package service

import (
	"errors"
	"fmt"
	"strings"

	"Project-M/internal/repository"
)

// AITask describes what kind of work the assistant should perform before it
// decides how to answer. This is intentionally narrower than the chat intent.
type AITask string

const (
	AITaskExplainConcept  AITask = "explain_concept"
	AITaskRetrieveFact    AITask = "retrieve_fact"
	AITaskAnalyzeData     AITask = "analyze_data"
	AITaskRecommendAction AITask = "recommend_action"
)

type AIToolName string

const (
	AIToolGetLowestMarginMenu    AIToolName = "get_lowest_margin_menu"
	AIToolGetLowStockIngredients AIToolName = "get_low_stock_ingredients"
	AIToolGetTopSellingMenus     AIToolName = "get_top_selling_menus"
	AIToolGetInventoryValuation  AIToolName = "get_inventory_valuation"
)

type AITaskRoute struct {
	Task AITask
	Tool AIToolName
}

type AIToolResult struct {
	Tool                AIToolName
	LowestMarginMenu    *repository.AIMenuMarginSummary
	LowStockIngredients []AIStockRisk
	TopSellingMenus     []repository.AIMenuSummary
	InventoryValuation  *AIInventorySummary
}

func resolveLocalTask(question string) (AITaskRoute, bool) {
	if requestsMarginConceptExplanation(question) {
		return AITaskRoute{Task: AITaskExplainConcept}, true
	}
	if requestsBusinessDecision(question) {
		return AITaskRoute{Task: AITaskRecommendAction}, true
	}
	return AITaskRoute{}, false
}

func requestsMarginConceptExplanation(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	hasMargin := strings.Contains(normalized, "margin") ||
		strings.Contains(normalized, "มาร์จิ้น") ||
		strings.Contains(normalized, "มาร์จิน")
	if !hasMargin {
		return false
	}
	for _, phrase := range []string{
		"คืออะไร", "หมายถึงอะไร", "แปลว่าอะไร", "คำนวณยังไง", "คำนวณอย่างไร",
		"what is", "what does", "define", "how is", "how do you calculate",
	} {
		if strings.Contains(normalized, phrase) {
			return true
		}
	}
	return false
}

func localConceptAnswer(route AITaskRoute) (string, bool) {
	if route.Task != AITaskExplainConcept {
		return "", false
	}
	return "Margin หรืออัตรากำไร คือสัดส่วนกำไรที่เหลือหลังหักต้นทุนจากรายได้ครับ\n\n" +
		"- สูตร: `(รายได้ - ต้นทุน) / รายได้ x 100`\n" +
		"- ตัวอย่าง: ขายอาหาร 100 บาท ต้นทุนวัตถุดิบ 60 บาท กำไร 40 บาท เท่ากับ Margin 40%\n\n" +
		"ในระบบร้านของเรา Margin เมนูจะอ้างอิงรายการที่เสิร์ฟแล้วและมีการบันทึกต้นทุนวัตถุดิบครบ เพื่อให้ตัวเลขไม่คลาดเคลื่อนครับ", true
}

func executeReadOnlyTool(tool AIToolName, snapshot AISnapshot) (AIToolResult, error) {
	switch tool {
	case AIToolGetLowestMarginMenu:
		if !snapshot.AnalysisReadiness.CanAnalyzeMargin {
			return AIToolResult{Tool: tool}, nil
		}
		if len(snapshot.LowMarginMenus) == 0 {
			return AIToolResult{Tool: tool}, nil
		}
		menu := snapshot.LowMarginMenus[0]
		return AIToolResult{Tool: tool, LowestMarginMenu: &menu}, nil
	case AIToolGetLowStockIngredients:
		return AIToolResult{Tool: tool, LowStockIngredients: snapshot.StockRisks}, nil
	case AIToolGetTopSellingMenus:
		return AIToolResult{Tool: tool, TopSellingMenus: snapshot.TopMenuItems}, nil
	case AIToolGetInventoryValuation:
		return AIToolResult{Tool: tool, InventoryValuation: &snapshot.InventorySummary}, nil
	default:
		return AIToolResult{}, errors.New("unsupported AI tool")
	}
}

func localToolAnswer(result AIToolResult) (string, bool) {
	switch result.Tool {
	case AIToolGetLowestMarginMenu:
		menu := result.LowestMarginMenu
		if menu == nil || menu.Quantity <= 0 {
			return "", false
		}
		quantity := float64(menu.Quantity)
		return fmt.Sprintf(
			"เมนูที่มี Margin ต่ำที่สุดคือ %s ครับ\n\n- ขายได้ %d จาน\n- รายได้รวม %.2f บาท\n- ต้นทุนรวม %.2f บาท\n- กำไรรวม %.2f บาท\n- Margin %.2f%%\n- ต้นทุนเฉลี่ยต่อจาน %.2f บาท\n- กำไรเฉลี่ยต่อจาน %.2f บาท\n\nเมนูนี้เป็นรายการที่ควรตรวจรายละเอียดต้นทุนต่อ หากต้องการวิเคราะห์แนวทางปรับราคาหรือสูตร ผมจะช่วยประเมินเป็นขั้นถัดไปครับ",
			menu.MenuName,
			menu.Quantity,
			menu.Revenue,
			menu.Cost,
			menu.Profit,
			menu.Margin,
			menu.Cost/quantity,
			menu.Profit/quantity,
		), true

	case AIToolGetLowStockIngredients:
		ingredients := result.LowStockIngredients
		if len(ingredients) == 0 {
			return "ปัจจุบันระบบตรวจไม่พบสินค้าคลังที่เสี่ยงหมดหรือหมดสต็อกครับ การจัดการคลังวัตถุดิบทำได้ดีเยี่ยมมากครับ! 👍", true
		}
		var sb strings.Builder
		sb.WriteString("รายการวัตถุดิบที่ใกล้หมดหรือหมดสต็อกมีดังนี้ครับ:\n\n")
		for _, item := range ingredients {
			statusStr := "ใกล้หมด ⚠️"
			if item.Status == "out" {
				statusStr = "หมดสต็อก ❌"
			}
			sb.WriteString(fmt.Sprintf("- **%s** (%s)\n  • สต็อกปัจจุบัน: %.2f %s (เกณฑ์ขั้นต่ำ: %.2f %s)\n  • แนะนำเติมเพิ่ม: **%.2f** %s\n",
				item.Name, statusStr, item.Stock, item.Unit, item.MinStock, item.Unit, item.RestockEstimate, item.Unit))
		}
		sb.WriteString("\nแนะนำให้ทำการสั่งซื้อวัตถุดิบเพื่อป้องกันการขาดแคลนและรักษาความต่อเนื่องในการเสิร์ฟอาหารครับ")
		return sb.String(), true

	case AIToolGetTopSellingMenus:
		menus := result.TopSellingMenus
		if len(menus) == 0 {
			return "ในช่วง 14 วันที่ผ่านมาร้านยังไม่มีข้อมูลบันทึกยอดขายเข้ามาครับ", true
		}
		var sb strings.Builder
		sb.WriteString("เมนูที่ขายดีที่สุดในช่วงวิเคราะห์มีดังนี้ครับ:\n\n")
		limit := len(menus)
		if limit > 5 {
			limit = 5
		}
		for i := 0; i < limit; i++ {
			menu := menus[i]
			avgPrice := 0.0
			if menu.Quantity > 0 {
				avgPrice = menu.Revenue / float64(menu.Quantity)
			}
			sb.WriteString(fmt.Sprintf("%d. **%s**\n  • จำนวนที่ขายได้: %d จาน\n  • รายได้รวม: %.2f บาท (ราคาเฉลี่ย %.2f บาท/จาน)\n",
				i+1, menu.MenuName, menu.Quantity, menu.Revenue, avgPrice))
		}
		return sb.String(), true

	case AIToolGetInventoryValuation:
		val := result.InventoryValuation
		if val == nil {
			return "ไม่พบข้อมูลสรุปมูลค่าคลังสินค้าคงเหลือในระบบครับ", true
		}
		return fmt.Sprintf(
			"สรุปมูลค่าคลังสินค้าคงเหลือในปัจจุบันครับ:\n\n"+
				"- **จำนวนรายการวัตถุดิบทั้งหมด:** %d รายการ\n"+
				"- **วัตถุดิบที่หมดสต็อก:** %d รายการ\n"+
				"- **วัตถุดิบที่เหลือน้อย:** %d รายการ\n"+
				"- **มูลค่าคลังสินค้ารวม:** **%.2f** บาท\n\n"+
				"หากต้องการเช็กรายชื่อวัตถุดิบที่เหลือน้อย สามารถถามว่า \"มีวัตถุดิบอะไรใกล้หมดบ้าง\" ได้เลยครับ",
			val.TotalItems,
			val.OutItems,
			val.LowItems,
			val.Value,
		), true
	}
	return "", false
}
