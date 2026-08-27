package service

import (
	"encoding/json"
	"errors"
	"strings"
)

// Reading a sentence into proposed changes.
//
// This is the one place a model is allowed to shape a command, and its output is
// treated as a proposal, never as truth: names are looked up, units converted,
// numbers bounds-checked, and the owner confirms — all downstream of here. The
// model is asked for JSON only, and anything that is not a well-formed array of
// known fields is discarded rather than guessed at.

// AICommandExtractor proposes structured changes from the owner's words. It is
// an interface so the pipeline can be tested without a provider.
type AICommandExtractor interface {
	ExtractStockCommands(question string, history []AIConversationMessage) ([]AIStockCommandDraft, error)
}

// aiStockExtractionPrompt asks for a strict JSON array. It states the three
// kinds explicitly because "ปรับเป็น" (set) and "เพิ่ม" (add) are different
// writes that sound alike, and tells the model to leave a field empty rather
// than invent it — an empty field becomes a question to the owner, which is
// always better than a confident wrong number.
const aiStockExtractionPrompt = `คุณคือตัวแปลงคำสั่งของผู้ช่วยร้านอาหาร แปลงข้อความของเจ้าของร้านเป็น JSON array เท่านั้น

กฎ:
- ตอบเป็น JSON array อย่างเดียว ห้ามมีข้อความอื่น ห้ามมี markdown
- แต่ละสมาชิกคือ {"name": "ชื่อสิ่งของ", "kind": "ชนิดคำสั่ง", "quantity": ตัวเลข, "unit": "หน่วยที่ผู้ใช้พูด"}

คำสั่งเกี่ยวกับ "วัตถุดิบในคลัง" (name = ชื่อวัตถุดิบ)
- "in" = รับเข้า/เพิ่ม/ซื้อมา · "out" = ตัดออก/ใช้ไป/ทิ้ง · "adjust" = ตั้งยอดใหม่/ปรับเป็น/นับได้
- "min" = ตั้งขั้นต่ำ/แจ้งเตือนเมื่อเหลือ · "cost" = ตั้งราคาต่อหน่วย/ราคาขึ้น (quantity = บาทต่อหน่วย)
- "create" = เพิ่มวัตถุดิบใหม่เข้าคลัง (ต้องมี unit ถ้าผู้ใช้บอก)

คำสั่งเกี่ยวกับ "เมนูที่ขายหน้าร้าน" (name = ชื่อเมนู · quantity เป็น 0 · unit เป็น "")
- "menu_off" = ปิดขาย/หยุดขาย/งดขาย/เอาลง/ของหมดขายไม่ได้แล้ว
- "menu_on"  = เปิดขาย/กลับมาขาย/เอาขึ้นใหม่

กฎร่วม:
- ถ้าผู้ใช้ไม่ได้บอกจำนวน ให้ quantity เป็น 0 · ถ้าไม่ได้บอกหน่วย ให้ unit เป็น ""
- ห้ามเดาชื่อที่ผู้ใช้ไม่ได้พูด ห้ามเดาตัวเลข
- **ยกชื่อมาให้ครบตามที่ผู้ใช้พูด ห้ามตัดให้สั้นลง** เช่น "ต้มยำกุ้งน้ำข้นหมดแล้ว"
  → name="ต้มยำกุ้งน้ำข้น" ไม่ใช่ "ต้มยำกุ้ง"
- **name ต้องเป็นชื่อล้วน ห้ามติดหน่วยหรือคำบอกปริมาณ** เช่น "ไข่ไก่ฟองละ 6" → name="ไข่ไก่" unit="ฟอง"
  · "หมูกิโลละ 180" → name="หมู" unit="กก." · "กะเพรากำละ 10" → name="กะเพรา" unit="กำ"
- ปนกันได้ ข้อความเดียวมีทั้งคำสั่งเมนูและคำสั่งคลังพร้อมกันก็ได้
- **ถ้าเป็นคำถาม ไม่ใช่คำสั่ง ให้ตอบ []** เช่น "เมนูไหนควรปิดขาย" "วัตถุดิบไหนใกล้หมด"
- ถ้าข้อความไม่ใช่คำสั่งเลย ให้ตอบ []

ตัวอย่าง
ข้อความ: "รับกะเพราเข้า 2 กก. หมูสับ 5 กก."
ตอบ: [{"name":"กะเพรา","kind":"in","quantity":2,"unit":"กก."},{"name":"หมูสับ","kind":"in","quantity":5,"unit":"กก."}]

ข้อความ: "ปิดขายต้มยำกุ้ง"
ตอบ: [{"name":"ต้มยำกุ้ง","kind":"menu_off","quantity":0,"unit":""}]

ข้อความ: "ผัดไทยหมดแล้ว เอาลงก่อนนะ"
ตอบ: [{"name":"ผัดไทย","kind":"menu_off","quantity":0,"unit":""}]

ข้อความ: "เปิดขายข้าวผัดกับต้มยำกุ้งด้วย"
ตอบ: [{"name":"ข้าวผัด","kind":"menu_on","quantity":0,"unit":""},{"name":"ต้มยำกุ้ง","kind":"menu_on","quantity":0,"unit":""}]

ข้อความ: "ปิดขายต้มยำกุ้ง แล้วก็รับหมูสับเข้า 2 กก."
ตอบ: [{"name":"ต้มยำกุ้ง","kind":"menu_off","quantity":0,"unit":""},{"name":"หมูสับ","kind":"in","quantity":2,"unit":"กก."}]

ข้อความ: "เมนูไหนควรปิดขายดี"
ตอบ: []

ข้อความ: "ปรับกะเพราเป็น 500 กรัม"
ตอบ: [{"name":"กะเพรา","kind":"adjust","quantity":500,"unit":"กรัม"}]

ข้อความ: "ตัดหมูออก"
ตอบ: [{"name":"หมู","kind":"out","quantity":0,"unit":""}]

ข้อความ: "ตั้งขั้นต่ำกะเพราเป็น 1 กก."
ตอบ: [{"name":"กะเพรา","kind":"min","quantity":1,"unit":"กก."}]

ข้อความ: "หมูขึ้นราคาเป็นกิโลละ 180"
ตอบ: [{"name":"หมู","kind":"cost","quantity":180,"unit":"กก."}]

ข้อความ: "ไข่ไก่ฟองละ 6 บาท"
ตอบ: [{"name":"ไข่ไก่","kind":"cost","quantity":6,"unit":"ฟอง"}]

ข้อความ: "เพิ่มผักชีเข้าคลังหน่อย หน่วยกรัม"
ตอบ: [{"name":"ผักชี","kind":"create","quantity":0,"unit":"กรัม"}]

ข้อความ: "ยอดขายวันนี้เท่าไหร่"
ตอบ: []

ข้อความของเจ้าของร้าน:
`

// ExtractStockCommands asks the model to shape the sentence, including the last
// few turns so an answer to a question ("กรัม") joins the command that prompted
// it without a separate state machine.
func (s *AIService) ExtractStockCommands(question string, history []AIConversationMessage) ([]AIStockCommandDraft, error) {
	if strings.TrimSpace(question) == "" {
		return nil, nil
	}
	prompt := aiStockExtractionPrompt + aiRecentTurnsForExtraction(history) + strings.TrimSpace(question)
	text, _, err := s.askSecondRoundWithOptions(prompt, aiProviderCompleteOptions{ReasoningEffort: "low"})
	if err != nil {
		return nil, err
	}
	return ParseStockCommandDrafts(text)
}

// aiRecentTurnsForExtraction renders the last exchanges so a one-word reply can
// be read against what was asked. Kept short: this round only needs the thread
// of the current command, not the conversation's history.
func aiRecentTurnsForExtraction(history []AIConversationMessage) string {
	if len(history) == 0 {
		return ""
	}
	const maxTurns = 4
	start := len(history) - maxTurns
	if start < 0 {
		start = 0
	}
	var builder strings.Builder
	builder.WriteString("(บทสนทนาก่อนหน้า)\n")
	for _, turn := range history[start:] {
		role := "ผู้ใช้"
		if strings.EqualFold(turn.Role, "assistant") {
			role = "ผู้ช่วย"
		}
		builder.WriteString(role + ": " + strings.TrimSpace(turn.Content) + "\n")
	}
	builder.WriteString("\nข้อความล่าสุด: ")
	return builder.String()
}

// ParseStockCommandDrafts reads the model's reply as a JSON array, tolerating a
// code fence or stray prose around it. Anything malformed yields no commands —
// the assistant then answers normally instead of acting on a guess.
func ParseStockCommandDrafts(raw string) ([]AIStockCommandDraft, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return nil, nil
	}
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(strings.TrimSpace(text), "```")

	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")
	if start < 0 || end <= start {
		return nil, nil
	}

	var drafts []AIStockCommandDraft
	if err := json.Unmarshal([]byte(text[start:end+1]), &drafts); err != nil {
		return nil, errors.New("ตัวแปลงคำสั่งตอบไม่เป็น JSON")
	}

	cleaned := make([]AIStockCommandDraft, 0, len(drafts))
	for _, draft := range drafts {
		draft.Name = strings.TrimSpace(draft.Name)
		draft.Kind = strings.ToLower(strings.TrimSpace(draft.Kind))
		draft.Unit = strings.TrimSpace(draft.Unit)
		draft.Note = strings.TrimSpace(draft.Note)
		if draft.Name == "" {
			continue
		}
		if draft.Quantity < 0 {
			draft.Quantity = 0
		}
		cleaned = append(cleaned, draft)
	}
	return cleaned, nil
}
