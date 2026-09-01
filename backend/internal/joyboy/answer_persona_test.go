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
