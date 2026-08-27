package service

import "testing"

// The model may say which months were meant; Go decides whether that answer is
// usable. A month or year outside the possible range is dropped rather than
// clamped, because a confidently wrong month is worse than asking again.
func TestParseAIModelPeriodReply(t *testing.T) {
	reply, ok := parseAIModelPeriodReply(`{"periods":[{"year":2026,"month":3},{"year":2026,"month":4}],"comparison":true}`)
	if !ok || len(reply.Periods) != 2 || !reply.Comparison {
		t.Fatalf("plain object = %+v ok=%v", reply, ok)
	}
	if reply.Periods[0].Month != 3 || reply.Periods[1].Month != 4 {
		t.Errorf("months lost: %+v", reply.Periods)
	}

	fenced, ok := parseAIModelPeriodReply("```json\n{\"periods\":[{\"year\":2026,\"month\":7}],\"comparison\":false}\n```")
	if !ok || len(fenced.Periods) != 1 || fenced.Periods[0].Month != 7 {
		t.Fatalf("fenced object = %+v ok=%v", fenced, ok)
	}

	empty, ok := parseAIModelPeriodReply(`{"periods":[],"comparison":false}`)
	if !ok || len(empty.Periods) != 0 {
		t.Fatalf("empty periods = %+v ok=%v", empty, ok)
	}

	if _, ok := parseAIModelPeriodReply("ยอดขายเดือนนี้ 12,000 บาท"); ok {
		t.Error("prose must not parse as a period reply")
	}
	if _, ok := parseAIModelPeriodReply("{broken"); ok {
		t.Error("malformed JSON must not parse")
	}
}
