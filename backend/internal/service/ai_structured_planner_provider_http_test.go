package service

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

// groqStructuredPlannerSuccessBody is a minimal well-formed Groq chat response.
func groqStructuredPlannerSuccessBody() string {
	return `{"choices":[{"message":{"content":"{\"answer\":\"ok\"}"}}],"usage":{"prompt_tokens":31,"completion_tokens":12}}`
}

func structuredPlannerProviderTestRequest() StructuredPlannerProviderRequest {
	return StructuredPlannerProviderRequest{
		SchemaName:   "resolved_plan_v1",
		SystemPrompt: "system instructions",
		UserPrompt:   `{"current_question":"hello"}`,
		JSONSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"answer": map[string]any{"type": "string"},
			},
			"required": []string{"answer"},
		},
	}
}

func TestGroqStructuredPlannerProviderUsesStrictJSONSchema(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "")

	var received groqStructuredPlannerRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if authorization := r.Header.Get("Authorization"); authorization != "Bearer groq-test-key" {
			t.Errorf("Authorization = %q", authorization)
		}
		if contentType := r.Header.Get("Content-Type"); contentType != "application/json" {
			t.Errorf("Content-Type = %q", contentType)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Errorf("decode request: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"answer\":\"ok\"}"}}],"usage":{"prompt_tokens":31,"completion_tokens":12}}`))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"groq-test-key"}, server.URL)
	response, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err != nil {
		t.Fatalf("GenerateResolvedPlan: %v", err)
	}

	if received.Model != defaultGroqPlannerModel {
		t.Fatalf("model = %q, want %q", received.Model, defaultGroqPlannerModel)
	}
	if received.MaxCompletionTokens != structuredPlannerMaxOutputTokens {
		t.Fatalf("max_completion_tokens = %d, want %d", received.MaxCompletionTokens, structuredPlannerMaxOutputTokens)
	}
	if len(received.Messages) != 2 || received.Messages[0].Role != "system" || received.Messages[0].Content != "system instructions" || received.Messages[1].Role != "user" {
		t.Fatalf("messages = %#v", received.Messages)
	}
	if received.ResponseFormat.Type != "json_schema" || received.ResponseFormat.JSONSchema.Name != "resolved_plan_v1" || !received.ResponseFormat.JSONSchema.Strict {
		t.Fatalf("response_format = %#v", received.ResponseFormat)
	}
	if additional, ok := received.ResponseFormat.JSONSchema.Schema["additionalProperties"].(bool); !ok || additional {
		t.Fatalf("schema was not forwarded: %#v", received.ResponseFormat.JSONSchema.Schema)
	}
	if response.RawJSON != `{"answer":"ok"}` || response.Model != defaultGroqPlannerModel {
		t.Fatalf("response = %+v", response)
	}
	if response.InputTokens != 31 || response.OutputTokens != 12 {
		t.Fatalf("usage = input:%d output:%d", response.InputTokens, response.OutputTokens)
	}
}

func TestGroqStructuredPlannerProviderRotatesKeyAfter429(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "openai/gpt-oss-120b")

	var mu sync.Mutex
	var authorizations []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		authorizations = append(authorizations, r.Header.Get("Authorization"))
		call := len(authorizations)
		mu.Unlock()
		if call == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"gsk-secret-must-not-leak"}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"answer\":\"fallback-key\"}"}}]}`))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key-one", "key-two"}, server.URL)
	response, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err != nil {
		t.Fatalf("GenerateResolvedPlan: %v", err)
	}
	if response.RawJSON != `{"answer":"fallback-key"}` || response.Model != "openai/gpt-oss-120b" {
		t.Fatalf("response = %+v", response)
	}
	if response.HTTPAttempts != 2 || response.KeyFallbacks != 1 || response.RateLimits != 1 {
		t.Fatalf("rotation stats = %+v", response)
	}

	mu.Lock()
	defer mu.Unlock()
	want := []string{"Bearer key-one", "Bearer key-two"}
	if len(authorizations) != len(want) || authorizations[0] != want[0] || authorizations[1] != want[1] {
		t.Fatalf("authorizations = %#v, want %#v", authorizations, want)
	}
}

func TestGroqStructuredPlannerConcurrentRequestsKeepPerRequestKeyOrder(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "")
	firstAStarted := make(chan struct{})
	requestBFinished := make(chan struct{})
	var mu sync.Mutex
	calls := map[string][]string{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request groqStructuredPlannerRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode request: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		name := request.Messages[0].Content
		mu.Lock()
		calls[name] = append(calls[name], r.Header.Get("Authorization"))
		callNumber := len(calls[name])
		mu.Unlock()

		if name == "request-a" && callNumber == 1 {
			close(firstAStarted)
			<-requestBFinished
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		if name == "request-b" {
			close(requestBFinished)
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"answer\":\"ok\"}"}}]}`))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key-one", "key-two"}, server.URL)
	requestA := structuredPlannerProviderTestRequest()
	requestA.SystemPrompt = "request-a"
	requestB := structuredPlannerProviderTestRequest()
	requestB.SystemPrompt = "request-b"

	errA := make(chan error, 1)
	go func() {
		_, err := provider.GenerateResolvedPlan(context.Background(), requestA)
		errA <- err
	}()
	<-firstAStarted
	if _, err := provider.GenerateResolvedPlan(context.Background(), requestB); err != nil {
		t.Fatalf("request B: %v", err)
	}
	if err := <-errA; err != nil {
		t.Fatalf("request A: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if got := calls["request-a"]; len(got) != 2 || got[0] != "Bearer key-one" || got[1] != "Bearer key-two" {
		t.Fatalf("request A keys = %#v, want distinct ordered keys", got)
	}
	if got := calls["request-b"]; len(got) != 1 || got[0] != "Bearer key-two" {
		t.Fatalf("request B keys = %#v, want its reserved start key", got)
	}
}

func TestGeminiStructuredPlannerProviderUsesResponseJSONSchema(t *testing.T) {
	t.Setenv("GEMINI_PLANNER_MODEL", "")

	var received geminiStructuredPlannerRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/v1beta/models/gemini-2.5-flash:generateContent" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if apiKey := r.Header.Get("x-goog-api-key"); apiKey != "gemini-test-key" {
			t.Errorf("x-goog-api-key = %q", apiKey)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Errorf("decode request: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"answer\":"},{"text":"\"ok\"}"}]}}],"usageMetadata":{"promptTokenCount":47,"candidatesTokenCount":9}}`))
	}))
	defer server.Close()

	provider := newGeminiStructuredPlannerProvider(server.Client(), []string{"gemini-test-key"}, server.URL+"/v1beta/models")
	response, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err != nil {
		t.Fatalf("GenerateResolvedPlan: %v", err)
	}

	if len(received.SystemInstruction.Parts) != 1 || received.SystemInstruction.Parts[0].Text != "system instructions" {
		t.Fatalf("systemInstruction = %#v", received.SystemInstruction)
	}
	if len(received.Contents) != 1 || received.Contents[0].Role != "user" || received.Contents[0].Parts[0].Text != `{"current_question":"hello"}` {
		t.Fatalf("contents = %#v", received.Contents)
	}
	if received.GenerationConfig.ResponseMIMEType != "application/json" {
		t.Fatalf("responseMimeType = %q", received.GenerationConfig.ResponseMIMEType)
	}
	if received.GenerationConfig.MaxOutputTokens != structuredPlannerMaxOutputTokens {
		t.Fatalf("maxOutputTokens = %d, want %d", received.GenerationConfig.MaxOutputTokens, structuredPlannerMaxOutputTokens)
	}
	if additional, ok := received.GenerationConfig.ResponseJSONSchema["additionalProperties"].(bool); !ok || additional {
		t.Fatalf("responseJsonSchema was not forwarded: %#v", received.GenerationConfig.ResponseJSONSchema)
	}
	if response.RawJSON != `{"answer":"ok"}` || response.Model != defaultGeminiPlannerModel {
		t.Fatalf("response = %+v", response)
	}
	if response.InputTokens != 47 || response.OutputTokens != 9 {
		t.Fatalf("usage = input:%d output:%d", response.InputTokens, response.OutputTokens)
	}
}

func TestGeminiStructuredPlannerProviderRotatesKeyAfter429(t *testing.T) {
	t.Setenv("GEMINI_PLANNER_MODEL", "gemini-planner-test")

	var mu sync.Mutex
	var apiKeys []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		apiKeys = append(apiKeys, r.Header.Get("x-goog-api-key"))
		call := len(apiKeys)
		mu.Unlock()
		if call == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"gemini-secret-must-not-leak"}`))
			return
		}
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"answer\":\"fallback-key\"}"}]}}]}`))
	}))
	defer server.Close()

	provider := newGeminiStructuredPlannerProvider(server.Client(), []string{"key-one", "key-two"}, server.URL)
	response, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err != nil {
		t.Fatalf("GenerateResolvedPlan: %v", err)
	}
	if response.RawJSON != `{"answer":"fallback-key"}` || response.Model != "gemini-planner-test" {
		t.Fatalf("response = %+v", response)
	}
	if response.HTTPAttempts != 2 || response.KeyFallbacks != 1 || response.RateLimits != 1 {
		t.Fatalf("rotation stats = %+v", response)
	}

	mu.Lock()
	defer mu.Unlock()
	want := []string{"key-one", "key-two"}
	if len(apiKeys) != len(want) || apiKeys[0] != want[0] || apiKeys[1] != want[1] {
		t.Fatalf("API keys = %#v, want %#v", apiKeys, want)
	}
}

func TestStructuredPlannerProviderErrorsDoNotExposeProviderBodyOrKey(t *testing.T) {
	secretBody := "provider-body-secret"
	secretKey := "api-key-secret"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"` + secretBody + `"}`))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{secretKey}, server.URL)
	_, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err == nil {
		t.Fatal("GenerateResolvedPlan accepted an HTTP 400 response")
	}
	if strings.Contains(err.Error(), secretBody) || strings.Contains(err.Error(), secretKey) {
		t.Fatalf("error exposed provider data: %q", err)
	}
	if !strings.Contains(err.Error(), "HTTP status 400") {
		t.Fatalf("error = %q, want sanitized status", err)
	}
}

// A model without strict-schema support must still be usable: the request
// degrades to JSON object mode and carries the schema in the system prompt,
// because the backend validates the plan either way.
func TestGroqStructuredPlannerFallsBackToJSONObjectModeForNonStrictModel(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "llama-3.3-70b-versatile")
	var body []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(groqStructuredPlannerSuccessBody()))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key"}, server.URL)
	response, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err != nil {
		t.Fatalf("GenerateResolvedPlan: %v", err)
	}
	if response.Model != "llama-3.3-70b-versatile" {
		t.Fatalf("model = %q, want the configured model", response.Model)
	}

	var sent struct {
		Model          string `json:"model"`
		ResponseFormat struct {
			Type       string          `json:"type"`
			JSONSchema json.RawMessage `json:"json_schema"`
		} `json:"response_format"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &sent); err != nil {
		t.Fatalf("decode request: %v", err)
	}
	if sent.ResponseFormat.Type != "json_object" {
		t.Fatalf("response_format.type = %q, want json_object", sent.ResponseFormat.Type)
	}
	if len(sent.ResponseFormat.JSONSchema) != 0 {
		t.Fatalf("json_schema must be omitted in JSON object mode, got %s", sent.ResponseFormat.JSONSchema)
	}
	if len(sent.Messages) == 0 || !strings.Contains(sent.Messages[0].Content, "JSON Schema") {
		t.Fatal("system prompt must carry the schema when the provider cannot enforce it")
	}
}

// The planner reuses GROQ_MODEL when no planner-specific override is set, so one
// model setting drives both the legacy flow and the planner.
func TestStructuredPlannerModelChainPrefersPlannerThenSharedThenDefault(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "")
	t.Setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
	if got := structuredPlannerModelChain("GROQ_PLANNER_MODEL", "GROQ_MODEL", defaultGroqPlannerModel); got != "llama-3.3-70b-versatile" {
		t.Fatalf("shared model not used: %q", got)
	}

	t.Setenv("GROQ_PLANNER_MODEL", "openai/gpt-oss-120b")
	if got := structuredPlannerModelChain("GROQ_PLANNER_MODEL", "GROQ_MODEL", defaultGroqPlannerModel); got != "openai/gpt-oss-120b" {
		t.Fatalf("planner override not used: %q", got)
	}

	t.Setenv("GROQ_PLANNER_MODEL", "")
	t.Setenv("GROQ_MODEL", "")
	if got := structuredPlannerModelChain("GROQ_PLANNER_MODEL", "GROQ_MODEL", defaultGroqPlannerModel); got != defaultGroqPlannerModel {
		t.Fatalf("default not used: %q", got)
	}
}

func TestGroqStructuredPlannerUsesStrictSchemaForSupportedModel(t *testing.T) {
	t.Setenv("GROQ_PLANNER_MODEL", "openai/gpt-oss-20b")
	var body []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(groqStructuredPlannerSuccessBody()))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key"}, server.URL)
	if _, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest()); err != nil {
		t.Fatalf("GenerateResolvedPlan: %v", err)
	}
	var sent struct {
		ResponseFormat struct {
			Type       string `json:"type"`
			JSONSchema struct {
				Strict bool `json:"strict"`
			} `json:"json_schema"`
		} `json:"response_format"`
	}
	if err := json.Unmarshal(body, &sent); err != nil {
		t.Fatalf("decode request: %v", err)
	}
	if sent.ResponseFormat.Type != "json_schema" || !sent.ResponseFormat.JSONSchema.Strict {
		t.Fatalf("supported model must keep strict schema mode, got %+v", sent.ResponseFormat)
	}
}

func TestGroqStructuredPlannerUnusedRejectionHelper(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		atomic.AddInt32(&calls, 1)
	}))
	defer server.Close()
	if calls != 0 {
		t.Fatalf("unexpected calls %d", calls)
	}
}

func TestStructuredPlannerProvidersDoNotRotateKeysForDeterministic400(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	providers := []StructuredPlannerProvider{
		newGroqStructuredPlannerProvider(server.Client(), []string{"one", "two", "three"}, server.URL),
		newGeminiStructuredPlannerProvider(server.Client(), []string{"one", "two", "three"}, server.URL),
	}
	for _, provider := range providers {
		t.Run(string(provider.Name()), func(t *testing.T) {
			before := atomic.LoadInt32(&calls)
			_, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
			if err == nil {
				t.Fatal("GenerateResolvedPlan accepted HTTP 400")
			}
			if used := atomic.LoadInt32(&calls) - before; used != 1 {
				t.Fatalf("HTTP calls = %d, want fail-fast single call", used)
			}
		})
	}
}

func TestStructuredPlannerHTTPClientAppliesBoundedTimeoutWithoutMutatingCaller(t *testing.T) {
	original := &http.Client{}
	bounded := structuredPlannerHTTPClient(original)
	if bounded == original {
		t.Fatal("structured planner reused the caller client pointer")
	}
	if bounded.Timeout != structuredPlannerHTTPTimeout || original.Timeout != 0 {
		t.Fatalf("timeouts = bounded %s original %s", bounded.Timeout, original.Timeout)
	}
}

func TestGeminiCompatibleJSONSchemaRemovesUnsupportedHints(t *testing.T) {
	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"version": map[string]any{"type": "string", "const": "1.0", "enum": []any{"1.0"}, "maxLength": 3},
		},
	}
	converted := geminiCompatibleJSONSchema(schema)
	version := converted["properties"].(map[string]any)["version"].(map[string]any)
	if _, exists := version["const"]; exists {
		t.Fatalf("converted schema retained const: %#v", version)
	}
	if _, exists := version["maxLength"]; exists {
		t.Fatalf("converted schema retained maxLength: %#v", version)
	}
	if _, exists := version["enum"]; !exists {
		t.Fatalf("converted schema removed supported enum: %#v", version)
	}
	if _, exists := schema["properties"].(map[string]any)["version"].(map[string]any)["const"]; !exists {
		t.Fatal("conversion mutated the shared source schema")
	}
}

func TestStructuredPlannerProviderPreservesRateLimitClassification(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"do not expose this"}`))
	}))
	defer server.Close()

	provider := newGeminiStructuredPlannerProvider(server.Client(), []string{"one-key"}, server.URL)
	_, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if !errors.Is(err, errRateLimit) {
		t.Fatalf("error = %v, want errRateLimit", err)
	}
	if strings.Contains(err.Error(), "do not expose this") {
		t.Fatalf("error exposed response body: %q", err)
	}
}

func TestStructuredPlannerProviderLimitsResponseBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("x", structuredPlannerHTTPBodyLimit+1)))
	}))
	defer server.Close()

	provider := newGroqStructuredPlannerProvider(server.Client(), []string{"key"}, server.URL)
	_, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
	if err == nil || !strings.Contains(err.Error(), "size limit") {
		t.Fatalf("error = %v, want response size limit", err)
	}
}

func TestStructuredPlannerProvidersHonorCancellation(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	providers := []StructuredPlannerProvider{
		newGroqStructuredPlannerProvider(server.Client(), []string{"key"}, server.URL),
		newGeminiStructuredPlannerProvider(server.Client(), []string{"key"}, server.URL),
	}
	for _, provider := range providers {
		t.Run(string(provider.Name()), func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			_, err := provider.GenerateResolvedPlan(ctx, structuredPlannerProviderTestRequest())
			if !errors.Is(err, context.Canceled) {
				t.Fatalf("error = %v, want context.Canceled", err)
			}
		})
	}
	if got := atomic.LoadInt32(&calls); got != 0 {
		t.Fatalf("providers made %d HTTP calls after cancellation", got)
	}
}

func TestStructuredPlannerProvidersRejectMissingKeys(t *testing.T) {
	providers := []StructuredPlannerProvider{
		NewGroqStructuredPlannerProvider(nil, []string{" ", ""}),
		NewGeminiStructuredPlannerProvider(nil, nil),
	}
	for _, provider := range providers {
		t.Run(string(provider.Name()), func(t *testing.T) {
			_, err := provider.GenerateResolvedPlan(context.Background(), structuredPlannerProviderTestRequest())
			if err == nil || !strings.Contains(err.Error(), "API_KEYS") {
				t.Fatalf("error = %v, want missing API keys", err)
			}
		})
	}
}
