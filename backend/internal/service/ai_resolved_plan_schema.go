package service

// ResolvedPlanJSONSchema returns a fresh, provider-neutral JSON Schema for
// ResolvedPlan. Provider adapters may translate the nullable representation if
// their structured-output API uses a dialect other than standard JSON Schema.
// Runtime validation remains mandatory even when a provider accepts this schema.
func ResolvedPlanJSONSchema() map[string]any {
	schema := resolvedPlanObjectSchema(
		map[string]any{
			"schema_version": map[string]any{
				"type":  "string",
				"const": ResolvedPlanSchemaVersion,
			},
			"original_question": resolvedPlanDescribedSchema(
				resolvedPlanBoundedStringSchema(1, 2000),
				"Exact current message written by the user.",
			),
			"resolved_question": resolvedPlanDescribedSchema(
				resolvedPlanBoundedStringSchema(1, 3000),
				"Standalone question after applying only context recorded in inherited_fields.",
			),
			"task":       resolvedPlanEnumSchema(resolvedPlanTasks),
			"domain":     resolvedPlanEnumSchema(resolvedPlanDomains),
			"operation":  resolvedPlanEnumSchema(resolvedPlanOperations),
			"parameters": resolvedPlanParametersJSONSchema(),
			"tool_hint": resolvedPlanDescribedSchema(
				resolvedPlanToolHintJSONSchema(),
				"Optional untrusted read-only tool proposal. Empty string means no legacy tool hint.",
			),
			"resolution":     resolvedPlanResolutionJSONSchema(),
			"policy":         resolvedPlanPolicyJSONSchema(),
			"response_style": resolvedPlanEnumSchema(resolvedPlanResponseStyles),
		},
		[]string{
			"schema_version", "original_question", "resolved_question", "task",
			"domain", "operation", "parameters", "tool_hint", "resolution",
			"policy", "response_style",
		},
	)
	schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
	schema["$id"] = "https://project-m.local/schemas/ai/resolved-plan-v1.json"
	schema["title"] = "ResolvedPlan"
	schema["description"] = "Provider-neutral proposal describing how the backend should answer one restaurant-assistant question."
	return schema
}

func resolvedPlanParametersJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"metrics": resolvedPlanArraySchema(
				resolvedPlanEnumSchema(resolvedPlanMetrics), 8, true,
			),
			"group_by": resolvedPlanArraySchema(
				resolvedPlanEnumSchema(resolvedPlanGroupDimensions), 2, true,
			),
			"entities": resolvedPlanArraySchema(
				resolvedPlanEntityJSONSchema(), 20, true,
			),
			"time_range":         resolvedPlanNullableSchema(resolvedPlanTimeRangeJSONSchema()),
			"compare_time_range": resolvedPlanNullableSchema(resolvedPlanTimeRangeJSONSchema()),
			"day_part":           resolvedPlanNullableSchema(resolvedPlanDayPartJSONSchema()),
			"filters": resolvedPlanArraySchema(
				resolvedPlanFilterJSONSchema(), 20, true,
			),
			"ranking": resolvedPlanNullableSchema(resolvedPlanRankingJSONSchema()),
		},
		[]string{
			"metrics", "group_by", "entities", "time_range", "compare_time_range",
			"day_part", "filters", "ranking",
		},
	)
}

func resolvedPlanEntityJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"type":           resolvedPlanEnumSchema(resolvedPlanEntityTypes),
			"id":             resolvedPlanBoundedStringSchema(0, 128),
			"name":           resolvedPlanBoundedStringSchema(0, 200),
			"result_index":   map[string]any{"type": "integer", "minimum": 0, "maximum": 100},
			"source_turn_id": resolvedPlanBoundedStringSchema(0, 128),
		},
		[]string{"type", "id", "name", "result_index", "source_turn_id"},
	)
}

func resolvedPlanTimeRangeJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"kind":       resolvedPlanEnumSchema(resolvedPlanTimeRangeKinds),
			"label":      resolvedPlanBoundedStringSchema(1, 120),
			"start_date": map[string]any{"type": "string", "pattern": `^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$`},
			"end_date": resolvedPlanDescribedSchema(
				map[string]any{"type": "string", "pattern": `^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$`},
				"Exclusive restaurant-local end date. Empty only when kind is all_time.",
			),
			"timezone": map[string]any{"type": "string", "const": ResolvedPlanTimezone},
		},
		[]string{"kind", "label", "start_date", "end_date", "timezone"},
	)
}

func resolvedPlanDayPartJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"label":      resolvedPlanBoundedStringSchema(1, 80),
			"start_hour": map[string]any{"type": "integer", "minimum": 0, "maximum": 23},
			"end_hour":   map[string]any{"type": "integer", "minimum": 1, "maximum": 24},
		},
		[]string{"label", "start_hour", "end_hour"},
	)
}

func resolvedPlanFilterJSONSchema() map[string]any {
	values := resolvedPlanArraySchema(
		resolvedPlanBoundedStringSchema(1, 200), 20, true,
	)
	values["minItems"] = 1
	return resolvedPlanObjectSchema(
		map[string]any{
			"field":    resolvedPlanEnumSchema(resolvedPlanFilterFields),
			"operator": resolvedPlanEnumSchema(resolvedPlanFilterOperators),
			"values":   values,
		},
		[]string{"field", "operator", "values"},
	)
}

func resolvedPlanRankingJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"metric":    resolvedPlanEnumSchema(resolvedPlanMetrics),
			"direction": resolvedPlanEnumSchema(resolvedPlanRankDirections),
			"rank":      map[string]any{"type": "integer", "minimum": 1},
			"limit":     map[string]any{"type": "integer", "minimum": 1, "maximum": 100},
		},
		[]string{"metric", "direction", "rank", "limit"},
	)
}

func resolvedPlanResolutionJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"inherited_fields": resolvedPlanArraySchema(
				resolvedPlanInheritedFieldJSONSchema(), 20, true,
			),
			"missing_fields": resolvedPlanArraySchema(
				resolvedPlanEnumSchema(resolvedPlanFields), 20, true,
			),
			"needs_clarification":    map[string]any{"type": "boolean"},
			"clarification_question": resolvedPlanBoundedStringSchema(0, 500),
			"confidence": map[string]any{
				"type":    "number",
				"minimum": 0,
				"maximum": 1,
			},
		},
		[]string{
			"inherited_fields", "missing_fields", "needs_clarification",
			"clarification_question", "confidence",
		},
	)
}

func resolvedPlanInheritedFieldJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"field":  resolvedPlanEnumSchema(resolvedPlanFields),
			"source": resolvedPlanEnumSchema(resolvedPlanContextSources),
			"source_turn_id": resolvedPlanDescribedSchema(
				resolvedPlanBoundedStringSchema(1, 128),
				"Request-local history/tool-result ID assigned by the context adapter.",
			),
		},
		[]string{"field", "source", "source_turn_id"},
	)
}

func resolvedPlanPolicyJSONSchema() map[string]any {
	return resolvedPlanObjectSchema(
		map[string]any{
			"risk":      resolvedPlanEnumSchema(resolvedPlanRiskLevels),
			"read_only": map[string]any{"type": "boolean"},
			"requires_confirmation": resolvedPlanDescribedSchema(
				map[string]any{"type": "boolean"},
				"Whether the server must request confirmation; never evidence that confirmation already happened.",
			),
		},
		[]string{"risk", "read_only", "requires_confirmation"},
	)
}

func resolvedPlanToolHintJSONSchema() map[string]any {
	tools := supportedReadOnlyToolNames()
	values := make([]string, 1, len(tools)+1)
	for _, tool := range tools {
		values = append(values, string(tool))
	}
	return map[string]any{"type": "string", "enum": values}
}

func resolvedPlanObjectSchema(properties map[string]any, required []string) map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties":           properties,
		"required":             append([]string(nil), required...),
	}
}

func resolvedPlanArraySchema(items map[string]any, maxItems int, unique bool) map[string]any {
	return map[string]any{
		"type":        "array",
		"items":       items,
		"maxItems":    maxItems,
		"uniqueItems": unique,
	}
}

func resolvedPlanNullableSchema(schema map[string]any) map[string]any {
	return map[string]any{
		"anyOf": []any{
			schema,
			map[string]any{"type": "null"},
		},
	}
}

func resolvedPlanBoundedStringSchema(minLength, maxLength int) map[string]any {
	return map[string]any{
		"type":      "string",
		"minLength": minLength,
		"maxLength": maxLength,
	}
}

func resolvedPlanEnumSchema[T ~string](values []T) map[string]any {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return map[string]any{"type": "string", "enum": result}
}

func resolvedPlanDescribedSchema(schema map[string]any, description string) map[string]any {
	schema["description"] = description
	return schema
}
