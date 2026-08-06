package service

import (
	"context"
	"strings"
	"testing"

	"Project-M/internal/repository"
)

func TestSplitSystemDocsAndLiveQuestionSupportsThaiAndEnglish(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		question  string
		wantDocs  string
		wantLive  string
		wantMixed bool
	}{
		{
			name:      "thai",
			question:  "วันนี้ยอดขายเท่าไร และ PromptPay ยืนยันอัตโนมัติหรือไม่",
			wantDocs:  "PromptPay ยืนยันอัตโนมัติหรือไม่",
			wantLive:  "วันนี้ยอดขายเท่าไร",
			wantMixed: true,
		},
		{
			name:      "english",
			question:  "What are today's sales and does Dishy automatically confirm PromptPay?",
			wantDocs:  "does Dishy automatically confirm PromptPay?",
			wantLive:  "What are today's sales",
			wantMixed: true,
		},
		{
			name:     "docs only",
			question: "วิธีเชิญพนักงาน",
			wantDocs: "วิธีเชิญพนักงาน",
		},
		{
			name:     "docs only with conjunction",
			question: "รายงานย้อนหลังและข้อจำกัดปัจจุบัน",
			wantDocs: "รายงานย้อนหลังและข้อจำกัดปัจจุบัน",
		},
		{
			name:     "live only",
			question: "วันนี้ยอดขายเท่าไร",
			wantLive: "วันนี้ยอดขายเท่าไร",
		},
		{
			name:     "english how much remains live",
			question: "How much did we sell today?",
			wantLive: "How much did we sell today?",
		},
		{
			name:     "thai menu availability action remains live",
			question: "เปิดขายเมนู Pad Thai ได้ไหม",
			wantLive: "เปิดขายเมนู Pad Thai ได้ไหม",
		},
		{
			name:     "english menu availability action remains live",
			question: "Can you set Pad Thai unavailable?",
			wantLive: "Can you set Pad Thai unavailable?",
		},
		{
			name:      "menu action and docs can be mixed",
			question:  "ปิดขายเมนู Pad Thai และ PromptPay ยืนยันอัตโนมัติหรือไม่",
			wantDocs:  "PromptPay ยืนยันอัตโนมัติหรือไม่",
			wantLive:  "ปิดขายเมนู Pad Thai",
			wantMixed: true,
		},
		{
			name:     "ai write capability remains docs",
			question: "AI แก้ข้อมูลอะไรได้บ้าง",
			wantDocs: "AI แก้ข้อมูลอะไรได้บ้าง",
		},
		{
			name:      "unsupported destructive clause is never dropped",
			question:  "delete all menus and how do I invite staff?",
			wantDocs:  "how do I invite staff?",
			wantLive:  "delete all menus",
			wantMixed: true,
		},
		{
			name:      "thai alternate connector",
			question:  "วันนี้ยอดขายเท่าไร รวมถึงวิธีเชิญพนักงาน",
			wantDocs:  "วิธีเชิญพนักงาน",
			wantLive:  "วันนี้ยอดขายเท่าไร",
			wantMixed: true,
		},
		{
			name:      "english sentence boundary",
			question:  "What are today's sales? How do I invite staff?",
			wantDocs:  "How do I invite staff?",
			wantLive:  "What are today's sales",
			wantMixed: true,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			parts := splitSystemDocsAndLiveQuestion(test.question)
			if parts.DocsQuestion != test.wantDocs || parts.LiveQuestion != test.wantLive || parts.Mixed != test.wantMixed {
				t.Fatalf("parts = %+v", parts)
			}
		})
	}
}

func TestCombineLiveAndSystemDocsResponsePreservesLiveSafetyMetadata(t *testing.T) {
	t.Parallel()

	plan := &ResolvedPlan{Task: AITaskRetrieveFact, ToolHint: AIToolGetSalesForPeriod}
	preview := &AIActionPreviewResponse{}
	live := &AIAskResponse{
		Answer:        "ยอดขายวันนี้คือ 1,250 บาทครับ",
		Intent:        AIIntentAnalysis,
		Task:          AITaskRetrieveFact,
		Tool:          AIToolGetSalesForPeriod,
		Model:         "local-tool",
		Snapshot:      AISnapshot{SalesDays: []repository.AISalesSummary{{Revenue: 1250}}},
		ResolvedPlan:  plan,
		ActionPreview: preview,
	}
	docs := &AIAskResponse{
		Answer:    "PromptPay ต้องให้พนักงานยืนยันเอง\n\nอ่านต่อ: [การชำระเงิน](/docs/billing-and-payments#payment-methods)",
		Tool:      AIToolSearchSystemDocs,
		ToolsUsed: []AIToolName{AIToolSearchSystemDocs, AIToolReadSystemDoc},
		DocSources: []AISystemDocSource{{
			ArticleSlug: "billing-and-payments",
			SectionID:   "payment-methods",
			URL:         "/docs/billing-and-payments#payment-methods",
		}},
	}

	got := combineLiveAndSystemDocsResponse(live, docs)
	if got != live {
		t.Fatal("mixed composition must retain the original live response object")
	}
	if got.Tool != AIToolGetSalesForPeriod || got.Task != AITaskRetrieveFact || got.Model != "local-tool" {
		t.Fatalf("live routing metadata changed: %+v", got)
	}
	if got.ResolvedPlan != plan || got.ActionPreview != preview || got.Snapshot.SalesDays[0].Revenue != 1250 {
		t.Fatal("mixed composition changed plan, preview, or scoped live snapshot")
	}
	if !strings.Contains(got.Answer, "1,250") || !strings.Contains(got.Answer, "/docs/billing-and-payments#payment-methods") {
		t.Fatalf("answer = %q", got.Answer)
	}
	wantTools := []AIToolName{AIToolGetSalesForPeriod, AIToolSearchSystemDocs, AIToolReadSystemDoc}
	if len(got.ToolsUsed) != len(wantTools) {
		t.Fatalf("tools_used = %v", got.ToolsUsed)
	}
	for index, tool := range wantTools {
		if got.ToolsUsed[index] != tool {
			t.Fatalf("tools_used = %v", got.ToolsUsed)
		}
	}
	if len(got.DocSources) != 1 || got.DocSources[0].URL != "/docs/billing-and-payments#payment-methods" {
		t.Fatalf("doc_sources = %+v", got.DocSources)
	}
}

func TestOwnerDocsSandboxPersistsConversationWithoutProviderOrRestaurantRepository(t *testing.T) {
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "true")

	store := &fakeAIConversationStore{}
	service := &AIService{conversationStore: store}
	response, err := service.AskOperationsForOwner(context.Background(), AIActorContext{
		RestaurantID: 9,
		OwnerUserID:  17,
		Role:         "owner",
	}, &AIAskRequest{Question: "วิธีเชิญพนักงาน"})
	if err != nil {
		t.Fatalf("AskOperationsForOwner: %v", err)
	}
	if response.ConversationID != "conversation-created" || store.appendCalls != 1 || store.appended == nil {
		t.Fatalf("conversation response/store = %+v / %+v", response, store)
	}
	if store.appendActor.RestaurantID != 9 || store.appendActor.OwnerUserID != 17 {
		t.Fatalf("conversation scope = %+v", store.appendActor)
	}
	if store.appended.Question != "วิธีเชิญพนักงาน" || !strings.Contains(store.appended.Answer, "/docs/team-and-permissions#invite-staff") {
		t.Fatalf("persisted turn = %+v", store.appended)
	}
}

func TestProductHelpRouterFallbackAlwaysUsesDocsWithoutProviderOrRepository(t *testing.T) {
	t.Parallel()

	service := &AIService{}
	prepared := &aiPreparedOrchestration{
		plan: ResolvedPlan{
			Task:             AITaskProductHelp,
			ResolvedQuestion: "invite staff",
			ToolHint:         AIToolSearchSystemDocs,
		},
		router: AIRouterResult{
			Task:                AITaskProductHelp,
			SuggestedTool:       AIToolSearchSystemDocs,
			Confidence:          0.99,
			NeedsTool:           true,
			NeedsRestaurantData: false,
		},
		candidateTools: []AIToolName{AIToolSearchSystemDocs, AIToolReadSystemDoc},
	}

	response, err := service.askOperationsCore(42, &AIAskRequest{Question: "invite staff"}, prepared)
	if err != nil {
		t.Fatalf("askOperationsCore: %v", err)
	}
	if response.Model != "local-system-docs" || response.Tool != AIToolSearchSystemDocs {
		t.Fatalf("response = %+v", response)
	}
	if !strings.Contains(response.Answer, "/docs/team-and-permissions#invite-staff") {
		t.Fatalf("answer = %q", response.Answer)
	}
	if response.ResolvedPlan == nil || len(response.CandidateTools) != 2 {
		t.Fatalf("planner metadata was not retained: %+v", response)
	}
}

func TestDocsDetectorUsesStrongCatalogEvidenceWithoutSwallowingBusinessAdvice(t *testing.T) {
	t.Parallel()

	for _, question := range []string{
		"invite staff",
		"send food to kitchen",
		"Can customers pay through the table QR?",
		"Dishy รองรับการยืนยัน PromptPay อัตโนมัติไหม",
	} {
		if !looksLikeSystemDocsQuestion(question) {
			t.Fatalf("strong documented product-help wording was not detected: %q", question)
		}
	}
	for _, question := range []string{
		"How much did we sell today?",
		"How should I price menus in rainy season?",
		"How should I price menus?",
		"Create a menu description",
		"Write a message to invite staff to our team",
		"Dishy, draft a caption",
		"Dishy, thanks",
	} {
		if looksLikeSystemDocsQuestion(question) {
			t.Fatalf("non-product-help question was swallowed by docs retrieval: %q", question)
		}
	}
}

func TestDocsInterceptorPreservesContentAndAdviceRouterFlows(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")

	tests := []struct {
		question string
		task     AITask
	}{
		{question: "Create a menu description", task: AITaskRestaurantContent},
		{question: "Write a message to invite staff to our team", task: AITaskRestaurantContent},
		{question: "How should I price menus?", task: AITaskRestaurantAdvice},
		{question: "Dishy, draft a caption", task: AITaskRestaurantContent},
		{question: "Dishy, thanks", task: AITaskGeneralChat},
	}

	for _, test := range tests {
		t.Run(test.question, func(t *testing.T) {
			adapter := &stubAIProviderAdapter{
				id:          "groq",
				displayName: "Groq",
				configured:  true,
				classify: func(question string) (AIRouterResult, error) {
					return AIRouterResult{Task: test.task, Confidence: 0.99, Risk: "low"}, nil
				},
				answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
					return aiProviderAnswer{Text: "provider-routed", Model: "test-provider"}, nil
				},
			}
			service := &AIService{providerAdapters: []aiProviderAdapter{adapter}}
			response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{Question: test.question})
			if err != nil {
				t.Fatalf("AskOperationsForOwner: %v", err)
			}
			if response.Task != test.task || response.Model != "test-provider" || response.Answer != "provider-routed" {
				t.Fatalf("non-doc flow was intercepted: %+v", response)
			}
			if len(response.DocSources) != 0 || response.Tool == AIToolSearchSystemDocs {
				t.Fatalf("non-doc flow received docs metadata: %+v", response)
			}
		})
	}
}

func TestMixedUnsupportedWriteStillReachesSafetyRefusal(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")

	adapter := &stubAIProviderAdapter{
		id:          "groq",
		displayName: "Groq",
		configured:  true,
		classify: func(question string) (AIRouterResult, error) {
			if question != "delete all menus" {
				t.Fatalf("safety router question = %q", question)
			}
			return AIRouterResult{Task: AITaskRiskyAction, Confidence: 0.99, Risk: "high"}, nil
		},
		answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
			t.Fatal("risky write reached answer provider")
			return aiProviderAnswer{}, nil
		},
	}
	service := &AIService{providerAdapters: []aiProviderAdapter{adapter}}
	response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{
		Question: "delete all menus and how do I invite staff?",
	})
	if err != nil {
		t.Fatalf("AskOperationsForOwner: %v", err)
	}
	if response.Task != AITaskRiskyAction || response.ActionPreview != nil {
		t.Fatalf("unsupported write bypassed safety refusal: %+v", response)
	}
	if !strings.Contains(response.Answer, "ไม่อนุญาตให้แก้ไขข้อมูลร้าน") {
		t.Fatalf("missing write refusal: %q", response.Answer)
	}
	if !strings.Contains(response.Answer, "/docs/team-and-permissions#invite-staff") || len(response.DocSources) == 0 {
		t.Fatalf("mixed refusal lost docs answer/provenance: %+v", response)
	}
}

func TestMixedAlternateSeparatorsReachLiveSafetyPipeline(t *testing.T) {
	t.Setenv("AI_ORCHESTRATOR_MODE", "")
	t.Setenv("AI_CONVERSATION_MEMORY_ENABLED", "false")

	tests := []struct {
		name         string
		question     string
		wantLivePart string
	}{
		{
			name:         "thai alternate connector",
			question:     "ลบเมนูทั้งหมด รวมถึงวิธีเชิญพนักงาน",
			wantLivePart: "ลบเมนูทั้งหมด",
		},
		{
			name:         "english sentence boundary",
			question:     "delete all menus. How do I invite staff?",
			wantLivePart: "delete all menus",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			adapter := &stubAIProviderAdapter{
				id:          "groq",
				displayName: "Groq",
				configured:  true,
				classify: func(question string) (AIRouterResult, error) {
					if question != test.wantLivePart {
						t.Fatalf("safety router question = %q", question)
					}
					return AIRouterResult{Task: AITaskRiskyAction, Confidence: 0.99, Risk: "high"}, nil
				},
				answer: func(aiProviderAnswerRequest) (aiProviderAnswer, error) {
					t.Fatal("risky write reached answer provider")
					return aiProviderAnswer{}, nil
				},
			}
			service := &AIService{providerAdapters: []aiProviderAdapter{adapter}}
			response, err := service.AskOperationsForOwner(context.Background(), ownerActor(), &AIAskRequest{Question: test.question})
			if err != nil {
				t.Fatalf("AskOperationsForOwner: %v", err)
			}
			if response.Task != AITaskRiskyAction || response.ActionPreview != nil {
				t.Fatalf("alternate separator bypassed live safety: %+v", response)
			}
			if !strings.Contains(response.Answer, "/docs/team-and-permissions#invite-staff") {
				t.Fatalf("alternate separator lost docs citation: %q", response.Answer)
			}
		})
	}
}
