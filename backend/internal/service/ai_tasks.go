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
	AIToolGetLowestMarginMenu AIToolName = "get_lowest_margin_menu"
)

type AITaskRoute struct {
	Task AITask
	Tool AIToolName
}

type AIToolResult struct {
	Tool             AIToolName
	LowestMarginMenu *repository.AIMenuMarginSummary
}

func resolveLocalTask(question string) (AITaskRoute, bool) {
	if requestsLowestMarginFact(question) {
		return AITaskRoute{Task: AITaskRetrieveFact, Tool: AIToolGetLowestMarginMenu}, true
	}
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
	}
	return "", false
}
