package service

import "time"

// StructuredPlannerRawRecord is one provider answer kept verbatim, together with
// the verdict the parse boundary gave it. It holds the user's question and
// whatever the model wrote, so it is only ever produced when a recorder is
// installed — see structuredPlannerRawRecorder.
type StructuredPlannerRawRecord struct {
	Provider     StructuredPlannerProviderName `json:"provider"`
	Model        string                        `json:"model"`
	Question     string                        `json:"question"`
	RawJSON      string                        `json:"raw_json"`
	FailureStage StructuredPlannerFailureStage `json:"failure_stage,omitempty"`
	Error        string                        `json:"error,omitempty"`
	RecordedAt   time.Time                     `json:"recorded_at"`
	// MustReject marks a record the contract has to keep rejecting. It is set by
	// hand in the committed corpus, never by a recorder.
	MustReject bool `json:"must_reject,omitempty"`
	// Note explains where a hand-written corpus entry came from.
	Note string `json:"note,omitempty"`
}

// structuredPlannerRawRecorder is nil in production and stays nil unless an
// evaluation run installs one. A live planning run costs provider quota; with a
// recorder installed it also leaves behind the exact JSON each provider wrote,
// so the same answers can be replayed through parse and validation offline as
// often as the contract changes, without paying for them again.
var structuredPlannerRawRecorder func(StructuredPlannerRawRecord)

func recordStructuredPlannerRaw(record StructuredPlannerRawRecord) {
	recorder := structuredPlannerRawRecorder
	if recorder == nil {
		return
	}
	record.RecordedAt = time.Now()
	recorder(record)
}

func errorText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
