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

func TestHistoryIsTrimmedAndOmittedWhenEmpty(t *testing.T) {
	if formatHistory(nil) != "\n" {
		t.Fatalf("empty history = %q, want no heading", formatHistory(nil))
	}
	long := make([]Turn, 0, 10)
	for i := 0; i < 10; i++ {
		long = append(long, Turn{Role: "user", Content: "คำถามที่ " + string(rune('0'+i))})
	}
	rendered := formatHistory(long)
	if strings.Contains(rendered, "คำถามที่ 0") {
		t.Fatal("the oldest turns should be trimmed away")
	}
	if !strings.Contains(rendered, "คำถามที่ 9") {
		t.Fatal("the newest turn must survive")
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

// The model is told never to do arithmetic, and it keeps that rule almost always
// — but asked "ขายได้เท่าไหร่ จ่ายไปเท่าไหร่ เหลือเท่าไหร่" it subtracted the two
// and reported 347,153, a figure on no sheet, in bold. One rewrite naming the
// figure is cheaper than an owner acting on an invented number.
func TestAskRewritesAnAnswerThatStatesAFigureFromNoSheet(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus"},
		replies: []string{
			"ขายได้ 347,453 บาท จ่ายไป 300 บาท เหลือ 347,153 บาทครับ",
			"ขายได้ 347,453 บาท จ่ายไป 300 บาท ส่วนยอดคงเหลือยังไม่มีตัวเลขนี้ในระบบครับ",
		},
	}
	tools := &fakeTools{results: []ToolResult{{Tool: "get_top_selling_menus", Body: "revenue=347453\nspent=300"}}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "เดือนที่แล้วเหลือเท่าไหร่"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if strings.Contains(answer.Text, "347,153") {
		t.Errorf("the invented figure survived the rewrite: %q", answer.Text)
	}
	if chat.writeCalls != 2 {
		t.Errorf("writeCalls = %d, want one write and one rewrite", chat.writeCalls)
	}
	if !strings.Contains(chat.lastPrompt, "347,153") {
		t.Errorf("the rewrite prompt should name the offending figure:\n%s", chat.lastPrompt)
	}
}

// A rewrite that invents a different figure is no better than the first answer,
// so the first one stands rather than being traded for another unbacked number.
func TestAskKeepsTheFirstAnswerWhenTheRewriteIsNoCleaner(t *testing.T) {
	chat := &fakeChat{
		selected: []string{"get_top_selling_menus"},
		replies:  []string{"เหลือ 347,153 บาทครับ", "เหลือ 912,644 บาทครับ"},
	}
	tools := &fakeTools{results: []ToolResult{{Tool: "get_top_selling_menus", Body: "revenue=347453"}}}

	answer, err := newAssistant(t, chat, tools).Ask(context.Background(), Request{Question: "เหลือเท่าไหร่"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if !strings.Contains(answer.Text, "347,153") {
		t.Errorf("the first answer should stand, got %q", answer.Text)
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
