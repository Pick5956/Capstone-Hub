package service

import (
	"strings"
	"testing"

	"Project-M/internal/repository"
)

func TestResolveLocalTaskSeparatesConceptQuestionsFromRestaurantAnalysis(t *testing.T) {
	for _, question := range []string{
		"มาร์จิ้นคืออะไร",
		"Margin หมายถึงอะไร",
		"what is margin?",
	} {
		route, ok := resolveLocalTask(question)
		if !ok || route.Task != AITaskExplainConcept || route.Tool != "" {
			t.Fatalf("resolveLocalTask(%q) = %+v, %t; want explain_concept without a data tool", question, route, ok)
		}
	}
}

func TestConceptQuestionAnswersWithoutProviderOrSnapshot(t *testing.T) {
	svc := &AIService{}

	response, err := svc.AskOperations(1, &AIAskRequest{Question: "มาร์จิ้นคืออะไร"})
	if err != nil {
		t.Fatalf("AskOperations margin concept: %v", err)
	}
	if response.Intent != AIIntentChat || response.Task != AITaskExplainConcept || response.Model != "local-knowledge" {
		t.Fatalf("margin concept response route = intent %q, task %q, model %q", response.Intent, response.Task, response.Model)
	}
	if response.Snapshot.GeneratedAt != "" || len(response.Snapshot.LowMarginMenus) != 0 {
		t.Fatalf("margin concept loaded operational data unexpectedly: %+v", response.Snapshot)
	}
	for _, expected := range []string{"Margin", "รายได้", "ต้นทุน", "40%"} {
		if !strings.Contains(response.Answer, expected) {
			t.Fatalf("margin concept answer is missing %q: %s", expected, response.Answer)
		}
	}
	for _, unrelated := range []string{"สั่งซื้อ", "เพิ่มสต็อก", "มัสมั่น"} {
		if strings.Contains(response.Answer, unrelated) {
			t.Fatalf("margin concept answer contains unrelated action %q: %s", unrelated, response.Answer)
		}
	}
}

func TestResolveLocalTaskMapsLowestMarginParaphrasesToReadOnlyTool(t *testing.T) {
	for _, question := range []string{
		"เมนูไหนมี Margin ต่ำที่สุด",
		"จานไหนมาร์จิ้นน้อยที่สุด",
		"what is the lowest margin menu?",
	} {
		route, ok := resolveLocalTask(question)
		if !ok || route.Task != AITaskRetrieveFact || route.Tool != AIToolGetLowestMarginMenu {
			t.Fatalf("resolveLocalTask(%q) = %+v, %t; want lowest-margin tool", question, route, ok)
		}
	}
}

func TestLowestMarginToolFormatsValidatedAggregateAndAverageValues(t *testing.T) {
	snapshot := AISnapshot{
		AnalysisReadiness: analysisReadinessFromCoverage(repository.AIAnalysisCoverage{
			SalesItems:           20,
			MarginItems:          20,
			CostedMarginItems:    20,
			SoldMenus:            1,
			SoldMenusWithRecipes: 1,
		}),
		LowMarginMenus: []repository.AIMenuMarginSummary{{
			MenuName: "ข้าวผัดปู",
			Quantity: 20,
			Revenue:  1900,
			Cost:     1250,
			Profit:   650,
			Margin:   34.21,
		}},
	}

	result, err := executeReadOnlyTool(AIToolGetLowestMarginMenu, snapshot)
	if err != nil {
		t.Fatalf("executeReadOnlyTool: %v", err)
	}
	answer, ok := localToolAnswer(result)
	if !ok {
		t.Fatal("lowest-margin tool should produce an answer when validated data is available")
	}
	for _, expected := range []string{"ต้นทุนรวม 1250.00 บาท", "ต้นทุนเฉลี่ยต่อจาน 62.50 บาท", "กำไรเฉลี่ยต่อจาน 32.50 บาท"} {
		if !strings.Contains(answer, expected) {
			t.Fatalf("lowest margin answer is missing %q: %s", expected, answer)
		}
	}
}
