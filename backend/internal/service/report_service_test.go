package service

import "testing"

func TestTruncateReportRowsReportsPartialResults(t *testing.T) {
	rows := make([]int, salesDetailLimit+1)
	visible, hasMore := truncateReportRows(rows, salesDetailLimit)

	if len(visible) != salesDetailLimit || !hasMore {
		t.Fatalf("truncateReportRows() = %d rows, hasMore=%t", len(visible), hasMore)
	}

	visible, hasMore = truncateReportRows(rows[:salesDetailLimit], salesDetailLimit)
	if len(visible) != salesDetailLimit || hasMore {
		t.Fatalf("exact-limit rows should not be marked partial: %d rows, hasMore=%t", len(visible), hasMore)
	}
}
