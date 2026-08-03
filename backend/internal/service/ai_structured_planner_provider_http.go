package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

const (
	groqStructuredPlannerEndpoint    = "https://api.groq.com/openai/v1/chat/completions"
	geminiStructuredPlannerBaseURL   = "https://generativelanguage.googleapis.com/v1beta/models"
	defaultGroqPlannerModel          = "openai/gpt-oss-20b"
	defaultGeminiPlannerModel        = "gemini-2.5-flash"
	structuredPlannerHTTPBodyLimit   = 1 << 20
	structuredPlannerHTTPTimeout     = 30 * time.Second
	structuredPlannerMaxOutputTokens = 2048
)

var groqStrictStructuredPlannerModels = map[string]struct{}{
	"openai/gpt-oss-20b":  {},
	"openai/gpt-oss-120b": {},
}

// NewGroqStructuredPlannerProvider creates the hosted Groq implementation of
// StructuredPlannerProvider. Keys are copied so callers may safely reuse or
// clear their input slice after construction.
func NewGroqStructuredPlannerProvider(client *http.Client, apiKeys []string) StructuredPlannerProvider {
	return newGroqStructuredPlannerProvider(client, apiKeys, groqStructuredPlannerEndpoint)
}

// NewGeminiStructuredPlannerProvider creates the hosted Gemini implementation
// of StructuredPlannerProvider. It is intentionally not connected to
// AIService yet; the planner can be integrated after its evaluation gate is in
// place.
func NewGeminiStructuredPlannerProvider(client *http.Client, apiKeys []string) StructuredPlannerProvider {
	return newGeminiStructuredPlannerProvider(client, apiKeys, geminiStructuredPlannerBaseURL)
}

type groqStructuredPlannerProvider struct {
	client   *http.Client
	apiKeys  []string
	endpoint string
	keyIndex uint32
}

var _ StructuredPlannerProvider = (*groqStructuredPlannerProvider)(nil)

func newGroqStructuredPlannerProvider(client *http.Client, apiKeys []string, endpoint string) *groqStructuredPlannerProvider {
	return &groqStructuredPlannerProvider{
		client:   structuredPlannerHTTPClient(client),
		apiKeys:  normalizedStructuredPlannerKeys(apiKeys),
		endpoint: strings.TrimSpace(endpoint),
	}
}

func (p *groqStructuredPlannerProvider) Name() StructuredPlannerProviderName {
	return StructuredPlannerProviderGroq
}

func (p *groqStructuredPlannerProvider) GenerateResolvedPlan(ctx context.Context, request StructuredPlannerProviderRequest) (StructuredPlannerProviderResponse, error) {
	if p == nil {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner provider is nil")
	}
	if err := validateStructuredPlannerProviderRequest(ctx, request); err != nil {
		return StructuredPlannerProviderResponse{}, err
	}
	if len(p.apiKeys) == 0 {
		return StructuredPlannerProviderResponse{}, errors.New("GROQ_API_KEYS is not configured")
	}
	if p.endpoint == "" {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner endpoint is not configured")
	}

	model := structuredPlannerModel("GROQ_PLANNER_MODEL", defaultGroqPlannerModel)
	if _, supported := groqStrictStructuredPlannerModels[model]; !supported {
		return StructuredPlannerProviderResponse{}, fmt.Errorf("Groq planner model %q does not support the required strict JSON schema mode", model)
	}
	payload, err := json.Marshal(groqStructuredPlannerRequest{
		Model:               model,
		MaxCompletionTokens: structuredPlannerMaxOutputTokens,
		Messages: []groqStructuredPlannerMessage{
			{Role: "system", Content: request.SystemPrompt},
			{Role: "user", Content: request.UserPrompt},
		},
		ResponseFormat: groqStructuredPlannerResponseFormat{
			Type: "json_schema",
			JSONSchema: groqStructuredPlannerSchema{
				Name:   strings.TrimSpace(request.SchemaName),
				Strict: true,
				Schema: request.JSONSchema,
			},
		},
	})
	if err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner request could not be encoded")
	}

	startIndex := atomic.AddUint32(&p.keyIndex, 1) - 1
	var lastErr error
	stats := StructuredPlannerProviderResponse{Model: model}
	for offset := range p.apiKeys {
		if err := ctx.Err(); err != nil {
			return StructuredPlannerProviderResponse{}, err
		}
		key := p.apiKeys[(int(startIndex)+offset)%len(p.apiKeys)]
		stats.HTTPAttempts++
		response, callErr := p.generateWithKey(ctx, payload, key, model)
		if callErr == nil {
			response.HTTPAttempts = stats.HTTPAttempts
			response.KeyFallbacks = stats.KeyFallbacks
			response.RateLimits = stats.RateLimits
			return response, nil
		}
		if err := ctx.Err(); err != nil {
			return StructuredPlannerProviderResponse{}, err
		}
		lastErr = callErr
		if errors.Is(callErr, errRateLimit) {
			stats.RateLimits++
		}
		if !structuredPlannerShouldTryNextKey(callErr) {
			break
		}
		if offset+1 < len(p.apiKeys) {
			stats.KeyFallbacks++
		}
	}

	return stats, fmt.Errorf("Groq structured planner exhausted configured API keys: %w", lastErr)
}

func (p *groqStructuredPlannerProvider) generateWithKey(ctx context.Context, payload []byte, apiKey string, model string) (StructuredPlannerProviderResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(payload))
	if err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner request could not be created")
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return StructuredPlannerProviderResponse{}, ctxErr
		}
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner transport failed")
	}
	defer resp.Body.Close()

	body, tooLarge, err := readStructuredPlannerHTTPBody(resp.Body)
	if err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner response could not be read")
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return StructuredPlannerProviderResponse{}, structuredPlannerHTTPStatusError("Groq", resp.StatusCode)
	}
	if tooLarge {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner response exceeded the size limit")
	}

	var decoded groqStructuredPlannerResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner returned an invalid response")
	}
	for _, choice := range decoded.Choices {
		rawJSON := strings.TrimSpace(choice.Message.Content)
		if rawJSON == "" {
			continue
		}
		return StructuredPlannerProviderResponse{
			RawJSON:      rawJSON,
			Model:        model,
			InputTokens:  maxPlannerUsage(decoded.Usage.PromptTokens),
			OutputTokens: maxPlannerUsage(decoded.Usage.CompletionTokens),
		}, nil
	}

	return StructuredPlannerProviderResponse{}, errors.New("Groq structured planner returned no JSON content")
}

type groqStructuredPlannerRequest struct {
	Model               string                              `json:"model"`
	Messages            []groqStructuredPlannerMessage      `json:"messages"`
	ResponseFormat      groqStructuredPlannerResponseFormat `json:"response_format"`
	MaxCompletionTokens int                                 `json:"max_completion_tokens"`
}

type groqStructuredPlannerMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type groqStructuredPlannerResponseFormat struct {
	Type       string                      `json:"type"`
	JSONSchema groqStructuredPlannerSchema `json:"json_schema"`
}

type groqStructuredPlannerSchema struct {
	Name   string         `json:"name"`
	Strict bool           `json:"strict"`
	Schema map[string]any `json:"schema"`
}

type groqStructuredPlannerResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

type geminiStructuredPlannerProvider struct {
	client   *http.Client
	apiKeys  []string
	baseURL  string
	keyIndex uint32
}

var _ StructuredPlannerProvider = (*geminiStructuredPlannerProvider)(nil)

func newGeminiStructuredPlannerProvider(client *http.Client, apiKeys []string, baseURL string) *geminiStructuredPlannerProvider {
	return &geminiStructuredPlannerProvider{
		client:  structuredPlannerHTTPClient(client),
		apiKeys: normalizedStructuredPlannerKeys(apiKeys),
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
	}
}

func (p *geminiStructuredPlannerProvider) Name() StructuredPlannerProviderName {
	return StructuredPlannerProviderGemini
}

func (p *geminiStructuredPlannerProvider) GenerateResolvedPlan(ctx context.Context, request StructuredPlannerProviderRequest) (StructuredPlannerProviderResponse, error) {
	if p == nil {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner provider is nil")
	}
	if err := validateStructuredPlannerProviderRequest(ctx, request); err != nil {
		return StructuredPlannerProviderResponse{}, err
	}
	if len(p.apiKeys) == 0 {
		return StructuredPlannerProviderResponse{}, errors.New("GEMINI_API_KEYS is not configured")
	}
	if p.baseURL == "" {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner endpoint is not configured")
	}

	model := structuredPlannerModel("GEMINI_PLANNER_MODEL", defaultGeminiPlannerModel)
	payload, err := json.Marshal(geminiStructuredPlannerRequest{
		SystemInstruction: geminiStructuredPlannerContent{
			Parts: []geminiStructuredPlannerPart{{Text: request.SystemPrompt}},
		},
		Contents: []geminiStructuredPlannerContent{{
			Role:  "user",
			Parts: []geminiStructuredPlannerPart{{Text: request.UserPrompt}},
		}},
		GenerationConfig: geminiStructuredPlannerGenerationConfig{
			ResponseMIMEType:   "application/json",
			ResponseJSONSchema: geminiCompatibleJSONSchema(request.JSONSchema),
			MaxOutputTokens:    structuredPlannerMaxOutputTokens,
		},
	})
	if err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner request could not be encoded")
	}

	endpoint := p.baseURL + "/" + url.PathEscape(model) + ":generateContent"
	startIndex := atomic.AddUint32(&p.keyIndex, 1) - 1
	var lastErr error
	stats := StructuredPlannerProviderResponse{Model: model}
	for offset := range p.apiKeys {
		if err := ctx.Err(); err != nil {
			return StructuredPlannerProviderResponse{}, err
		}
		key := p.apiKeys[(int(startIndex)+offset)%len(p.apiKeys)]
		stats.HTTPAttempts++
		response, callErr := p.generateWithKey(ctx, payload, key, endpoint, model)
		if callErr == nil {
			response.HTTPAttempts = stats.HTTPAttempts
			response.KeyFallbacks = stats.KeyFallbacks
			response.RateLimits = stats.RateLimits
			return response, nil
		}
		if err := ctx.Err(); err != nil {
			return StructuredPlannerProviderResponse{}, err
		}
		lastErr = callErr
		if errors.Is(callErr, errRateLimit) {
			stats.RateLimits++
		}
		if !structuredPlannerShouldTryNextKey(callErr) {
			break
		}
		if offset+1 < len(p.apiKeys) {
			stats.KeyFallbacks++
		}
	}

	return stats, fmt.Errorf("Gemini structured planner exhausted configured API keys: %w", lastErr)
}

func (p *geminiStructuredPlannerProvider) generateWithKey(ctx context.Context, payload []byte, apiKey string, endpoint string, model string) (StructuredPlannerProviderResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner request could not be created")
	}
	req.Header.Set("x-goog-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return StructuredPlannerProviderResponse{}, ctxErr
		}
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner transport failed")
	}
	defer resp.Body.Close()

	body, tooLarge, err := readStructuredPlannerHTTPBody(resp.Body)
	if err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner response could not be read")
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return StructuredPlannerProviderResponse{}, structuredPlannerHTTPStatusError("Gemini", resp.StatusCode)
	}
	if tooLarge {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner response exceeded the size limit")
	}

	var decoded geminiStructuredPlannerResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner returned an invalid response")
	}
	for _, candidate := range decoded.Candidates {
		var content strings.Builder
		for _, part := range candidate.Content.Parts {
			content.WriteString(part.Text)
		}
		rawJSON := strings.TrimSpace(content.String())
		if rawJSON == "" {
			continue
		}
		return StructuredPlannerProviderResponse{
			RawJSON:      rawJSON,
			Model:        model,
			InputTokens:  maxPlannerUsage(decoded.UsageMetadata.PromptTokenCount),
			OutputTokens: maxPlannerUsage(decoded.UsageMetadata.CandidatesTokenCount),
		}, nil
	}

	return StructuredPlannerProviderResponse{}, errors.New("Gemini structured planner returned no JSON content")
}

type geminiStructuredPlannerRequest struct {
	SystemInstruction geminiStructuredPlannerContent          `json:"systemInstruction"`
	Contents          []geminiStructuredPlannerContent        `json:"contents"`
	GenerationConfig  geminiStructuredPlannerGenerationConfig `json:"generationConfig"`
}

type geminiStructuredPlannerGenerationConfig struct {
	ResponseMIMEType   string         `json:"responseMimeType"`
	ResponseJSONSchema map[string]any `json:"responseJsonSchema"`
	MaxOutputTokens    int            `json:"maxOutputTokens"`
}

type geminiStructuredPlannerContent struct {
	Role  string                        `json:"role,omitempty"`
	Parts []geminiStructuredPlannerPart `json:"parts"`
}

type geminiStructuredPlannerPart struct {
	Text string `json:"text"`
}

type geminiStructuredPlannerResponse struct {
	Candidates []struct {
		Content geminiStructuredPlannerContent `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
}

func validateStructuredPlannerProviderRequest(ctx context.Context, request StructuredPlannerProviderRequest) error {
	if ctx == nil {
		return errors.New("structured planner provider context is nil")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(request.SchemaName) == "" {
		return errors.New("structured planner provider schema name is required")
	}
	if strings.TrimSpace(request.SystemPrompt) == "" {
		return errors.New("structured planner provider system prompt is required")
	}
	if strings.TrimSpace(request.UserPrompt) == "" {
		return errors.New("structured planner provider user prompt is required")
	}
	if request.JSONSchema == nil {
		return errors.New("structured planner provider JSON schema is required")
	}
	return nil
}

func structuredPlannerHTTPClient(client *http.Client) *http.Client {
	if client != nil {
		clone := *client
		if clone.Timeout <= 0 || clone.Timeout > structuredPlannerHTTPTimeout {
			clone.Timeout = structuredPlannerHTTPTimeout
		}
		return &clone
	}
	return &http.Client{Timeout: structuredPlannerHTTPTimeout}
}

func normalizedStructuredPlannerKeys(keys []string) []string {
	normalized := make([]string, 0, len(keys))
	seen := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}
	return normalized
}

func structuredPlannerModel(environmentName string, fallback string) string {
	if configured := strings.TrimSpace(os.Getenv(environmentName)); configured != "" {
		return configured
	}
	return fallback
}

func readStructuredPlannerHTTPBody(reader io.Reader) ([]byte, bool, error) {
	limited := io.LimitReader(reader, structuredPlannerHTTPBodyLimit+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, false, err
	}
	if len(body) > structuredPlannerHTTPBodyLimit {
		return nil, true, nil
	}
	return body, false, nil
}

func structuredPlannerHTTPStatusError(provider string, statusCode int) error {
	err := &structuredPlannerProviderHTTPError{Provider: provider, StatusCode: statusCode}
	if statusCode == http.StatusTooManyRequests {
		err.Cause = errRateLimit
	}
	return err
}

type structuredPlannerProviderHTTPError struct {
	Provider   string
	StatusCode int
	Cause      error
}

func (e *structuredPlannerProviderHTTPError) Error() string {
	if e.StatusCode == http.StatusTooManyRequests {
		return fmt.Sprintf("%s structured planner was rate limited: %v", e.Provider, e.Cause)
	}
	return fmt.Sprintf("%s structured planner returned HTTP status %d", e.Provider, e.StatusCode)
}

func (e *structuredPlannerProviderHTTPError) Unwrap() error { return e.Cause }

func structuredPlannerShouldTryNextKey(err error) bool {
	var statusErr *structuredPlannerProviderHTTPError
	if !errors.As(err, &statusErr) {
		return false
	}
	return statusErr.StatusCode == http.StatusUnauthorized ||
		statusErr.StatusCode == http.StatusForbidden ||
		statusErr.StatusCode == http.StatusTooManyRequests
}

// Gemini supports a deliberate subset of JSON Schema. The backend still runs
// the complete ResolvedPlan validator, so removing unsupported hint keywords
// here improves provider compatibility without weakening the execution gate.
func geminiCompatibleJSONSchema(schema map[string]any) map[string]any {
	stripped, _ := stripGeminiUnsupportedSchemaKeywords(schema).(map[string]any)
	return stripped
}

func stripGeminiUnsupportedSchemaKeywords(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, child := range typed {
			switch key {
			case "const", "pattern", "uniqueItems", "minLength", "maxLength", "minimum", "maximum":
				continue
			default:
				result[key] = stripGeminiUnsupportedSchemaKeywords(child)
			}
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, child := range typed {
			result[index] = stripGeminiUnsupportedSchemaKeywords(child)
		}
		return result
	default:
		return value
	}
}
