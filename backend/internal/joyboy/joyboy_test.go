package joyboy

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// fakeChat answers the tool-selection prompt with selected, then hands out
// replies one per writing attempt.
type fakeChat struct {
	selected   []string
	selectErr  error
	replies    []string
	writeCalls int
	lastPrompt string
	selectAsk  string
}

func (c *fakeChat) Complete(_ context.Context, prompt string, _ CallKind) (string, error) {
	if strings.Contains(prompt, "ตอบกลับเป็น JSON array") {
		c.selectAsk = prompt
		if c.selectErr != nil {
			return "", c.selectErr
		}
		encoded, err := json.Marshal(c.selected)
		if err != nil {
			return "", err
		}
		return string(encoded), nil
	}

	c.writeCalls++
	c.lastPrompt = prompt
	if len(c.replies) == 0 {
		return "", nil
	}
	reply := c.replies[0]
	c.replies = c.replies[1:]
	return reply, nil
}

type fakeTools struct {
	asked   []string
	results []ToolResult
	runErr  error
}

func (t *fakeTools) Catalogue() []ToolSpec {
	return []ToolSpec{
		{Name: "get_top_selling_menus", Description: "Top selling menus."},
		{Name: "get_low_stock_ingredients", Description: "Ingredients running low."},
	}
}

func (t *fakeTools) Run(_ context.Context, names []string, _ string) ([]ToolResult, error) {
	t.asked = names
	return t.results, t.runErr
}

func newAssistant(t *testing.T, chat Chat, tools Tools) *Assistant {
	t.Helper()
	assistant, err := New(chat, tools, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return assistant
}

func TestAskRunsTheToolsTheModelChoseAndReturnsWhatItWrote(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus", "get_low_stock_ingredients"},
		replies:  []string{"ต้มยำกุ้งขายดีที่สุด 112 รายการในช่วง 30 วันล่าสุดครับ"},
	}
	tools := &fakeTools{results: []ToolResult{
		{Tool: "get_top_selling_menus", Label: "เมนูขายดี · 30 วันล่าสุด", Body: "- ต้มยำกุ้ง: 112 จาน"},
	}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "เมนูขายดี"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if answer.Text != "ต้มยำกุ้งขายดีที่สุด 112 รายการในช่วง 30 วันล่าสุดครับ" {
		t.Fatalf("text = %q", answer.Text)
	}
	if len(tools.asked) != 2 {
		t.Fatalf("tools asked = %v, want both", tools.asked)
	}
	// The sheet reaches the model, and only the model's words reach the owner.
	if !strings.Contains(chat.lastPrompt, "[เมนูขายดี · 30 วันล่าสุด]") {
		t.Fatal("the labelled fact sheet was not in the answer prompt")
	}
	if strings.Contains(answer.Text, "- ต้มยำกุ้ง: 112 จาน") {
		t.Fatal("the fact sheet leaked into the answer")
	}
}

// Answer.Tools is what the caller's invention guard reads: it stands down when a
// tool ran, because a figure or a claim then has a fact sheet behind it. So it
// must list the tools that ANSWERED, not the ones that were asked for. A tool
// that was requested and then dropped (no period parsed, a port not wired, a
// repository error) contributes nothing to the sheet, and counting it told the
// guard to stand down over an answer written from nothing.
func TestAskReportsOnlyTheToolsThatProducedData(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus", "get_low_stock_ingredients"},
		replies:  []string{"ต้มยำกุ้งขายดีที่สุดครับ"},
	}
	// Two asked for; one came back empty, the way a dropped tool does.
	tools := &fakeTools{results: []ToolResult{
		{Tool: "get_top_selling_menus", Label: "เมนูขายดี", Body: "- ต้มยำกุ้ง: 112"},
		{Tool: "get_low_stock_ingredients", Label: "วัตถุดิบใกล้หมด", Body: "   "},
	}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "เมนูขายดี"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if len(answer.Tools) != 1 || answer.Tools[0] != "get_top_selling_menus" {
		t.Fatalf("Tools = %v, want only the tool that produced a body", answer.Tools)
	}
}

// Every tool dropped means the answer was written from an empty sheet, and the
// guard has to see that as "no tools ran" so it can catch an invented claim.
func TestAskReportsNoToolsWhenEveryResultIsEmpty(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus"},
		replies:  []string{"จองโต๊ะให้แล้วครับ"},
	}
	tools := &fakeTools{results: []ToolResult{
		{Tool: "get_top_selling_menus", Label: "เมนูขายดี", Body: ""},
	}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "จองโต๊ะ"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if len(answer.Tools) != 0 {
		t.Fatalf("Tools = %v, want empty so the guard stays armed", answer.Tools)
	}
}

func TestAskAsksForEachToolOnce(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus", "get_top_selling_menus", " ", "get_low_stock_ingredients"},
		replies:  []string{"ตอบแล้วครับ"},
	}
	tools := &fakeTools{results: []ToolResult{{Tool: "x", Label: "x", Body: "- ok"}}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "เมนูขายดี"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	want := []string{"get_top_selling_menus", "get_low_stock_ingredients"}
	if len(tools.asked) != len(want) {
		t.Fatalf("tools asked = %v, want %v", tools.asked, want)
	}
	for i, name := range want {
		if tools.asked[i] != name {
			t.Fatalf("tools asked = %v, want %v", tools.asked, want)
		}
	}
	// Dedupe is about the REQUEST — asserted on tools.asked above. What comes back
	// in answer.Tools is a different question: the tools that produced a body. The
	// fake returns one result, so one tool answered, however many were asked for.
	if len(answer.Tools) != 1 || answer.Tools[0] != "x" {
		t.Fatalf("reported tools = %v, want the single tool that answered", answer.Tools)
	}
}

// No tools is a real answer, not a failure: a greeting needs no data.
func TestAskWithoutToolsStillAnswers(t *testing.T) {
	chat := &fakeChat{selected: nil, replies: []string{"สวัสดีครับ"}}
	tools := &fakeTools{}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "สวัสดี"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if answer.Text != "สวัสดีครับ" {
		t.Fatalf("text = %q", answer.Text)
	}
	// Without data the prompt must forbid quoting figures about this shop.
	if !strings.Contains(chat.lastPrompt, "ห้ามอ้างตัวเลขใด ๆ เกี่ยวกับร้านนี้") {
		t.Fatal("the no-data prompt did not forbid shop figures")
	}
}

func TestAskRetriesOnceThenReportsUnavailable(t *testing.T) {
	// First reply is a bare code fence, which cleans down to nothing.
	chat := &fakeChat{selected: nil, replies: []string{"```", "ตอบได้แล้วครับ"}}
	answer, err := newAssistant(t, chat, &fakeTools{}).Ask(context.Background(), Request{Question: "สวัสดี"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if answer.Text != "ตอบได้แล้วครับ" || chat.writeCalls != 2 {
		t.Fatalf("text = %q after %d calls", answer.Text, chat.writeCalls)
	}

	// Two empty replies is an outage. Joyboy has nothing of its own to say,
	// because the only text it could fall back to is the fact sheet.
	silent := &fakeChat{selected: nil, replies: []string{"", ""}}
	if _, err := newAssistant(t, silent, &fakeTools{}).Ask(context.Background(), Request{Question: "สวัสดี"}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
	if silent.writeCalls != 2 {
		t.Fatalf("write calls = %d, want exactly one retry", silent.writeCalls)
	}
}

func TestAskReportsUnavailableWhenAStepFails(t *testing.T) {
	failedSelect := &fakeChat{selectErr: errors.New("provider down")}
	if _, err := newAssistant(t, failedSelect, &fakeTools{}).Ask(context.Background(), Request{Question: "เมนูขายดี"}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("select failure = %v, want ErrUnavailable", err)
	}

	chat := &fakeChat{selected: []string{"get_top_selling_menus"}, replies: []string{"ok"}}
	brokenTools := &fakeTools{runErr: errors.New("snapshot failed")}
	if _, err := newAssistant(t, chat, brokenTools).Ask(context.Background(), Request{Question: "เมนูขายดี"}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("tool failure = %v, want ErrUnavailable", err)
	}
}

func TestFactSheetLabelsEveryBlockAndSkipsEmptyOnes(t *testing.T) {
	sheet := buildFactSheet([]ToolResult{
		{Tool: "a", Label: "เมนูขายดี · 30 วันล่าสุด", Body: "- ต้มยำกุ้ง: 112 จาน"},
		{Tool: "b", Label: "วัตถุดิบใกล้หมด", Body: "   "},
		{Tool: "c", Label: "", Body: "- กุ้งสด: 2.50 กก."},
	})
	if strings.Contains(sheet, "วัตถุดิบใกล้หมด") {
		t.Fatal("a block with no body should not appear")
	}
	if !strings.Contains(sheet, "[เมนูขายดี · 30 วันล่าสุด]") {
		t.Fatal("the label is missing")
	}
	if !strings.Contains(sheet, "[c]") {
		t.Fatal("a block with no label should fall back to the tool name")
	}
	if buildFactSheet(nil) != "" {
		t.Fatal("no results should produce no sheet")
	}
}

// The thread is trimmed by size now, not by a count of exchanges. The count was
// the wrong unit: two chatty turns cost less than half of one long stock listing,
// so a fixed count either threw away a short conversation the owner was still
// referring back to, or spent an unpredictable amount on a long one.
func TestHistoryIsTrimmedBySizeNotByCount(t *testing.T) {
	if formatHistory(nil) != "\n" {
		t.Fatalf("empty history = %q, want no heading", formatHistory(nil))
	}

	// Ten short exchanges are a normal chat and now all survive — this is exactly
	// what the old four-message cap threw away.
	short := make([]Turn, 0, 20)
	for i := 0; i < 10; i++ {
		short = append(short,
			Turn{Role: "user", Content: "คำถามที่ " + string(rune('0'+i))},
			Turn{Role: "assistant", Content: "คำตอบที่ " + string(rune('0'+i))})
	}
	rendered := formatHistory(short)
	for i := 0; i < 10; i++ {
		if !strings.Contains(rendered, "คำถามที่ "+string(rune('0'+i))) {
			t.Fatalf("a short conversation should be remembered whole; lost turn %d:\n%s", i, rendered)
		}
	}

	// Long exchanges spend the budget quickly, so the oldest fall off while the
	// newest — what "อันนั้น" points at — always stays.
	long := make([]Turn, 0, 20)
	for i := 0; i < 10; i++ {
		long = append(long,
			Turn{Role: "user", Content: "คำถามยาวที่ " + string(rune('0'+i)) + strings.Repeat("ก", 150)},
			Turn{Role: "assistant", Content: "คำตอบยาวที่ " + string(rune('0'+i)) + strings.Repeat("ข", 150)})
	}
	rendered = formatHistory(long)
	verbatim := rendered
	if at := strings.Index(rendered, "บทสนทนาก่อนหน้า:"); at >= 0 {
		verbatim = rendered[at:]
	}
	// The oldest long turns leave the verbatim window...
	if strings.Contains(verbatim, "คำถามยาวที่ 0") {
		t.Fatalf("the oldest long turns should leave the verbatim window:\n%s", rendered)
	}
	// ...but they are not forgotten: each leaves a line in the thread index, which
	// is what lets the assistant answer "what did we talk about" honestly.
	if !strings.Contains(rendered, "เรื่องที่คุยกันไปก่อนหน้านี้") {
		t.Fatalf("trimmed turns should still be indexed:\n%s", rendered)
	}
	if !strings.Contains(rendered, "คำถามยาวที่ 0") {
		t.Fatalf("the oldest question should survive as an index line:\n%s", rendered)
	}
	if !strings.Contains(rendered, "คำตอบยาวที่ 9") {
		t.Fatalf("the newest turn must survive:\n%s", rendered)
	}
	if runes := []rune(rendered); len(runes) > historyBudgetChars*2 {
		t.Fatalf("the rendered thread overran its budget: %d characters", len(runes))
	}
}

// One enormous answer must not silently disappear: a follow-up usually points at
// the end of it ("อันสุดท้ายที่บอก"), so it is cut rather than dropped.
func TestAnOversizedMessageIsCutNotDropped(t *testing.T) {
	huge := Turn{Role: "assistant", Content: "เริ่มต้น" + strings.Repeat("ค", 5000) + "ท้ายสุดคือชาไทยเย็น"}
	rendered := formatHistory([]Turn{{Role: "user", Content: "ขอลิสต์ยาว ๆ"}, huge})
	if !strings.Contains(rendered, "ท้ายสุดคือชาไทยเย็น") {
		t.Fatalf("the tail of a long answer is what follow-ups point at:\n%s", rendered)
	}
	if strings.Contains(rendered, "เริ่มต้น") {
		t.Fatalf("the message should have been cut from the front:\n%s", rendered)
	}
}

// A thread that opens on an answer whose question was trimmed away reads as the
// assistant talking to itself.
func TestTheThreadNeverStartsOnAnOrphanAnswer(t *testing.T) {
	turns := []Turn{}
	for i := 0; i < 8; i++ {
		turns = append(turns,
			Turn{Role: "user", Content: "ถาม " + string(rune('0'+i)) + strings.Repeat("ก", 120)},
			Turn{Role: "assistant", Content: "ตอบ " + string(rune('0'+i)) + strings.Repeat("ข", 120)})
	}
	rendered := formatHistory(turns)
	body := strings.TrimPrefix(rendered, "\nบทสนทนาก่อนหน้า:\n")
	if strings.HasPrefix(body, "ผู้ช่วย: ") {
		t.Fatalf("the thread should not open on an orphan answer:\n%s", rendered)
	}
}

func TestCleanAnswerDropsWrappersAndRunawayReplies(t *testing.T) {
	// A markdown heading is part of a formatted answer now and must survive, so
	// the client can render it. Only a bare row of hashes with no text is noise.
	if got := cleanAnswer("## สรุป\nกำไรรวม 4,469.58 บาท"); got != "## สรุป\nกำไรรวม 4,469.58 บาท" {
		t.Fatalf("a heading was dropped: %q", got)
	}
	if got := cleanAnswer("###\nกำไรรวม 4,469.58 บาท"); got != "กำไรรวม 4,469.58 บาท" {
		t.Fatalf("a bare row of hashes was kept: %q", got)
	}
	if got := cleanAnswer("- ต้มยำกุ้ง 112 จาน\n- ชาไทย 108 จาน"); !strings.Contains(got, "\n") {
		t.Fatal("line breaks are part of the answer and must survive")
	}
	// A long reply is kept. It used to be discarded, which turned a good long
	// answer (a recipe, a full explanation) into an outage; the provider's token
	// ceiling is what bounds length now.
	long := strings.Repeat("ก", 4000)
	if cleanAnswer(long) != long {
		t.Fatal("a long reply must be kept, not discarded")
	}
	if cleanAnswer("   ") != "" {
		t.Fatal("an empty reply must be rejected")
	}
}

func TestNewRefusesMissingDependencies(t *testing.T) {
	if _, err := New(nil, &fakeTools{}, nil); err == nil {
		t.Fatal("a missing chat provider should be refused")
	}
	if _, err := New(&fakeChat{}, nil, nil); err == nil {
		t.Fatal("a missing tool runner should be refused")
	}
}

// The model names tools in prose. Anything it invents is dropped, and a reply
// that cannot be read at all selects nothing — which answers without data
// rather than failing the question.
func TestToolSelectionKeepsOnlyRealToolNames(t *testing.T) {
	catalogue := (&fakeTools{}).Catalogue()

	selected := parseToolSelection(
		"```json\n[\"get_top_selling_menus\", \"get_menu_horoscope\"]\n```", catalogue)
	if len(selected) != 1 || selected[0] != "get_top_selling_menus" {
		t.Fatalf("selected = %v, want only the real tool", selected)
	}

	if got := parseToolSelection("ผมขอดูเมนูขายดีครับ", catalogue); len(got) != 0 {
		t.Fatalf("prose reply selected %v, want nothing", got)
	}
	if got := parseToolSelection("[]", catalogue); len(got) != 0 {
		t.Fatalf("empty array selected %v", got)
	}
}

// Arithmetic on figures the sheet supplied is not invention, and the answer now
// survives.
//
// This test used to assert the opposite: the model subtracted 347,453 − 300 and
// the whole answer was sent back to be rewritten without the result. The example
// it was built from is the clearest argument against it — the owner had asked
// "ขายได้เท่าไหร่ จ่ายไปเท่าไหร่ เหลือเท่าไหร่", the subtraction WAS the question,
// and the rewrite deleted the answer to it.
//
// Ninety live questions later the rewrite had fired twice and been wrong both
// times, on a Buddhist year and on a year the owner typed himself. Nothing
// invented was ever caught. What is left is a log line.
func TestAskKeepsAnAnswerThatDoesArithmeticOnSheetFigures(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus"},
		replies:  []string{"ขายได้ 347,453 บาท จ่ายไป 300 บาท เหลือ 347,153 บาทครับ"},
	}
	tools := &fakeTools{results: []ToolResult{{Tool: "get_top_selling_menus", Body: "revenue=347453\nspent=300"}}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "เดือนที่แล้วเหลือเท่าไหร่"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if !strings.Contains(answer.Text, "347,153") {
		t.Errorf("the derived figure answers the question and must survive: %q", answer.Text)
	}
	// The point of removing the rewrite was the call it cost on every such answer.
	if chat.writeCalls != 1 {
		t.Errorf("writeCalls = %d, want one — no second call", chat.writeCalls)
	}
	// Both operands are on the sheet, which is what makes the result checkable by
	// the owner. The prompt asks for them to be named for exactly that reason.
	for _, operand := range []string{"347,453", "300"} {
		if !strings.Contains(answer.Text, operand) {
			t.Errorf("the answer should name what it started from, %q is missing: %q", operand, answer.Text)
		}
	}
}

// An answer whose figures are all on the sheet must not pay for a second call.
func TestAskDoesNotRewriteAnAnswerThatMatchesTheSheet(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus"},
		replies:  []string{"ขายได้ 347,453 บาทครับ"},
	}
	tools := &fakeTools{results: []ToolResult{{Tool: "get_top_selling_menus", Body: "revenue=347453"}}}

	if _, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "ขายได้เท่าไหร่"}); err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if chat.writeCalls != 1 {
		t.Errorf("writeCalls = %d, want a single write", chat.writeCalls)
	}
}

// The index is what stops a long conversation from being forgotten outright, and
// what it deliberately leaves out matters as much as what it keeps: no figures.
// A number remembered from ten minutes ago is stale the moment an order is
// cooked, so the index says only what was discussed and sends the next answer
// back through the tool to read the database now.
func TestTheThreadIndexRemembersTopicsWithoutFigures(t *testing.T) {
	turns := []Turn{
		{Role: "user", Content: "เมื่อวานขายได้เท่าไหร่", Topic: "ยอดขายและกำไร"},
		{Role: "assistant", Content: "เมื่อวานขายได้ 7,880 บาทครับ"},
		{Role: "user", Content: "กะเพราเหลือเท่าไหร่", Topic: "วัตถุดิบและสต๊อก"},
		{Role: "assistant", Content: "กะเพราเหลือ 423 กรัมครับ"},
	}
	index := formatThreadIndex(turns)

	for _, want := range []string{"เมื่อวานขายได้เท่าไหร่", "กะเพราเหลือเท่าไหร่", "ยอดขายและกำไร", "วัตถุดิบและสต๊อก"} {
		if !strings.Contains(index, want) {
			t.Errorf("the index lost %q:\n%s", want, index)
		}
	}
	// The answers held real figures; none of them may reach the index.
	for _, figure := range []string{"7,880", "423"} {
		if strings.Contains(index, figure) {
			t.Errorf("a figure leaked into the index (%s) — it would be quoted as current:\n%s", figure, index)
		}
	}
	if !strings.Contains(index, "เรียกเครื่องมือใหม่") {
		t.Errorf("the index must tell the model to re-read the data for numbers:\n%s", index)
	}
	if formatThreadIndex(nil) != "" {
		t.Error("no older turns should produce no index at all")
	}
}

// A tool name in the prompt is one the model has copied into an answer before,
// and the answer cleaner only strips the bracketed form. The index uses the
// section heading instead, so there is nothing raw to copy.
func TestTheThreadIndexNeverCarriesRawToolNames(t *testing.T) {
	index := formatThreadIndex([]Turn{
		{Role: "user", Content: "เมนูไหนขายดี", Topic: "เมนู"},
	})
	if strings.Contains(index, "get_") {
		t.Errorf("a raw tool name reached the prompt:\n%s", index)
	}
}

// "แล้วอันที่สองล่ะ" in the index says nothing on its own — the thing it points
// at is in the question before it. Pairing them keeps the line readable once the
// verbatim window has moved past both.
func TestTheIndexPairsAShortFollowUpWithWhatItFollowed(t *testing.T) {
	index := formatThreadIndex([]Turn{
		{Role: "user", Content: "เมนูไหนขายดีที่สุด", Topic: "เมนู"},
		{Role: "assistant", Content: "ชาไทยเย็นครับ"},
		{Role: "user", Content: "แล้วอันที่สองล่ะ", Topic: "เมนู"},
	})
	if !strings.Contains(index, "ต่อจาก") || !strings.Contains(index, "เมนูไหนขายดีที่สุด") {
		t.Fatalf("a short follow-up should carry what it followed:\n%s", index)
	}
	// A question that stands on its own is left alone.
	plain := formatThreadIndex([]Turn{
		{Role: "user", Content: "เดือนที่แล้วจ่ายค่าอะไรไปเยอะที่สุด", Topic: "รายจ่าย"},
		{Role: "assistant", Content: "ค่าวัตถุดิบครับ"},
		{Role: "user", Content: "แล้วเดือนก่อนหน้านั้นล่ะจ่ายอะไรเยอะสุด", Topic: "รายจ่าย"},
	})
	if strings.Contains(plain, "ต่อจาก") {
		t.Fatalf("a self-contained question needs no pairing:\n%s", plain)
	}
}
