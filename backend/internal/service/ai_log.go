package service

import (
	"fmt"
	"log"
	"strings"
)

// aiStage prints one line of an AskOperations request in a consistent, scannable
// shape so a whole request reads top-to-bottom as it flows through the pipeline:
//
//	[AI] input | user asked: "เมนูไหนแพงสุด" (history 0 turns)
//	[AI] route | task=analyze_data tool=get_most_expensive_menu conf=0.90 risk=low needs_data=true
//	[AI] flow  | analytical — building 14-day snapshot
//	[AI] call  | Groq analytical model=llama-3.3-70b-versatile key=gsk_Yb...fuuw
//	[AI] done  | model=local-tool-confirmed task=retrieve_fact tool=get_most_expensive_menu
//
// It uses the standard log package so lines carry the same timestamp prefix as
// the http_request access log.
func aiStage(stage, format string, args ...interface{}) {
	log.Printf("[AI] %-5s | %s", stage, fmt.Sprintf(format, args...))
}

// aiSnippet collapses whitespace and shortens free text (e.g. the user's
// question) so it fits on a single log line without leaking a huge blob.
func aiSnippet(s string, max int) string {
	s = strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
	r := []rune(s)
	if len(r) > max {
		return string(r[:max]) + "..."
	}
	return s
}

// aiToolOrDash renders an empty tool name as "-" for readable log lines.
func aiToolOrDash(t AIToolName) string {
	if t == "" {
		return "-"
	}
	return string(t)
}
