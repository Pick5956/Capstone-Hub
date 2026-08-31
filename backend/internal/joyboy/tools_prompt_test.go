package joyboy

import (
	"fmt"
	"strings"
	"testing"
)

// selectionPrompt renders what the model is shown when it picks tools, the same
// way Ask does.
func selectionPrompt(question string, history []Turn, catalogue []ToolSpec) string {
	return fmt.Sprintf(selectToolsTemplate, question, formatHistory(history), renderCatalogue(catalogue))
}

// The four topics are the floor for a store overview. Without them the model
// re-decided what an overview meant on every ask — four runs of the identical
// question produced margins once, the average bill once, and neither twice.
// They are asserted as topics because the rule deliberately names topics rather
// than tools, so that renaming a tool cannot silently empty the rule.
func TestTheSelectionPromptFixesWhatAStoreOverviewContains(t *testing.T) {
	prompt := selectionPrompt("สรุปสถานการณ์ร้าน 30 วันล่าสุด", nil, []ToolSpec{
		{Name: "get_sales_summary", Description: "ยอดขายรวม"},
	})
	for _, topic := range []string{"ยอดขาย", "เมนูขายดี", "วัตถุดิบที่ใกล้หมด", "มูลค่าคงคลัง"} {
		if !strings.Contains(prompt, topic) {
			t.Fatalf("a store overview no longer requires %q", topic)
		}
	}
	if !strings.Contains(prompt, "ห้ามขาด") {
		t.Fatal("the four topics stopped being mandatory")
	}
}

// Owners do not type the phrase from the spec. The rule fires on the wording
// they actually use, which is the same finding that fixed tool selection in
// round four: descriptions written in the owner's words picked correctly twice
// out of two, the English quadrant wording once out of two.
func TestTheStoreOverviewRuleListsHowOwnersActuallyAsk(t *testing.T) {
	prompt := selectionPrompt("ร้านเป็นไงบ้าง", nil, nil)
	for _, phrasing := range []string{"สรุปสถานการณ์ร้าน", "ร้านเป็นไงบ้าง", "ช่วงนี้เป็นยังไง", "สรุปให้หน่อย"} {
		if !strings.Contains(prompt, phrasing) {
			t.Fatalf("the rule no longer recognises %q", phrasing)
		}
	}
}

// A floor, not a ceiling. Capping the selection would cost the behaviour joyboy
// exists for: asked "แล้วทำไมถึงขึ้นล่ะ" it reached for four extra tools to find
// the cause, which is the point legacy could not reach.
func TestTheStoreOverviewRuleStillAllowsReachingForMore(t *testing.T) {
	prompt := selectionPrompt("สรุปสถานการณ์ร้าน", nil, nil)
	if !strings.Contains(prompt, "หยิบเรื่องอื่นเพิ่มได้") {
		t.Fatal("the rule turned into a ceiling")
	}
	// The greeting path has to survive a rule about overviews: a question that
	// needs no data at all still selects nothing.
	if !strings.Contains(prompt, "ให้ตอบ []") {
		t.Fatal("the no-tools escape was lost")
	}
}

// The template is a format string with three verbs in a fixed order. Adding the
// rule above them is exactly the edit that would break the pairing, and a
// mismatched verb prints "%!s(MISSING)" into the instructions rather than
// failing, producing a worse selection instead of an error.
func TestTheSelectionPromptRendersWithoutFormatArtifacts(t *testing.T) {
	prompt := selectionPrompt("เมนูไหนขายดี", []Turn{{Role: "user", Content: "สวัสดี"}}, []ToolSpec{
		{Name: "get_top_selling_menus", Description: "เมนูขายดี"},
	})
	if strings.Contains(prompt, "%!") || strings.Contains(prompt, "(MISSING)") || strings.Contains(prompt, "(EXTRA") {
		t.Fatalf("a format verb did not match its argument:\n%s", prompt)
	}
	if !strings.Contains(prompt, "เมนูไหนขายดี") || !strings.Contains(prompt, "get_top_selling_menus") {
		t.Fatal("the question or the catalogue was lost from the selection prompt")
	}
}

// "เพิ่มเมนูยังไง" asked once picked no tool at all — the model answered from its
// own knowledge instead of the manual, which is the exact guess search_system_docs
// exists to replace. The rule has to name the how-to phrasing and forbid the guess,
// or the model keeps thinking it already knows.
func TestSelectionPromptForcesDocsForHowToQuestions(t *testing.T) {
	prompt := selectionPrompt("เพิ่มเมนูใหม่ยังไง", nil, nil)
	for _, want := range []string{"วิธีใช้ระบบ Dishy", "search_system_docs", "ห้ามตอบจากความรู้ของตัวเอง"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("the how-to rule lost %q", want)
		}
	}
}

// A question can point at a menu without spelling its name. Asked "เมนูแรกที่บอกไป
// กำไรดีไหม" one turn after being told the best seller was ชาไทยเย็น, the selector
// picked no tool and the answer came back "ไม่ทราบกำไรของชาไทยเย็น" — over a shop
// whose margin per menu is one tool call away. The detail rule only fires on a
// name, so the prompt has to say: resolve the reference first, then choose as if
// the name had been typed.
func TestSelectionPromptResolvesBackReferencesToNames(t *testing.T) {
	history := []Turn{
		{Role: "user", Content: "เมนูไหนขายดีที่สุด"},
		{Role: "assistant", Content: "เมนูขายดีที่สุดคือ ชาไทยเย็นครับ"},
	}
	prompt := selectionPrompt("เมนูแรกที่บอกไป กำไรดีไหม", history, nil)
	for _, want := range []string{
		"อ้างถึงของที่พูดไปแล้ว",
		"หาชื่อจริงจากบทสนทนาก่อนหน้า",
		"get_menu_detail",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("the back-reference rule lost %q", want)
		}
	}
	// The history itself must reach the prompt, or there is nothing to resolve from.
	if !strings.Contains(prompt, "ชาไทยเย็น") {
		t.Fatal("the conversation the reference points at is not in the prompt")
	}
}

// "สรุปที่คุยกันวันนี้ให้หน่อย" asks the assistant to recap the conversation. The
// overview rule listed "สรุปให้หน่อย" as a store-overview phrase, so the word
// "สรุป" plus "วันนี้" pulled the question to the sales tools and the owner got a
// store report over a conversation that had been about tables and expenses —
// the assistant answering a question nobody asked.
func TestSelectionPromptSeparatesRecappingTheChatFromSummarisingTheShop(t *testing.T) {
	prompt := selectionPrompt("สรุปที่คุยกันวันนี้ให้หน่อย", nil, []ToolSpec{
		{Name: "get_sales_summary", Description: "ยอดขายรวม"},
	})
	for _, want := range []string{
		`สรุป "บทสนทนา" ไม่ใช่ "ร้าน"`,
		"สรุปที่คุยกันวันนี้ให้หน่อย",
		`ถึงจะมีคำว่า "วันนี้"`,
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("the recap rule lost %q", want)
		}
	}
	// The genuine store question must stay on the data path.
	if !strings.Contains(prompt, `"สรุปร้านวันนี้"`) {
		t.Fatal("the rule must still send a real store question to the tools")
	}
}
