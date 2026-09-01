package service

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"Project-M/internal/entity"
)

// Turning a sentence into reviewed changes.
//
// The model's only job is to propose structure: which thing, what kind of
// change, how much, in which unit. Everything that decides what actually
// happens is done here in Go against the live database — which ingredient that
// name is, whether the unit converts, whether the numbers hold — and the owner
// still confirms before anything is written.
//
// Three outcomes are possible, and all three are answers, never guesses:
//   - ready       → build the plan and show the confirm bar
//   - ask         → one short question for what is missing or ambiguous
//   - offerCreate → the thing does not exist yet; offer to add it

// AIStockCommandDraft is the model's proposal for one change, before Go has
// checked any of it. The name is whatever the owner called the thing — an
// ingredient for the stock kinds, a menu for the menu kinds.
type AIStockCommandDraft struct {
	Name string `json:"name"`
	// in | out | adjust change stock; min sets the low-stock threshold; cost sets
	// the price per unit; create adds a new ingredient; menu_on | menu_off open
	// and close a menu for selling.
	Kind     string  `json:"kind"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Note     string  `json:"note,omitempty"`
	// Used by kind=expense only. Category is one of the six the ledger accepts;
	// Date is "YYYY-MM-DD" and defaults to today when the owner did not say one.
	Category string `json:"category,omitempty"`
	Date     string `json:"date,omitempty"`
}

// AICommandKindsAll lists what the extractor may propose.
var AICommandKindsAll = []string{"in", "out", "adjust", "min", "cost", "create", "menu_on", "menu_off", "expense"}

func aiIsStockKind(kind string) bool {
	return kind == "in" || kind == "out" || kind == "adjust"
}

// AIMenuCommandKind reports whether a drafted command is about a menu rather
// than the shelf, which decides which catalogue the name is resolved against.
func AIMenuCommandKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "menu_on", "menu_off", "menu_price":
		return true
	default:
		return false
	}
}

// --- Units -------------------------------------------------------------------

// The system never converts units on its own: a recipe in grams against stock in
// kilograms silently misreads by a thousand. So a spoken unit is either the same
// unit, a conversion this table knows, or a question back to the owner.
var aiUnitAliases = map[string]string{
	"กรัม": "g", "ก.": "g", "g": "g", "gram": "g", "grams": "g",
	"ขีด": "hg", "hg": "hg",
	"กิโลกรัม": "kg", "กิโล": "kg", "กก.": "kg", "กก": "kg", "โล": "kg", "kg": "kg", "kilo": "kg", "kilogram": "kg",
	"มิลลิลิตร": "ml", "มล.": "ml", "มล": "ml", "ml": "ml",
	"ลิตร": "l", "ล.": "l", "l": "l", "liter": "l", "litre": "l",
	"ฟอง": "unit", "ชิ้น": "unit", "อัน": "unit", "ลูก": "unit", "ใบ": "unit", "ห่อ": "pack", "แพ็ค": "pack", "แพ็ก": "pack",
	"ขวด": "bottle", "กระป๋อง": "can", "ถุง": "bag", "กล่อง": "box", "แผง": "tray", "หัว": "head", "กำ": "bunch", "มัด": "bunch",
}

// aiUnitToBase converts a canonical unit to a base unit and a factor, when the
// unit belongs to a family this code can reason about (mass, volume). Counting
// units have no factor: "ฟอง" and "ชิ้น" only match themselves.
var aiUnitToBase = map[string]struct {
	base   string
	factor float64
}{
	"g":  {"g", 1},
	"hg": {"g", 100},
	"kg": {"g", 1000},
	"ml": {"ml", 1},
	"l":  {"ml", 1000},
}

func aiCanonicalUnit(unit string) string {
	key := strings.ToLower(strings.TrimSpace(unit))
	key = strings.TrimSuffix(key, ".")
	if canonical, ok := aiUnitAliases[key]; ok {
		return canonical
	}
	if canonical, ok := aiUnitAliases[key+"."]; ok {
		return canonical
	}
	return key
}

// ConvertToStockUnit expresses a spoken quantity in the ingredient's own stock
// unit. ok=false means the two units are not the same and no known conversion
// links them — the caller must ask rather than assume.
func ConvertToStockUnit(quantity float64, spokenUnit, stockUnit string) (float64, bool) {
	spoken := aiCanonicalUnit(spokenUnit)
	stock := aiCanonicalUnit(stockUnit)
	if spoken == "" || spoken == stock {
		return quantity, true
	}
	from, okFrom := aiUnitToBase[spoken]
	to, okTo := aiUnitToBase[stock]
	if !okFrom || !okTo || from.base != to.base {
		return 0, false
	}
	converted := quantity * from.factor / to.factor
	if math.IsNaN(converted) || math.IsInf(converted, 0) {
		return 0, false
	}
	return converted, true
}

// aiUnitIsFine reports whether a stock unit is small enough that a bare price
// ("ตั้งราคาหมูสับ 180") cannot plausibly mean per that unit — nobody prices pork
// at 180 baht a gram. For a counting unit ("ไข่ 5 บาท" against ฟอง) a bare price
// is unambiguous and needs no question.
func aiUnitIsFine(stockUnit string) bool {
	switch aiCanonicalUnit(stockUnit) {
	case "g", "ml":
		return true
	default:
		return false
	}
}

// ConvertPricePerUnit turns a price quoted per spokenUnit into a price per
// stockUnit. ok=false means the caller must ask: either no unit was given for a
// finely measured ingredient, or the two units have no known relation.
func ConvertPricePerUnit(price float64, spokenUnit, stockUnit string) (float64, bool) {
	if price < 0 {
		return 0, false
	}
	if strings.TrimSpace(spokenUnit) == "" {
		// No unit spoken: safe only when the stock unit is something a price is
		// naturally quoted in (a piece, an egg), never for grams or millilitres.
		if aiUnitIsFine(stockUnit) {
			return 0, false
		}
		return price, true
	}
	// How many stock units make up one spoken unit — 1 กก. = 1,000 กรัม.
	perSpoken, ok := ConvertToStockUnit(1, spokenUnit, stockUnit)
	if !ok || perSpoken <= 0 {
		return 0, false
	}
	converted := price / perSpoken
	if math.IsNaN(converted) || math.IsInf(converted, 0) {
		return 0, false
	}
	return converted, true
}

// --- Name resolution ----------------------------------------------------------

// AIIngredientMatch is the outcome of looking a spoken name up in the shelf.
type AIIngredientMatch struct {
	Exact      *entity.Ingredient
	Candidates []entity.Ingredient
}

func aiNormalizeName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}

// aiMatchNames finds which entry a spoken name refers to. An exact match wins;
// otherwise near matches come back as candidates for the owner to pick from. Two
// entries with the same name stay ambiguous on purpose — guessing between them
// would eventually change the wrong row.
//
// It works on names alone so the shelf and the menu can share one rule: the two
// catalogues are different tables but the owner refers to both the same way,
// with a partial name and no thought for how it is stored.
func aiMatchNames(names []string, name string) (exact int, candidates []int) {
	wanted := aiNormalizeName(name)
	if wanted == "" {
		return -1, nil
	}
	exactHits := make([]int, 0, 2)
	near := make([]int, 0, 4)
	for index, candidate := range names {
		normalized := aiNormalizeName(candidate)
		switch {
		case normalized == wanted:
			exactHits = append(exactHits, index)
		case strings.Contains(normalized, wanted) || strings.Contains(wanted, normalized):
			near = append(near, index)
		}
	}
	if len(exactHits) == 1 {
		return exactHits[0], nil
	}
	if len(exactHits) > 1 {
		return -1, exactHits
	}
	// Shortest first: "ต้มยำกุ้ง" said over "ต้มยำกุ้งน้ำข้น" and "ต้มยำกุ้งน้ำใส"
	// should offer the plainest reading at the top.
	sort.SliceStable(near, func(i, j int) bool { return len(names[near[i]]) < len(names[near[j]]) })
	if len(near) > 3 {
		near = near[:3]
	}
	return -1, near
}

// ResolveIngredientName finds the one ingredient a name refers to.
func ResolveIngredientName(shelf []entity.Ingredient, name string) AIIngredientMatch {
	names := make([]string, len(shelf))
	for index, item := range shelf {
		names[index] = item.Name
	}
	exact, candidates := aiMatchNames(names, name)
	if exact >= 0 {
		found := shelf[exact]
		return AIIngredientMatch{Exact: &found}
	}
	near := make([]entity.Ingredient, 0, len(candidates))
	for _, index := range candidates {
		near = append(near, shelf[index])
	}
	return AIIngredientMatch{Candidates: near}
}

// AIMenuMatch is the outcome of looking a spoken name up in the menu.
type AIMenuMatch struct {
	Exact      *entity.MenuItem
	Candidates []entity.MenuItem
}

// ResolveMenuName finds the one menu a name refers to, by the same rule the
// shelf uses.
func ResolveMenuName(menus []entity.MenuItem, name string) AIMenuMatch {
	names := make([]string, len(menus))
	for index, item := range menus {
		names[index] = item.Name
	}
	exact, candidates := aiMatchNames(names, name)
	if exact >= 0 {
		found := menus[exact]
		return AIMenuMatch{Exact: &found}
	}
	near := make([]entity.MenuItem, 0, len(candidates))
	for _, index := range candidates {
		near = append(near, menus[index])
	}
	return AIMenuMatch{Candidates: near}
}

// --- Deciding what to do ------------------------------------------------------

type AICommandOutcomeKind string

const (
	AICommandOutcomeReady       AICommandOutcomeKind = "ready"
	AICommandOutcomeAsk         AICommandOutcomeKind = "ask"
	AICommandOutcomeOfferCreate AICommandOutcomeKind = "offer_create"
	// The change is already true — the menu is closed and the owner said close it.
	// Nothing to confirm, and saying "done" would be a lie about a write that
	// never ran, so it is reported as its own outcome.
	AICommandOutcomeNothingToDo AICommandOutcomeKind = "nothing_to_do"
)

// AICommandResolution is what the assistant should do with one drafted change.
type AICommandResolution struct {
	Kind     AICommandOutcomeKind
	Command  AIAdjustStockCommand // set when Kind is ready
	Title    string               // the ingredient name as the owner said it
	Question string               // set when Kind is ask or offer_create
}

// aiExpenseCategoryLabels turns the ledger's six stored categories into the
// words the owner uses, for the preview line and for the question back when the
// model could not tell which one was meant.
var aiExpenseCategoryLabels = map[string]string{
	"ingredient": "วัตถุดิบ",
	"labor":      "ค่าแรง",
	"rent":       "ค่าเช่า",
	"utilities":  "ค่าน้ำค่าไฟ",
	"equipment":  "อุปกรณ์",
	"other":      "อื่น ๆ",
}

func aiExpenseCategoryLabel(category string) string {
	if label, ok := aiExpenseCategoryLabels[strings.ToLower(strings.TrimSpace(category))]; ok {
		return label
	}
	return category
}

// ResolveExpenseCommand checks a drafted expense before it becomes a plan. The
// two things that cannot be guessed are asked about: which category the ledger
// should file it under, and how much was actually paid. The date is the one
// field with a safe default — an expense mentioned with no date is today's.
func ResolveExpenseCommand(draft AIStockCommandDraft, now time.Time) AICommandResolution {
	note := strings.TrimSpace(draft.Note)
	if note == "" {
		note = strings.TrimSpace(draft.Name)
	}
	title := note
	if title == "" {
		title = "รายจ่าย"
	}

	category := strings.ToLower(strings.TrimSpace(draft.Category))
	if !entity.IsValidExpenseCategory(category) {
		options := make([]string, 0, len(aiExpenseCategoryLabels))
		for _, key := range entity.ExpenseCategories {
			options = append(options, aiExpenseCategoryLabels[key])
		}
		return AICommandResolution{
			Kind:     AICommandOutcomeAsk,
			Title:    title,
			Question: fmt.Sprintf("“%s” จัดเป็นรายจ่ายหมวดไหนครับ — %s", title, strings.Join(options, " / ")),
		}
	}
	if draft.Quantity <= 0 {
		return AICommandResolution{
			Kind:     AICommandOutcomeAsk,
			Title:    title,
			Question: fmt.Sprintf("“%s” จ่ายไปเท่าไหร่ครับ", title),
		}
	}

	date := strings.TrimSpace(draft.Date)
	if date == "" {
		date = now.Format("2006-01-02")
	} else if _, err := time.Parse("2006-01-02", date); err != nil {
		return AICommandResolution{
			Kind:     AICommandOutcomeAsk,
			Title:    title,
			Question: fmt.Sprintf("“%s” จ่ายวันไหนครับ", title),
		}
	}

	return AICommandResolution{
		Kind:  AICommandOutcomeReady,
		Title: title,
		Command: AIAdjustStockCommand{
			Kind:     "expense",
			Quantity: draft.Quantity,
			Category: category,
			Date:     date,
			Note:     note,
		},
	}
}

// ResolveMenuCommand checks a drafted open/close against the live menu. The menu
// has to exist and has to actually be changing: a name nobody recognises is
// asked about rather than half-matched, and a menu already in the asked-for
// state is reported as such instead of becoming an empty confirmation.
func ResolveMenuCommand(menus []entity.MenuItem, draft AIStockCommandDraft) AICommandResolution {
	title := strings.TrimSpace(draft.Name)
	if title == "" {
		// Same as the stock path: quote the owner's words back when the extractor
		// kept them, so the question names the half of the sentence it is about.
		if said := strings.TrimSpace(draft.Note); said != "" {
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Question: fmt.Sprintf("ส่วน “%s” หมายถึงเมนูไหนครับ บอกชื่อมาได้เลย", said),
			}
		}
		return AICommandResolution{Kind: AICommandOutcomeAsk, Question: "ขอชื่อเมนูด้วยครับ"}
	}
	kind := strings.ToLower(strings.TrimSpace(draft.Kind))
	if !AIMenuCommandKind(kind) && kind != "menu_price" {
		return AICommandResolution{
			Kind:     AICommandOutcomeAsk,
			Title:    title,
			Question: fmt.Sprintf("“%s” นี่ต้องการเปิดขายหรือปิดขายครับ", title),
		}
	}

	match := ResolveMenuName(menus, title)
	// One near match and nothing else is not a guess — it is the only reading the
	// catalogue allows. Asking "ต้มยำกุ้ง หมายถึงเมนูไหน — ต้มยำกุ้งน้ำข้น" when
	// that is the sole answer reads as the assistant not paying attention, and the
	// owner still sees the full name on the confirm bar before anything happens.
	if match.Exact == nil && len(match.Candidates) == 1 {
		only := match.Candidates[0]
		match = AIMenuMatch{Exact: &only}
	}
	if match.Exact == nil {
		if len(match.Candidates) > 0 {
			names := make([]string, 0, len(match.Candidates))
			for _, candidate := range match.Candidates {
				names = append(names, candidate.Name)
			}
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Title:    title,
				Question: fmt.Sprintf("“%s” หมายถึงเมนูไหนครับ — %s", title, strings.Join(names, " / ")),
			}
		}
		return AICommandResolution{
			Kind:     AICommandOutcomeAsk,
			Title:    title,
			Question: fmt.Sprintf("ไม่พบเมนูชื่อ “%s” ในร้านครับ ลองบอกชื่อให้ตรงกับหน้าจัดการเมนูอีกทีนะ", title),
		}
	}

	if kind == "menu_price" {
		if draft.Quantity <= 0 {
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Title:    match.Exact.Name,
				Question: fmt.Sprintf("“%s” ตั้งราคาเท่าไหร่ครับ", match.Exact.Name),
			}
		}
		return AICommandResolution{
			Kind:  AICommandOutcomeReady,
			Title: match.Exact.Name,
			Command: AIAdjustStockCommand{
				Kind:       "menu_price",
				MenuItemID: match.Exact.ID,
				Quantity:   draft.Quantity,
			},
		}
	}

	wantAvailable := kind == "menu_on"
	if match.Exact.IsAvailable == wantAvailable {
		state := "ปิดขาย"
		if wantAvailable {
			state = "เปิดขาย"
		}
		return AICommandResolution{
			Kind:     AICommandOutcomeNothingToDo,
			Title:    match.Exact.Name,
			Question: fmt.Sprintf("“%s” %sอยู่แล้วครับ ไม่ต้องแก้อะไร", match.Exact.Name, state),
		}
	}

	return AICommandResolution{
		Kind:  AICommandOutcomeReady,
		Title: match.Exact.Name,
		Command: AIAdjustStockCommand{
			Kind:       kind,
			MenuItemID: match.Exact.ID,
			Available:  wantAvailable,
		},
	}
}

// ResolveStockCommand checks one drafted change against the shelf and decides
// whether it can proceed, needs a question, or refers to something that does not
// exist yet.
func ResolveStockCommand(shelf []entity.Ingredient, draft AIStockCommandDraft) AICommandResolution {
	title := strings.TrimSpace(draft.Name)
	if title == "" {
		// The extractor sends the owner's own words along when it could tell a
		// command was there but not what it was about ("เพิ่มของอีกอย่างที่ใกล้หมด").
		// Quoting them back is the difference between a question the owner can
		// answer and one they have to decode.
		if said := strings.TrimSpace(draft.Note); said != "" {
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Question: fmt.Sprintf("ส่วน “%s” หมายถึงตัวไหนครับ บอกชื่อมาได้เลย", said),
			}
		}
		return AICommandResolution{Kind: AICommandOutcomeAsk, Question: "ขอชื่อวัตถุดิบด้วยครับ"}
	}

	kind := strings.ToLower(strings.TrimSpace(draft.Kind))
	// Adding a new ingredient is the one command that must not resolve against
	// the shelf — it is precisely for something the shelf does not have.
	if kind == "create" {
		if strings.TrimSpace(draft.Unit) == "" {
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Title:    title,
				Question: fmt.Sprintf("“%s” นับเป็นหน่วยอะไรครับ เช่น กรัม / กก. / ฟอง", title),
			}
		}
		if match := ResolveIngredientName(shelf, title); match.Exact != nil {
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Title:    title,
				Question: fmt.Sprintf("มี “%s” ในคลังอยู่แล้วครับ ต้องการรับเข้าเพิ่มหรือแก้ข้อมูลแทนไหม", match.Exact.Name),
			}
		}
		return AICommandResolution{
			Kind:  AICommandOutcomeReady,
			Title: title,
			Command: AIAdjustStockCommand{
				Kind:     "create",
				Quantity: draft.Quantity,
				Name:     title,
				Unit:     strings.TrimSpace(draft.Unit),
				Note:     strings.TrimSpace(draft.Note),
			},
		}
	}
	if kind != "in" && kind != "out" && kind != "adjust" && kind != "min" && kind != "cost" {
		return AICommandResolution{
			Kind:     AICommandOutcomeAsk,
			Title:    title,
			Question: fmt.Sprintf("“%s” นี่ต้องการรับเข้า ตัดออก หรือตั้งยอดใหม่ครับ", title),
		}
	}

	// Same rule as the menu: a single near match is the only reading available, so
	// it is taken rather than asked about. This is deliberately below the "create"
	// branch above, which still demands an exact match — there, a near miss means
	// "ผักชี" would be refused for looking like "ผักชีฝรั่ง", which is a different
	// ingredient and a real one to add.
	match := ResolveIngredientName(shelf, title)
	if match.Exact == nil && len(match.Candidates) == 1 {
		only := match.Candidates[0]
		match = AIIngredientMatch{Exact: &only}
	}
	if match.Exact == nil {
		if len(match.Candidates) > 0 {
			names := make([]string, 0, len(match.Candidates))
			for _, candidate := range match.Candidates {
				names = append(names, candidate.Name)
			}
			return AICommandResolution{
				Kind:     AICommandOutcomeAsk,
				Title:    title,
				Question: fmt.Sprintf("“%s” หมายถึงตัวไหนครับ — %s", title, strings.Join(names, " / ")),
			}
		}
		// Nothing on the shelf answers to this name, so the only thing the owner
		// can have meant is a new ingredient.
		//
		// If they already said the unit, do not ask for it again. "เพิ่ม
		// หมูสามชั้น 3000 กก เข้าคลัง" arrived here as a complete draft — name,
		// quantity, unit — and the reply was still "ให้ผมเพิ่มเข้าคลังให้ไหม
		// (บอกหน่วยด้วย)", which reads as though the assistant did not listen.
		// It cost two extra turns to say back what the first sentence contained.
		//
		// Handing it straight to the confirmation card is not skipping the
		// question: the card IS the question, and it shows the name, unit and
		// opening quantity before anything is written.
		if unit := strings.TrimSpace(draft.Unit); unit != "" {
			return AICommandResolution{
				Kind:  AICommandOutcomeReady,
				Title: title,
				Command: AIAdjustStockCommand{
					Kind:     "create",
					Quantity: draft.Quantity,
					Name:     title,
					Unit:     unit,
					Note:     strings.TrimSpace(draft.Note),
				},
			}
		}
		return AICommandResolution{
			Kind:     AICommandOutcomeOfferCreate,
			Title:    title,
			Question: fmt.Sprintf("ยังไม่มี “%s” ในคลังครับ ให้ผมเพิ่มเข้าคลังให้ไหม (บอกหน่วยด้วย เช่น กรัม / กก. / ฟอง)", title),
		}
	}

	if draft.Quantity <= 0 {
		question := fmt.Sprintf("“%s” เท่าไหร่ครับ (หน่วย%s)", match.Exact.Name, match.Exact.Unit)
		if kind == "cost" {
			question = fmt.Sprintf("“%s” ราคาต่อ%sเท่าไหร่ครับ", match.Exact.Name, match.Exact.Unit)
		}
		return AICommandResolution{Kind: AICommandOutcomeAsk, Title: title, Question: question}
	}

	// A price is money PER unit, so it converts the opposite way to a quantity:
	// 2 กก. of stock is 2,000 grams, but 180 บาท/กก. is 0.18 บาท/กรัม. Getting this
	// backwards is a thousand-fold error in every menu's cost, so an unclear unit
	// is asked about rather than assumed.
	if kind == "cost" {
		perUnit, ok := ConvertPricePerUnit(draft.Quantity, draft.Unit, match.Exact.Unit)
		if !ok {
			return AICommandResolution{
				Kind:  AICommandOutcomeAsk,
				Title: title,
				Question: fmt.Sprintf(
					"“%s” ราคานี้ต่อหน่วยอะไรครับ ระบบเก็บเป็น%s (เช่น ต่อ%s หรือ ต่อกิโล)",
					match.Exact.Name, match.Exact.Unit, match.Exact.Unit,
				),
			}
		}
		return AICommandResolution{
			Kind:    AICommandOutcomeReady,
			Title:   match.Exact.Name,
			Command: AIAdjustStockCommand{IngredientID: match.Exact.ID, Kind: "cost", Quantity: perUnit},
		}
	}

	quantity, ok := ConvertToStockUnit(draft.Quantity, draft.Unit, match.Exact.Unit)
	if !ok {
		return AICommandResolution{
			Kind:  AICommandOutcomeAsk,
			Title: title,
			Question: fmt.Sprintf(
				"“%s” เก็บเป็น%s แต่คุณบอกมาเป็น%s ครับ — เท่ากับกี่%s",
				match.Exact.Name, match.Exact.Unit, strings.TrimSpace(draft.Unit), match.Exact.Unit,
			),
		}
	}

	return AICommandResolution{
		Kind:  AICommandOutcomeReady,
		Title: match.Exact.Name,
		Command: AIAdjustStockCommand{
			IngredientID: match.Exact.ID,
			Kind:         kind,
			Quantity:     quantity,
			Note:         strings.TrimSpace(draft.Note),
		},
	}
}
