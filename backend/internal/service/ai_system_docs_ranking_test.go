package service

import (
	"context"
	"testing"
)

func TestSystemDocsRequiredQuestionsRankTheCitedSectionFirst(t *testing.T) {
	t.Parallel()

	tests := []struct {
		question string
		wantURL  string
	}{
		{"PromptPay ยืนยันอัตโนมัติหรือไม่", "/docs/billing-and-payments#payment-methods"},
		{"ลูกค้าชำระเงินผ่าน QR โต๊ะได้หรือไม่", "/docs/customer-qr-ordering#staff-boundary"},
		{"วิธีเชิญพนักงาน", "/docs/team-and-permissions#invite-staff"},
		{"วิธีส่งอาหารเข้าครัว", "/docs/take-orders#build-round"},
		{"รายงานย้อนหลังและข้อจำกัดปัจจุบัน", "/docs/expenses-and-reports#fourteen-day-report"},
		{"AI แก้ข้อมูลอะไรได้บ้าง", "/docs/ai-assistant#ai-actions"},
		{"Does Dishy automatically confirm PromptPay transfers?", "/docs/billing-and-payments#payment-methods"},
	}

	for _, test := range tests {
		test := test
		t.Run(test.wantURL, func(t *testing.T) {
			t.Parallel()
			result, err := executeSystemDocsTool(AIToolSearchSystemDocs, AISystemDocsToolInput{
				Query: test.question,
				Limit: 1,
			})
			if err != nil {
				t.Fatalf("search_system_docs: %v", err)
			}
			if len(result.SearchResults) != 1 {
				t.Fatalf("results = %+v", result.SearchResults)
			}
			if result.SearchResults[0].URL != test.wantURL {
				t.Fatalf("top result = %+v, want %q", result.SearchResults[0], test.wantURL)
			}
		})
	}
}

func TestSystemDocsOwnerInterceptPreservesOwnerGateAndLiveDataPath(t *testing.T) {
	t.Parallel()

	service := &AIService{}
	if _, err := service.AskOperationsForOwner(context.Background(), AIActorContext{
		RestaurantID: 42,
		OwnerUserID:  7,
		Role:         "manager",
	}, &AIAskRequest{Question: "วิธีเชิญพนักงาน"}); err == nil {
		t.Fatal("docs intercept bypassed the owner gate")
	}

	if response, handled, err := answerSystemDocsQuestion("วันนี้ยอดขายเท่าไร"); err != nil || handled || response != nil {
		t.Fatalf("live-data question was intercepted: response=%+v handled=%v err=%v", response, handled, err)
	}
}
