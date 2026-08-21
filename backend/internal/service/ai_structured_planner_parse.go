package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const structuredPlannerMaxJSONBytes = 128 << 10

var (
	ErrStructuredPlannerJSON           = errors.New("structured planner returned invalid JSON")
	ErrStructuredPlannerPlanValidation = errors.New("structured planner returned an invalid plan")
)

// ParseStructuredPlannerResolvedPlan enforces the strict wire shape before
// applying ResolvedPlan's semantic validation. trustedOriginalQuestion always
// replaces the model-provided copy at this trust boundary.
func ParseStructuredPlannerResolvedPlan(rawJSON string, trustedOriginalQuestion string) (ResolvedPlan, error) {
	rawJSON = strings.TrimSpace(rawJSON)
	if rawJSON == "" {
		return ResolvedPlan{}, fmt.Errorf("%w: empty response", ErrStructuredPlannerJSON)
	}
	if len(rawJSON) > structuredPlannerMaxJSONBytes {
		return ResolvedPlan{}, fmt.Errorf("%w: response exceeds %d bytes", ErrStructuredPlannerJSON, structuredPlannerMaxJSONBytes)
	}

	var shape any
	shapeDecoder := json.NewDecoder(strings.NewReader(rawJSON))
	shapeDecoder.UseNumber()
	if err := shapeDecoder.Decode(&shape); err != nil {
		return ResolvedPlan{}, fmt.Errorf("%w: %v", ErrStructuredPlannerJSON, err)
	}
	if err := requireStructuredPlannerEOF(shapeDecoder); err != nil {
		return ResolvedPlan{}, fmt.Errorf("%w: %v", ErrStructuredPlannerJSON, err)
	}
	// Models routinely write null where the contract asks for an empty list, and
	// both say the same thing: nothing was specified. Rejecting the whole plan
	// over that spelling cost correct routing in live measurement, so the two are
	// folded together here, at the wire boundary, before anything is validated.
	rawJSON, shape = coerceStructuredPlannerNullArrays(rawJSON, shape)
	// resolution.missing_fields is a list of field names, while the neighbouring
	// inherited_fields is a list of objects. Models copy the object shape into
	// both often enough that it cost a whole plan in live measurement, so an entry
	// written as {"field":"task",...} is read as the name it already carries.
	rawJSON, shape = coerceStructuredPlannerMissingFields(rawJSON, shape)
	// The nullable object fields get the same treatment as the lists above, for
	// the same reason: gpt-oss-20b writes "ranking": [] to say there is no
	// ranking. An empty list and null say the same thing here, and rejecting the
	// spelling threw away two complete, correct plans in live measurement.
	rawJSON, shape = coerceStructuredPlannerEmptyObjects(rawJSON, shape)
	if err := validateStructuredPlannerWireShape(shape); err != nil {
		return ResolvedPlan{}, fmt.Errorf("%w: %v", ErrStructuredPlannerJSON, err)
	}

	// Unknown fields are ignored rather than fatal. Every field the contract needs
	// has already been checked for presence and type above, so an extra key adds
	// nothing and reaches no code: it cannot be a renamed field slipping through,
	// because the real name would then be missing. Being strict here cost a
	// complete and correct plan in live measurement, where the model appended one
	// stray "resolved_plan" key after writing the whole plan correctly.
	decoder := json.NewDecoder(bytes.NewBufferString(rawJSON))
	var plan ResolvedPlan
	if err := decoder.Decode(&plan); err != nil {
		return ResolvedPlan{}, fmt.Errorf("%w: %v", ErrStructuredPlannerJSON, err)
	}
	if err := requireStructuredPlannerEOF(decoder); err != nil {
		return ResolvedPlan{}, fmt.Errorf("%w: %v", ErrStructuredPlannerJSON, err)
	}

	trustedOriginalQuestion = strings.TrimSpace(trustedOriginalQuestion)
	if trustedOriginalQuestion == "" || len([]rune(trustedOriginalQuestion)) > 800 {
		return ResolvedPlan{}, fmt.Errorf("%w: trusted original question is invalid", ErrStructuredPlannerPlanValidation)
	}
	plan.OriginalQuestion = trustedOriginalQuestion
	validated, err := NormalizeAndValidateResolvedPlan(plan)
	if err != nil {
		return ResolvedPlan{}, fmt.Errorf("%w: %v", ErrStructuredPlannerPlanValidation, err)
	}
	return validated, nil
}

func requireStructuredPlannerEOF(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return errors.New("response contains more than one JSON value")
		}
		return err
	}
	return nil
}

func validateStructuredPlannerWireShape(value any) error {
	root, err := structuredPlannerObject(value, "resolved_plan")
	if err != nil {
		return err
	}
	if err := structuredPlannerRequired(root, "resolved_plan",
		"schema_version", "original_question", "resolved_question", "task", "domain", "operation",
		"action", "parameters", "tool_hint", "resolution", "policy", "response_style"); err != nil {
		return err
	}
	if root["action"] != nil {
		action, actionErr := structuredPlannerObject(root["action"], "action")
		if actionErr != nil {
			return actionErr
		}
		if actionErr = structuredPlannerRequired(action, "action", "type", "arguments"); actionErr != nil {
			return actionErr
		}
		arguments, argumentsErr := structuredPlannerObject(action["arguments"], "action.arguments")
		if argumentsErr != nil {
			return argumentsErr
		}
		if argumentsErr = structuredPlannerRequired(arguments, "action.arguments", "is_available"); argumentsErr != nil {
			return argumentsErr
		}
	}

	parameters, err := structuredPlannerObject(root["parameters"], "parameters")
	if err != nil {
		return err
	}
	if err := structuredPlannerRequired(parameters, "parameters",
		"metrics", "group_by", "entities", "time_range", "compare_time_range", "day_part", "filters", "ranking"); err != nil {
		return err
	}
	if err := structuredPlannerArray(parameters["metrics"], "parameters.metrics", nil); err != nil {
		return err
	}
	if err := structuredPlannerArray(parameters["group_by"], "parameters.group_by", nil); err != nil {
		return err
	}
	if err := structuredPlannerArray(parameters["entities"], "parameters.entities", func(item any, path string) error {
		return structuredPlannerObjectWithRequired(item, path, "type", "id", "name", "result_index", "source_turn_id")
	}); err != nil {
		return err
	}
	if err := structuredPlannerNullableObjectWithRequired(parameters["time_range"], "parameters.time_range",
		"kind", "label", "start_date", "end_date", "timezone"); err != nil {
		return err
	}
	if err := structuredPlannerNullableObjectWithRequired(parameters["compare_time_range"], "parameters.compare_time_range",
		"kind", "label", "start_date", "end_date", "timezone"); err != nil {
		return err
	}
	if err := structuredPlannerNullableObjectWithRequired(parameters["day_part"], "parameters.day_part",
		"label", "start_hour", "end_hour"); err != nil {
		return err
	}
	if err := structuredPlannerArray(parameters["filters"], "parameters.filters", func(item any, path string) error {
		object, itemErr := structuredPlannerObject(item, path)
		if itemErr != nil {
			return itemErr
		}
		if itemErr = structuredPlannerRequired(object, path, "field", "operator", "values"); itemErr != nil {
			return itemErr
		}
		return structuredPlannerArray(object["values"], path+".values", nil)
	}); err != nil {
		return err
	}
	if err := structuredPlannerNullableObjectWithRequired(parameters["ranking"], "parameters.ranking",
		"metric", "direction", "rank", "limit"); err != nil {
		return err
	}

	resolution, err := structuredPlannerObject(root["resolution"], "resolution")
	if err != nil {
		return err
	}
	if err := structuredPlannerRequired(resolution, "resolution",
		"inherited_fields", "missing_fields", "needs_clarification", "clarification_question", "confidence"); err != nil {
		return err
	}
	if err := structuredPlannerArray(resolution["inherited_fields"], "resolution.inherited_fields", func(item any, path string) error {
		return structuredPlannerObjectWithRequired(item, path, "field", "source", "source_turn_id")
	}); err != nil {
		return err
	}
	if err := structuredPlannerArray(resolution["missing_fields"], "resolution.missing_fields", nil); err != nil {
		return err
	}

	policy, err := structuredPlannerObject(root["policy"], "policy")
	if err != nil {
		return err
	}
	return structuredPlannerRequired(policy, "policy", "risk", "read_only", "requires_confirmation")
}

func structuredPlannerObject(value any, path string) (map[string]any, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s must be an object", path)
	}
	return object, nil
}

func structuredPlannerRequired(object map[string]any, path string, keys ...string) error {
	for _, key := range keys {
		value, exists := object[key]
		if !exists {
			return fmt.Errorf("%s.%s is required", path, key)
		}
		if value == nil && !structuredPlannerNullableField(path, key) {
			return fmt.Errorf("%s.%s must not be null", path, key)
		}
	}
	return nil
}

func structuredPlannerNullableField(path, key string) bool {
	if path == "resolved_plan" && key == "action" {
		return true
	}
	if path != "parameters" {
		return false
	}
	switch key {
	case "time_range", "compare_time_range", "day_part", "ranking":
		return true
	default:
		return false
	}
}

func structuredPlannerArray(value any, path string, validateItem func(any, string) error) error {
	items, ok := value.([]any)
	if !ok {
		return fmt.Errorf("%s must be an array", path)
	}
	if validateItem == nil {
		return nil
	}
	for i, item := range items {
		if err := validateItem(item, fmt.Sprintf("%s[%d]", path, i)); err != nil {
			return err
		}
	}
	return nil
}

func structuredPlannerObjectWithRequired(value any, path string, keys ...string) error {
	object, err := structuredPlannerObject(value, path)
	if err != nil {
		return err
	}
	return structuredPlannerRequired(object, path, keys...)
}

func structuredPlannerNullableObjectWithRequired(value any, path string, keys ...string) error {
	if value == nil {
		return nil
	}
	return structuredPlannerObjectWithRequired(value, path, keys...)
}

// structuredPlannerListFields are the contract's array-valued fields, addressed
// as "<parent>.<key>" where the parent is the object that holds them.
var structuredPlannerListFields = map[string][]string{
	"parameters": {"metrics", "group_by", "entities", "filters"},
	"resolution": {"inherited_fields", "missing_fields"},
}

// coerceStructuredPlannerNullArrays rewrites null list fields to empty lists and
// returns both the patched JSON (for the typed decode) and the patched shape
// (for wire validation), so the two views can never disagree.
func coerceStructuredPlannerNullArrays(rawJSON string, shape any) (string, any) {
	root, ok := shape.(map[string]any)
	if !ok {
		return rawJSON, shape
	}
	changed := false
	for parent, keys := range structuredPlannerListFields {
		nested, nestedOK := root[parent].(map[string]any)
		if !nestedOK {
			continue
		}
		for _, key := range keys {
			value, exists := nested[key]
			if !exists || value != nil {
				continue
			}
			nested[key] = []any{}
			changed = true
		}
	}
	if !changed {
		return rawJSON, shape
	}
	patched, err := json.Marshal(root)
	if err != nil {
		return rawJSON, shape
	}
	return string(patched), root
}

// structuredPlannerNullableObjectFields are the contract's object-or-null fields.
var structuredPlannerNullableObjectFields = map[string][]string{
	"parameters": {"time_range", "compare_time_range", "day_part", "ranking"},
}

// coerceStructuredPlannerEmptyObjects rewrites an empty list written in place of
// a nullable object to null. A non-empty list is left alone, so a model that
// genuinely sent the wrong shape still fails validation.
func coerceStructuredPlannerEmptyObjects(rawJSON string, shape any) (string, any) {
	root, ok := shape.(map[string]any)
	if !ok {
		return rawJSON, shape
	}
	changed := false
	for parent, keys := range structuredPlannerNullableObjectFields {
		nested, nestedOK := root[parent].(map[string]any)
		if !nestedOK {
			continue
		}
		for _, key := range keys {
			list, isList := nested[key].([]any)
			if !isList || len(list) != 0 {
				continue
			}
			nested[key] = nil
			changed = true
		}
	}
	if !changed {
		return rawJSON, shape
	}
	patched, err := json.Marshal(root)
	if err != nil {
		return rawJSON, shape
	}
	return string(patched), root
}

// coerceStructuredPlannerMissingFields flattens objects in
// resolution.missing_fields down to the field name they name. Anything that is
// not an object with a string "field" is left untouched, so a genuinely
// malformed value still fails validation.
func coerceStructuredPlannerMissingFields(rawJSON string, shape any) (string, any) {
	root, ok := shape.(map[string]any)
	if !ok {
		return rawJSON, shape
	}
	resolution, ok := root["resolution"].(map[string]any)
	if !ok {
		return rawJSON, shape
	}
	entries, ok := resolution["missing_fields"].([]any)
	if !ok {
		return rawJSON, shape
	}

	changed := false
	flattened := make([]any, 0, len(entries))
	for _, entry := range entries {
		object, isObject := entry.(map[string]any)
		if !isObject {
			flattened = append(flattened, entry)
			continue
		}
		name, isString := object["field"].(string)
		if !isString || strings.TrimSpace(name) == "" {
			flattened = append(flattened, entry)
			continue
		}
		flattened = append(flattened, name)
		changed = true
	}
	if !changed {
		return rawJSON, shape
	}
	resolution["missing_fields"] = flattened
	patched, err := json.Marshal(root)
	if err != nil {
		return rawJSON, shape
	}
	return string(patched), root
}
