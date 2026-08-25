//go:build ai_eval

package service

// Phase 0.5: why does the structured planner fail where the legacy router
// succeeds? The planner deliberately swallows provider errors so that log lines
// can never echo prompts or restaurant data, which is right for production and
// useless for diagnosis. This calls each provider directly and prints the parts
// the pipeline discards: the transport error, the raw JSON, and the exact
// validation failure.
//
// Run:
//   AI_EVAL_ENABLED=1 go test -tags ai_eval -count=1 ./internal/service/ -run TestPlannerDiagnose -v
//
// -count=1 keeps Go from replaying a cached result instead of calling providers.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// diagnoseQuestionOrDefault lets one investigation target the exact question that
// failed, instead of re-running a question already known to work.
func diagnoseQuestionOrDefault() string {
	if q := strings.TrimSpace(os.Getenv("AI_DIAGNOSE_QUESTION")); q != "" {
		return q
	}
	return "เมนูไหนกำไรดีที่สุด"
}

// TestPlannerDiagnoseProviders calls Groq and Gemini one at a time and reports
// where each one actually breaks.
func TestPlannerDiagnoseProviders(t *testing.T) {
	svc := liveAIServiceOrSkip(t)

	normalized, err := normalizeStructuredPlannerRequest(StructuredPlannerRequest{
		Question:      diagnoseQuestionOrDefault(),
		ReferenceTime: time.Now(),
	})
	if err != nil {
		t.Fatalf("normalize request: %v", err)
	}
	systemPrompt, userPrompt, err := structuredPlannerPrompts(normalized)
	if err != nil {
		t.Fatalf("build prompts: %v", err)
	}

	providers := []struct {
		name     string
		provider StructuredPlannerProvider
	}{
		{"groq", NewGroqStructuredPlannerProvider(svc.httpClient, svc.getGroqKeys(), &svc.keyHealth)},
		{"gemini", NewGeminiStructuredPlannerProvider(svc.httpClient, svc.getGeminiKeys(), &svc.keyHealth)},
	}

	for _, entry := range providers {
		t.Logf("═══════════════ %s ═══════════════", entry.name)
		if entry.provider == nil {
			t.Logf("ไม่ได้ตั้งค่า provider นี้")
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		start := time.Now()
		response, callErr := entry.provider.GenerateResolvedPlan(ctx, StructuredPlannerProviderRequest{
			SchemaName:   "resolved_plan_v1",
			SystemPrompt: systemPrompt,
			UserPrompt:   userPrompt,
			JSONSchema:   ResolvedPlanJSONSchema(),
		})
		elapsed := time.Since(start)
		cancel()

		t.Logf("model=%s เวลา=%dms in=%d out=%d http_attempts=%d",
			response.Model, elapsed.Milliseconds(), response.InputTokens, response.OutputTokens, response.HTTPAttempts)

		if callErr != nil {
			// This is the message the production pipeline throws away.
			t.Logf("❌ provider_call ล้มเหลว: %v", callErr)
			continue
		}

		raw := strings.TrimSpace(response.RawJSON)
		t.Logf("✅ ได้ JSON กลับมา %d chars", len(raw))
		t.Logf("RAW: %s", truncateForLog(raw, 900))

		plan, parseErr := ParseStructuredPlannerResolvedPlan(raw, normalized.Question)
		if parseErr != nil {
			t.Logf("❌ parse/validate ล้มเหลว: %v", parseErr)
			reportMissingPlanFields(t, raw)
			continue
		}
		t.Logf("✅ ผ่าน validate: task=%s domain=%s metrics=%v tool_hint=%q",
			plan.Task, plan.Domain, plan.Parameters.Metrics, plan.ToolHint)
	}
}

// reportMissingPlanFields shows which top-level keys the model returned, so a
// schema mismatch is visible without dumping restaurant data.
func reportMissingPlanFields(t *testing.T, raw string) {
	t.Helper()
	var generic map[string]any
	if err := json.Unmarshal([]byte(raw), &generic); err != nil {
		t.Logf("   (JSON ไม่ถูกต้องตั้งแต่ต้น: %v)", err)
		return
	}
	keys := make([]string, 0, len(generic))
	for key := range generic {
		keys = append(keys, key)
	}
	t.Logf("   คีย์ที่โมเดลส่งมา: %v", keys)

	var reference ResolvedPlan
	referenceJSON, _ := json.Marshal(reference)
	var referenceMap map[string]any
	_ = json.Unmarshal(referenceJSON, &referenceMap)
	missing := make([]string, 0)
	for key := range referenceMap {
		if _, ok := generic[key]; !ok {
			missing = append(missing, key)
		}
	}
	t.Logf("   คีย์ที่ schema ต้องการแต่ไม่มา: %v", missing)
}

func truncateForLog(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…(ตัด)"
}

// TestPlannerDiagnoseGroqStrictSchema replays the exact payload the Groq adapter
// sends and prints the provider's own error text, which the adapter drops so it
// can never leak prompt or restaurant content into logs.
func TestPlannerDiagnoseGroqStrictSchema(t *testing.T) {
	svc := liveAIServiceOrSkip(t)
	keys := svc.getGroqKeys()
	if len(keys) == 0 {
		t.Skip("no Groq keys configured")
	}
	model := structuredPlannerModelChain("GROQ_PLANNER_MODEL", "GROQ_MODEL", defaultGroqPlannerModel)
	_, strict := groqStrictStructuredPlannerModels[model]
	t.Logf("model=%s strict_json_schema=%v", model, strict)

	// Mirror production: the adapter strips the keywords Groq refuses before
	// sending, so diagnosing the raw schema would report an already-fixed error.
	schema := sanitizeSchemaForGroqStrict(ResolvedPlanJSONSchema())
	for _, mode := range []string{"json_schema", "json_object"} {
		body := map[string]any{
			"model":       model,
			"temperature": 0,
			"messages": []map[string]string{
				{"role": "system", "content": "Return the resolved plan as JSON."},
				{"role": "user", "content": diagnoseQuestionOrDefault()},
			},
		}
		if mode == "json_schema" {
			body["response_format"] = map[string]any{
				"type": "json_schema",
				"json_schema": map[string]any{
					"name": "resolved_plan_v1", "strict": true, "schema": schema,
				},
			}
		} else {
			body["response_format"] = map[string]any{"type": "json_object"}
		}
		status, message := postGroqForDiagnosis(t, keys[0], body)
		t.Logf("── response_format=%s → HTTP %d", mode, status)
		if message != "" {
			t.Logf("   %s", truncateForLog(message, 500))
		}
	}
}

func postGroqForDiagnosis(t *testing.T, key string, body map[string]any) (int, string) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost,
		"https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(encoded))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(key))
	response, err := (&http.Client{Timeout: 60 * time.Second}).Do(request)
	if err != nil {
		return 0, err.Error()
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return response.StatusCode, "(สำเร็จ)"
	}
	var parsed struct {
		Error struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &parsed) == nil && parsed.Error.Message != "" {
		return response.StatusCode, parsed.Error.Code + ": " + parsed.Error.Message
	}
	return response.StatusCode, string(raw)
}
