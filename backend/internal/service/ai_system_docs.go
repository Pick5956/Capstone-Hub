package service

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"Project-M/internal/systemdocs"
)

const (
	defaultSystemDocsSearchLimit = 3
	maxSystemDocsSearchLimit     = 5
	minimumSystemDocsScore       = 0.38
	strongSystemDocsIntentScore  = 0.62
	maxSystemDocsQuestionRunes   = 800
)

var (
	safeSystemDocID         = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	safeSystemDocURLPattern = regexp.MustCompile(
		`^/docs(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?#[a-z0-9]+(?:-[a-z0-9]+)*$`,
	)
	systemDocURLInTextPattern = regexp.MustCompile(
		`/docs(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?#[a-z0-9]+(?:-[a-z0-9]+)*`,
	)
)

type AISystemDocsToolInput struct {
	Query     string `json:"query,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Slug      string `json:"slug,omitempty"`
	SectionID string `json:"section_id,omitempty"`
	Language  string `json:"language,omitempty"`
}

type AISystemDocSearchResult struct {
	ArticleSlug     string  `json:"article_slug"`
	SectionID       string  `json:"section_id"`
	ArticleTitle    string  `json:"article_title"`
	SectionTitle    string  `json:"section_title"`
	RelevantContent string  `json:"relevant_content"`
	URL             string  `json:"url"`
	Language        string  `json:"language"`
	Score           float64 `json:"score"`
}

type AISystemDocDocument struct {
	ArticleSlug  string `json:"article_slug"`
	SectionID    string `json:"section_id"`
	ArticleTitle string `json:"article_title"`
	SectionTitle string `json:"section_title"`
	Content      string `json:"content"`
	URL          string `json:"url"`
	Language     string `json:"language"`
}

type AISystemDocsToolResult struct {
	SearchResults []AISystemDocSearchResult `json:"search_results,omitempty"`
	Document      *AISystemDocDocument      `json:"document,omitempty"`
}

type AISystemDocSource struct {
	ArticleSlug     string `json:"article_slug"`
	SectionID       string `json:"section_id"`
	ArticleTitle    string `json:"article_title"`
	SectionTitle    string `json:"section_title"`
	RelevantContent string `json:"relevant_content,omitempty"`
	URL             string `json:"url"`
}

func executeSystemDocsTool(tool AIToolName, input AISystemDocsToolInput) (AISystemDocsToolResult, error) {
	switch tool {
	case AIToolSearchSystemDocs:
		return searchSystemDocs(input)
	case AIToolReadSystemDoc:
		return readSystemDoc(input)
	default:
		return AISystemDocsToolResult{}, errors.New("unsupported system docs tool")
	}
}

func searchSystemDocs(input AISystemDocsToolInput) (AISystemDocsToolResult, error) {
	query := strings.TrimSpace(input.Query)
	if query == "" {
		return AISystemDocsToolResult{}, errors.New("system docs query is required")
	}
	if utf8.RuneCountInString(query) > maxSystemDocsQuestionRunes {
		return AISystemDocsToolResult{}, errors.New("system docs query is too long")
	}

	limit := input.Limit
	if limit == 0 {
		limit = defaultSystemDocsSearchLimit
	}
	if limit < 0 {
		return AISystemDocsToolResult{}, errors.New("system docs search limit cannot be negative")
	}
	if limit > maxSystemDocsSearchLimit {
		limit = maxSystemDocsSearchLimit
	}

	catalog, err := systemdocs.Load()
	if err != nil {
		return AISystemDocsToolResult{}, err
	}
	language := detectSystemDocsLanguage(query)
	results := make([]AISystemDocSearchResult, 0, len(catalog.Articles))
	for _, article := range catalog.Articles {
		for _, section := range article.Sections {
			score := rankSystemDocSection(query, language, article, section)
			if score < minimumSystemDocsScore {
				continue
			}
			results = append(results, AISystemDocSearchResult{
				ArticleSlug:     article.Slug,
				SectionID:       section.ID,
				ArticleTitle:    article.Title.ForLanguage(language),
				SectionTitle:    section.Title.ForLanguage(language),
				RelevantContent: formatSystemDocSection(section, language),
				URL:             systemDocURL(article.Slug, section.ID),
				Language:        language,
				Score:           math.Round(score*1000) / 1000,
			})
		}
	}

	sort.SliceStable(results, func(left, right int) bool {
		if results[left].Score != results[right].Score {
			return results[left].Score > results[right].Score
		}
		if results[left].ArticleSlug != results[right].ArticleSlug {
			return results[left].ArticleSlug < results[right].ArticleSlug
		}
		return results[left].SectionID < results[right].SectionID
	})
	if len(results) > limit {
		results = results[:limit]
	}
	return AISystemDocsToolResult{SearchResults: results}, nil
}

// systemDocsHandbook renders the whole manual in one language, section by
// section, with the page each article lives on.
//
// Searching it turned out to be the problem rather than the solution. The query
// was scored against every section by counting three-character runs shared with
// it, so "จะกดให้สิทพนักงานกดตรงไหน" — one letter short of "สิทธิ์" — scored
// 0.295 against the permissions section, fell under the 0.38 cut, and the
// assistant replied that the manual has no such topic. It has a whole article
// on it. Spelling, phrasing and synonyms are what the model is for; the manual
// is about 12,000 characters, which is cheaper to hand over whole than to teach
// Go to guess which part of it someone meant.
func systemDocsHandbook(language string) (string, error) {
	catalog, err := systemdocs.Load()
	if err != nil {
		return "", err
	}
	lines := make([]string, 0, len(catalog.Articles)*6)
	for _, article := range catalog.Articles {
		title := strings.TrimSpace(article.Title.ForLanguage(language))
		lines = append(lines, "## "+title)
		if summary := strings.TrimSpace(article.Summary.ForLanguage(language)); summary != "" {
			lines = append(lines, summary)
		}
		// The page an article belongs to answers half the questions people ask
		// about it — "กดตรงไหน" wants a place, not a paragraph.
		for _, route := range article.Routes {
			label := strings.TrimSpace(route.Label.ForLanguage(language))
			if label == "" || strings.TrimSpace(route.Href) == "" {
				continue
			}
			lines = append(lines, fmt.Sprintf("หน้าที่ใช้: %s (%s)", label, route.Href))
		}
		for _, section := range article.Sections {
			lines = append(lines, "### "+strings.TrimSpace(section.Title.ForLanguage(language)))
			if content := strings.TrimSpace(formatSystemDocSection(section, language)); content != "" {
				lines = append(lines, content)
			}
			lines = append(lines, "อ่านเพิ่ม: "+systemDocURL(article.Slug, section.ID))
		}
		lines = append(lines, "")
	}
	return strings.TrimSpace(strings.Join(lines, "\n")), nil
}

func readSystemDoc(input AISystemDocsToolInput) (AISystemDocsToolResult, error) {
	slug := strings.TrimSpace(input.Slug)
	sectionID := strings.TrimSpace(input.SectionID)
	if !safeSystemDocID.MatchString(slug) || !safeSystemDocID.MatchString(sectionID) {
		return AISystemDocsToolResult{}, errors.New("invalid system doc slug or section")
	}
	language := strings.ToLower(strings.TrimSpace(input.Language))
	if language == "" {
		language = "th"
	}
	if language != "th" && language != "en" {
		return AISystemDocsToolResult{}, errors.New("unsupported system doc language")
	}

	catalog, err := systemdocs.Load()
	if err != nil {
		return AISystemDocsToolResult{}, err
	}
	for _, article := range catalog.Articles {
		if article.Slug != slug {
			continue
		}
		for _, section := range article.Sections {
			if section.ID != sectionID {
				continue
			}
			return AISystemDocsToolResult{Document: &AISystemDocDocument{
				ArticleSlug:  article.Slug,
				SectionID:    section.ID,
				ArticleTitle: article.Title.ForLanguage(language),
				SectionTitle: section.Title.ForLanguage(language),
				Content:      formatSystemDocSection(section, language),
				URL:          systemDocURL(article.Slug, section.ID),
				Language:     language,
			}}, nil
		}
		break
	}
	return AISystemDocsToolResult{}, errors.New("system doc was not found")
}

func answerSystemDocsQuestion(question string) (*AIAskResponse, bool, error) {
	question = strings.TrimSpace(question)
	if question == "" || !looksLikeSystemDocsQuestion(question) {
		return nil, false, nil
	}
	return answerKnownSystemDocsQuestion(question)
}

// answerKnownSystemDocsQuestion is used after the authorized router/planner has
// already classified a request as product help. It deliberately bypasses the
// local keyword detector so a detector miss can never fall through to a
// free-form provider answer.
func answerKnownSystemDocsQuestion(question string) (*AIAskResponse, bool, error) {
	question = strings.TrimSpace(question)
	if question == "" {
		return nil, true, errors.New("question is required")
	}
	if utf8.RuneCountInString(question) > maxSystemDocsQuestionRunes {
		return nil, true, errors.New("question is too long")
	}

	language := detectSystemDocsLanguage(question)
	search, err := executeSystemDocsTool(AIToolSearchSystemDocs, AISystemDocsToolInput{
		Query: question,
		Limit: defaultSystemDocsSearchLimit,
	})
	if err != nil {
		return nil, true, err
	}
	if len(search.SearchResults) == 0 {
		answer := "ยังไม่มีข้อมูลเรื่องนี้ในเอกสารสาธารณะของ Dishy ครับ"
		if language == "en" {
			answer = "Dishy's public documentation does not currently contain information that answers this question."
		}
		return &AIAskResponse{
			Answer:     answer,
			Intent:     AIIntentCapability,
			Task:       AITaskProductHelp,
			Tool:       AIToolSearchSystemDocs,
			Model:      "local-system-docs",
			ToolsUsed:  []AIToolName{AIToolSearchSystemDocs},
			DocSources: []AISystemDocSource{},
		}, true, nil
	}

	match := search.SearchResults[0]
	read, err := executeSystemDocsTool(AIToolReadSystemDoc, AISystemDocsToolInput{
		Slug:      match.ArticleSlug,
		SectionID: match.SectionID,
		Language:  language,
	})
	if err != nil {
		return nil, true, err
	}
	if read.Document == nil {
		return nil, true, errors.New("system docs read returned no document")
	}
	document := read.Document
	citationLabel := escapeSystemDocMarkdown(document.ArticleTitle + " — " + document.SectionTitle)
	answer := document.Content + "\n\nอ่านต่อ: [" + citationLabel + "](" + document.URL + ")"
	if language == "en" {
		answer = document.Content + "\n\nRead more: [" + citationLabel + "](" + document.URL + ")"
	}

	return &AIAskResponse{
		Answer:    answer,
		Intent:    AIIntentCapability,
		Task:      AITaskProductHelp,
		Tool:      AIToolSearchSystemDocs,
		Model:     "local-system-docs",
		ToolsUsed: []AIToolName{AIToolSearchSystemDocs, AIToolReadSystemDoc},
		DocSources: []AISystemDocSource{{
			ArticleSlug:     document.ArticleSlug,
			SectionID:       document.SectionID,
			ArticleTitle:    document.ArticleTitle,
			SectionTitle:    document.SectionTitle,
			RelevantContent: document.Content,
			URL:             document.URL,
		}},
	}, true, nil
}

func rankSystemDocSection(query, language string, article systemdocs.Article, section systemdocs.Section) float64 {
	sectionText := strings.Join(systemDocSectionSearchText(section, language), " ")
	articleText := strings.Join([]string{
		article.Title.ForLanguage(language),
		article.Summary.ForLanguage(language),
		article.Audience.ForLanguage(language),
		strings.Join(article.Keywords.ForLanguage(language), " "),
	}, " ")

	var sectionScore, articleScore float64
	if language == "th" {
		sectionScore = thaiTextCoverage(query, sectionText)
		articleScore = thaiTextCoverage(query, articleText)
	} else {
		sectionScore = wordTextCoverage(query, sectionText)
		articleScore = wordTextCoverage(query, articleText)
	}

	keywordBonus := 0.0
	normalizedQuery := normalizeSystemDocText(query)
	for _, keyword := range section.Keywords.ForLanguage(language) {
		keyword = normalizeSystemDocText(keyword)
		if keyword != "" && strings.Contains(normalizedQuery, keyword) {
			keywordBonus += 0.18
		}
	}
	if keywordBonus > 0.36 {
		keywordBonus = 0.36
	}

	score := sectionScore*0.78 + articleScore*0.22 + keywordBonus
	if score > 1 {
		return 1
	}
	return score
}

func systemDocSectionSearchText(section systemdocs.Section, language string) []string {
	parts := []string{section.Title.ForLanguage(language)}
	parts = append(parts, section.Keywords.ForLanguage(language)...)
	for _, paragraph := range section.Paragraphs {
		parts = append(parts, paragraph.ForLanguage(language))
	}
	for _, bullet := range section.Bullets {
		parts = append(parts, bullet.ForLanguage(language))
	}
	for _, step := range section.Steps {
		parts = append(parts, step.Title.ForLanguage(language), step.Body.ForLanguage(language))
	}
	if section.Note != nil {
		parts = append(parts, section.Note.Title.ForLanguage(language), section.Note.Body.ForLanguage(language))
	}
	return parts
}

func formatSystemDocSection(section systemdocs.Section, language string) string {
	parts := make([]string, 0, len(section.Paragraphs)+len(section.Bullets)+len(section.Steps)+1)
	for _, paragraph := range section.Paragraphs {
		parts = append(parts, escapeSystemDocMarkdown(paragraph.ForLanguage(language)))
	}
	for _, bullet := range section.Bullets {
		parts = append(parts, "- "+escapeSystemDocMarkdown(bullet.ForLanguage(language)))
	}
	for index, step := range section.Steps {
		parts = append(parts, fmt.Sprintf("%d. %s — %s", index+1,
			escapeSystemDocMarkdown(step.Title.ForLanguage(language)),
			escapeSystemDocMarkdown(step.Body.ForLanguage(language))))
	}
	if section.Note != nil {
		parts = append(parts, escapeSystemDocMarkdown(section.Note.Title.ForLanguage(language))+": "+
			escapeSystemDocMarkdown(section.Note.Body.ForLanguage(language)))
	}
	return strings.Join(parts, "\n")
}

func wordTextCoverage(query, document string) float64 {
	queryWords := searchableWords(query)
	if len(queryWords) == 0 {
		return 0
	}
	documentWords := searchableWords(document)
	documentText := " " + strings.Join(documentWords, " ") + " "
	matched := 0.0
	for _, queryWord := range queryWords {
		stem := stemSystemDocWord(queryWord)
		if strings.Contains(documentText, " "+queryWord+" ") || strings.Contains(documentText, " "+stem+" ") {
			matched++
			continue
		}
		for _, documentWord := range documentWords {
			documentStem := stemSystemDocWord(documentWord)
			if len(stem) >= 4 && (strings.Contains(documentStem, stem) || strings.Contains(stem, documentStem)) {
				matched += 0.8
				break
			}
		}
	}
	return matched / float64(len(queryWords))
}

func searchableWords(value string) []string {
	normalized := normalizeSystemDocText(value)
	words := strings.FieldsFunc(normalized, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	result := make([]string, 0, len(words))
	seen := make(map[string]struct{}, len(words))
	for _, word := range words {
		if len([]rune(word)) < 2 || isSystemDocStopWord(word) {
			continue
		}
		if _, exists := seen[word]; exists {
			continue
		}
		seen[word] = struct{}{}
		result = append(result, word)
	}
	return result
}

func stemSystemDocWord(word string) string {
	for _, suffix := range []string{"ations", "ation", "ments", "ment", "ingly", "edly", "ally", "ies", "ers", "ing", "ed", "es", "s"} {
		if strings.HasSuffix(word, suffix) && len(word)-len(suffix) >= 4 {
			return strings.TrimSuffix(word, suffix)
		}
	}
	return word
}

func isSystemDocStopWord(word string) bool {
	_, found := map[string]struct{}{
		"a": {}, "an": {}, "and": {}, "are": {}, "can": {}, "could": {}, "dishy": {},
		"do": {}, "does": {}, "for": {}, "from": {}, "how": {}, "i": {}, "in": {},
		"is": {}, "it": {}, "me": {}, "of": {}, "on": {}, "or": {}, "the": {},
		"through": {}, "to": {}, "what": {}, "when": {}, "where": {}, "with": {},
	}[word]
	return found
}

func thaiTextCoverage(query, document string) float64 {
	query = compactThaiSystemDocQuery(query)
	document = compactSystemDocText(document)
	if query == "" || document == "" {
		return 0
	}
	queryRunes := []rune(query)
	gramSize := 3
	if len(queryRunes) < 6 {
		gramSize = 2
	}
	grams := runeNGrams(queryRunes, gramSize)
	if len(grams) == 0 {
		if strings.Contains(document, query) {
			return 1
		}
		return 0
	}
	matched := 0
	for gram := range grams {
		if strings.Contains(document, gram) {
			matched++
		}
	}
	return float64(matched) / float64(len(grams))
}

func runeNGrams(value []rune, size int) map[string]struct{} {
	grams := make(map[string]struct{})
	if len(value) < size {
		return grams
	}
	for index := 0; index+size <= len(value); index++ {
		grams[string(value[index:index+size])] = struct{}{}
	}
	return grams
}

func compactThaiSystemDocQuery(value string) string {
	value = normalizeSystemDocText(value)
	for _, noise := range []string{
		"ได้หรือไม่", "หรือไม่", "อะไรได้บ้าง", "ทำอย่างไร", "ทำยังไง", "ใช้อย่างไร", "ยังไง",
		"วิธี", "เกี่ยวกับ", "ปัจจุบัน", "dishy", "ไหม", "หรือ", "และ",
	} {
		value = strings.ReplaceAll(value, noise, " ")
	}
	return compactSystemDocText(value)
}

func compactSystemDocText(value string) string {
	value = normalizeSystemDocText(value)
	var builder strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsNumber(r) {
			builder.WriteRune(r)
		}
	}
	return builder.String()
}

func normalizeSystemDocText(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func looksLikeSystemDocsQuestion(question string) bool {
	normalized := normalizeSystemDocText(question)
	if normalized == "" {
		return false
	}

	if looksLikeRestaurantContentOrAdviceRequest(normalized) {
		return false
	}
	// Exact workflow phrases live in the canonical catalog, so terse requests
	// such as "invite staff" and "ส่งเข้าครัว" need no duplicated routing list.
	// Content/advice intent is checked first because a request to write an
	// invitation message is not the same as asking how invitations work.
	if matchesSystemDocsSectionKeyword(normalized) {
		return true
	}

	hasExplicitDocsMarker := containsAny(normalized,
		"เอกสาร", "คู่มือ", "ข้อจำกัด", "แก้ปัญหา",
		"documentation", "system docs", "docs", "troubleshoot", "limitations", "not supported",
	)
	if hasExplicitDocsMarker {
		return true
	}

	hasHelpCue := containsAny(normalized,
		"วิธี", "ทำยังไง", "ทำอย่างไร", "ใช้อย่างไร", "ใช้ยังไง", "อยู่ไหน", "ที่ไหน", "ตรงไหน",
		"รองรับ", "ได้ไหม", "ได้หรือไม่", "หรือไม่", "อะไรได้บ้าง", "อัตโนมัติ", "มีไหม",
		"how to", "how do i", "how can i", "where can i", "where is", "what can", "what does",
		"can i", "can customers", "can guests", "can dishy", "does dishy", "is dishy", "supported",
		"automatically", "automatic confirmation",
	)
	if !hasHelpCue {
		return false
	}
	if containsAny(normalized, "dishy", "dishy's", "ระบบ") {
		return true
	}

	// Generic help wording is accepted only with strong catalog evidence. The
	// help cue is required so high lexical overlap alone cannot steal content
	// generation, business advice, live data, or ordinary chat from the router.
	search, err := searchSystemDocs(AISystemDocsToolInput{Query: question, Limit: 1})
	return err == nil && len(search.SearchResults) == 1 && search.SearchResults[0].Score >= strongSystemDocsIntentScore
}

func matchesSystemDocsSectionKeyword(question string) bool {
	query := compactSystemDocText(question)
	if query == "" {
		return false
	}
	catalog, err := systemdocs.Load()
	if err != nil {
		return false
	}
	for _, article := range catalog.Articles {
		for _, section := range article.Sections {
			keywords := append(append([]string{}, section.Keywords.TH...), section.Keywords.EN...)
			for _, keyword := range keywords {
				candidate := compactSystemDocText(keyword)
				if candidate != "" && strings.Contains(query, candidate) {
					return true
				}
			}
		}
	}
	return false
}

func looksLikeRestaurantContentOrAdviceRequest(question string) bool {
	if containsAny(question,
		"how should", "what should", "should i", "pricing strategy", "price strategy",
		"ควร", "กลยุทธ์ราคา", "ตั้งราคาให้", "แนะนำราคา",
	) {
		return true
	}

	hasCreationVerb := containsAny(question,
		"create", "draft", "write", "generate", "compose",
		"เขียน", "ร่าง", "สร้าง", "แต่ง", "ช่วยคิด",
	)
	hasContentSubject := containsAny(question,
		"caption", "description", "copy", "message", "social post", "promotion text", "slogan",
		"แคปชัน", "แคปชั่น", "คำบรรยาย", "คำอธิบายเมนู", "ข้อความ", "โพสต์", "ข้อความโปรโมชัน", "สโลแกน",
	)
	return hasCreationVerb && hasContentSubject
}

func detectSystemDocsLanguage(value string) string {
	for _, r := range value {
		if r >= '\u0E00' && r <= '\u0E7F' {
			return "th"
		}
	}
	return "en"
}

func systemDocURL(slug, sectionID string) string {
	if slug == "overview" {
		return "/docs#" + sectionID
	}
	return "/docs/" + slug + "#" + sectionID
}

func isSafeSystemDocURL(value string) bool {
	return safeSystemDocURLPattern.MatchString(strings.TrimSpace(value))
}

func safeSystemDocURLsFromText(value string) []string {
	matches := systemDocURLInTextPattern.FindAllString(value, maxSystemDocsSearchLimit)
	return deduplicateSafeSystemDocURLs(matches)
}

func deduplicateSafeSystemDocURLs(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if !isSafeSystemDocURL(value) {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
		if len(result) == maxSystemDocsSearchLimit {
			break
		}
	}
	return result
}

func escapeSystemDocMarkdown(value string) string {
	replacer := strings.NewReplacer(
		"\\", "\\\\",
		"[", "\\[",
		"]", "\\]",
		"<", "&lt;",
		">", "&gt;",
	)
	return replacer.Replace(strings.TrimSpace(value))
}

// systemDocsRoute finds the handbook page a path names, so a path the writer
// copied out of the handbook can be shown as a button and one it made up
// cannot. Matching is on the path alone, trailing slash ignored; the label
// comes back in the language asked for.
func systemDocsRoute(href, language string) (*AINavigation, bool) {
	want := strings.TrimRight(strings.TrimSpace(href), "/")
	if want == "" {
		return nil, false
	}
	catalog, err := systemdocs.Load()
	if err != nil {
		return nil, false
	}
	for _, article := range catalog.Articles {
		for _, route := range article.Routes {
			if strings.TrimRight(strings.TrimSpace(route.Href), "/") != want {
				continue
			}
			label := strings.TrimSpace(route.Label.ForLanguage(language))
			if label == "" {
				label = want
			}
			return &AINavigation{Href: want, Label: label}, true
		}
	}
	return nil, false
}
