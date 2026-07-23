package service

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"Project-M/internal/repository"
)

// AITask describes what kind of work the assistant should perform before it
// decides how to answer. This is intentionally narrower than the chat intent.
type AITask string

const (
	AITaskExplainConcept  AITask = "explain_concept"
	AITaskScopeQuestion   AITask = "scope_question"
	AITaskRetrieveFact    AITask = "retrieve_fact"
	AITaskAnalyzeData     AITask = "analyze_data"
	AITaskRecommendAction AITask = "recommend_action"

	// New structured task types
	AITaskGeneralChat       AITask = "general_chat"
	AITaskRestaurantAdvice  AITask = "restaurant_advice"
	AITaskRestaurantContent AITask = "restaurant_content"
	AITaskProductHelp       AITask = "product_help"
	AITaskRiskyAction       AITask = "risky_action"
	AITaskUnclear           AITask = "unclear"
	AITaskOutOfScope        AITask = "out_of_scope"
)

type AIToolName string

const (
	AIToolGetLowestMarginMenu    AIToolName = "get_lowest_margin_menu"
	AIToolGetHighestMarginMenu   AIToolName = "get_highest_margin_menu"
	AIToolGetLowStockIngredients AIToolName = "get_low_stock_ingredients"
	AIToolGetTopSellingMenus     AIToolName = "get_top_selling_menus"
	AIToolGetInventoryValuation  AIToolName = "get_inventory_valuation"
	AIToolGetSalesSummary        AIToolName = "get_sales_summary"
)

type AITaskRoute struct {
	Task AITask
	Tool AIToolName
}

type AIRouterResult struct {
	Task                AITask     `json:"task"`
	Confidence          float64    `json:"confidence"`
	NeedsRestaurantData bool       `json:"needs_restaurant_data"`
	NeedsTool           bool       `json:"needs_tool"`
	Risk                string     `json:"risk"`
	SuggestedTool       AIToolName `json:"suggested_tool,omitempty"`
}

type AIToolResult struct {
	Tool                AIToolName
	LowestMarginMenu    *repository.AIMenuMarginSummary
	HighestMarginMenu   *repository.AIMenuMarginSummary
	LowStockIngredients []AIStockRisk
	TopSellingMenus     []repository.AIMenuSummary
	InventoryValuation  *AIInventorySummary
	SalesSummary        *AISalesSummary
}

type AISalesSummary struct {
	Days    int
	Orders  int64
	Revenue float64
}

func isSupportedReadOnlyTool(tool AIToolName) bool {
	switch tool {
	case AIToolGetLowestMarginMenu, AIToolGetHighestMarginMenu, AIToolGetLowStockIngredients, AIToolGetTopSellingMenus, AIToolGetInventoryValuation, AIToolGetSalesSummary:
		return true
	default:
		return false
	}
}

// enforceRouterPolicy treats model routing as a proposal. The backend decides
// which data and tools may actually be used.
func enforceRouterPolicy(result AIRouterResult) (AIRouterResult, error) {
	if result.Confidence < 0 || result.Confidence > 1 {
		return AIRouterResult{}, errors.New("AI router returned confidence outside 0..1")
	}
	result.Risk = strings.ToLower(strings.TrimSpace(result.Risk))
	switch result.Risk {
	case "", "low":
		result.Risk = "low"
	case "medium", "high":
	default:
		return AIRouterResult{}, errors.New("AI router returned unsupported risk level")
	}

	switch result.Task {
	case AITask("restaurant_data"), AITaskRetrieveFact, AITaskAnalyzeData, AITaskRecommendAction:
		// These flows are read-only; readiness and tool policy guard any
		// recommendation before a user performs a change.
		result.Risk = "low"
		result.NeedsRestaurantData = true
		if result.SuggestedTool != "" {
			if !isSupportedReadOnlyTool(result.SuggestedTool) {
				return AIRouterResult{}, errors.New("AI router returned unsupported read-only tool")
			}
			result.NeedsTool = true
			if result.Task == AITask("restaurant_data") || result.Task == AITaskAnalyzeData {
				result.Task = AITaskRetrieveFact
			}
			return result, nil
		}
		if result.NeedsTool || result.Task == AITaskRetrieveFact {
			return AIRouterResult{}, errors.New("AI router requested a fact tool without a supported tool name")
		}
		if result.Task == AITask("restaurant_data") {
			result.Task = AITaskAnalyzeData
		}
		result.NeedsTool = false
		return result, nil
	case AITaskRiskyAction:
		result.NeedsRestaurantData = false
		result.NeedsTool = false
		result.SuggestedTool = ""
		return result, nil
	case AITaskExplainConcept, AITaskScopeQuestion, AITaskGeneralChat, AITaskRestaurantAdvice,
		AITaskRestaurantContent, AITaskProductHelp, AITaskUnclear, AITaskOutOfScope:
		result.NeedsRestaurantData = false
		result.NeedsTool = false
		result.SuggestedTool = ""
		return result, nil
	default:
		return AIRouterResult{}, errors.New("AI router returned unsupported task")
	}
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
	return "มาร์จิ้น (Margin) คือเปอร์เซ็นต์กำไรเทียบกับรายได้ครับ\n\n" +
		"- สูตร: `(รายได้ - ต้นทุน) / รายได้ x 100`\n" +
		"- ตัวอย่าง: ขาย 100 บาท ต้นทุน 60 บาท Margin เท่ากับ 40%\n\n" +
		"ในระบบนี้จะยืนยัน Margin เมื่อรายการขายมีต้นทุนวัตถุดิบครบครับ", true
}

func requestedTopSellingLimit(question string) (int, bool) {
	normalized := strings.ToLower(strings.TrimSpace(question))
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(\d+)\s*(?:อันดับ|รายการ|เมนู)`),
		regexp.MustCompile(`(?:top|first)\s*(\d+)`),
	}
	for _, pattern := range patterns {
		match := pattern.FindStringSubmatch(normalized)
		if len(match) < 2 {
			continue
		}
		limit, err := strconv.Atoi(match[1])
		if err == nil && limit > 0 {
			return limit, true
		}
	}
	return 0, false
}

func executeReadOnlyTool(tool AIToolName, snapshot AISnapshot, question ...string) (AIToolResult, error) {
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
	case AIToolGetHighestMarginMenu:
		if !snapshot.AnalysisReadiness.CanAnalyzeMargin {
			return AIToolResult{Tool: tool}, nil
		}
		if len(snapshot.HighMarginMenus) == 0 {
			return AIToolResult{Tool: tool}, nil
		}
		menu := snapshot.HighMarginMenus[0]
		return AIToolResult{Tool: tool, HighestMarginMenu: &menu}, nil
	case AIToolGetLowStockIngredients:
		return AIToolResult{Tool: tool, LowStockIngredients: snapshot.StockRisks}, nil
	case AIToolGetTopSellingMenus:
		menus := snapshot.TopMenuItems
		limit := 5
		if len(question) > 0 {
			if requested, ok := requestedTopSellingLimit(question[0]); ok {
				limit = requested
			}
		}
		if limit < len(menus) {
			menus = menus[:limit]
		}
		return AIToolResult{Tool: tool, TopSellingMenus: menus}, nil
	case AIToolGetInventoryValuation:
		return AIToolResult{Tool: tool, InventoryValuation: &snapshot.InventorySummary}, nil
	case AIToolGetSalesSummary:
		summary := AISalesSummary{Days: len(snapshot.SalesDays)}
		for _, day := range snapshot.SalesDays {
			summary.Orders += day.Orders
			summary.Revenue += day.Revenue
		}
		return AIToolResult{Tool: tool, SalesSummary: &summary}, nil
	default:
		return AIToolResult{}, errors.New("unsupported AI tool")
	}
}

func localToolAnswer(result AIToolResult) (string, bool) {
	switch result.Tool {
	case AIToolGetLowestMarginMenu:
		menu := result.LowestMarginMenu
		if menu == nil || menu.Quantity <= 0 {
			return "ตอนนี้ยังไม่มีข้อมูล Margin ของเมนูที่ยืนยันได้จากรายการขายและต้นทุนที่บันทึกครบครับ", true
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

	case AIToolGetHighestMarginMenu:
		menu := result.HighestMarginMenu
		if menu == nil || menu.Quantity <= 0 {
			return "ตอนนี้ยังไม่มีข้อมูล Margin ของเมนูที่ยืนยันได้จากรายการขายและต้นทุนที่บันทึกครบครับ", true
		}
		quantity := float64(menu.Quantity)
		return fmt.Sprintf(
			"เมนูที่ทำกำไรได้ดีที่สุด (Margin สูงสุด) คือ %s ครับ\n\n- ขายได้ %d จาน\n- รายได้รวม %.2f บาท\n- ต้นทุนรวม %.2f บาท\n- กำไรรวม %.2f บาท\n- Margin %.2f%%\n- ต้นทุนเฉลี่ยต่อจาน %.2f บาท\n- กำไรเฉลี่ยต่อจาน %.2f บาท\n\nเมนูนี้เป็นตัวทำกำไรหลักของร้าน เหมาะกับการผลักดันให้ขายมากขึ้น หากต้องการวิเคราะห์แนวทางโปรโมทหรือจัดเซ็ต ผมจะช่วยประเมินเป็นขั้นถัดไปครับ",
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
	case AIToolGetSalesSummary:
		summary := result.SalesSummary
		if summary == nil {
			return "ยังไม่มีข้อมูลยอดขายที่ยืนยันได้ในช่วง 14 วันล่าสุดครับ", true
		}
		return fmt.Sprintf(
			"ยอดขายรวมช่วง 14 วันล่าสุดคือ %.2f บาทครับ\n\n- จำนวนออเดอร์รวม %d ออเดอร์\n- วันที่มีรายการขาย %d วัน",
			summary.Revenue,
			summary.Orders,
			summary.Days,
		), true
	}
	return "", false
}
