package service

import (
	"testing"
	"time"

	"Project-M/internal/entity"
)

// The time a stored turn was said survives the trip from the row to the
// joyboy turn — through the sanitiser, which used to rebuild every message
// from scratch and would silently drop it.
func TestStoredTurnTimeReachesTheJoyboyHistory(t *testing.T) {
	at := time.Date(2026, 9, 6, 20, 18, 0, 0, time.UTC)
	messages := conversationTurnsToMessages([]entity.AIConversationTurn{{
		ID: "t1", Question: "สัปดาห์ก่อนคือวันไหน", Answer: "24 ถึง 30 สิงหาคม ครับ", CreatedAt: at,
	}})
	if len(messages) != 2 {
		t.Fatalf("messages = %d, want 2", len(messages))
	}
	for _, message := range messages {
		if !message.At.Equal(at) {
			t.Errorf("%s message lost its time: %v", message.Role, message.At)
		}
	}
	turns := joyboyHistory(messages)
	if len(turns) != 2 || !turns[1].At.Equal(at) {
		t.Fatalf("joyboy turns = %+v", turns)
	}
}
