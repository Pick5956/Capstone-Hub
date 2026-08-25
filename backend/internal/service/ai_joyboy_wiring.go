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
	"sort"
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

// joyboyWriteCeiling is the output ceiling for the answer-writing round. Groq's
// unset default is 2,048, and at medium effort the round's worst measured cost
// was 1,917 tokens thinking plus 326 writing — 2,243, which overruns the default
// mid-word. 3,072 clears that with roughly 800 to spare, matching what the
// planner path settled on for the same reason. Groq reserves it against the
// daily budget at request time, so it is spent only on the round that needs it.
const joyboyWriteCeiling = 3072

// joyboyCompleteOptions turns "which call is this" into what to ask the provider
// for. Every value here is measured, not guessed.
//
// Both rounds run at medium. Choosing tools needs it because low made the choice
// worse: asked "เมนูไหนขายดีแต่กำไรน้อย" twice, low reached for get_menu_engineering
// once and get_lowest_margin_menu the other time, and then answered that a menu
// sells well from a tool that only reports margins; at medium the same question
// picked correctly twice out of two. Writing needs it too, for a reason low only
// exposed once tested: at low the round transcribed 96 dishes as 95 and 9,504
// baht as 9,405 on a repeat of the identical question — cheaper thinking started
// getting the figures wrong. Medium buys that back.
//
// Only the write round carries a ceiling, because only it thinks long enough to
// approach one; selection's output is a short JSON array and never came close to
// 2,048.
func joyboyCompleteOptions(kind joyboy.CallKind) aiProviderCompleteOptions {
	if kind == joyboy.CallWriteAnswer {
		return aiProviderCompleteOptions{ReasoningEffort: "medium", MaxCompletionTokens: joyboyWriteCeiling}
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
	// joyboy-only tools are appended after legacy's list, described by their own
	// guide. Run() handles these directly rather than through executeReadOnlyTool.
	for _, name := range joyboyExtraTools {
		catalogue = append(catalogue, joyboy.ToolSpec{Name: string(name), Description: joyboyExtraToolGuide[name]})
	}
	// Order and label by section so the flat list reads as grouped headings. The
	// set is untouched — only the order and the Group tag are set here — so no
	// tool is dropped or added by grouping. A stable sort keeps the within-group
	// order above.
	for i := range catalogue {
		catalogue[i].Group = joyboyToolGroupHeading(AIToolName(catalogue[i].Name))
	}
	sort.SliceStable(catalogue, func(a, b int) bool {
		return joyboyToolGroupOrder(AIToolName(catalogue[a].Name)) <
			joyboyToolGroupOrder(AIToolName(catalogue[b].Name))
	})
	return catalogue
}

// runJoyboyExtraTool handles the joyboy-only tools that do not go through the
// snapshot. handled is false for any other tool, so the caller falls through to
// the normal read-only path.
func (t *joyboyTools) runJoyboyExtraTool(tool AIToolName, question string) (body string, ok bool, handled bool) {
	switch tool {
	case joyboyToolDataCoverage:
		coverage, err := t.service.repo.SalesCoverage(t.restaurantID)
		if err != nil {
			aiStage("warn", "joyboy: %s failed (%v) → leaving it out", tool, err)
			return "", false, true
		}
		return joyboyDataCoverageBody(coverage), true, true
	case AIToolSearchSystemDocs:
		result, err := executeSystemDocsTool(AIToolSearchSystemDocs, AISystemDocsToolInput{Query: question})
		if err != nil {
			aiStage("warn", "joyboy: %s failed (%v) → leaving it out", tool, err)
			return "", false, true
		}
		return joyboySystemDocsBody(result), true, true
	}
	return "", false, false
}

func (t *joyboyTools) Run(ctx context.Context, names []string, question string) ([]joyboy.ToolResult, error) {
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

	results := t.appendReadOnlyResults(make([]joyboy.ToolResult, 0, len(names)), names, snapshot, question)
	return results, nil
}

// appendReadOnlyResults runs each requested tool and appends its fact sheet.
func (t *joyboyTools) appendReadOnlyResults(results []joyboy.ToolResult, names []string, snapshot AISnapshot, question string) []joyboy.ToolResult {
	for _, name := range names {
		tool := AIToolName(strings.TrimSpace(name))
		// joyboy-only tools are handled before the snapshot path.
		if body, ok, handled := t.runJoyboyExtraTool(tool, question); handled {
			if ok && strings.TrimSpace(body) != "" {
				results = append(results, joyboy.ToolResult{Tool: string(tool), Label: string(tool), Body: body})
			}
			continue
		}
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
	return results
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
