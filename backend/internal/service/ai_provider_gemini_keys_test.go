package service

import "testing"

// The keys are written as a quoted block, one per line. A key added without a
// trailing comma was glued to the one above it — the pair became a single
// "key" carrying a newline, and every request with it failed as an invalid
// HTTP header value rather than as a bad key.
func TestGeminiKeysSplitOnCommasAndLineBreaks(t *testing.T) {
	service := &AIService{}
	t.Setenv("GEMINI_API_KEYS", "\n  key-one,\n  key-two\n  key-three,\n\n  key-four\n")
	keys := service.getGeminiKeys()
	want := []string{"key-one", "key-two", "key-three", "key-four"}
	if len(keys) != len(want) {
		t.Fatalf("got %d keys %v, want %d", len(keys), keys, len(want))
	}
	for i, expected := range want {
		if keys[i] != expected {
			t.Errorf("key %d = %q, want %q", i, keys[i], expected)
		}
	}
	t.Setenv("GEMINI_API_KEYS", "")
	if got := service.getGeminiKeys(); got != nil {
		t.Errorf("no keys configured should read as none, got %v", got)
	}
}
