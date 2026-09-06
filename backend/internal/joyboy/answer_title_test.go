package joyboy

import (
	"strings"
	"testing"
)

// The owner can choose what the assistant calls them. The line that carries it
// rides in front of the digest — the dynamic block — so the static persona and
// rules stay a cacheable prefix; and with no title set, nothing is added at all.
func TestOwnerTitleLineOnlyWhenSet(t *testing.T) {
	if got := ownerTitleLine(""); got != "" {
		t.Errorf("an empty title added %q to the prompt", got)
	}
	if got := ownerTitleLine("   "); got != "" {
		t.Errorf("a blank title added %q to the prompt", got)
	}

	line := ownerTitleLine("พี่เก่ง")
	if !strings.Contains(line, "“พี่เก่ง”") {
		t.Errorf("the title is not quoted in the line: %q", line)
	}
	if !strings.HasSuffix(line, "\n") {
		t.Errorf("the line must end with a newline so the digest starts on its own line: %q", line)
	}

	// Through the prompt: the title lands before the history block and after
	// the persona, which is exactly where the digest goes.
	prompt := answerPrompt("ยอดขายวันนี้", nil, line+"เคยคุยเรื่องกะเพรา", "revenue=100.00")
	titleAt := strings.Index(prompt, "“พี่เก่ง”")
	personaAt := strings.Index(prompt, joyboyPersona[:20])
	if titleAt < 0 || personaAt < 0 || titleAt < personaAt {
		t.Errorf("the title line is not after the persona: title=%d persona=%d", titleAt, personaAt)
	}
}
