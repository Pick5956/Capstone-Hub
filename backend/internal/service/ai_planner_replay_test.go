package service

// Offline replay of what the providers actually answered.
//
// Every planner number so far came from a live run, and a live run spends a
// daily token budget that resets once a day. Replay splits the two questions
// that were tangled together in those runs:
//
//	"what did the model write?"      answered once, by a paid run
//	"does our contract accept it?"   answered here, for free, as often as the
//	                                 contract changes
//
// The corpus is JSONL, one StructuredPlannerRawRecord per line:
//
//   - testdata/planner_replay_corpus.jsonl is committed and always replayed.
//   - Agent_testing/planner-raw-corpus.jsonl is written by an evaluation run
//     that installed the recorder, and is replayed too whenever it exists.
//     AI_PLANNER_REPLAY_CORPUS overrides that path.
//
// Verdicts:
//
//	a record that parsed when captured must still parse — that is the
//	  regression this test fails on;
//	a record that failed when captured and parses now is progress: it is
//	  reported, not failed, because loosening the contract to accept answers
//	  that were always reasonable is the work in progress;
//	must_reject records are the opposite — hand-labelled lines the contract has
//	  to keep refusing, so leniency added for the cases above cannot quietly
//	  swallow an unsafe plan.
//
// Replay covers the parse boundary and ResolvedPlan normalize/validate only.
// Provenance needs the live context items, which the corpus does not carry.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
)

const plannerCommittedCorpusPath = "testdata/planner_replay_corpus.jsonl"

// plannerCapturedCorpusPath points outside the repository on purpose: raw model
// output carries the question and any restaurant data quoted into it.
func plannerCapturedCorpusPath() string {
	if override := strings.TrimSpace(os.Getenv("AI_PLANNER_REPLAY_CORPUS")); override != "" {
		return override
	}
	return filepath.Join("..", "..", "..", "Agent_testing", "planner-raw-corpus.jsonl")
}

func TestPlannerReplayCorpus(t *testing.T) {
	records := loadPlannerReplayCorpus(t, plannerCommittedCorpusPath, true)
	captured := loadPlannerReplayCorpus(t, plannerCapturedCorpusPath(), false)
	if len(captured) > 0 {
		t.Logf("อ่านของจริงที่บันทึกไว้เพิ่ม %d รายการจาก %s", len(captured), plannerCapturedCorpusPath())
	}
	records = append(records, captured...)

	var improved, stillFailing, unchanged int
	reasons := map[string]int{}

	for index, record := range records {
		label := plannerRecordLabel(index, record)
		stage, err := replayPlannerRecord(record)

		if record.MustReject {
			if stage == "" {
				t.Errorf("%s: ต้องถูกปฏิเสธ แต่ผ่าน — ด่านความปลอดภัยหลุด", label)
			}
			continue
		}

		switch {
		case record.FailureStage == "" && stage != "":
			t.Errorf("%s: เคยผ่านตอนบันทึก แต่ตอนนี้ไม่ผ่านที่ชั้น %s: %v", label, stage, err)
		case record.FailureStage != "" && stage == "":
			improved++
			t.Logf("%s: เคยล้มที่ชั้น %s ตอนนี้ผ่านแล้ว", label, record.FailureStage)
		case record.FailureStage != "":
			stillFailing++
			reasons[plannerFailureReason(err)]++
		default:
			unchanged++
		}
	}

	t.Logf("replay %d รายการ — ผ่านเหมือนเดิม %d, ซ่อมได้แล้ว %d, ยังล้ม %d",
		len(records), unchanged, improved, stillFailing)
	if len(reasons) > 0 {
		t.Log("สาเหตุที่ยังล้ม (เรียงตามจำนวน):")
		for _, line := range sortedReasonCounts(reasons) {
			t.Log("  " + line)
		}
	}
}

func replayPlannerRecord(record StructuredPlannerRawRecord) (StructuredPlannerFailureStage, error) {
	_, err := ParseStructuredPlannerResolvedPlan(record.RawJSON, record.Question)
	switch {
	case err == nil:
		return "", nil
	case errors.Is(err, ErrStructuredPlannerPlanValidation):
		return StructuredPlannerFailureValidation, err
	default:
		return StructuredPlannerFailureParse, err
	}
}

func plannerRecordLabel(index int, record StructuredPlannerRawRecord) string {
	name := strings.TrimSpace(record.Note)
	if name == "" {
		name = truncateRunes(record.Question, 40)
	}
	return fmt.Sprintf("[%d] %s", index+1, name)
}

// plannerFailureReason strips the values out of an error so that the same defect
// seen on twenty different questions is counted once.
func plannerFailureReason(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if index := strings.Index(message, ": "); index >= 0 {
		message = message[index+2:]
	}
	if quote := strings.Index(message, " \""); quote >= 0 {
		message = message[:quote]
	}
	return truncateRunes(message, 100)
}

func sortedReasonCounts(reasons map[string]int) []string {
	lines := make([]string, 0, len(reasons))
	for reason, count := range reasons {
		lines = append(lines, fmt.Sprintf("%3d × %s", count, reason))
	}
	sort.Sort(sort.Reverse(sort.StringSlice(lines)))
	return lines
}

func truncateRunes(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit]) + "…"
}

func loadPlannerReplayCorpus(t *testing.T, path string, required bool) []StructuredPlannerRawRecord {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		if !required && errors.Is(err, os.ErrNotExist) {
			return nil
		}
		t.Fatalf("อ่าน corpus %s ไม่ได้: %v", path, err)
	}

	records := make([]StructuredPlannerRawRecord, 0, 16)
	for number, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		var record StructuredPlannerRawRecord
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("%s บรรทัด %d ไม่ใช่ JSON ที่อ่านได้: %v", path, number+1, err)
		}
		if strings.TrimSpace(record.RawJSON) == "" || strings.TrimSpace(record.Question) == "" {
			t.Fatalf("%s บรรทัด %d ขาด question หรือ raw_json", path, number+1)
		}
		records = append(records, record)
	}
	if required && len(records) == 0 {
		t.Fatalf("%s ว่างเปล่า", path)
	}
	return records
}

// installPlannerCorpusRecorder makes a live evaluation run pay for its provider
// calls once and leave the answers behind. It is called by the ai_eval builds;
// without it the corpus never grows.
func installPlannerCorpusRecorder(t *testing.T) {
	t.Helper()
	path := plannerCapturedCorpusPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("สร้างโฟลเดอร์เก็บ corpus ไม่ได้: %v", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatalf("เปิดไฟล์ corpus ไม่ได้: %v", err)
	}

	var mutex sync.Mutex
	written := 0
	structuredPlannerRawRecorder = func(record StructuredPlannerRawRecord) {
		line, marshalErr := json.Marshal(record)
		if marshalErr != nil {
			return
		}
		mutex.Lock()
		defer mutex.Unlock()
		if _, writeErr := file.Write(append(line, '\n')); writeErr == nil {
			written++
		}
	}

	t.Cleanup(func() {
		structuredPlannerRawRecorder = nil
		mutex.Lock()
		count := written
		mutex.Unlock()
		_ = file.Close()
		absolute, _ := filepath.Abs(path)
		t.Logf("เก็บคำตอบดิบไว้ %d รายการที่ %s (ใช้ replay ซ้ำได้ฟรี)", count, absolute)
	})
}

// TestPlannerCorpusRoundTrip proves the two halves fit: what the recorder writes
// during a paid run is exactly what the replay can read back afterwards. Without
// this, a recording bug would only surface a day later, after the quota that
// produced the corpus was already spent.
func TestPlannerCorpusRoundTrip(t *testing.T) {
	corpus := filepath.Join(t.TempDir(), "corpus.jsonl")
	t.Setenv("AI_PLANNER_REPLAY_CORPUS", corpus)
	installPlannerCorpusRecorder(t)

	question := "เมื่อวานร้านขายได้เท่าไหร่"
	valid, err := json.Marshal(structuredPlannerTestPlan(question))
	if err != nil {
		t.Fatalf("encode plan: %v", err)
	}
	planner, err := NewStructuredPlanner(
		&structuredPlannerMockProvider{
			name:     StructuredPlannerProviderGroq,
			response: StructuredPlannerProviderResponse{RawJSON: `{"schema_version":"1.1"`, Model: "mock-groq"},
		},
		&structuredPlannerMockProvider{
			name:     StructuredPlannerProviderGemini,
			response: StructuredPlannerProviderResponse{RawJSON: string(valid), Model: "mock-gemini"},
		},
	)
	if err != nil {
		t.Fatalf("build planner: %v", err)
	}
	if _, err := planner.Plan(context.Background(), StructuredPlannerRequest{Question: question}); err != nil {
		t.Fatalf("plan: %v", err)
	}

	records := loadPlannerReplayCorpus(t, corpus, true)
	if len(records) != 2 {
		t.Fatalf("ต้องบันทึกทั้งคำตอบที่พังและที่ใช้ได้ ได้ %d รายการ", len(records))
	}
	if records[0].FailureStage != StructuredPlannerFailureParse || records[0].Provider != StructuredPlannerProviderGroq {
		t.Fatalf("รายการแรกต้องเป็น groq ที่ล้มตอน parse: %+v", records[0])
	}
	if records[1].FailureStage != "" || records[1].Provider != StructuredPlannerProviderGemini {
		t.Fatalf("รายการที่สองต้องเป็น gemini ที่ผ่าน: %+v", records[1])
	}

	// The recorded verdicts must reproduce exactly: that equivalence is what lets
	// the replay stand in for a live run.
	for index, record := range records {
		stage, replayErr := replayPlannerRecord(record)
		if stage != record.FailureStage {
			t.Fatalf("รายการที่ %d replay ได้ชั้น %q แต่ตอนบันทึกเป็น %q: %v",
				index+1, stage, record.FailureStage, replayErr)
		}
	}
}

// The recorder must stay off unless a test installs it: raw model output carries
// the question and any restaurant data quoted into it.
func TestPlannerRawRecorderIsOffByDefault(t *testing.T) {
	if structuredPlannerRawRecorder != nil {
		t.Fatal("มี recorder ค้างอยู่ — production จะเขียน JSON ดิบทิ้งไว้")
	}
	recordStructuredPlannerRaw(StructuredPlannerRawRecord{Question: "x", RawJSON: "{}"})
}
