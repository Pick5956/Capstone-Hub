package service

import (
	"fmt"
	"math"
	"sort"
	"strings"

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
// checked any of it.
type AIStockCommandDraft struct {
	Name string `json:"name"`
	// in | out | adjust change stock; min sets the low-stock threshold; cost sets
	// the price per unit; create adds a new ingredient.
	Kind     string  `json:"kind"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Note     string  `json:"note,omitempty"`
}

// AICommandKindsAll lists what the extractor may propose.
var AICommandKindsAll = []string{"in", "out", "adjust", "min", "cost", "create"}

func aiIsStockKind(kind string) bool {
	return kind == "in" || kind == "out" || kind == "adjust"
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

// ResolveIngredientName finds the one ingredient a name refers to. An exact
// match wins; otherwise near matches are returned as candidates for the owner to
// pick from. Two ingredients with the same name stay ambiguous on purpose.
func ResolveIngredientName(shelf []entity.Ingredient, name string) AIIngredientMatch {
	wanted := aiNormalizeName(name)
	if wanted == "" {
		return AIIngredientMatch{}
	}
	exact := make([]entity.Ingredient, 0, 2)
	near := make([]entity.Ingredient, 0, 4)
	for _, item := range shelf {
		candidate := aiNormalizeName(item.Name)
		switch {
		case candidate == wanted:
			exact = append(exact, item)
		case strings.Contains(candidate, wanted) || strings.Contains(wanted, candidate):
			near = append(near, item)
		}
	}
	if len(exact) == 1 {
		found := exact[0]
		return AIIngredientMatch{Exact: &found}
	}
	if len(exact) > 1 {
		return AIIngredientMatch{Candidates: exact}
	}
	sort.SliceStable(near, func(i, j int) bool { return len(near[i].Name) < len(near[j].Name) })
	if len(near) > 3 {
		near = near[:3]
	}
	return AIIngredientMatch{Candidates: near}
}

// --- Deciding what to do ------------------------------------------------------

type AICommandOutcomeKind string

const (
	AICommandOutcomeReady       AICommandOutcomeKind = "ready"
	AICommandOutcomeAsk         AICommandOutcomeKind = "ask"
	AICommandOutcomeOfferCreate AICommandOutcomeKind = "offer_create"
)

// AICommandResolution is what the assistant should do with one drafted change.
type AICommandResolution struct {
	Kind     AICommandOutcomeKind
	Command  AIAdjustStockCommand // set when Kind is ready
	Title    string               // the ingredient name as the owner said it
	Question string               // set when Kind is ask or offer_create
}

// ResolveStockCommand checks one drafted change against the shelf and decides
// whether it can proceed, needs a question, or refers to something that does not
// exist yet.
func ResolveStockCommand(shelf []entity.Ingredient, draft AIStockCommandDraft) AICommandResolution {
	title := strings.TrimSpace(draft.Name)
	if title == "" {
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

	match := ResolveIngredientName(shelf, title)
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
