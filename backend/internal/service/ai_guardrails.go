package service

import (
	"fmt"
	"strings"
)

func localAnalyticalGuardrailAnswer(question string, snapshot AISnapshot) (string, bool) {
	if snapshot.AnalysisReadiness.CanRecommendActions || !requestsBusinessDecision(question) {
		return "", false
	}
	readiness := snapshot.AnalysisReadiness
	if !readiness.HasSales {
		return "ตอนนี้ยังไม่มีข้อมูลยอดขายในช่วงวิเคราะห์ จึงยังแนะนำการปรับราคา ถอดเมนู หรือสั่งซื้อวัตถุดิบไม่ได้ครับ กรุณาบันทึกการขายและตรวจว่าสูตรวัตถุดิบพร้อมก่อน แล้วผมจะช่วยวิเคราะห์ต่อได้", true
	}
	return fmt.Sprintf(
		"ตอนนี้ผมยังแนะนำการปรับราคา ถอดเมนู หรือสั่งซื้อวัตถุดิบจากผลวิเคราะห์ไม่ได้ครับ เพราะข้อมูลต้นทุนหรือสูตรยังไม่ครบ (ต้นทุนครอบคลุม %.0f%%, สูตรครอบคลุม %.0f%%) กรุณาตรวจการผูกสูตรและการตัดสต็อกก่อน แล้วจึงวิเคราะห์การตัดสินใจนี้อีกครั้ง",
		readiness.MarginCostCoveragePercent,
		readiness.MenuRecipeCoveragePercent,
	), true
}

func requestsBusinessDecision(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	for _, phrase := range []string{
		"ปรับราคา", "ขึ้นราคา", "ลดราคา", "เปลี่ยนราคา",
		"ลบเมนู", "ถอดเมนู", "เลิกขาย", "ลดการขาย",
		"ควรซื้อ", "ซื้อวัตถุดิบ", "สั่งซื้อ",
		"increase price", "decrease price", "change price",
		"remove menu", "stop selling", "buy ingredient", "purchase", "restock",
	} {
		if strings.Contains(normalized, phrase) {
			return true
		}
	}
	return false
}

func requestsLowestMarginFact(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	hasMargin := strings.Contains(normalized, "margin") ||
		strings.Contains(normalized, "มาร์จิ้น") ||
		strings.Contains(normalized, "มาร์จิน")
	hasLowest := strings.Contains(normalized, "ต่ำที่สุด") ||
		strings.Contains(normalized, "lowest") ||
		strings.Contains(normalized, "น้อยที่สุด")
	return hasMargin && hasLowest
}

func localLowestMarginFactAnswer(question string, snapshot AISnapshot) (string, bool) {
	if !requestsLowestMarginFact(question) {
		return "", false
	}
	result, err := executeReadOnlyTool(AIToolGetLowestMarginMenu, snapshot)
	if err != nil {
		return "", false
	}
	return localToolAnswer(result)
}
