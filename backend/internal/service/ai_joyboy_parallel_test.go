package service

import (
	"sync/atomic"
	"testing"
	"time"
)

// A period read started early answers the sentence it was started for, once,
// and any other sentence goes to a fresh read — so the shortcut can never hand
// a tool the wrong window.
func TestPeriodFutureAnswersItsOwnQuestionOnceAndOthersFresh(t *testing.T) {
	var calls int32
	direct := func(question string, _ []AIConversationMessage, _ time.Time) (datedSalesRequest, bool) {
		atomic.AddInt32(&calls, 1)
		return datedSalesRequest{comparison: question == "เทียบ"}, true
	}
	future := newJoyboyPeriodFuture("ยอดขายเดือนนี้", nil, time.Now(), direct)
	for i := 0; i < 3; i++ {
		req, ok := future.read("ยอดขายเดือนนี้", nil, time.Now())
		if !ok || req.comparison {
			t.Fatalf("read %d = %+v %v", i, req, ok)
		}
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("the same question was read %d times, want 1", n)
	}
	if req, _ := future.read("เทียบ", nil, time.Now()); !req.comparison {
		t.Fatal("a different sentence must be read fresh, not answered from the future")
	}
	if n := atomic.LoadInt32(&calls); n != 2 {
		t.Fatalf("reads = %d, want 2", n)
	}
}

// Off unless asked for: the switch is the rollback.
func TestParallelPreflightIsOffByDefault(t *testing.T) {
	t.Setenv("AI_JOYBOY_PARALLEL", "")
	if aiJoyboyParallelEnabled() {
		t.Fatal("AI_JOYBOY_PARALLEL should default to off")
	}
	t.Setenv("AI_JOYBOY_PARALLEL", "true")
	if !aiJoyboyParallelEnabled() {
		t.Fatal("AI_JOYBOY_PARALLEL=true should turn it on")
	}
}
