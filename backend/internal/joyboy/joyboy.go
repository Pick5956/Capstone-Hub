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
	selection, err := a.chat.Complete(ctx, fmt.Sprintf(
		selectToolsTemplate, question, formatHistory(request.History), renderCatalogue(catalogue)), CallSelectTools)
	if err != nil {
		return Answer{}, fmt.Errorf("%w: choosing tools: %w", ErrUnavailable, err)
	}
	requested := parseToolSelection(selection, catalogue)

	// A model that asks for the same tool twice gets it once. Nothing is capped
	// beyond that: how many tools it really reaches for is one of the things
	// this version exists to find out.
	requested = dedupe(requested)
	a.log("joyboy: model asked for %d tool(s): %s", len(requested), strings.Join(requested, ", "))

	results, err := a.tools.Run(ctx, requested, question)
	if err != nil {
		return Answer{}, fmt.Errorf("%w: running tools: %w", ErrUnavailable, err)
	}

	sheet := buildFactSheet(results)
	text, err := a.write(ctx, question, request.History, sheet)
	if err != nil {
		return Answer{}, err
	}
	// Report the tools that actually produced data, not the ones the model asked
	// for. A requested tool can be dropped on the way (no period parsed, a port
	// that is not wired, a repository error) and the answer is then written from
	// an empty fact sheet — exactly the situation the caller's invention guard
	// exists for. Reporting the request instead told that guard a tool had run,
	// so it stood down and let an unbacked claim through: "ได้จองโต๊ะ P01 ให้แล้ว"
	// over a booking that never happened.
	return Answer{Text: text, Tools: answeredTools(results)}, nil
}

// answeredTools lists the tools that came back with something to say, in the
// order they ran. A result with an empty body contributed nothing to the fact
// sheet, so it does not count as a tool that answered.
func answeredTools(results []ToolResult) []string {
	names := make([]string, 0, len(results))
	for _, result := range results {
		if strings.TrimSpace(result.Body) == "" {
			continue
		}
		names = append(names, result.Tool)
	}
	return names
}

// write asks for the answer, then checks every large figure in it against the
// fact sheet and asks once more if one of them is not there.
//
// The rule against doing arithmetic is stated in the prompt, and the model keeps
// it almost always — but asked "ขายได้เท่าไหร่ จ่ายไปเท่าไหร่ เหลือเท่าไหร่" it
// subtracted the two and reported a figure that appears in no sheet, as a fact,
// in bold. Logging that (which is all this used to do) tells us afterwards; the
// owner still read the invented number. Naming the figure back to the model gets
// a clean answer, and it fires rarely enough — once in about twenty-five
// questions here — to be worth the extra call when it does.
func (a *Assistant) write(ctx context.Context, question string, history []Turn, sheet string) (string, error) {
	text, unmatched, err := a.writeOnce(ctx, answerPrompt(question, history, sheet), sheet)
	if err != nil || len(unmatched) == 0 {
		return text, err
	}
	for _, figure := range unmatched {
		a.log("joyboy: answer figure %q is not in the fact sheet → asking again", figure)
	}

	retry, stillUnmatched, retryErr := a.writeOnce(ctx,
		answerPrompt(question, history, sheet)+fmt.Sprintf(rewriteWithoutInventedFigures, strings.Join(unmatched, ", ")),
		sheet)
	if retryErr != nil || len(stillUnmatched) > 0 {
		// The rewrite is no better than what we have, so keep the first answer
		// rather than trading one unbacked figure for another.
		a.log("joyboy: the rewrite did not come back clean, keeping the first answer")
		return text, nil
	}
	return retry, nil
}

// writeOnce gives the model exactly one second chance. That retry is for a reply
// that arrived empty or as nothing but a wrapper, which a model does
// occasionally and does not repeat; anything worse than that is an outage and is
// reported as one.
func (a *Assistant) writeOnce(ctx context.Context, prompt, sheet string) (string, []string, error) {
	var lastErr error
	for attempt := 1; attempt <= 2; attempt++ {
		raw, err := a.chat.Complete(ctx, prompt, CallWriteAnswer)
		if err != nil {
			lastErr = err
			a.log("joyboy: writing the answer failed on attempt %d: %v", attempt, err)
			continue
		}
		if text := cleanAnswer(raw); text != "" {
			// The fact sheet is the dictionary of correct figures: normalise the
			// separators of any figure that matches it, and report any large one
			// that matches nothing.
			text, unmatched := reconcileFigures(text, sheet)
			return text, unmatched, nil
		}
		lastErr = errors.New("the model returned nothing usable")
		a.log("joyboy: attempt %d produced nothing usable", attempt)
	}
	return "", nil, fmt.Errorf("%w: writing the answer: %w", ErrUnavailable, lastErr)
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
