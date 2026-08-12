package service

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"Project-M/internal/repository"
)

// AIPeriod is a resolved calendar window [Start, End) with a Thai display label.
// Tier 1-1 uses it to answer named-month and month-to-month sales questions that
// fall outside the fixed 14-day snapshot.
type AIPeriod struct {
	Label string
	Start time.Time
	End   time.Time // exclusive
}

func bangkokLocation() *time.Location {
	if loc, err := time.LoadLocation("Asia/Bangkok"); err == nil {
		return loc
	}
	return time.FixedZone("Asia/Bangkok", 7*60*60)
}

var thaiMonthNames = [13]string{
	1: "มกราคม", 2: "กุมภาพันธ์", 3: "มีนาคม", 4: "เมษายน",
	5: "พฤษภาคม", 6: "มิถุนายน", 7: "กรกฎาคม", 8: "สิงหาคม",
	9: "กันยายน", 10: "ตุลาคม", 11: "พฤศจิกายน", 12: "ธันวาคม",
}

// thaiMonthAliases lists distinctive Thai spellings per month (full, dotted
// abbreviation, and short form). Bare words like "มี" are intentionally excluded
// because they collide with common Thai words (e.g. "มี" = to have).
var thaiMonthAliases = map[int][]string{
	1:  {"มกราคม", "ม.ค.", "มกรา"},
	2:  {"กุมภาพันธ์", "กุมภาพันธ", "ก.พ.", "กุมภา"},
	3:  {"มีนาคม", "มี.ค.", "มีนา"},
	4:  {"เมษายน", "เม.ย.", "เมษา"},
	5:  {"พฤษภาคม", "พ.ค.", "พฤษภา"},
	6:  {"มิถุนายน", "มิ.ย.", "มิถุนา"},
	7:  {"กรกฎาคม", "กรกฏาคม", "ก.ค.", "กรกฎา", "กรกฏา"},
	8:  {"สิงหาคม", "ส.ค.", "สิงหา"},
	9:  {"กันยายน", "ก.ย.", "กันยา"},
	10: {"ตุลาคม", "ต.ค.", "ตุลา"},
	11: {"พฤศจิกายน", "พ.ย.", "พฤศจิกา"},
	12: {"ธันวาคม", "ธ.ค.", "ธันวา"},
}

// englishMonthAliases maps an English spelling to a month number. Matched with
// ASCII word boundaries so "dec" does not fire inside "decrease".
var englishMonthAliases = map[string]int{
	"january": 1, "jan": 1,
	"february": 2, "feb": 2,
	"march": 3, "mar": 3,
	"april": 4, "apr": 4,
	"may":  5,
	"june": 6, "jun": 6,
	"july": 7, "jul": 7,
	"august": 8, "aug": 8,
	"september": 9, "sept": 9, "sep": 9,
	"october": 10, "oct": 10,
	"november": 11, "nov": 11,
	"december": 12, "dec": 12,
}

var englishMonthPattern = buildEnglishMonthPattern()

func buildEnglishMonthPattern() *regexp.Regexp {
	aliases := make([]string, 0, len(englishMonthAliases))
	for a := range englishMonthAliases {
		aliases = append(aliases, a)
	}
	// Longer aliases first so "september" is preferred over "sep".
	sort.Slice(aliases, func(i, j int) bool { return len(aliases[i]) > len(aliases[j]) })
	return regexp.MustCompile(`(?i)\b(` + strings.Join(aliases, "|") + `)\b`)
}

// allMonthAliases maps every Thai and English month spelling to its month
// number, and reAnyMonth matches any of them (longest alias first so
// "กรกฎาคม" wins over "ก.ค.").
var allMonthAliases, reAnyMonth = buildMonthAliasIndex()

func buildMonthAliasIndex() (map[string]int, *regexp.Regexp) {
	index := make(map[string]int)
	for month, aliases := range thaiMonthAliases {
		for _, a := range aliases {
			index[a] = month
		}
	}
	for alias, month := range englishMonthAliases {
		index[alias] = month
	}
	keys := make([]string, 0, len(index))
	for k := range index {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return len(keys[i]) > len(keys[j]) })
	quoted := make([]string, 0, len(keys))
	for _, k := range keys {
		quoted = append(quoted, regexp.QuoteMeta(k))
	}
	return index, regexp.MustCompile(`(?i)(` + strings.Join(quoted, "|") + `)`)
}

var (
	reISODate        = regexp.MustCompile(`(\d{4})-(\d{1,2})-(\d{1,2})`)
	reSlashDate      = regexp.MustCompile(`(\d{1,2})/(\d{1,2})/(\d{4})`)
	reThaiDayOfMonth = regexp.MustCompile(`วันที่\s*(\d{1,2})`)
)

// dayPeriod is a single calendar day [day, day+1).
func dayPeriod(year int, month time.Month, day int, loc *time.Location) AIPeriod {
	start := time.Date(year, month, day, 0, 0, 0, 0, loc)
	return AIPeriod{
		Label: fmt.Sprintf("วันที่ %d %s %d", day, thaiMonthName(int(month)), year+543),
		Start: start,
		End:   start.AddDate(0, 0, 1),
	}
}

func validCalendarDate(year, month, day int) bool {
	if month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 3000 {
		return false
	}
	// Reject overflow dates such as 31 February.
	t := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
	return t.Day() == day && int(t.Month()) == month
}

// detectMonthInText returns the first month named anywhere in the text.
func detectMonthInText(n string) (int, bool) {
	if m := reAnyMonth.FindStringSubmatch(n); m != nil {
		if month, ok := allMonthAliases[strings.ToLower(m[1])]; ok {
			return month, true
		}
	}
	return 0, false
}

// extractSpecificDate finds a single calendar day named in the question
// ("วันที่ 2 เดือนกรกฎาคม", "2 ก.ค.", "2026-07-02", "2/7/2569"). Without it, such a
// question falls back to the whole month, which reports a figure ~30x too large.
func extractSpecificDate(question string, ref time.Time) (AIPeriod, bool) {
	loc := bangkokLocation()
	ref = ref.In(loc)
	n := strings.ToLower(strings.TrimSpace(question))

	if m := reISODate.FindStringSubmatch(n); m != nil {
		year, _ := strconv.Atoi(m[1])
		month, _ := strconv.Atoi(m[2])
		day, _ := strconv.Atoi(m[3])
		if validCalendarDate(year, month, day) {
			return dayPeriod(year, time.Month(month), day, loc), true
		}
	}
	if m := reSlashDate.FindStringSubmatch(n); m != nil {
		day, _ := strconv.Atoi(m[1])
		month, _ := strconv.Atoi(m[2])
		year, _ := strconv.Atoi(m[3])
		if year > 2400 { // Buddhist era
			year -= 543
		}
		if validCalendarDate(year, month, day) {
			return dayPeriod(year, time.Month(month), day, loc), true
		}
	}

	day := 0
	if m := reThaiDayOfMonth.FindStringSubmatch(n); m != nil {
		day, _ = strconv.Atoi(m[1])
	}
	month, hasMonth := detectMonthInText(n)
	if day == 0 && hasMonth {
		// "2 กรกฎาคม" — a bare number immediately before the month name.
		if loc := reAnyMonth.FindStringIndex(n); loc != nil {
			if d, ok := trailingDayNumber(n[:loc[0]]); ok {
				day = d
			}
		}
	}
	if day == 0 {
		return AIPeriod{}, false
	}

	year := ref.Year()
	if hasMonth {
		year = resolveNamedMonthYear(month, ref)
	} else {
		month = int(ref.Month())
		// A day later this month has not happened yet — mean last month.
		if day > ref.Day() {
			prev := time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, -1, 0)
			year, month = prev.Year(), int(prev.Month())
		}
	}
	if !validCalendarDate(year, month, day) {
		return AIPeriod{}, false
	}
	return dayPeriod(year, time.Month(month), day, loc), true
}

// summaryDayScope resolves a single day named in a store-summary question
// ("วันนี้", "เมื่อวาน", or an explicit date), so a day-scoped summary can lead
// with that day's real total instead of the rolling-window figure. Returns
// ok=false for an unscoped "สรุปร้าน", which keeps the normal window summary.
func summaryDayScope(question string, ref time.Time) (AIPeriod, bool) {
	if day, ok := extractSpecificDate(question, ref); ok {
		return day, true
	}
	loc := bangkokLocation()
	ref = ref.In(loc)
	n := strings.ToLower(question)
	today := dayPeriod(ref.Year(), ref.Month(), ref.Day(), loc)
	switch {
	case containsAny(n, "เมื่อวาน", "yesterday"):
		y := ref.AddDate(0, 0, -1)
		p := dayPeriod(y.Year(), y.Month(), y.Day(), loc)
		p.Label = "เมื่อวาน"
		return p, true
	case containsAny(n, "วันนี้", "today"):
		today.Label = "วันนี้"
		return today, true
	}
	return AIPeriod{}, false
}

// invalidNamedDate returns a clarification when the question names an explicit
// calendar day that does not exist for the month it names ("31 กุมภาพันธ์",
// "2569-02-31", "31/4/2569"). Without this the day is silently dropped and the
// question falls through to the whole month, reporting a figure the user never
// asked for. It only fires on a clearly-named day, so ordinary month questions
// are untouched.
func invalidNamedDate(question string, ref time.Time) (string, bool) {
	loc := bangkokLocation()
	ref = ref.In(loc)
	n := strings.ToLower(strings.TrimSpace(question))

	if m := reISODate.FindStringSubmatch(n); m != nil {
		year, _ := strconv.Atoi(m[1])
		month, _ := strconv.Atoi(m[2])
		day, _ := strconv.Atoi(m[3])
		if !validCalendarDate(year, month, day) {
			return invalidDateMessage(day, month), true
		}
		return "", false
	}
	if m := reSlashDate.FindStringSubmatch(n); m != nil {
		day, _ := strconv.Atoi(m[1])
		month, _ := strconv.Atoi(m[2])
		year, _ := strconv.Atoi(m[3])
		if year > 2400 {
			year -= 543
		}
		if !validCalendarDate(year, month, day) {
			return invalidDateMessage(day, month), true
		}
		return "", false
	}

	day := 0
	if m := reThaiDayOfMonth.FindStringSubmatch(n); m != nil {
		day, _ = strconv.Atoi(m[1])
	}
	month, hasMonth := detectMonthInText(n)
	if day == 0 && hasMonth {
		if idx := reAnyMonth.FindStringIndex(n); idx != nil {
			if d, ok := trailingDayNumber(n[:idx[0]]); ok {
				day = d
			}
		}
	}
	if day == 0 {
		return "", false
	}
	year := ref.Year()
	resolvedMonth := int(ref.Month())
	if hasMonth {
		resolvedMonth = month
		year = resolveNamedMonthYear(month, ref)
	}
	if validCalendarDate(year, resolvedMonth, day) {
		return "", false
	}
	return invalidDateMessage(day, resolvedMonth), true
}

func invalidDateMessage(day, month int) string {
	if name := thaiMonthName(month); name != "" {
		return fmt.Sprintf("วันที่ %d %s ไม่มีอยู่จริงครับ ลองระบุวันที่ที่ถูกต้องได้ไหมครับ", day, name)
	}
	return fmt.Sprintf("วันที่ที่ระบุ (วันที่ %d เดือน %d) ไม่ถูกต้องครับ ลองระบุใหม่ได้ไหมครับ", day, month)
}

// trailingDayNumber reads a 1-2 digit day at the end of the text preceding a
// month name, allowing an optional "เดือน" between them.
func trailingDayNumber(prefix string) (int, bool) {
	trimmed := strings.TrimRight(prefix, " \t")
	trimmed = strings.TrimSuffix(trimmed, "เดือน")
	trimmed = strings.TrimRight(trimmed, " \t")

	end := len(trimmed)
	start := end
	for start > 0 && trimmed[start-1] >= '0' && trimmed[start-1] <= '9' {
		start--
	}
	if start == end || end-start > 2 {
		return 0, false
	}
	value, err := strconv.Atoi(trimmed[start:end])
	if err != nil || value < 1 || value > 31 {
		return 0, false
	}
	return value, true
}

func thaiMonthName(month int) string {
	if month >= 1 && month <= 12 {
		return thaiMonthNames[month]
	}
	return ""
}

// monthPeriod builds a [start, end) window for the given calendar month and a
// Thai label carrying the Buddhist-era year (e.g. "เดือนมีนาคม 2569").
func monthPeriod(year int, month time.Month, loc *time.Location) AIPeriod {
	start := time.Date(year, month, 1, 0, 0, 0, 0, loc)
	end := start.AddDate(0, 1, 0)
	label := fmt.Sprintf("เดือน%s %d", thaiMonthName(int(month)), year+543)
	return AIPeriod{Label: label, Start: start, End: end}
}

func thisMonthPeriod(ref time.Time) AIPeriod {
	return monthPeriod(ref.Year(), ref.Month(), ref.Location())
}

func previousMonthPeriod(ref time.Time) AIPeriod {
	firstOfThis := time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, ref.Location())
	prev := firstOfThis.AddDate(0, -1, 0)
	return monthPeriod(prev.Year(), prev.Month(), ref.Location())
}

// resolveNamedMonthYear picks the most recent past occurrence of a bare month
// name: a month later than the reference month is assumed to mean last year, so
// "ธันวาคม" asked in July resolves to last December (which has data).
func resolveNamedMonthYear(month int, ref time.Time) int {
	year := ref.Year()
	if month > int(ref.Month()) {
		year--
	}
	return year
}

// earliestAlias returns the start and end byte offsets of the alias that begins
// at the earliest position; on a tie it prefers the longest match, so a trailing
// year is read past the full name ("กรกฎาคม" rather than its prefix "กรกฎา").
func earliestAlias(haystack string, aliases []string) (start, end int) {
	start, end = -1, -1
	for _, a := range aliases {
		idx := strings.Index(haystack, a)
		if idx < 0 {
			continue
		}
		if start == -1 || idx < start || (idx == start && idx+len(a) > end) {
			start, end = idx, idx+len(a)
		}
	}
	return start, end
}

// yearAfter reads a calendar year written right after byte offset `from`,
// allowing leading spaces and an optional พ.ศ./ค.ศ./ปี marker ("กรกฎาคม 2568",
// "july 2025", "กรกฎาคม 68"). A bare two-digit number is only taken as a year
// when it cannot be a day (>31) or a marker made it explicit, so a day written
// after a month name is never mistaken for a year.
func yearAfter(n string, from int) (int, bool) {
	if from < 0 || from > len(n) {
		return 0, false
	}
	rest := strings.TrimLeft(n[from:], " \t")
	marker := false
	for _, m := range []string{"พ.ศ.", "ค.ศ.", "ปี"} {
		if strings.HasPrefix(rest, m) {
			rest = strings.TrimLeft(rest[len(m):], " \t")
			marker = true
			break
		}
	}
	i := 0
	for i < len(rest) && rest[i] >= '0' && rest[i] <= '9' {
		i++
	}
	if i == 0 {
		return 0, false
	}
	value, err := strconv.Atoi(rest[:i])
	if err != nil {
		return 0, false
	}
	return normalizeYear(value, i, marker)
}

// normalizeYear converts a written year to a Gregorian year. Four-digit values
// above 2400 and any accepted two-digit value are read as Buddhist era; a
// two-digit value that could be a day (1-31) is rejected unless a ปี/พ.ศ. marker
// made it unambiguous.
func normalizeYear(value, digits int, marker bool) (int, bool) {
	switch {
	case digits >= 4:
		if value > 2400 {
			return value - 543, true
		}
		return value, true
	case digits == 2:
		if !marker && value <= 31 {
			return 0, false
		}
		return 2500 + value - 543, true
	default:
		return 0, false
	}
}

type periodHit struct {
	pos    int
	yearMo int // year*100 + month, for de-duplication
	period AIPeriod
}

// extractPeriods finds every month window referenced in the question, in the
// order they appear, de-duplicated by (year, month). It understands named months
// (Thai + English) and the relative words เดือนนี้ / เดือนก่อน.
func extractPeriods(question string, ref time.Time) []AIPeriod {
	loc := bangkokLocation()
	ref = ref.In(loc)
	n := strings.ToLower(strings.TrimSpace(question))

	hits := make([]periodHit, 0, 4)
	addPeriod := func(pos int, p AIPeriod) {
		hits = append(hits, periodHit{pos: pos, yearMo: p.Start.Year()*100 + int(p.Start.Month()), period: p})
	}

	// Relative months. Take the earliest position among each set of aliases.
	if pos := earliestIndex(n, "เดือนนี้", "เดือนปัจจุบัน", "this month"); pos >= 0 {
		addPeriod(pos, thisMonthPeriod(ref))
	}
	if pos := earliestIndex(n, "เดือนก่อนหน้า", "เดือนก่อน", "เดือนที่แล้ว", "เดือนที่ผ่านมา", "last month"); pos >= 0 {
		addPeriod(pos, previousMonthPeriod(ref))
	}

	// Named Thai months, honoring a year written after the name ("กรกฎาคม 2568",
	// "กรกฎาคม 68"). Without one, the most recent past occurrence is assumed.
	for month, aliases := range thaiMonthAliases {
		if pos, end := earliestAlias(n, aliases); pos >= 0 {
			year, ok := yearAfter(n, end)
			if !ok {
				year = resolveNamedMonthYear(month, ref)
			}
			addPeriod(pos, monthPeriod(year, time.Month(month), loc))
		}
	}

	// Named English months, with the same optional trailing year ("July 2025").
	for _, m := range englishMonthPattern.FindAllStringSubmatchIndex(n, -1) {
		alias := n[m[2]:m[3]]
		if month, ok := englishMonthAliases[strings.ToLower(alias)]; ok {
			year, hasYear := yearAfter(n, m[3])
			if !hasYear {
				year = resolveNamedMonthYear(month, ref)
			}
			addPeriod(m[0], monthPeriod(year, time.Month(month), loc))
		}
	}

	sort.SliceStable(hits, func(i, j int) bool { return hits[i].pos < hits[j].pos })

	periods := make([]AIPeriod, 0, len(hits))
	seen := make(map[int]bool, len(hits))
	for _, h := range hits {
		if seen[h.yearMo] {
			continue
		}
		seen[h.yearMo] = true
		periods = append(periods, h.period)
	}
	return periods
}

// earliestIndex returns the smallest index at which any of the candidates occurs,
// or -1 if none do.
func earliestIndex(haystack string, candidates ...string) int {
	best := -1
	for _, c := range candidates {
		if idx := strings.Index(haystack, c); idx >= 0 && (best == -1 || idx < best) {
			best = idx
		}
	}
	return best
}

func mentionsComparison(question string) bool {
	n := strings.ToLower(question)
	for _, k := range []string{"เทียบ", "เปรียบเทียบ", " vs ", "versus", "compare"} {
		if strings.Contains(n, k) {
			return true
		}
	}
	return false
}

var reBareYear = regexp.MustCompile(`ปี\s*(\d{2,4})`)

// extractBareYear finds a year mentioned without a month ("ปี 2568", "ปี 68",
// "ปีที่แล้ว"). It resolves a year-over-year comparison where one side names only
// a year. Returns a Gregorian year.
func extractBareYear(question string, ref time.Time) (int, bool) {
	n := strings.ToLower(question)
	switch {
	case containsAny(n, "ปีที่แล้ว", "ปีก่อน", "ปีที่ผ่านมา", "last year"):
		return ref.Year() - 1, true
	case containsAny(n, "ปีนี้", "this year"):
		return ref.Year(), true
	}
	if m := reBareYear.FindStringSubmatch(n); m != nil {
		value, _ := strconv.Atoi(m[1])
		if year, ok := normalizeYear(value, len(m[1]), true); ok {
			return year, true
		}
	}
	return 0, false
}

// hasSecondOperand is true when a comparison explicitly names something to
// compare against ("...กับ...", "vs"), as opposed to a lone period that defaults
// to the month before it.
func hasSecondOperand(n string) bool {
	return containsAny(strings.ToLower(n), "กับ", " vs ", "versus", "เทียบกับ")
}

// datedSalesExcluded is true when a question names a period but is really about a
// menu, ingredient, breakdown, or per-order average — those have their own tools
// and must not be hijacked by the total-sales flow.
func datedSalesExcluded(n string) bool {
	for _, ex := range []string{
		"เมนู", "menu", "dish", "จาน", "วัตถุดิบ", "ingredient",
		"อันดับ", "ประเภท", "order type", "ต่อบิล", "ต่อออเดอร์", "เฉลี่ย", "average",
	} {
		if strings.Contains(n, ex) {
			return true
		}
	}
	return false
}

func mentionsSalesTotal(n string) bool {
	for _, k := range []string{
		"ยอดขาย", "ยอดรวม", "ยอด", "รายได้", "ขายได้", "ขายไป",
		"sales", "revenue", "turnover", "how much",
	} {
		if strings.Contains(n, k) {
			return true
		}
	}
	return false
}

type datedSalesRequest struct {
	comparison bool
	periods    []AIPeriod
	clarify    string // when set, ask this instead of guessing a comparison window
}

// resolveDatedSalesRequest decides whether a question is a dated total-sales
// query (single named/relative month, or a month-to-month comparison) and
// returns the windows to sum. It returns ok=false for anything that should keep
// flowing through the normal snapshot pipeline.
func resolveDatedSalesRequest(question string, ref time.Time) (datedSalesRequest, bool) {
	n := strings.ToLower(strings.TrimSpace(question))
	if datedSalesExcluded(n) {
		return datedSalesRequest{}, false
	}
	// A named day that does not exist for its month ("31 กุมภาพันธ์") is flagged
	// rather than silently answered as that whole month.
	if msg, bad := invalidNamedDate(question, ref); bad && mentionsSalesTotal(n) {
		return datedSalesRequest{clarify: msg}, true
	}
	// A named day is more specific than the month containing it.
	if day, ok := extractSpecificDate(question, ref); ok && mentionsSalesTotal(n) {
		return datedSalesRequest{periods: []AIPeriod{day}}, true
	}
	periods := extractPeriods(question, ref)
	if len(periods) == 0 {
		return datedSalesRequest{}, false
	}

	if mentionsComparison(question) {
		if len(periods) >= 2 {
			return datedSalesRequest{comparison: true, periods: periods[:2]}, true
		}
		// One period named. A year on the other side ("...กับ ปี 68", "...กับ
		// ปีที่แล้ว") means a year-over-year comparison of the same month.
		if y, ok := extractBareYear(question, ref); ok && y != periods[0].Start.Year() {
			second := monthPeriod(y, periods[0].Start.Month(), bangkokLocation())
			return datedSalesRequest{comparison: true, periods: []AIPeriod{periods[0], second}}, true
		}
		// An explicit second operand we could not parse: ask, rather than
		// silently substituting the previous month (a confidently wrong answer).
		if hasSecondOperand(n) {
			return datedSalesRequest{
				clarify: `อยากเทียบกับช่วงไหนครับ ลองระบุให้ชัดขึ้น เช่น "เทียบยอดขายเดือนกรกฎาคม 2569 กับ กรกฎาคม 2568" ครับ`,
			}, true
		}
		// A lone period ("เทียบยอดเดือนนี้") compares with the month before it.
		periods = append(periods, previousMonthPeriod(periods[0].Start))
		return datedSalesRequest{comparison: true, periods: periods}, true
	}

	// A single dated window is only claimed when the question is clearly about a
	// sales/revenue total, so "เมนูขายดีเดือนมีนาคม" style questions fall through.
	if !mentionsSalesTotal(n) {
		return datedSalesRequest{}, false
	}
	return datedSalesRequest{comparison: false, periods: periods[:1]}, true
}

func formatDatedSalesAnswer(p AIPeriod, d repository.AISalesRange) string {
	if d.Orders == 0 {
		return fmt.Sprintf("ยอดขาย%s ยังไม่มีออเดอร์ที่ชำระเงินครับ", p.Label)
	}
	return fmt.Sprintf(
		"ยอดขาย%s คือ %s บาท จาก %d ออเดอร์ (มีการขาย %d วัน) ครับ",
		p.Label, formatMoney(d.Revenue), d.Orders, d.Days,
	)
}

func formatDatedSalesComparison(a AIPeriod, da repository.AISalesRange, b AIPeriod, db repository.AISalesRange) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("เทียบยอดขายระหว่าง %s กับ %s ครับ\n\n", a.Label, b.Label))
	sb.WriteString(fmt.Sprintf("- %s: %s บาท (%d ออเดอร์)\n", a.Label, formatMoney(da.Revenue), da.Orders))
	sb.WriteString(fmt.Sprintf("- %s: %s บาท (%d ออเดอร์)\n", b.Label, formatMoney(db.Revenue), db.Orders))
	switch {
	case db.Revenue > 0:
		pct := (da.Revenue - db.Revenue) / db.Revenue * 100
		dir := "เพิ่มขึ้น 📈"
		if pct < 0 {
			dir = "ลดลง 📉"
		}
		sb.WriteString(fmt.Sprintf("- เปลี่ยนแปลง: %+.1f%% (%s)", pct, dir))
	case da.Revenue > 0:
		sb.WriteString(fmt.Sprintf("- %s ยังไม่มียอดขายให้เทียบเป็นเปอร์เซ็นต์ครับ", b.Label))
	default:
		sb.WriteString("- ยังไม่มียอดขายทั้งสองช่วงให้เทียบครับ")
	}
	return sb.String()
}
