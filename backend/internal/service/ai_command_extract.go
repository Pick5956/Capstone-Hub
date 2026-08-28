package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"Project-M/internal/repository"
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
- "menu_price" = เปลี่ยนราคาขายของเมนู (quantity = ราคาป้ายใหม่ เป็นบาทต่อจาน)
  ระวังอย่าสับสนกับ "cost" ซึ่งเป็นราคาทุนของวัตถุดิบ ไม่ใช่ราคาขายของเมนู

คำสั่งเกี่ยวกับ "บันทึกรายจ่ายของร้าน" (เงินที่จ่ายออกไปจริง)
- "expense" = จ่ายค่าอะไรไป/ซื้ออะไรมา/เสียเงินค่าอะไร
- ใส่เพิ่ม 2 ช่อง: "category" และ "date"
- quantity = จำนวนเงินบาท · note = จ่ายค่าอะไร (เขียนสั้น ๆ เป็นคำพูด)
- category เลือกจาก 6 ค่านี้เท่านั้น ห้ามคิดค่าใหม่
  · "ingredient" = วัตถุดิบ ของสด ของแห้ง เครื่องปรุง
  · "labor" = ค่าแรง เงินเดือน ค่าจ้าง โอที
  · "rent" = ค่าเช่าที่ ค่าเช่าร้าน
  · "utilities" = ค่าน้ำ ค่าไฟ ค่าแก๊ส ค่าเน็ต ค่าโทรศัพท์
  · "equipment" = อุปกรณ์ เครื่องครัว โต๊ะเก้าอี้ ของใช้ที่ใช้ได้นาน
  · "other" = อย่างอื่นที่ไม่เข้าห้าข้อบน
- date เป็น "YYYY-MM-DD" ถ้าผู้ใช้ไม่ได้บอกวันเลย ให้เว้นว่าง ระบบจะใช้วันนี้เอง
  แต่ถ้าผู้ใช้บอกวันแบบพูด ๆ ("เมื่อวาน" "เมื่อวานซืน" "วันที่ 20") ให้คำนวณเป็นวันที่จริง
  โดยนับจากวันที่ปัจจุบันที่แจ้งไว้ข้างล่าง
- ถ้าเดาหมวดไม่ออกจริง ๆ ให้ category เป็น "" ระบบจะถามเอง ห้ามเดามั่ว

กฎร่วม:
- ถ้าผู้ใช้ไม่ได้บอกจำนวน ให้ quantity เป็น 0 · ถ้าไม่ได้บอกหน่วย ให้ unit เป็น ""
- ห้ามเดาชื่อที่ผู้ใช้ไม่ได้พูด ห้ามเดาตัวเลข
- **ยกชื่อมาให้ครบตามที่ผู้ใช้พูด ห้ามตัดให้สั้นลง** เช่น "ต้มยำกุ้งน้ำข้นหมดแล้ว"
  → name="ต้มยำกุ้งน้ำข้น" ไม่ใช่ "ต้มยำกุ้ง"
- **name ต้องเป็นชื่อล้วน ห้ามติดหน่วยหรือคำบอกปริมาณ** เช่น "ไข่ไก่ฟองละ 6" → name="ไข่ไก่" unit="ฟอง"
  · "หมูกิโลละ 180" → name="หมู" unit="กก." · "กะเพรากำละ 10" → name="กะเพรา" unit="กำ"
- ปนกันได้ ข้อความเดียวมีทั้งคำสั่งเมนูและคำสั่งคลังพร้อมกันก็ได้
- **สานต่อจากบทสนทนาก่อนหน้าได้** ถ้าผู้ช่วยเพิ่งถามหรือเพิ่งเสนอทำอะไรกับวัตถุดิบ/เมนูตัวหนึ่ง
  แล้วข้อความล่าสุดของผู้ใช้เป็นการตอบรับ (เช่น "เพิ่มเลย" "เอาเลย" "ตกลง") หรือบอกแค่จำนวน/หน่วย
  ให้ยกชื่อและชนิดคำสั่งจากที่ผู้ช่วยเสนอมาเติมให้ครบ — **ไม่ถือว่าเป็นการเดา** เพราะมาจากบทสนทนาจริง
- **ถ้าเป็นคำถาม ไม่ใช่คำสั่ง ให้ตอบ []** เช่น "เมนูไหนควรปิดขาย" "วัตถุดิบไหนใกล้หมด"
- ถ้าข้อความไม่ใช่คำสั่งเลย ให้ตอบ []
- **ถ้าประโยคสั่งหลายอย่าง แล้วมีอันที่รู้ว่าเป็นคำสั่งแต่ไม่รู้ว่าหมายถึงของชิ้นไหน
  ห้ามทิ้งอันนั้น** ให้ส่งมาด้วยโดยให้ name เป็น "" และใส่คำพูดเดิมของผู้ใช้ไว้ใน note
  ระบบจะถามกลับเอง · ถ้าทิ้งไป เจ้าของจะสั่งสองอย่างแต่ได้ยินเรื่องเดียวโดยไม่รู้ตัว
  **ห้ามเดาชื่อของที่ผู้ใช้ไม่ได้พูด และห้ามลอกชื่อจากตัวอย่างด้านล่างมาใช้**
  ตัวอย่างมีไว้ให้ดูรูปแบบ ไม่ใช่ให้ยกคำตอบมาใช้ซ้ำ
- **ถ้าผู้ช่วยเพิ่งบอกว่า "... — รับทราบแล้วครับ" แล้วถามต่อว่าอีกอันหมายถึงตัวไหน
  ให้ส่งกลับมาทั้งสองอัน** ทั้งอันที่รับทราบไปแล้ว (ยกจำนวนและหน่วยเดิมมาให้ครบ)
  และอันที่ผู้ใช้เพิ่งบอกชื่อ ห้ามส่งมาแค่อันใหม่ ไม่งั้นอันแรกจะหายไปเงียบ ๆ

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

ข้อความ: "ขึ้นราคาต้มยำกุ้งเป็น 159"
ตอบ: [{"name":"ต้มยำกุ้ง","kind":"menu_price","quantity":159,"unit":""}]

ข้อความ: "ผัดไทยขายจานละ 89 นะ"
ตอบ: [{"name":"ผัดไทย","kind":"menu_price","quantity":89,"unit":""}]

ข้อความ: "จ่ายค่าไฟไป 3200"
ตอบ: [{"name":"ค่าไฟ","kind":"expense","quantity":3200,"unit":"","category":"utilities","date":"","note":"ค่าไฟ"}]

ข้อความ: "เมื่อวานจ่ายค่าแรงพนักงาน 2 คน 1,200 บาท"
ตอบ: [{"name":"ค่าแรงพนักงาน","kind":"expense","quantity":1200,"unit":"","category":"labor","date":"","note":"ค่าแรงพนักงาน 2 คน"}]

ข้อความ: "ซื้อกระทะใหม่ 1500"
ตอบ: [{"name":"กระทะ","kind":"expense","quantity":1500,"unit":"","category":"equipment","date":"","note":"ซื้อกระทะใหม่"}]

ข้อความ: "เดือนนี้จ่ายอะไรไปบ้าง"
ตอบ: []

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

(บทสนทนาก่อนหน้า)
ผู้ช่วย: ยังไม่มี "หัวหอม" ในคลังครับ ให้ผมเพิ่มเข้าคลังให้ไหม (บอกหน่วยด้วย)
ข้อความล่าสุด: เพิ่มเลย 5000 กรัม
ตอบ: [{"name":"หัวหอม","kind":"create","quantity":5000,"unit":"กรัม"}]

ข้อความ: "ยอดขายวันนี้เท่าไหร่"
ตอบ: []

ข้อความ: "รับน้ำมันพืชเข้า 5 ลิตร แล้วก็เติมของอีกตัวที่หมดไปเมื่อวานด้วย"
ตอบ: [{"name":"น้ำมันพืช","kind":"in","quantity":5,"unit":"ลิตร"},{"name":"","kind":"in","quantity":0,"unit":"","note":"ของอีกตัวที่หมดไปเมื่อวาน"}]

(บทสนทนาก่อนหน้า)
ผู้ใช้: รับน้ำมันพืชเข้า 5 ลิตร แล้วก็เติมของอีกตัวที่หมดไปเมื่อวานด้วย
ผู้ช่วย: น้ำมันพืช 5 ลิตร — รับทราบแล้วครับ
ส่วน “ของอีกตัวที่หมดไปเมื่อวาน” หมายถึงตัวไหนครับ บอกชื่อมาได้เลย
ข้อความล่าสุด: ซอสหอยนางรม 3 ขวด
ตอบ: [{"name":"น้ำมันพืช","kind":"in","quantity":5,"unit":"ลิตร"},{"name":"ซอสหอยนางรม","kind":"in","quantity":3,"unit":"ขวด"}]

ข้อความของเจ้าของร้าน:
`

// ExtractStockCommands asks the model to shape the sentence, including the last
// few turns so an answer to a question ("กรัม") joins the command that prompted
// it without a separate state machine.
func (s *AIService) ExtractStockCommands(question string, history []AIConversationMessage) ([]AIStockCommandDraft, error) {
	if strings.TrimSpace(question) == "" {
		return nil, nil
	}
	// The date goes in because "เมื่อวานจ่ายค่าแรง 1,200" has to become a real
	// date, and the model cannot count back from a day it was never told.
	today := fmt.Sprintf("(วันนี้คือ %s)\n", repository.BangkokNow().Format("2006-01-02"))
	prompt := aiStockExtractionPrompt + today + aiRecentTurnsForExtraction(history) + strings.TrimSpace(question)
	text, _, err := s.askSecondRoundWithOptions(prompt, aiProviderCompleteOptions{ReasoningEffort: "low"})
	if err != nil {
		return nil, err
	}
	drafts, err := ParseStockCommandDrafts(text)
	// What the model made of the sentence is the first thing worth seeing when a
	// command comes out wrong, and it was the one step of this flow that left no
	// trace: the plan is logged, the answer is logged, the reading between them
	// was not.
	if aiDebugEnabled() {
		aiStage("debug", "joyboy command: read %d draft(s) from %q → %s", len(drafts), question, strings.TrimSpace(text))
	}
	return drafts, err
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
		draft.Category = strings.ToLower(strings.TrimSpace(draft.Category))
		draft.Date = strings.TrimSpace(draft.Date)
		// A nameless entry is dropped, except when the model kept the owner's own
		// words for it. That is the case where it could tell a command was there
		// but not what it was about — "เพิ่มไข่ไก่ 30 ฟอง แล้วก็เพิ่มของอีกอย่างที่
		// ใกล้หมดด้วย" — and dropping it here is what made the second half vanish
		// with nothing said. It becomes a question to the owner further down, never
		// a write: nothing can be written without a resolved name.
		if draft.Name == "" && draft.Note == "" {
			continue
		}
		if draft.Quantity < 0 {
			draft.Quantity = 0
		}
		cleaned = append(cleaned, draft)
	}
	return cleaned, nil
}
