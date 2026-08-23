package service

// Wiring for the joyboy package.
//
// joyboy knows nothing about this backend: it asks for a model call and a way to
// run read-only tools, and everything else it does itself. This file supplies
// those two things out of parts that already exist and are already trusted — the
// provider rotation, the snapshot builder, and the 22 read-only tools with their
// calculations. Nothing here recomputes anything.

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"Project-M/internal/joyboy"
)

// joyboyChat calls a model through the existing rotation, which already handles
// provider fallback, key rotation and parked keys. It stays on that path rather
// than calling Groq directly so that AI_PROVIDER keeps meaning the same thing
// for joyboy as it does for everything else.
type joyboyChat struct {
	service *AIService
}

func (c joyboyChat) Complete(ctx context.Context, prompt string, kind joyboy.CallKind) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	text, _, err := c.service.askSecondRoundWithOptions(prompt, joyboyCompleteOptions(kind))
	return text, err
}

// joyboyCompleteOptions turns "which call is this" into what to ask the provider
// for. Both settings are measured, not guessed.
//
// Choosing tools stays at medium because low made it worse: asked
// "เมนูไหนขายดีแต่กำไรน้อย" twice it reached for get_menu_engineering once and
// get_lowest_margin_menu the other time, and the second answer asserted a menu
// sells well from a tool that only reports margins. At medium the same question
// picked correctly twice out of two.
//
// Writing drops to low because there is nothing to decide there — the figures
// are already computed and the job is to put them into Thai. At medium, two
// replies out of four spent 1,857 and 1,917 tokens thinking and ran out of room
// mid-word; at low none did, and answers came back in half the time.
func joyboyCompleteOptions(kind joyboy.CallKind) aiProviderCompleteOptions {
	if kind == joyboy.CallWriteAnswer {
		return aiProviderCompleteOptions{ReasoningEffort: "low"}
	}
	return aiProviderCompleteOptions{ReasoningEffort: "medium"}
}

// joyboyTools runs read-only tools for one restaurant. The restaurant is fixed
// when this is built, from the authenticated caller — there is no path by which
// a model could change it, because no tool takes it as an argument.
type joyboyTools struct {
	service      *AIService
	restaurantID uint
}

func (t *joyboyTools) Catalogue() []joyboy.ToolSpec {
	// The tool names still come from the provider definitions, so adding a tool
	// there is enough to make it runnable. The descriptions come from
	// joyboyToolGuide instead: legacy's were written for a model that had
	// already been narrowed down by a classifier, and joyboy has none.
	definitions := t.service.getGroqTools()
	catalogue := make([]joyboy.ToolSpec, 0, len(definitions))
	for _, definition := range definitions {
		name := AIToolName(definition.Function.Name)
		if _, withheld := joyboyToolsNotOffered[name]; withheld {
			continue
		}
		description, described := joyboyToolGuide[name]
		if !described {
			// Falling back keeps a newly added tool usable rather than
			// invisible; the test insists it be described properly.
			description = definition.Function.Description
		}
		catalogue = append(catalogue, joyboy.ToolSpec{Name: string(name), Description: description})
	}
	return catalogue
}

func (t *joyboyTools) Run(ctx context.Context, names []string) ([]joyboy.ToolResult, error) {
	if len(names) == 0 {
		return nil, nil
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// One database read serves every tool: they all compute from the same
	// snapshot, so asking for five tools costs the same query as asking for one.
	snapshot, err := t.service.buildSnapshot(t.restaurantID)
	if err != nil {
		return nil, err
	}

	results := make([]joyboy.ToolResult, 0, len(names))
	for _, name := range names {
		tool := AIToolName(strings.TrimSpace(name))
		if !isSupportedReadOnlyTool(tool) {
			aiStage("warn", "joyboy: ignoring unsupported tool %q", name)
			continue
		}
		result, runErr := executeReadOnlyTool(tool, snapshot)
		if runErr != nil {
			aiStage("warn", "joyboy: tool %s failed (%v) → leaving it out", tool, runErr)
			continue
		}
		// joyboyFactBody, not localToolAnswer: the model is given figures to
		// interpret, not legacy's finished Thai answer to reword.
		body, ok := joyboyFactBody(result)
		if !ok || strings.TrimSpace(body) == "" {
			aiStage("warn", "joyboy: %s has no fact sheet rendering → leaving it out", tool)
			continue
		}
		results = append(results, joyboy.ToolResult{
			Tool: string(tool),
			// The body is figures only, so the label carries the one piece of
			// context the figures cannot: which tool produced them.
			Label: string(tool),
			Body:  body,
		})
	}
	return results, nil
}

// askJoyboy answers one question through joyboy and shapes the reply the way the
// frontend already expects. A failure is reported as an outage rather than
// answered around: the only text available to fall back on is the fact sheet,
// which is Go's writing, and showing it would be the template again.
func (s *AIService) askJoyboy(ctx context.Context, actor AIActorContext, request *AIAskRequest) (*AIAskResponse, error) {
	assistant, err := joyboy.New(joyboyChat{service: s}, &joyboyTools{service: s, restaurantID: actor.RestaurantID}, func(format string, args ...any) {
		aiStage("flow", format, args...)
	})
	if err != nil {
		return nil, err
	}

	answer, err := assistant.Ask(ctx, joyboy.Request{
		Question: request.Question,
		History:  joyboyHistory(request.History),
	})
	if err != nil {
		if errors.Is(err, joyboy.ErrUnavailable) {
			aiStage("warn", "joyboy: %v", err)
			return nil, aiProviderOutageError(errors.Unwrap(err))
		}
		return nil, err
	}

	intent := AIIntentChat
	task := AITaskGeneralChat
	if len(answer.Tools) > 0 {
		intent = AIIntentAnalysis
		task = AITaskRetrieveFact
	}
	aiStage("done", "joyboy answered with %d tool(s)", len(answer.Tools))
	// The answer itself only under AI_DEBUG: it is the owner's data, and
	// without it the log shows every decision except the one being judged.
	aiDebug("joyboy question: %s", request.Question)
	aiDebug("joyboy answer: %s", answer.Text)
	return &AIAskResponse{
		Answer: answer.Text,
		Intent: intent,
		Task:   task,
		Model:  fmt.Sprintf("joyboy(%s)", strings.Join(answer.Tools, "+")),
	}, nil
}

func joyboyHistory(history []AIConversationMessage) []joyboy.Turn {
	turns := make([]joyboy.Turn, 0, len(history))
	for _, message := range history {
		turns = append(turns, joyboy.Turn{Role: message.Role, Content: message.Content})
	}
	return turns
}
