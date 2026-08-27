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
	"time"

	"Project-M/internal/joyboy"
	"Project-M/internal/repository"
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

	// forecast carries chart-ready data back out of the tool run: joyboy's answer
	// channel is text-only (joyboy.Answer), so when the forecast tool runs it
	// stashes its structured result here on the struct that askJoyboy owns, and
	// askJoyboy attaches it to the response for the frontend chart to draw. The
	// LLM still writes the words from the fact sheet; this is only the series.
	forecast *AIForecastResult

	// chart rides back the same way for the general chart payloads (a two-period
	// comparison bar, a daily trend line): the tool computes it, askJoyboy hands
	// it to the frontend to draw.
	chart *AIChartData

	// history lets a tool read the range from the thread when the sentence alone
	// is not enough ("แล้วเดือนก่อนล่ะ").
	history []AIConversationMessage
}

// joyboyWithCoverage appends what range the shop actually has data for, so an
// empty window is reported as "outside the records" rather than as zero sales.
func joyboyWithCoverage(body, coverage string) string {
	if strings.TrimSpace(coverage) == "" {
		return body
	}
	return body + "\n" + coverage
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
	case joyboyToolMenuForPeriod:
		// Reuse legacy's period parser and range query, but render raw figures for
		// the model to rank rather than legacy's finished answer. A question that
		// names no period is not this tool's job — leave it out so the model's
		// 30-day menu tools answer instead.
		periods := extractPeriods(question, repository.BangkokNow())
		if len(periods) == 0 {
			return "", false, true
		}
		period := periods[0]
		metrics, err := t.service.repo.MenuMetricsForRange(t.restaurantID, period.Start, period.End)
		if err != nil {
			aiStage("warn", "joyboy: %s failed (%v) → leaving it out", tool, err)
			return "", false, true
		}
		return joyboyMenuForPeriodBody(period.Label, metrics), true, true
	case AIToolGetSalesForPeriod:
		// A whole-store sales total for a named day / month / relative month, or
		// a month-to-month / year-over-year comparison, all go through legacy's
		// dated-sales resolver (already tested) for the window, then render a
		// joyboy fact sheet rather than legacy's finished Thai answer. A named
		// year on its own ("ยอดขายปีนี้") is not covered by that resolver, so it
		// is handled here without widening extractPeriods (shared with the menu
		// and profit period flows). A question that names no period at all is
		// reported unhandled and falls through to the snapshot tool, which
		// answers about today — the right default for "ยอดขายเท่าไหร่" with no
		// window in it. (That tool can also report the last seven days, but only
		// when it is given the question, which the snapshot path does not do.)
		now := repository.BangkokNow()
		req, isDated := resolveDatedSalesRequest(question, now)
		if !isDated {
			// The word list did not recognise the range — which is most of the time,
			// because it only knows months. "เมื่อวาน", "สัปดาห์ที่แล้ว" and every
			// other day-level window arrive here. Rather than quietly answering
			// about today — which is how "เดือนมีน่า" became "there is no data" —
			// ask the model what range was meant and validate its answer here.
			// Reading a sentence is its job; deciding the figures stays ours.
			if modelReq, ok := t.service.resolveDatedSalesWithModel(question, t.history, now); ok {
				req, isDated = modelReq, true
				aiStage("flow", "joyboy: period read by the model (%d window(s), comparison=%v)", len(modelReq.periods), modelReq.comparison)
			}
		}
		if isDated {
			if strings.TrimSpace(req.clarify) != "" {
				return req.clarify, true, true
			}
			if req.comparison && len(req.periods) >= 2 {
				// Always oldest → newest, whichever order the owner said them in, so
				// the sentence reads forward in time and cannot be told backwards.
				a, b := req.periods[0], req.periods[1]
				if a.Start.Before(b.Start) {
					a, b = b, a
				}
				da, err := t.service.repo.SalesForRange(t.restaurantID, a.Start, a.End)
				if err != nil {
					aiStage("warn", "joyboy: %s comparison failed (%v) → leaving it out", tool, err)
					return "", false, true
				}
				db, err := t.service.repo.SalesForRange(t.restaurantID, b.Start, b.End)
				if err != nil {
					aiStage("warn", "joyboy: %s comparison failed (%v) → leaving it out", tool, err)
					return "", false, true
				}
				// A comparison is a picture worth drawing: hand the frontend a
				// two-bar chart of the same figures the fact sheet carries.
				t.chart = buildSalesComparisonChart(a.Label, da.Revenue, b.Label, db.Revenue)
				return joyboyWithCoverage(joyboySalesComparisonBody(a, da, b, db), t.service.aiSalesCoverageNote(t.restaurantID)), true, true
			}
			if len(req.periods) > 0 {
				p := req.periods[0]
				d, err := t.service.repo.SalesForRange(t.restaurantID, p.Start, p.End)
				if err != nil {
					aiStage("warn", "joyboy: %s failed (%v) → leaving it out", tool, err)
					return "", false, true
				}
				return joyboyWithCoverage(joyboySalesForPeriodBody(p.Label, d), t.service.aiSalesCoverageNote(t.restaurantID)), true, true
			}
		}
		if year, ok := joyboyYearSalesTotal(question, now); ok {
			d, err := t.service.repo.SalesForRange(t.restaurantID, year.Start, year.End)
			if err != nil {
				aiStage("warn", "joyboy: %s (year) failed (%v) → leaving it out", tool, err)
				return "", false, true
			}
			return joyboySalesForPeriodBody(year.Label, d), true, true
		}
		return "", false, false
	case joyboyToolSalesForecast:
		// Reuse legacy's forecast compute wholesale (weekday average × trend +
		// backtest bounds) — it already builds the chart-ready result. The chart
		// data is stashed on the tools struct for askJoyboy; the fact sheet is
		// what the model phrases from.
		// No word-list check here: the model already read the sentence and asked
		// for a forecast, and a list of sixteen phrases can only overrule it.
		resp, handled, err := t.service.buildSalesForecastAnswer(t.restaurantID)
		if err != nil {
			aiStage("warn", "joyboy: %s failed (%v) → leaving it out", tool, err)
			return "", false, true
		}
		if !handled {
			return "", false, true
		}
		if resp.Forecast == nil {
			// Not enough daily history to forecast: relay the deterministic
			// explanation, no chart.
			return resp.Answer, true, true
		}
		t.forecast = resp.Forecast
		return joyboyForecastBody(resp.Forecast), true, true
	}
	return "", false, false
}

// joyboyYearSalesTotal recognises a whole-year sales total ("ยอดขายปีนี้",
// "ยอดขายปีที่แล้ว", "ยอดขายปี 2568") — a case the month/day resolver does not
// cover. It is kept here, joyboy-local, rather than added to extractPeriods so
// the shared menu and profit period parsers keep their current tested behaviour.
// It claims a question only when it is clearly about a sales total and not about
// a menu, ingredient, or per-order average (those own their tools).
func joyboyYearSalesTotal(question string, ref time.Time) (AIPeriod, bool) {
	n := strings.ToLower(strings.TrimSpace(question))
	if datedSalesExcluded(n) || !mentionsSalesTotal(n) {
		return AIPeriod{}, false
	}
	year, ok := extractBareYear(question, ref)
	if !ok {
		return AIPeriod{}, false
	}
	loc := bangkokLocation()
	start := time.Date(year, 1, 1, 0, 0, 0, 0, loc)
	return AIPeriod{
		Label: fmt.Sprintf("ปี %d", year+543),
		Start: start,
		End:   start.AddDate(1, 0, 0),
	}, true
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
		// The question goes in as well. It used to be left out, which quietly cost
		// two things: a "how many did I sell yesterday" fell back to today's figure
		// because the period tool never saw the word, and "ขอ 10 อันดับ" always
		// returned five. The tools that ignore the question are unaffected.
		result, runErr := executeReadOnlyTool(tool, snapshot, question)
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
	// Some questions are worth a picture, drawn from the same snapshot the fact
	// sheet used: a trend as a daily line, best-sellers as bars, order types as a
	// pie. The first chart-worthy tool wins, and only when no chart was already
	// set (a dated comparison owns the chart when it runs).
	if t.chart == nil {
		for _, name := range names {
			var chart *AIChartData
			switch AIToolName(strings.TrimSpace(name)) {
			case AIToolGetSalesTrend:
				chart = buildDailySalesLineChart(snapshot.SalesDays)
			case AIToolGetTopSellingMenus:
				// The model reaches for this tool even to just list the menus
				// ("มีเมนูอะไรบ้าง"), so only draw a ranking chart when the question
				// actually asks for one — never for a plain list.
				if menuRankingChartWanted(question) {
					chart = buildTopMenusBarChart(snapshot.TopMenuItems)
				}
			case AIToolGetOrderTypeBreakdown:
				chart = buildOrderTypePieChart(snapshot.OrderTypeBreakdown)
			}
			if chart != nil {
				t.chart = chart
				break
			}
		}
	}
	return results
}

// askJoyboy answers one question through joyboy and shapes the reply the way the
// frontend already expects. A failure is reported as an outage rather than
// answered around: the only text available to fall back on is the fact sheet,
// which is Go's writing, and showing it would be the template again.
func (s *AIService) askJoyboy(ctx context.Context, actor AIActorContext, request *AIAskRequest) (*AIAskResponse, error) {
	// An owner's plain-language command to change something — stock, an
	// ingredient's price, a menu going off sale — short-circuits the read/answer
	// flow into the reviewed plan boundary: the model proposes structure, Go
	// checks it against the live database, and nothing is written until the owner
	// confirms. When actions are off or the sentence is not a command, this leaves
	// the question to be answered normally below.
	//
	// Menu commands used to have their own keyword-matched entry point here. They
	// do not any more: one road, one boundary, and "ต้มยำกุ้งหมดแล้ว เอาลงก่อน"
	// works for the same reason "เอาหมูสับเข้าคลัง 2 กิโล" does.
	actionResponse := &AIAskResponse{Intent: AIIntentChat, Task: AITaskGeneralChat, Model: "joyboy"}
	if s.maybeHandleJoyboyStockCommand(actor, request, actionResponse) {
		return actionResponse, nil
	}

	tools := &joyboyTools{service: s, restaurantID: actor.RestaurantID, history: request.History}
	assistant, err := joyboy.New(joyboyChat{service: s}, tools, func(format string, args ...any) {
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
	// With no tool behind it, an answer that states a figure or claims a change
	// was made is invented — send the plain "cannot help with this yet" instead.
	finalAnswer := joyboyScopedAnswer(answer.Text, len(answer.Tools))
	if finalAnswer != answer.Text {
		aiStage("flow", "joyboy: unbacked answer with 0 tools → replaced with out-of-scope reply")
	}
	response := &AIAskResponse{
		Answer: finalAnswer,
		Intent: intent,
		Task:   task,
		Model:  fmt.Sprintf("joyboy(%s)", strings.Join(answer.Tools, "+")),
	}
	// A forecast question leaves its chart-ready series on the tools struct; hand
	// it to the frontend so the ForecastChart draws under the answer.
	if tools.forecast != nil {
		response.Forecast = tools.forecast
	}
	if tools.chart != nil {
		response.Chart = tools.chart
	}
	return response, nil
}

func joyboyHistory(history []AIConversationMessage) []joyboy.Turn {
	turns := make([]joyboy.Turn, 0, len(history))
	for _, message := range history {
		turns = append(turns, joyboy.Turn{Role: message.Role, Content: message.Content})
	}
	return turns
}
