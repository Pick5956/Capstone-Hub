package controller

import (
	"encoding/csv"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func csvExportContext(t *testing.T, rawQuery string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	request, err := http.NewRequest(http.MethodGet, "/api/v1/ingredient-transactions/export?"+rawQuery, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	context.Request = request
	return context, recorder
}

// Excel on Windows reads a CSV in the system codepage unless the file opens with
// a UTF-8 BOM. Without these three bytes every Thai ingredient name arrives as
// mojibake on the machine the shop owner actually uses.
func TestCSVDownloadStartsWithUTF8BOM(t *testing.T) {
	context, recorder := csvExportContext(t, "")

	writeCSVDownload(context, "inventory-history-2026-09-01.csv", []string{"วัตถุดิบ"}, [][]string{{"หมูสับ"}}, 1)

	body := recorder.Body.Bytes()
	if len(body) < 3 || string(body[:3]) != utf8BOM {
		t.Fatalf("CSV must start with a UTF-8 BOM, got % x", body[:min(len(body), 8)])
	}
	if !strings.Contains(recorder.Body.String(), "หมูสับ") {
		t.Fatal("Thai content must survive the export unchanged")
	}
	if got := recorder.Header().Get("Content-Disposition"); !strings.Contains(got, "inventory-history-2026-09-01.csv") {
		t.Fatalf("Content-Disposition = %q, want the export filename", got)
	}
}

// The client warns when a download was capped, so it needs to see both the rows
// it got and the total it asked for.
func TestCSVDownloadReportsRowAndTotalCounts(t *testing.T) {
	context, recorder := csvExportContext(t, "")

	writeCSVDownload(context, "x.csv", []string{"a"}, [][]string{{"1"}, {"2"}}, 500)

	if got := recorder.Header().Get("X-Export-Rows"); got != "2" {
		t.Fatalf("X-Export-Rows = %q, want 2", got)
	}
	if got := recorder.Header().Get("X-Export-Total"); got != "500" {
		t.Fatalf("X-Export-Total = %q, want 500", got)
	}
}

// Excel treats a bare LF-separated CSV as one long row on some locales, so the
// writer has to emit CRLF between records.
func TestCSVDownloadSeparatesRecordsWithCRLF(t *testing.T) {
	context, recorder := csvExportContext(t, "")

	writeCSVDownload(context, "x.csv", []string{"a", "b"}, [][]string{{"1", "2"}}, 1)

	if !strings.Contains(recorder.Body.String(), "a,b\r\n1,2\r\n") {
		t.Fatalf("records must be CRLF separated, got %q", recorder.Body.String())
	}
}

// A quantity comes off a numeric(18,4) column, so 3 kg arrives as 3.0000. Excel
// reads both as the same number; only one of them is readable.
func TestCSVNumberDropsTrailingZeros(t *testing.T) {
	cases := map[float64]string{
		3:       "3",
		3.5:     "3.5",
		-0.6:    "-0.6",
		0:       "0",
		0.0001:  "0.0001",
		1250.25: "1250.25",
	}
	for value, want := range cases {
		if got := csvNumber(value); got != want {
			t.Fatalf("csvNumber(%v) = %q, want %q", value, got, want)
		}
	}
}

// "adjust" sets an absolute level rather than moving stock by an amount. Mixing
// it into the same column as the ins and outs would make a SUM in Excel silently
// wrong, which is worse than no total at all.
func TestTransactionCSVSeparatesChangeFromAbsoluteSet(t *testing.T) {
	rows := [][]string{
		{"2026-09-01", "08:15", "หมูสับ", "เนื้อสัตว์", csvTransactionTypeLabel("in", true), csvNumber(5), "", "กก.", csvMoney(1250), "สมชาย ใจดี", ""},
		{"2026-09-01", "12:04", "หมูสับ", "เนื้อสัตว์", csvTransactionTypeLabel("out", true), csvNumber(-0.6), "", "กก.", "", "สมชาย ใจดี", ""},
		{"2026-09-01", "20:30", "หมูสับ", "เนื้อสัตว์", csvTransactionTypeLabel("adjust", true), "", csvNumber(3.2), "กก.", "", "สมชาย ใจดี", ""},
	}

	const changeColumn, setToColumn = 5, 6
	if rows[0][changeColumn] != "5" || rows[0][setToColumn] != "" {
		t.Fatalf("a stock-in belongs in the change column: %v", rows[0])
	}
	if rows[1][changeColumn] != "-0.6" {
		t.Fatalf("a stock-out must be negative so the column totals correctly: %v", rows[1])
	}
	if rows[2][changeColumn] != "" || rows[2][setToColumn] != "3.2" {
		t.Fatalf("an absolute set must stay out of the change column: %v", rows[2])
	}
}

// A dash or a stray quote in a note must not be able to break the row apart.
func TestCSVDownloadQuotesSeparatorsInsideValues(t *testing.T) {
	context, recorder := csvExportContext(t, "")

	writeCSVDownload(context, "x.csv", []string{"note"}, [][]string{{`ซื้อ "หมู", ตลาด`}}, 1)

	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(recorder.Body.String(), utf8BOM)))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("exported CSV must parse back: %v", err)
	}
	if len(records) != 2 || records[1][0] != `ซื้อ "หมู", ตลาด` {
		t.Fatalf("value with a comma and quotes did not round-trip: %#v", records)
	}
}

// "to = today" has to include today. Stored timestamps carry a time of day, so an
// inclusive-looking filter compared against midnight would drop the whole day.
func TestTransactionQueryWidensToDateToTheFollowingMidnight(t *testing.T) {
	context, _ := csvExportContext(t, "from=2026-08-19&to=2026-09-01")

	query, err := parseIngredientTransactionQuery(context)
	if err != nil {
		t.Fatalf("parseIngredientTransactionQuery() error = %v", err)
	}
	if got := query.From.Format("2006-01-02 15:04"); got != "2026-08-19 00:00" {
		t.Fatalf("From = %q, want the start of 2026-08-19", got)
	}
	if got := query.To.Format("2006-01-02 15:04"); got != "2026-09-02 00:00" {
		t.Fatalf("To = %q, want the midnight after 2026-09-01", got)
	}
}

func TestTransactionQueryRejectsBadInput(t *testing.T) {
	for _, rawQuery := range []string{
		"from=01/09/2026",
		"to=not-a-date",
		"ingredient_id=abc",
		"category_id=abc",
		"from=2026-09-01&to=2026-08-19",
	} {
		context, _ := csvExportContext(t, rawQuery)
		if _, err := parseIngredientTransactionQuery(context); err == nil {
			t.Fatalf("%q must be rejected rather than silently ignored", rawQuery)
		}
	}
}

// The filename names the period, so two downloads from different ranges cannot
// overwrite each other in the same folder.
func TestExportFilenameNamesThePickedRange(t *testing.T) {
	context, _ := csvExportContext(t, "from=2026-08-19&to=2026-09-01")

	query, err := parseIngredientTransactionQuery(context)
	if err != nil {
		t.Fatalf("parseIngredientTransactionQuery() error = %v", err)
	}
	if got := csvDateRangeSuffix(query); got != "2026-08-19_2026-09-01" {
		t.Fatalf("csvDateRangeSuffix() = %q, want the day the user picked, not the exclusive bound", got)
	}
}
