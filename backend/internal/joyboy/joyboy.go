package joyboy

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ErrUnavailable means no answer was produced. The caller reports it to the
// owner as an outage rather than substituting one of its own, because the only
// text Joyboy could substitute is the fact sheet, and the fact sheet is Go's
// writing.
var ErrUnavailable = errors.New("joyboy could not produce an answer")

// Assistant answers questions. Build it with New and keep it; it holds no state
// between questions.
type Assistant struct {
	chat  Chat
	tools Tools
	log   func(format string, args ...any)
}

// New wires an assistant. log may be nil.
func New(chat Chat, tools Tools, log func(string, ...any)) (*Assistant, error) {
	if chat == nil {
		return nil, errors.New("joyboy needs a chat provider")
	}
	if tools == nil {
		return nil, errors.New("joyboy needs a tool runner")
	}
	if log == nil {
		log = func(string, ...any) {}
	}
	return &Assistant{chat: chat, tools: tools, log: log}, nil
}

// Ask runs one question end to end.
func (a *Assistant) Ask(ctx context.Context, request Request) (Answer, error) {
	question := strings.TrimSpace(request.Question)
	if question == "" {
		return Answer{}, errors.New("joyboy needs a question")
	}

	catalogue := a.tools.Catalogue()
	requested, err := a.chat.SelectTools(ctx, selectToolsPrompt(question, request.History), catalogue)
	if err != nil {
		return Answer{}, fmt.Errorf("%w: choosing tools: %w", ErrUnavailable, err)
	}

	// A model that asks for the same tool twice gets it once. Nothing is capped
	// beyond that: how many tools it really reaches for is one of the things
	// this version exists to find out.
	requested = dedupe(requested)
	a.log("joyboy: model asked for %d tool(s): %s", len(requested), strings.Join(requested, ", "))

	results, err := a.tools.Run(ctx, requested)
	if err != nil {
		return Answer{}, fmt.Errorf("%w: running tools: %w", ErrUnavailable, err)
	}

	sheet := buildFactSheet(results)
	text, err := a.write(ctx, question, request.History, sheet)
	if err != nil {
		return Answer{}, err
	}
	return Answer{Text: text, Tools: requested}, nil
}

// write asks for the answer and gives the model exactly one second chance. The
// retry is for a reply that arrived empty or as nothing but a wrapper, which a
// model does occasionally and does not repeat; anything worse than that is an
// outage and is reported as one.
func (a *Assistant) write(ctx context.Context, question string, history []Turn, sheet string) (string, error) {
	prompt := answerPrompt(question, history, sheet)
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		raw, err := a.chat.Write(ctx, prompt)
		if err != nil {
			lastErr = err
			a.log("joyboy: writing the answer failed on attempt %d: %v", attempt, err)
			continue
		}
		if text := cleanAnswer(raw); text != "" {
			return text, nil
		}
		lastErr = errors.New("the model returned nothing usable")
		a.log("joyboy: attempt %d produced nothing usable", attempt)
	}
	return "", fmt.Errorf("%w: writing the answer: %w", ErrUnavailable, lastErr)
}

func dedupe(names []string) []string {
	seen := make(map[string]struct{}, len(names))
	unique := make([]string, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, repeated := seen[name]; repeated {
			continue
		}
		seen[name] = struct{}{}
		unique = append(unique, name)
	}
	return unique
}
