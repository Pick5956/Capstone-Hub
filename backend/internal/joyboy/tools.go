package joyboy

import (
	"encoding/json"
	"regexp"
	"strings"
)

const selectToolsTemplate = `คุณคือผู้ช่วยของเจ้าของร้านอาหาร กำลังจะตอบคำถามด้านล่าง

คำถาม:
%s
%s
เครื่องมือที่เรียกได้:
%s

ตอบกลับเป็น JSON array ของชื่อเครื่องมือที่ต้องใช้เท่านั้น ห้ามมีข้อความอื่น
เลือกได้หลายตัว เช่น ["get_top_selling_menus","get_low_stock_ingredients"]
ถ้าคำถามไม่ต้องใช้ข้อมูลของร้านเลย เช่นทักทายหรือถามความหมายของศัพท์ ให้ตอบ []`

func renderCatalogue(tools []ToolSpec) string {
	lines := make([]string, 0, len(tools))
	for _, tool := range tools {
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
