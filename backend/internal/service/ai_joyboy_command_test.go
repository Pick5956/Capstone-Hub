package service

import (
	"strings"
	"testing"
)


// The owner asked the same thing twice and heard it twice: "กะเพราเหลือเท่าไหร่
// แล้วสั่งเพิ่มให้หน่อย" produced two drafts about กะเพรา, both missing a
// quantity, and both questions were printed on consecutive lines.
func TestRepeatedQuestionsAreAskedOnce(t *testing.T) {
	got := aiDropRepeats([]string{
		`“กะเพรา” เท่าไหร่ครับ (หน่วยกรัม)`,
		`“กะเพรา” เท่าไหร่ครับ (หน่วยกรัม)`,
		`“หมูสับ” เท่าไหร่ครับ (หน่วยกรัม)`,
	})
	if len(got) != 2 {
		t.Fatalf("identical questions should collapse to one, got %d: %v", len(got), got)
	}
	// Order matters: the first thing the owner said should be asked about first.
	if !strings.Contains(got[0], "กะเพรา") || !strings.Contains(got[1], "หมูสับ") {
		t.Errorf("order was not preserved: %v", got)
	}
}
