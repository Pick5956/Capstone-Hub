package service

import (
	"os"
	"strings"
	"sync"
	"time"
)

// The three reads of a question — is it a command, which tools, which period —
// used to run one after another, each a provider call of about a second, before
// the answer was even started. They read the same sentence and none needs
// another's result, so with AI_JOYBOY_PARALLEL on they run at the same time:
// the command drafts and the period are started as futures while joyboy makes
// its tool choice, and whoever needs a result waits for it. Measured on
// gemini-3.5-flash-lite a call costs ~1s whatever its size, so this takes a
// question from ~5s to ~3s without changing a single prompt.
//
// The cost is honest: the period is read speculatively, so a question with no
// period in it spends one small call (~1.5k tokens) it did not need. Off by
// default; the switch is the rollback.

// aiJoyboyParallelEnabled reads AI_JOYBOY_PARALLEL.
func aiJoyboyParallelEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AI_JOYBOY_PARALLEL"))) {
	case "1", "true", "on", "enabled":
		return true
	default:
		return false
	}
}

// joyboyDraftsResult is what the command extractor returned, carried across
// the goroutine boundary as one value so nothing is read half-written.
type joyboyDraftsResult struct {
	drafts []AIStockCommandDraft
	err    error
}

// joyboyPeriodFuture is a period read started early. read blocks until it is
// in, and answers only the sentence it was started for — any other sentence
// goes to a fresh read, so the shortcut can never hand a tool the wrong window.
type joyboyPeriodFuture struct {
	question string
	direct   salesWindowReader
	done     chan struct{}
	once     sync.Once
	req      datedSalesRequest
	ok       bool
}

func newJoyboyPeriodFuture(question string, history []AIConversationMessage, now time.Time, direct salesWindowReader) *joyboyPeriodFuture {
	f := &joyboyPeriodFuture{question: question, direct: direct, done: make(chan struct{})}
	go func() {
		defer close(f.done)
		f.req, f.ok = direct(question, history, now)
	}()
	return f
}

func (f *joyboyPeriodFuture) read(question string, history []AIConversationMessage, now time.Time) (datedSalesRequest, bool) {
	if question != f.question {
		return f.direct(question, history, now)
	}
	<-f.done
	return f.req, f.ok
}
