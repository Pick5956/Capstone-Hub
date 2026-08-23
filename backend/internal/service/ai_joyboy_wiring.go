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
// provider fallback, key rotation and parked keys.
type joyboyChat struct {
	service *AIService
}

func (c joyboyChat) Complete(ctx context.Context, prompt string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	text, _, err := c.service.askSecondRoundWithRotation(prompt)
	return text, err
}

// joyboyTools runs read-only tools for one restaurant. The restaurant is fixed
// when this is built, from the authenticated caller — there is no path by which
// a model could change it, because no tool takes it as an argument.
type joyboyTools struct {
	service      *AIService
	restaurantID uint
}

func (t *joyboyTools) Catalogue() []joyboy.ToolSpec {
	// The same names and one-line descriptions the provider tool definitions
	// already carry, so there is one place to edit when a tool is added.
	definitions := t.service.getGroqTools()
	catalogue := make([]joyboy.ToolSpec, 0, len(definitions))
	for _, definition := range definitions {
		catalogue = append(catalogue, joyboy.ToolSpec{
			Name:        definition.Function.Name,
			Description: definition.Function.Description,
		})
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
		body, ok := localToolAnswer(result)
		if !ok || strings.TrimSpace(body) == "" {
			continue
		}
		results = append(results, joyboy.ToolResult{
			Tool: string(tool),
			// The body already opens with the Thai sentence naming the period,
			// so the label only has to say which tool produced the block.
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
