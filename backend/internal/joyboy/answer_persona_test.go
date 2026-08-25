package joyboy

import (
	"strings"
	"testing"
)

// A question about the assistant itself can arrive on either path: the model
// sometimes reaches for a tool even then. The rules have to travel with both.
func TestPersonaReachesBothPaths(t *testing.T) {
	prompts := map[string]string{
		"with data":    answerPrompt("นายรันด้วยโมเดลอะไร", nil, "rank=1 menu=ต้มยำกุ้ง qty=109"),
		"without data": answerPrompt("นายรันด้วยโมเดลอะไร", nil, ""),
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
