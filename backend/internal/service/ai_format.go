package service

import (
	"fmt"
	"strconv"
	"strings"
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
