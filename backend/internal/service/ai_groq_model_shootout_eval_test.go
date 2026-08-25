//go:build ai_eval

package service

// Which Groq model can actually hold the contract?
//
// Groq is already first in the planner chain, so it is the model that decides
// what the assistant feels like; Gemini is only there to catch what Groq drops.
// In the 21 Aug run Groq dropped 7 of 20 questions at the parse boundary, and
// every one of those was rescued by Gemini or lost outright. The cause was never
// measured because the raw answers were not kept.
//
// openai/gpt-oss-20b is not on the strict-schema list, so Groq does not enforce
// the schema for it: the contract is carried in the prompt and the model is free
// to write whatever it likes. The models on that list are enforced by the
// provider. This runs the same questions - the exact seven that failed - through
// each candidate model and reports who parses, who routes correctly, and what it
// costs, keeping every raw answer for offline replay.
//
// Run:
//
//	AI_EVAL_ENABLED=1 go test -tags ai_eval -count=1 ./internal/service/ \
//	  -run TestGroqPlannerModelShootout -v -timeout 1800s
//
// AI_GROQ_SHOOTOUT_MODELS overrides the candidates (comma separated),
// AI_GROQ_SHOOTOUT_PAUSE_SECONDS the pacing. -count=1 is required: without it Go
// serves the previous run's cached result without calling anything.

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// groqShootoutQuestions are the questions Groq failed to parse on 21 Aug. A
// model that fixes nothing here fixes nothing at all.
var groqShootoutQuestions = []string{
	"สรุปสถานการณ์ร้านช่วงนี้หน่อย",
	"วิเคราะห์เมนูให้หน่อย ตัวไหนดาวเด่นตัวไหนตัวถ่วง",
	"สวัสดีครับ",
	"ช่วยทำการบ้านคณิตให้หน่อย",
	"เช็คสต๊อกให้หน่อย",
	"which menu sells best",
	"เทียบยอดเดือนนี้กับเดือนก่อน",
}

func groqShootoutModels() []string {
	if raw := strings.TrimSpace(os.Getenv("AI_GROQ_SHOOTOUT_MODELS")); raw != "" {
		models := make([]string, 0, 4)
		for _, model := range strings.Split(raw, ",") {
			if model = strings.TrimSpace(model); model != "" {
				models = append(models, model)
			}
		}
		return models
	}
	return []string{
		// Today's production choice: no provider-side schema enforcement.
		"openai/gpt-oss-20b",
		// Same family, strict schema enforced by Groq.
		"openai/gpt-oss-120b",
	}
}

func groqShootoutPause() time.Duration {
	raw := strings.TrimSpace(os.Getenv("AI_GROQ_SHOOTOUT_PAUSE_SECONDS"))
	seconds, err := strconv.Atoi(raw)
	if raw == "" || err != nil || seconds < 0 {
		// Each planning prompt is roughly 4.7k tokens against an 8k-per-minute
		// window per key. Four keys rotate, so this keeps the run measuring
		// routing instead of measuring rate limits.
		seconds = 12
	}
	return time.Duration(seconds) * time.Second
}

type groqShootoutOutcome struct {
	model    string
	question string
	expected AIToolName
	parsed   bool
	tool     AIToolName
	clarify  bool
	callErr  string
	parseErr string
	millis   int64
	input    int
	output   int
}

func TestGroqPlannerModelShootout(t *testing.T) {
	svc := liveAIServiceOrSkip(t)
	keys := svc.getGroqKeys()
	if len(keys) == 0 {
		t.Skip("ไม่มี GROQ_API_KEYS")
	}
	installPlannerCorpusRecorder(t)

	expectedTools := make(map[string]AIToolName)
	for _, goldenCase := range loadGoldenCases(t) {
		expectedTools[goldenCase.Question] = goldenCase.ExpectedTool
	}

	models := groqShootoutModels()
	pause := groqShootoutPause()
	actor := AIActorContext{RestaurantID: 1, OwnerUserID: 1, Role: "owner"}
	outcomes := make([]groqShootoutOutcome, 0, len(models)*len(groqShootoutQuestions))

	t.Logf("ทดสอบ %d โมเดล × %d คำถาม (เว้น %s ต่อครั้ง) ≈ %s",
		len(models), len(groqShootoutQuestions), pause,
		(time.Duration(len(models)*len(groqShootoutQuestions)) * (pause + 4*time.Second)).Round(time.Second))

	first := true
	for _, model := range models {
		t.Setenv("GROQ_PLANNER_MODEL", model)
		provider := NewGroqStructuredPlannerProvider(svc.httpClient, keys, &svc.keyHealth)
		if provider == nil {
			t.Fatalf("สร้าง provider สำหรับ %s ไม่ได้", model)
		}

		for _, question := range groqShootoutQuestions {
			if !first && pause > 0 {
				time.Sleep(pause)
			}
			first = false
			outcomes = append(outcomes, runGroqShootoutCase(t, provider, model, question, expectedTools[question], actor))
		}
	}

	report := buildGroqShootoutReport(outcomes, models)
	t.Log("\n" + report)
	writeReadinessReport(t, report)
}

func runGroqShootoutCase(
	t *testing.T,
	provider StructuredPlannerProvider,
	model string,
	question string,
	expected AIToolName,
	actor AIActorContext,
) groqShootoutOutcome {
	t.Helper()
	outcome := groqShootoutOutcome{model: model, question: question, expected: expected}

	normalized, err := normalizeStructuredPlannerRequest(StructuredPlannerRequest{
		Question:      question,
		ReferenceTime: time.Now(),
	})
	if err != nil {
		outcome.callErr = err.Error()
		return outcome
	}
	systemPrompt, userPrompt, err := structuredPlannerPrompts(normalized)
	if err != nil {
		outcome.callErr = err.Error()
		return outcome
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	start := time.Now()
	response, callErr := provider.GenerateResolvedPlan(ctx, StructuredPlannerProviderRequest{
		SchemaName:   "resolved_plan_v1",
		SystemPrompt: systemPrompt,
		UserPrompt:   userPrompt,
		JSONSchema:   ResolvedPlanJSONSchema(),
	})
	outcome.millis = time.Since(start).Milliseconds()
	outcome.input, outcome.output = response.InputTokens, response.OutputTokens
	if callErr != nil {
		outcome.callErr = callErr.Error()
		t.Logf("  %-22s %-44s ❌ เรียกไม่ได้: %v", model, truncateForLog(question, 42), callErr)
		return outcome
	}

	plan, parseErr := ParseStructuredPlannerResolvedPlan(response.RawJSON, normalized.Question)
	// Keep the answer whatever the verdict: a failure is the more valuable
	// record, because it is the one the replay test needs to work against.
	stage := StructuredPlannerFailureStage("")
	if parseErr != nil {
		stage = StructuredPlannerFailureParse
	}
	recordStructuredPlannerRaw(StructuredPlannerRawRecord{
		Provider:     StructuredPlannerProviderGroq,
		Model:        model,
		Question:     normalized.Question,
		RawJSON:      response.RawJSON,
		FailureStage: stage,
		Error:        errorText(parseErr),
		Note:         "groq model shootout",
	})
	if parseErr != nil {
		outcome.parseErr = parseErr.Error()
		t.Logf("  %-22s %-44s ❌ parse: %v", model, truncateForLog(question, 42), parseErr)
		return outcome
	}

	outcome.parsed = true
	prepared, prepErr := prepareAuthorizedPlannerResult(StructuredPlannerResult{
		Plan: plan, Provider: StructuredPlannerProviderGroq, Model: model,
	}, actor)
	switch {
	case prepErr != nil:
		outcome.parseErr = prepErr.Error()
	case prepared.clarification != "" || prepared.router.Task == AITaskUnclear:
		outcome.clarify = true
	default:
		outcome.tool = prepared.router.SuggestedTool
	}
	t.Logf("  %-22s %-44s ✅ %s", model, truncateForLog(question, 42), describeGroqShootoutRouting(outcome))
	return outcome
}

func (o groqShootoutOutcome) routesCorrectly() bool {
	if o.expected == "" {
		return o.parsed && o.tool == ""
	}
	return o.tool == o.expected
}

func describeGroqShootoutRouting(o groqShootoutOutcome) string {
	switch {
	case o.clarify:
		return "ถามกลับ"
	case o.tool == "":
		return "(ไม่มี tool)"
	default:
		return string(o.tool)
	}
}

func buildGroqShootoutReport(outcomes []groqShootoutOutcome, models []string) string {
	var b strings.Builder
	b.WriteString("═══════ Groq: โมเดลไหนถือสัญญาได้จริง ═══════\n")
	fmt.Fprintf(&b, "เวลาทดสอบ : %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&b, "คำถาม     : %d ข้อ (ชุดที่ groq:parse ล้มเมื่อ 21 ส.ค.)\n\n", len(groqShootoutQuestions))

	for _, model := range models {
		var parsed, routed, calls, failedCalls int
		var millis int64
		var input, output int
		for _, outcome := range outcomes {
			if outcome.model != model {
				continue
			}
			calls++
			millis += outcome.millis
			input += outcome.input
			output += outcome.output
			if outcome.callErr != "" {
				failedCalls++
			}
			if outcome.parsed {
				parsed++
			}
			if outcome.routesCorrectly() {
				routed++
			}
		}
		if calls == 0 {
			continue
		}
		fmt.Fprintf(&b, "%s\n", model)
		fmt.Fprintf(&b, "  ผ่าน parse   : %d/%d\n", parsed, calls)
		fmt.Fprintf(&b, "  เลือก tool ถูก: %d/%d\n", routed, calls)
		fmt.Fprintf(&b, "  เรียกไม่ได้   : %d\n", failedCalls)
		fmt.Fprintf(&b, "  เวลาเฉลี่ย    : %d ms\n", millis/int64(calls))
		fmt.Fprintf(&b, "  token         : เข้า %d / ออก %d (เฉลี่ย %d ต่อคำถาม)\n\n",
			input, output, (input+output)/calls)
	}

	b.WriteString("รายเคส\n")
	for _, outcome := range outcomes {
		verdict := "✓"
		detail := describeGroqShootoutRouting(outcome)
		switch {
		case outcome.callErr != "":
			verdict, detail = "✗", "เรียกไม่ได้: "+outcome.callErr
		case outcome.parseErr != "":
			verdict, detail = "✗", "parse: "+outcome.parseErr
		case !outcome.routesCorrectly():
			verdict = "✗"
			expected := string(outcome.expected)
			if expected == "" {
				expected = "(ไม่ควรมี tool)"
			}
			detail = detail + " (ควรได้ " + expected + ")"
		}
		fmt.Fprintf(&b, "  %s %-22s %-46s %s\n", verdict, outcome.model,
			truncateForLog(outcome.question, 44), detail)
	}
	return b.String()
}
