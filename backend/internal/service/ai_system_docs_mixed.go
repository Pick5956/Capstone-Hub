package service

import (
	"regexp"
	"strings"
)

type systemDocsQuestionParts struct {
	DocsQuestion string
	LiveQuestion string
	Mixed        bool
}

var systemDocsQuestionSeparator = regexp.MustCompile(
	`(?i)(?:\s+(?:and|also)\s+|\s*(?:และ|พร้อมกับ|อีกทั้ง|รวมถึง|แล้วก็|นอกจากนี้)\s*|[;；]\s*|[?!！？。]\s+|\.\s+)`,
)

// splitSystemDocsAndLiveQuestion only creates a mixed request when the user
// explicitly separates a live restaurant-data clause from a product-help
// clause with a conjunction, semicolon, or sentence boundary. This keeps the
// existing scoped live-data pipeline authoritative for restaurant facts while
// sending only the help clause to public docs lookup.
func splitSystemDocsAndLiveQuestion(question string) systemDocsQuestionParts {
	question = strings.TrimSpace(question)
	if question == "" {
		return systemDocsQuestionParts{}
	}

	rawParts := systemDocsQuestionSeparator.Split(question, -1)
	clauses := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		if part = strings.TrimSpace(part); part != "" {
			clauses = append(clauses, part)
		}
	}

	if len(clauses) > 1 {
		docsParts := make([]string, 0, len(clauses))
		liveParts := make([]string, 0, len(clauses))
		for _, clause := range clauses {
			switch {
			case looksLikeMenuAvailabilityActionCommand(clause):
				// Supported writes must always pass through the existing scoped
				// planner and preview/confirm pipeline. Documentation retrieval
				// must never intercept an action just because the catalog also
				// describes that capability.
				liveParts = append(liveParts, clause)
			case looksLikeLiveRestaurantDataQuestion(clause):
				liveParts = append(liveParts, clause)
			case looksLikeSystemDocsQuestion(clause):
				docsParts = append(docsParts, clause)
			default:
				// Never discard an unclassified clause. It may be a risky or
				// unsupported write that the existing planner/safety guard must
				// see and explicitly refuse.
				liveParts = append(liveParts, clause)
			}
		}
		if len(docsParts) > 0 && len(liveParts) > 0 {
			return systemDocsQuestionParts{
				DocsQuestion: strings.Join(docsParts, " "),
				LiveQuestion: strings.Join(liveParts, " "),
				Mixed:        true,
			}
		}
	}

	if looksLikeMenuAvailabilityActionCommand(question) {
		return systemDocsQuestionParts{LiveQuestion: question}
	}
	if looksLikeLiveRestaurantDataQuestion(question) {
		return systemDocsQuestionParts{LiveQuestion: question}
	}
	if looksLikeSystemDocsQuestion(question) {
		return systemDocsQuestionParts{DocsQuestion: question}
	}
	return systemDocsQuestionParts{LiveQuestion: question}
}

var englishMenuAvailabilityActionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(?:set|mark|make)\s+(.+?)\s+(?:unavailable|available)\b`),
	regexp.MustCompile(`(?i)\bset\s+(?:the\s+)?availability\s+(?:of\s+)?(.+?)\s+to\s+(?:unavailable|available)\b`),
}

var thaiMenuAvailabilityActionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?:ตั้ง|เปลี่ยน)สถานะ(?:ของ)?เมนู\s+(.+?)\s+(?:เป็น|ให้เป็น)\s*(?:ไม่)?พร้อมขาย`),
	regexp.MustCompile(`ทำให้เมนู\s+(.+?)\s+(?:ไม่)?พร้อมขาย`),
}

// looksLikeMenuAvailabilityActionCommand is deliberately narrow. It only
// protects the single reviewed write capability from being mistaken for a
// docs question; the planner remains responsible for resolving the target,
// enforcing owner/restaurant scope, and requiring preview plus confirmation.
func looksLikeMenuAvailabilityActionCommand(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	if normalized == "" {
		return false
	}

	for _, phrase := range []string{"ปิดขายเมนู", "เปิดขายเมนู", "ปิดขาย", "เปิดขาย"} {
		if index := strings.Index(normalized, phrase); index >= 0 {
			target := normalized[index+len(phrase):]
			if hasConcreteMenuAvailabilityTarget(target) {
				return true
			}
		}
	}
	for _, pattern := range thaiMenuAvailabilityActionPatterns {
		matches := pattern.FindStringSubmatch(normalized)
		if len(matches) == 2 && hasConcreteMenuAvailabilityTarget(matches[1]) {
			return true
		}
	}
	for _, pattern := range englishMenuAvailabilityActionPatterns {
		matches := pattern.FindStringSubmatch(normalized)
		if len(matches) == 2 && hasConcreteMenuAvailabilityTarget(matches[1]) {
			return true
		}
	}
	return false
}

func hasConcreteMenuAvailabilityTarget(value string) bool {
	value = strings.TrimSpace(strings.Trim(value, "?!.,:;。！？"))
	for {
		original := value
		for _, suffix := range []string{
			"ได้หรือไม่", "ได้ไหม", "หรือไม่", "ไหม", "ให้หน่อย", "หน่อย", "ที", "ครับ", "ค่ะ", "please",
		} {
			value = strings.TrimSpace(strings.TrimSuffix(value, suffix))
		}
		value = strings.TrimSpace(strings.Trim(value, "?!.,:;。！？"))
		if value == original {
			break
		}
	}

	switch value {
	case "", "เมนู", "menu", "the menu", "menu item", "the menu item",
		"อะไร", "อะไรได้บ้าง", "อย่างไร", "ยังไง", "how", "what":
		return false
	default:
		return true
	}
}

func looksLikeLiveRestaurantDataQuestion(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	if normalized == "" {
		return false
	}
	if containsAny(normalized,
		"วิธี", "ทำยังไง", "ทำอย่างไร", "ใช้อย่างไร", "ข้อจำกัด", "อะไรได้บ้าง",
		"how to", "where can", "what can", "does dishy support", "can dishy", "documentation", "docs",
	) {
		return false
	}

	hasDataSubject := containsAny(normalized,
		"ยอดขาย", "รายได้", "ออเดอร์", "เมนูขาย", "กำไร", "มาร์จิ้น", "margin",
		"สต็อก", "สต๊อก", "วัตถุดิบ", "ต้นทุน", "sales", "sell", "sold", "revenue", "orders", "order count",
		"top menu", "best seller", "profit", "inventory", "stock", "ingredient", "cost",
	)
	if !hasDataSubject {
		return false
	}

	return containsAny(normalized,
		"วันนี้", "เมื่อวาน", "ตอนนี้", "ล่าสุด", "สัปดาห์", "เดือน", "ปี", "ช่วง", "เท่าไร", "เท่าไหร่",
		"กี่", "อะไร", "ไหน", "สูงสุด", "ต่ำสุด", "ขายดี", "ใกล้หมด", "แนะนำ", "เทียบ",
		"today", "yesterday", "current", "latest", "this week", "last week", "this month", "last month",
		"how much", "how many", "which", "what are", "top", "highest", "lowest", "low stock", "compare", "recommend",
	)
}

func combineLiveAndSystemDocsResponse(live, docs *AIAskResponse) *AIAskResponse {
	if live == nil {
		return docs
	}
	if docs == nil {
		return live
	}

	if strings.TrimSpace(docs.Answer) != "" {
		if strings.TrimSpace(live.Answer) == "" {
			live.Answer = docs.Answer
		} else {
			heading := "ข้อมูลวิธีใช้จากเอกสาร Dishy:"
			if detectSystemDocsLanguage(docs.Answer) == "en" {
				heading = "Dishy system documentation:"
			}
			live.Answer = strings.TrimSpace(live.Answer) + "\n\n" + heading + "\n" + strings.TrimSpace(docs.Answer)
		}
	}

	tools := make([]AIToolName, 0, len(live.ToolsUsed)+len(docs.ToolsUsed)+1)
	seenTools := make(map[AIToolName]struct{}, cap(tools))
	appendTool := func(tool AIToolName) {
		if tool == "" {
			return
		}
		if _, exists := seenTools[tool]; exists {
			return
		}
		seenTools[tool] = struct{}{}
		tools = append(tools, tool)
	}
	for _, tool := range live.ToolsUsed {
		appendTool(tool)
	}
	appendTool(live.Tool)
	for _, tool := range docs.ToolsUsed {
		appendTool(tool)
	}
	live.ToolsUsed = tools

	seenSources := make(map[string]struct{}, len(live.DocSources)+len(docs.DocSources))
	for _, source := range live.DocSources {
		seenSources[source.URL] = struct{}{}
	}
	for _, source := range docs.DocSources {
		if _, exists := seenSources[source.URL]; exists {
			continue
		}
		seenSources[source.URL] = struct{}{}
		live.DocSources = append(live.DocSources, source)
	}
	return live
}
