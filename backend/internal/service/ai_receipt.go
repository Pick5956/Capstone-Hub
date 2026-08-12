package service

// Receipt scanner — the owner snaps a photo of an expense bill and Gemini (our
// multimodal provider) reads it into structured expense fields. Following the
// deterministic-first, human-confirms principle, this ONLY extracts a draft; the
// frontend shows it for review and the owner confirms before anything is written
// to the expenses ledger.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
)

// ReceiptDraft is the proposed expense parsed from a bill photo. Every value is a
// suggestion the owner can edit — nothing is saved from here.
type ReceiptDraft struct {
	Category   string  `json:"category"` // ingredient|labor|rent|utilities|equipment|other
	Amount     float64 `json:"amount"`
	SpentAt    string  `json:"spent_at"` // YYYY-MM-DD (empty → frontend defaults to today)
	Vendor     string  `json:"vendor"`
	Note       string  `json:"note"`
	Confidence string  `json:"confidence"` // high|medium|low — how sure the model is
}

var receiptExpenseCategories = map[string]struct{}{
	"ingredient": {}, "labor": {}, "rent": {}, "utilities": {}, "equipment": {}, "other": {},
}

const receiptExtractPrompt = `You are reading a photo of an expense receipt/bill for a Thai restaurant.
Extract the expense into STRICT JSON only (no prose, no markdown fences), with exactly these keys:
{"category": string, "amount": number, "spent_at": string, "vendor": string, "note": string, "confidence": string}

Rules:
- category MUST be one of: "ingredient" (fresh food, produce, meat, groceries), "utilities" (water/electric/gas/internet bills), "rent", "labor" (wages/salary), "equipment" (tools, appliances, utensils), "other" (anything else). Pick the best fit.
- amount = the FINAL grand total to pay (include VAT/service if shown), as a plain number without currency symbol or thousands separators.
- spent_at = the receipt date in "YYYY-MM-DD". If no date is visible, use "".
- vendor = the shop/company name (Thai is fine). If unknown, use "".
- note = a short Thai description of what was bought (<= 60 chars).
- confidence = "high" if the total and category are clearly readable, "medium" if partly unclear, "low" if the image is hard to read.
Return ONLY the JSON object.`

// executeReceiptGemini sends the image to Gemini and parses the returned JSON.
func (s *AIService) executeReceiptGemini(imageBase64, mimeType, apiKey string) (*ReceiptDraft, error) {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-2.5-flash"
	}
	aiStage("call", "Gemini receipt-scan model=%s", model)

	payload := geminiGenerateRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{
				{Text: receiptExtractPrompt},
				{InlineData: &geminiInlineData{MimeType: mimeType, Data: imageBase64}},
			}},
		},
		GenerationConfig: &geminiGenerationConfig{Temperature: zeroTemperature()},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", model)
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", apiKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == 429 {
			return nil, errRateLimit
		}
		return nil, newAIProviderHTTPError("Gemini", "receipt scan", resp.StatusCode)
	}

	var parsed geminiGenerateResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}
	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if text := strings.TrimSpace(part.Text); text != "" {
				return parseReceiptJSON(text)
			}
		}
	}
	return nil, errors.New("gemini returned an empty receipt response")
}

// parseReceiptJSON tolerates markdown fences / stray text around the JSON object.
func parseReceiptJSON(text string) (*ReceiptDraft, error) {
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, errors.New("could not find JSON in receipt response")
	}
	var draft ReceiptDraft
	if err := json.Unmarshal([]byte(text[start:end+1]), &draft); err != nil {
		return nil, fmt.Errorf("failed to parse receipt JSON: %w", err)
	}
	draft.Category = strings.ToLower(strings.TrimSpace(draft.Category))
	if _, ok := receiptExpenseCategories[draft.Category]; !ok {
		draft.Category = "other"
	}
	if draft.Amount < 0 {
		draft.Amount = 0
	}
	draft.SpentAt = strings.TrimSpace(draft.SpentAt)
	draft.Vendor = strings.TrimSpace(draft.Vendor)
	draft.Note = strings.TrimSpace(draft.Note)
	if draft.Confidence == "" {
		draft.Confidence = "medium"
	}
	return &draft, nil
}

// extractReceiptWithRotation rotates through the Gemini keys, skipping any that
// are rate limited — same resilience the chat router already uses.
func (s *AIService) extractReceiptWithRotation(imageBase64, mimeType string) (*ReceiptDraft, error) {
	keys := s.getGeminiKeys()
	if len(keys) == 0 {
		return nil, errors.New("GEMINI_API_KEY is not configured")
	}
	var lastErr error
	numKeys := len(keys)
	for i := 0; i < numKeys; i++ {
		idx := atomic.AddUint32(&s.geminiKeyIndex, 1) - 1
		currentKey := keys[idx%uint32(numKeys)]
		draft, err := s.executeReceiptGemini(imageBase64, mimeType, currentKey)
		if err == nil {
			return draft, nil
		}
		lastErr = err
		if err == errRateLimit {
			aiStage("warn", "Gemini receipt key %d/%d rate limited (429) → rotating", (idx%uint32(numKeys))+1, numKeys)
			continue
		}
		aiStage("warn", "Gemini receipt key %d/%d failed: %v → rotating", (idx%uint32(numKeys))+1, numKeys, err)
	}
	// All keys exhausted while rate limited → surface as a quota error so the API
	// returns 429 and the UI can tell the owner to retry shortly.
	if errors.Is(lastErr, errRateLimit) {
		return nil, ErrAIQuotaExceeded
	}
	return nil, lastErr
}

// ExtractReceiptForOwner is the owner-gated entry point used by the controller.
func (s *AIService) ExtractReceiptForOwner(actor AIActorContext, imageBase64, mimeType string) (*ReceiptDraft, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return nil, errors.New("authenticated restaurant owner context is required")
	}
	if strings.TrimSpace(imageBase64) == "" {
		return nil, errors.New("an image is required")
	}
	if strings.TrimSpace(mimeType) == "" {
		mimeType = "image/jpeg"
	}
	return s.extractReceiptWithRotation(imageBase64, mimeType)
}
