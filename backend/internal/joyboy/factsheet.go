package joyboy

import "strings"

// buildFactSheet lays the tool results out for the model to read.
//
// Every block carries a label naming the tool and the period it covers. That
// label does three jobs at once, each of which was a real failure before it
// existed: figures from two tools stop blurring together, the answer stops
// dropping the time window ("30 วันล่าสุด" went missing from a live reply), and
// a wrong answer can be traced back to the block that misled the model.
//
// The owner never sees this text.
func buildFactSheet(results []ToolResult) string {
	if len(results) == 0 {
		return ""
	}
	var sheet strings.Builder
	for i, result := range results {
		body := strings.TrimSpace(result.Body)
		if body == "" {
			continue
		}
		if i > 0 {
			sheet.WriteString("\n\n")
		}
		label := strings.TrimSpace(result.Label)
		if label == "" {
			label = strings.TrimSpace(result.Tool)
		}
		sheet.WriteString("[" + label + "]\n")
		sheet.WriteString(body)
	}
	return strings.TrimSpace(sheet.String())
}
