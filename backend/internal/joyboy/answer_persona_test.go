package joyboy

import (
	"strings"
	"testing"
)

// A question about the assistant itself can arrive on either path: the model
// sometimes reaches for a tool even then. The rules have to travel with both.
func TestPersonaReachesBothPaths(t *testing.T) {
	prompts := map[string]string{
		"with data":    answerPrompt("นายรันด้วยโมเดลอะไร", nil, "", "rank=1 menu=ต้มยำกุ้ง qty=109"),
		"without data": answerPrompt("นายรันด้วยโมเดลอะไร", nil, "", ""),
	}
	for path, prompt := range prompts {
		if !strings.Contains(prompt, joyboyPersona) {
			t.Fatalf("%s: the persona block is missing", path)
		}
	}
}

// The model answered "GPT-4, by OpenAI" twice, and apologised in between without
// changing its mind. The rule that stops it has to survive being argued with,
// so it names that case explicitly.
func TestThePersonaRefusesToNameAModel(t *testing.T) {
	for _, required := range []string{
		"ห้ามเดาชื่อโมเดลหรือชื่อบริษัท",
		"ถูกแย้ง",
		"ห้ามแต่งเหตุผลย้อนหลัง",
		"ให้ถามกลับ",
	} {
		if !strings.Contains(joyboyPersona, required) {
			t.Errorf("the persona lost its rule about %q", required)
		}
	}
}

// Hardcoding the running model here would go stale the moment key rotation
// falls through to another provider, turning this file into the source of the
// lie it was written to prevent.
func TestThePersonaNamesNoProvider(t *testing.T) {
	for _, name := range []string{"gpt-oss", "GPT-4", "OpenAI", "Groq", "Gemini", "Google", "Llama"} {
		if strings.Contains(joyboyPersona, name) {
			t.Errorf("the persona hardcodes %q, which rotation can make false", name)
		}
	}
}

// The assistant is the same character every day, so it uses one pronoun. Left
// unsaid it drifted: "ฉันเป็น AI ไม่ได้กินอาหารเลยครับ" in the middle of a thread
// where every other answer said "ผม", which reads as a different person replying.
func TestThePersonaPinsOnePronoun(t *testing.T) {
	for _, prompt := range []string{
		answerPrompt("ชอบกินอะไร", nil, "", ""),
		answerPrompt("ยอดขายเท่าไหร่", nil, "", "revenue=7880.00"),
	} {
		if !strings.Contains(prompt, `เรียกตัวเองว่า "ผม" เสมอ`) {
			t.Fatal("the persona stopped pinning a pronoun")
		}
	}
}

// The rule about claiming a change has to be one the model can follow without
// knowing what happened this round — that is the whole point of it.
//
// The old phrasing was "do not say you did something, BECAUSE nothing happened
// this round". That asks the model to know what happened, which it cannot: it
// sees a prompt and a fact sheet, not the write path. So the rule was
// unfollowable in principle, and Go compensated by reading the Thai and throwing
// answers away — which is how a recipe step became "I can't help with this".
//
// The unconditional version costs the owner nothing, because the confirmation
// card was always the thing that actually announced the outcome.
func TestPersonaForbidsOutcomeClaimsWithoutJudgement(t *testing.T) {
	// Both answer paths need the rule: the one with a fact sheet and the one
	// without. A model with no data is the more likely to improvise a result.
	for name, template := range map[string]string{
		"answerTemplate":       answerTemplate,
		"noDataAnswerTemplate": noDataAnswerTemplate,
	} {
		if !strings.Contains(template, "ไม่ว่ากรณีใด") {
			t.Errorf("%s must forbid outcome claims outright, not conditionally", name)
		}
		// A prohibition with no explanation of who does announce the result reads
		// as a gag order, and the model works around gag orders.
		if !strings.Contains(template, "ระบบมีกล่องยืนยันเป็นคนประกาศผลเอง") {
			t.Errorf("%s must say that the confirmation card announces the outcome", name)
		}
	}

	// Reading stored state back is not a claim about having changed it, and
	// losing that distinction would make the assistant unable to report a booking.
	if !strings.Contains(answerTemplate, "การรายงานสถานะที่อ่านมาไม่ถือว่าผิดข้อนี้") {
		t.Error("reporting state read from the shop must stay allowed")
	}

	// The old conditional phrasing asked the model to know what happened this
	// round. If it comes back, the rule becomes unfollowable again.
	if strings.Contains(answerTemplate, "เพราะรอบนี้เป็นการอ่านข้อมูลมาตอบเท่านั้น") {
		t.Error("the conditional phrasing is back — the rule now depends on knowledge the model does not have")
	}
}

// A rule that dictates a sentence gets emitted as that sentence.
//
// "ให้บอกสั้น ๆ ว่ายังไม่แน่ใจ แล้วขอให้ผู้ใช้พิมพ์สั่งใหม่ให้ชัดอีกที" came back
// as "ผมยังไม่แน่ใจครับ ขอให้ผู้ใช้พิมพ์สั่งใหม่ให้ชัดอีกทีครับ" on seven of
// fifteen questions — nearly word for word, including "ผู้ใช้", which is the
// prompt's word for the person the model is talking to, not a word anyone uses
// to someone's face.
//
// The same failure had already appeared once elsewhere: the command extractor
// returned its own twenty-one worked examples as if the owner had ordered them.
// Both times the model could not tell the rules from the thing it was asked to
// produce. The file's own notes reached this conclusion before either of us did
// — "The fix is not another prohibition — it is telling it what the answer looks
// like without handing it a sentence to fill in."
//
// So: state the goal, never the words. This test fails if a script comes back.
func TestPromptDoesNotHandTheModelASentenceToRecite(t *testing.T) {
	for name, template := range map[string]string{
		"answerTemplate":       answerTemplate,
		"noDataAnswerTemplate": noDataAnswerTemplate,
	} {
		// The exact script that was being recited.
		if strings.Contains(template, "ขอให้ผู้ใช้พิมพ์สั่งใหม่") {
			t.Errorf("%s hands the model a sentence again — it will be recited, third person and all", name)
		}
		// The replacement has to say whose words to use, or the model reaches for
		// the nearest sentence in the prompt.
		if !strings.Contains(template, "ด้วยคำพูดของคุณเอง") {
			t.Errorf("%s asks for clarification without saying to use its own words", name)
		}
		// Both paths must carry the boundary between rules and output.
		if !strings.Contains(template, "ไม่ใช่ประโยคที่เอาไว้ลอกไปตอบ") {
			t.Errorf("%s does not tell the model that the rules are not the answer", name)
		}
		// "ผู้ใช้" reaching the owner is the visible symptom, so it is named
		// outright rather than left to the general rule.
		if !strings.Contains(template, `ห้ามใช้คำว่า "ผู้ใช้" ในคำตอบเด็ดขาด`) {
			t.Errorf("%s does not forbid addressing the owner as \"ผู้ใช้\"", name)
		}
	}
}

// Two rules that were doing damage by being too broad, and one that was missing.
func TestPersonaScopesAndForbidsWhatItShould(t *testing.T) {
	// G — "นายชื่ออะไรเหรอ" was answered "ผมไม่มีข้อมูลส่วนนั้นครับ รบกวนสอบถาม
	// ผู้ดูแลระบบ", which is the model-identity rule applied to a question about
	// its name. It is also, word for word, the rule itself.
	if !strings.Contains(joyboyPersona, "ข้อนี้ใช้เฉพาะคำถามเรื่องโมเดล/ค่าย/เครื่องที่รันเท่านั้น") {
		t.Error("the model-identity rule must be scoped, or it swallows 'what is your name'")
	}
	if !strings.Contains(joyboyPersona, "คุณคือผู้ช่วยของ Dishy ยังไม่มีชื่อเล่นเป็นของตัวเอง") {
		t.Error("the assistant needs a true answer to give when asked its name")
	}

	// C — "นายว่าร้านเราไปได้ดีมั้ย" came back "ผมว่าร้านเราน่าจะไปได้ดีนะครับ
	// เพราะมีลูกค้าแวะเวียนมาอุดหนุนอยู่เรื่อย ๆ" with no tool behind it. The old
	// rule only banned figures, and this sentence carries none — which is exactly
	// why it is worse: there is nothing in it the owner could check.
	if !strings.Contains(noDataAnswerTemplate, "ห้ามตัดสินว่าร้านนี้เป็นยังไงด้วย") {
		t.Error("a verdict on how the shop is doing needs data too, not just figures")
	}
}

// The assistant had no way to say no, so it started saying "I'm on it".
//
// Two rules had closed both honest exits: it may not say a change was made, and
// it may not say the system cannot do it ("เพราะคุณไม่รู้ว่าทำได้หรือไม่" — which
// was true, because nothing in the prompt had ever told it). What was left was
// the friendliest remaining move, and across three runs of eight impossible
// commands it took that move four times: "เดี๋ยวผมจัดการให้ตามนี้นะครับ",
// "ผมรับเรื่องไว้แล้วครับ", "เดี๋ยวผมจัดการในระบบให้ครับ" — for deleting staff,
// renaming the shop, moving a table. None of it was going to happen.
//
// The fix is not a fourth prohibition. It is the fact the model was missing:
// Go knows exactly what can be written, and the list is nine kinds long.
func TestNoDataPromptSaysWhatTheSystemCanActuallyWrite(t *testing.T) {
	for _, capability := range []string{"คลังวัตถุดิบ", "เมนู", "รายจ่าย"} {
		if !strings.Contains(noDataAnswerTemplate, capability) {
			t.Errorf("the writable area %q is missing — the model cannot refuse what it cannot enumerate", capability)
		}
	}
	// Without this the model has a list and still no permission to use it.
	if !strings.Contains(noDataAnswerTemplate, "ให้บอกตรง ๆ ว่าผู้ช่วยทำให้ไม่ได้") {
		t.Error("the prompt lists what is possible but never allows saying no to the rest")
	}
	// The exact opening the model walked through once the other two were shut.
	if !strings.Contains(noDataAnswerTemplate, "ห้ามบอกว่ากำลังทำอยู่ รับเรื่องไว้แล้ว หรือเดี๋ยวจัดการให้") {
		t.Error("claiming work is under way is the same lie as claiming it is done")
	}
	// A prohibition with no reason is one the model argues its way around; this
	// one says what it costs the owner.
	if !strings.Contains(noDataAnswerTemplate, "เจ้าของร้านจะรอสิ่งที่ไม่มีวันมา") {
		t.Error("the rule should say why, not just what")
	}
}

// "สวัสดีครับ" at noon came back "เหนื่อยมาทั้งวันเลยสิครับวันนี้": the persona's
// line about a tired owner was read as a fact about this owner. The rule is
// now conditional on the owner saying so, and says the assumption is wrong.
func TestPersonaDoesNotAssumeTheOwnerIsTired(t *testing.T) {
	if !strings.Contains(joyboyPersona, "ห้ามทึกทักเองว่าเขาเหนื่อย") {
		t.Fatal("the persona lost the rule against assuming tiredness")
	}
	if strings.Contains(joyboyPersona, "เจ้าของร้านเปิดร้านมาทั้งวันเหนื่อยได้") {
		t.Fatal("the unconditional 'the owner is tired' line is back")
	}
}
