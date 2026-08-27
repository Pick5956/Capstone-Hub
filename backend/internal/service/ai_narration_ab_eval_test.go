//go:build ai_eval

package service

// Does the rewritten narration actually read better than the template?
//
// The change was made on an argument — that a 180-character opener over an
// unchanging Go template could only ever produce the same answer twice — so it
// has to be checked against what a provider really writes, not against the
// argument. Each case prints the answer as the owner saw it BEFORE (the Go
// template alone, which is exactly what AI_NARRATION=off still returns today)
// and AFTER (the same template with the narration on top), so the two can be
// read side by side.
//
// The tool results here are built by hand rather than read from a database: the
// text under test is rendered by localToolAnswer from those fields, so the
// strings are the real production templates, and the run needs no live shop.
//
// Run:
//
//	AI_EVAL_ENABLED=1 go test -tags ai_eval -count=1 ./internal/service/ \
//	  -run TestNarrationBeforeAfter -v -timeout 900s
//
// Cost is small — the prompt is the question plus the answer already computed,
// a few hundred tokens — but it is one provider call per case, so keep the set
// short. -count=1 is required or Go replays the previous run without calling
// anything.

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"Project-M/internal/repository"
)

type narrationCase struct {
	question   string
	result     AIToolResult
	insights   []AIInsight
	insightsWhy string
}

func narrationCases() []narrationCase {
	return []narrationCase{
		{
			question: "เมนูไหนกำไรดีสุด",
			result: AIToolResult{
				Tool: AIToolGetHighestMarginMenu,
				HighestMarginMenu: &repository.AIMenuMarginSummary{
					MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 184,
					Revenue: 27600, Cost: 9660, Profit: 17940, Margin: 65.00,
				},
			},
			insightsWhy: "ไม่มีข้อสังเกตที่เกี่ยวข้อง",
		},
		{
			question: "เมนูไหนขายดีที่สุด",
			result: AIToolResult{
				Tool: AIToolGetTopSellingMenus,
				TopSellingMenus: []repository.AIMenuSummary{
					{MenuName: "ข้าวผัดปู", Quantity: 312, Revenue: 43680},
					{MenuName: "ต้มยำกุ้งน้ำข้น", Quantity: 184, Revenue: 27600},
					{MenuName: "ปีกไก่ทอดน้ำปลา", Quantity: 151, Revenue: 13590},
				},
			},
			insights: []AIInsight{{
				Kind: "plowhorse", Severity: "info",
				Title: "ข้าวผัดปู ขายดี", Metric: "กำไรบาง",
				Detail: "ขายดีแต่มาร์จิ้นต่ำ ลองทบทวนต้นทุนหรือปรับราคาเพื่อเพิ่มกำไรรวมครับ",
			}},
			insightsWhy: "เมนูอันดับหนึ่งเป็นตัวที่กำไรบาง",
		},
		{
			question: "ยอดขายช่วงนี้เป็นยังไงบ้าง",
			result: AIToolResult{
				Tool:        AIToolGetSalesSummary,
				SalesSummary: &AISalesSummary{Days: 30, Orders: 1284, Revenue: 412750},
			},
			insights: []AIInsight{{
				Kind: "sales_drop", Severity: "warning",
				Title: "ยอดขายตก (7 วัน)", Metric: "-18%",
				Detail: "7 วันล่าสุด 12,400 บาท เทียบ 7 วันก่อนหน้า 15,100 บาท",
			}},
			insightsWhy: "ยอดรวมดูดี แต่ 7 วันล่าสุดกำลังตก",
		},
		{
			question: "วัตถุดิบอะไรใกล้หมดบ้าง",
			result: AIToolResult{
				Tool: AIToolGetLowStockIngredients,
				LowStockIngredients: []AIStockRisk{
					{Name: "กุ้งสด", Category: "เนื้อสัตว์", Stock: 2.5, MinStock: 5, Unit: "กิโลกรัม"},
					{Name: "มะนาว", Category: "ผัก", Stock: 1.2, MinStock: 3, Unit: "กิโลกรัม"},
				},
			},
			insights: []AIInsight{{
				Kind: "ingredient_low", Severity: "critical",
				Title: "กุ้งสด ใกล้หมด", Metric: "พออีก 1 วัน",
				Detail: "เหลือ 2.50 กิโลกรัม ใช้เฉลี่ย 2.20 กิโลกรัม/วัน ควรสั่งเพิ่มครับ",
			}},
			insightsWhy: "ตัวแรกวิกฤตกว่าที่รายการบอก",
		},
	}
}

func narrationCaseLimit() int {
	raw := strings.TrimSpace(os.Getenv("AI_NARRATION_AB_CASES"))
	limit, err := strconv.Atoi(raw)
	if raw == "" || err != nil || limit <= 0 {
		return len(narrationCases())
	}
	return limit
}

func TestNarrationBeforeAfter(t *testing.T) {
	svc := liveAIServiceOrSkip(t)

	cases := narrationCases()
	if limit := narrationCaseLimit(); limit < len(cases) {
		cases = cases[:limit]
	}

	var improved, rejected, unavailable int
	for index, testCase := range cases {
		if index > 0 {
			// The per-minute token window is shared by every key on the account.
			time.Sleep(8 * time.Second)
		}

		before, ok := localToolAnswer(testCase.result)
		if !ok {
			t.Fatalf("[%d] the deterministic template produced nothing", index+1)
		}

		start := time.Now()
		after := svc.narrateDeterministicAnswer(testCase.question, before, testCase.insights)
		elapsed := time.Since(start)

		t.Logf("\n══════════ %d/%d  %s ══════════", index+1, len(cases), testCase.question)
		t.Logf("ข้อสังเกตที่ส่งเข้าไป: %s", testCase.insightsWhy)
		t.Logf("\n───── ก่อน (AI_NARRATION=off) ─────\n%s", before)

		switch {
		case after == before:
			unavailable++
			t.Logf("\n───── หลัง ─────\n(ไม่มีอะไรเพิ่ม — provider ล้มเหลว หรือถูกด่านตรวจตัวเลขปัดตก)")
		default:
			improved++
			added := strings.TrimSuffix(after, "\n\n"+before)
			t.Logf("\n───── หลัง (%d ms) ─────\n%s\n\n%s", elapsed.Milliseconds(), added, before)
			t.Logf("\nประโยคที่เพิ่มมา: %d ตัวอักษร (เพดาน %d)", len([]rune(added)), maxNarrationRunes)
			if !narrationUsesOnlyKnownNumbers(added, allowedNumbers(before+" "+formatNarrationInsights(testCase.insights))) {
				// Should be unreachable: the same check gates the value above.
				t.Errorf("[%d] ตัวเลขหลุดด่านตรวจ", index+1)
				rejected++
			}
		}
	}

	t.Logf("\n═══════════════════════════════")
	t.Logf("สรุป: เขียนเพิ่มได้ %d/%d เคส · ไม่มีอะไรเพิ่ม %d · ตัวเลขหลุด %d",
		improved, len(cases), unavailable, rejected)
	if improved == 0 {
		t.Error("ไม่มีเคสไหนได้ข้อความเพิ่มเลย — ชั้นเรียบเรียงไม่ทำงาน")
	}
	fmt.Fprintln(os.Stdout)
}
