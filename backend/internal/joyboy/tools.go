package joyboy

import (
	"encoding/json"
	"regexp"
	"strings"
)

// selectToolsTemplate carries one selection rule, and it is here rather than in
// the tool descriptions for a reason. Asked "สรุปสถานการณ์ร้าน" four times the
// model reached for six tools, then four, then four, then five: the same four
// every time plus a different extra each round, so one run reported margins,
// another the average bill, and two neither. Nothing in the system said what a
// store overview has to contain — get_store_summary used to, and was dropped in
// round four for bundling its five topics lossily, with nothing put in its place.
//
// Marking each tool "one of the main sources for a store overview" would say it
// in four places and still never state the full set, so the model could not tell
// whether it had them all. It would also leave that sentence in front of the
// model when someone asks only about stock. One list, in one place, read once
// per question.
//
// The rule names topics rather than tools, so renaming a tool cannot break it,
// and it is a floor rather than a ceiling: reaching for more is what makes this
// worth having over legacy's single fixed bundle.
const selectToolsTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร กำลังจะตอบคำถามด้านล่าง

คำถาม:
%s
%s
เครื่องมือที่เรียกได้:
%s

ถ้าคำถามขอภาพรวมของร้าน เช่น "สรุปสถานการณ์ร้าน" "ร้านเป็นไงบ้าง" "ช่วงนี้เป็นยังไง"
"สรุปให้หน่อย" ให้เลือกเครื่องมือที่ครอบคลุมทั้งสี่เรื่องนี้เสมอ
ยอดขาย · เมนูขายดี · วัตถุดิบที่ใกล้หมด · มูลค่าคงคลัง
หยิบเรื่องอื่นเพิ่มได้ถ้าเห็นว่าเกี่ยวกับคำถาม แต่สี่เรื่องนี้ห้ามขาด

ถ้าคำถามถามวิธีใช้ระบบ Dishy เช่น "เพิ่มเมนูยังไง" "ตั้งค่า...ตรงไหน" "ทำ...ยังไง"
"ระบบทำอะไรได้บ้าง" "มีข้อจำกัดอะไร" "แก้ปัญหา...ยังไง" ให้ใช้ search_system_docs เสมอ
ห้ามตอบจากความรู้ของตัวเองแม้จะคิดว่ารู้ เพราะระบบจริงอาจไม่เหมือนที่คุณเดา

ถ้าคำถามเป็นเรื่องส่วนตัวหรือคุยเล่น ไม่ได้ถามถึงร้าน เช่น "มื้อเย็นทานอะไรดี"
"หิวจัง" "เบื่อจัง" "วันนี้เหนื่อย" ให้ตอบ [] แล้วปล่อยให้ตอบแบบคุยกันธรรมดา
**ห้ามหยิบเครื่องมือเรื่องกำไรหรือยอดขายมาตอบคำถามพวกนี้** เพราะคนถามว่าจะกินอะไรดี
ไม่ได้อยากรู้ว่าเมนูไหนทำกำไรให้ร้านมากที่สุด
ยกเว้นคำถามที่พูดถึงร้านชัดเจน เช่น "ลูกค้าน่าจะชอบเมนูไหน" นั่นถือว่าถามเรื่องร้าน

ตอบกลับเป็น JSON array ของชื่อเครื่องมือที่ต้องใช้เท่านั้น ห้ามมีข้อความอื่น
เลือกได้หลายตัว เช่น ["get_top_selling_menus","get_low_stock_ingredients"]
ถ้าคำถามไม่ต้องใช้ข้อมูลของร้านเลย เช่นทักทายหรือถามความหมายของศัพท์ทั่วไป ให้ตอบ []`

func renderCatalogue(tools []ToolSpec) string {
	lines := make([]string, 0, len(tools))
	currentGroup := ""
	for _, tool := range tools {
		if tool.Group != "" && tool.Group != currentGroup {
			lines = append(lines, "## "+tool.Group)
			currentGroup = tool.Group
		}
		lines = append(lines, "- "+tool.Name+": "+tool.Description)
	}
	return strings.Join(lines, "\n")
}

// jsonArray finds the first bracketed list in a reply. Models wrap the array in
// a code fence or a sentence often enough that insisting on a clean reply would
// throw away a correct selection over packaging.
var jsonArray = regexp.MustCompile(`\[[^\[\]]*\]`)

// parseToolSelection reads the names the model asked for and keeps only the ones
// that exist. An unparseable reply selects nothing, which answers the question
// without data rather than failing it — the right outcome for a greeting, and a
// recoverable one for anything else.
func parseToolSelection(raw string, catalogue []ToolSpec) []string {
	known := make(map[string]struct{}, len(catalogue))
	for _, tool := range catalogue {
		known[tool.Name] = struct{}{}
	}

	match := jsonArray.FindString(raw)
	if match == "" {
		return nil
	}
	var names []string
	if err := json.Unmarshal([]byte(match), &names); err != nil {
		return nil
	}

	selected := make([]string, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if _, exists := known[name]; exists {
			selected = append(selected, name)
		}
	}
	return selected
}
