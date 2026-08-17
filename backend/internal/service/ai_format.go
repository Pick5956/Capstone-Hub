package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// analysisWindowDays is the single source of truth for the rolling window the
// snapshot covers. buildSnapshot derives its start date from this, the reorder
// forecast divides usage by it, and the Thai answers label themselves with it —
// so the number, the data, and the wording can never drift apart.
const analysisWindowDays = 30.0

// analysisWindowLabel is how the window is described to the user. Being explicit
// ("30 วันล่าสุด") beats a vague "ช่วงวิเคราะห์", which left people guessing which
// period a figure actually covered.
func analysisWindowLabel() string {
	return fmt.Sprintf("%.0f วันล่าสุด", analysisWindowDays)
}

// formatThaiDate turns a "2006-01-02" date into "31 กรกฎาคม 2569" (Buddhist era).
// Falls back to the raw value if it cannot be parsed, so a formatting problem
// never hides the underlying fact.
func formatThaiDate(isoDate string) string {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(isoDate))
	if err != nil {
		return isoDate
	}
	return fmt.Sprintf("%d %s %d", t.Day(), thaiMonthName(int(t.Month())), t.Year()+543)
}

// formatInt renders a whole count with thousand separators, e.g. 3500 -> "3,500".
// Used for dish/order counts where the ".00" of formatMoney would be noise.
func formatInt(n int64) string {
	negative := n < 0
	if negative {
		n = -n
	}
	digits := strconv.FormatInt(n, 10)
	var b strings.Builder
	for i := 0; i < len(digits); i++ {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteByte(digits[i])
	}
	if negative {
		return "-" + b.String()
	}
	return b.String()
}

// formatMoney renders a baht amount with thousand separators, e.g.
// 588804 -> "588,804.00". Six-figure sums are unreadable without them.
func formatMoney(value float64) string {
	negative := value < 0
	if negative {
		value = -value
	}
	whole, fraction, _ := strings.Cut(strconv.FormatFloat(value, 'f', 2, 64), ".")

	var b strings.Builder
	for i := 0; i < len(whole); i++ {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteByte(whole[i])
	}
	out := b.String() + "." + fraction
	if negative {
		return "-" + out
	}
	return out
}
