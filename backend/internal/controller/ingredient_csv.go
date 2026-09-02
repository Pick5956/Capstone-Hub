package controller

import (
	"encoding/csv"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"Project-M/internal/entity"
	"Project-M/internal/repository"

	"github.com/gin-gonic/gin"
)

// maxIngredientCSVRows caps one download so a restaurant with years of history
// cannot ask the server to build an unbounded response in memory. When the cap
// bites, the X-Export-* headers say so — the client warns instead of handing the
// user a file that quietly stops part-way through the period.
const maxIngredientCSVRows = 20000

// utf8BOM is the three bytes that make Excel read a Thai CSV as Thai. Without it
// Excel on Windows falls back to the system codepage and every Thai name arrives
// as mojibake: the export looks fine in a text editor and fails on the machine
// the shop owner actually uses.
const utf8BOM = "\xEF\xBB\xBF"

func bangkokLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		return time.Local
	}
	return loc
}

// parseIngredientTransactionQuery reads the filter set shared by the history view
// and its CSV export. Dates arrive as YYYY-MM-DD in the shop's own timezone, and
// `to` is widened to the following midnight so the day named in the filter is
// included rather than cut off at 00:00.
func parseIngredientTransactionQuery(c *gin.Context) (repository.IngredientTransactionQuery, error) {
	query := repository.IngredientTransactionQuery{
		Type:   strings.TrimSpace(c.Query("type")),
		Search: c.Query("search"),
	}
	if raw := strings.TrimSpace(c.Query("ingredient_id")); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			return query, errors.New("ingredient_id must be a number")
		}
		query.IngredientID = uint(id)
	}
	if raw := strings.TrimSpace(c.Query("category_id")); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			return query, errors.New("category_id must be a number")
		}
		query.CategoryID = uint(id)
	}
	loc := bangkokLocation()
	if raw := strings.TrimSpace(c.Query("from")); raw != "" {
		from, err := time.ParseInLocation("2006-01-02", raw, loc)
		if err != nil {
			return query, errors.New("from must be a YYYY-MM-DD date")
		}
		query.From = from
	}
	if raw := strings.TrimSpace(c.Query("to")); raw != "" {
		to, err := time.ParseInLocation("2006-01-02", raw, loc)
		if err != nil {
			return query, errors.New("to must be a YYYY-MM-DD date")
		}
		query.To = to.AddDate(0, 0, 1)
	}
	if !query.From.IsZero() && !query.To.IsZero() && query.To.Before(query.From) {
		return query, errors.New("from must not be after to")
	}
	return query, nil
}

func csvWantsThai(c *gin.Context) bool {
	return !strings.EqualFold(strings.TrimSpace(c.Query("lang")), "en")
}

// csvNumber prints a numeric(18,4) quantity without its trailing zeros, so a 3 kg
// movement reads "3" and not "3.0000". Excel treats both as the same number; only
// one of them is readable.
func csvNumber(value float64) string {
	text := strconv.FormatFloat(value, 'f', 4, 64)
	if strings.Contains(text, ".") {
		text = strings.TrimRight(text, "0")
		text = strings.TrimSuffix(text, ".")
	}
	if text == "" || text == "-" {
		return "0"
	}
	return text
}

func csvMoney(value float64) string {
	return strconv.FormatFloat(value, 'f', 2, 64)
}

func csvTransactionTypeLabel(kind string, thai bool) string {
	switch kind {
	case "in":
		if thai {
			return "เข้า"
		}
		return "In"
	case "out":
		if thai {
			return "ออก"
		}
		return "Out"
	case "adjust":
		if thai {
			return "ตั้งค่า"
		}
		return "Set"
	}
	return kind
}

func csvStockStatus(item entity.Ingredient, thai bool) string {
	switch {
	case item.Stock == 0:
		if thai {
			return "ของหมด"
		}
		return "Out of stock"
	case item.MinStock > 0 && item.Stock <= item.MinStock:
		if thai {
			return "ใกล้หมด"
		}
		return "Low"
	}
	if thai {
		return "ปกติ"
	}
	return "OK"
}

func csvStorageLabel(storage string, thai bool) string {
	labels := map[string][2]string{
		"room_temp": {"อุณหภูมิห้อง", "Room temp"},
		"chilled":   {"แช่เย็น", "Chilled"},
		"frozen":    {"แช่แข็ง", "Frozen"},
		"dry":       {"ของแห้ง", "Dry"},
	}
	pair, ok := labels[storage]
	if !ok {
		return storage
	}
	if thai {
		return pair[0]
	}
	return pair[1]
}

// writeCSVDownload streams rows as a downloadable CSV aimed at Excel: the BOM
// first, then CRLF-separated records. The filename stays ASCII because a Thai one
// survives the browser but not every mail client or file server it gets forwarded
// through afterwards.
func writeCSVDownload(c *gin.Context, filename string, header []string, rows [][]string, total int64) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Header("X-Export-Total", strconv.FormatInt(total, 10))
	c.Header("X-Export-Rows", strconv.Itoa(len(rows)))
	c.Status(http.StatusOK)

	if _, err := c.Writer.WriteString(utf8BOM); err != nil {
		return
	}
	writer := csv.NewWriter(c.Writer)
	writer.UseCRLF = true
	if err := writer.Write(header); err != nil {
		return
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return
		}
	}
	writer.Flush()
}

// csvDateRangeSuffix names the period a file covers, so two downloads never land
// in the same folder under the same name.
func csvDateRangeSuffix(query repository.IngredientTransactionQuery) string {
	loc := bangkokLocation()
	today := time.Now().In(loc).Format("2006-01-02")
	if query.From.IsZero() && query.To.IsZero() {
		return today
	}
	from := "start"
	if !query.From.IsZero() {
		from = query.From.In(loc).Format("2006-01-02")
	}
	to := today
	if !query.To.IsZero() {
		// To is the exclusive following midnight; name the day the user picked.
		to = query.To.In(loc).AddDate(0, 0, -1).Format("2006-01-02")
	}
	return from + "_" + to
}

func (ctrl *IngredientController) ExportTransactionsCSV(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing inventory permission", "view_inventory", "manage_inventory")
	if !ok {
		return
	}
	query, err := parseIngredientTransactionQuery(c)
	if err != nil {
		respondAPIError(c, http.StatusBadRequest, err)
		return
	}
	query.Limit = maxIngredientCSVRows
	rows, total, err := ctrl.svc.ListTransactions(restaurantID, query)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}

	thai := csvWantsThai(c)
	header := []string{"Date", "Time", "Ingredient", "Category", "Type", "Change", "Set to", "Unit", "Amount", "By", "Note"}
	if thai {
		header = []string{"วันที่", "เวลา", "วัตถุดิบ", "หมวด", "ประเภท", "จำนวนเปลี่ยน", "ตั้งค่าเป็น", "หน่วย", "ยอดเงิน", "ผู้ทำรายการ", "หมายเหตุ"}
	}

	loc := bangkokLocation()
	records := make([][]string, 0, len(rows))
	for _, row := range rows {
		// "adjust" sets an absolute level rather than moving stock by an amount,
		// so it gets its own column. Totalling "Change" then stays correct instead
		// of silently mixing a target level in with the ins and outs.
		change := ""
		setTo := ""
		switch row.Type {
		case "in":
			change = csvNumber(row.Quantity)
		case "out":
			change = csvNumber(-row.Quantity)
		case "adjust":
			setTo = csvNumber(row.Quantity)
		}
		// Only a restock carries money, so an "out" leaves the cell empty rather
		// than printing a 0.00 that would read as "this cost nothing".
		amount := ""
		if row.Amount > 0 {
			amount = csvMoney(row.Amount)
		}
		at := row.CreatedAt.In(loc)
		records = append(records, []string{
			at.Format("2006-01-02"),
			at.Format("15:04"),
			row.IngredientName,
			row.CategoryName,
			csvTransactionTypeLabel(row.Type, thai),
			change,
			setTo,
			row.IngredientUnit,
			amount,
			row.CreatedByName,
			row.Note,
		})
	}

	writeCSVDownload(c, "inventory-history-"+csvDateRangeSuffix(query)+".csv", header, records, total)
}

func (ctrl *IngredientController) ExportStockCSV(c *gin.Context) {
	restaurantID, ok := requireRestaurantWithAnyPermission(c, "missing inventory permission", "view_inventory", "manage_inventory")
	if !ok {
		return
	}
	// No Limit: the stock sheet is one row per ingredient, which stays small even
	// for a large shop, and a half-exported stock count is worse than a slow one.
	stockQuery := repository.IngredientListQuery{
		Search: c.Query("search"),
		Status: c.Query("status"),
		Sort:   c.Query("sort"),
		Desc:   c.Query("order") == "desc",
	}
	if raw := strings.TrimSpace(c.Query("category_id")); raw != "" {
		id, parseErr := strconv.ParseUint(raw, 10, 64)
		if parseErr != nil {
			respondAPIError(c, http.StatusBadRequest, errors.New("category_id must be a number"))
			return
		}
		stockQuery.CategoryID = uint(id)
	}
	items, total, err := ctrl.svc.ListFiltered(restaurantID, stockQuery)
	if err != nil {
		respondAPIError(c, http.StatusInternalServerError, err)
		return
	}

	thai := csvWantsThai(c)
	header := []string{"Ingredient", "Category", "Stock", "Unit", "Min stock", "Status", "Cost per unit", "Total value", "Storage"}
	if thai {
		header = []string{"วัตถุดิบ", "หมวด", "คงเหลือ", "หน่วย", "ขั้นต่ำ", "สถานะ", "ต้นทุนต่อหน่วย", "มูลค่ารวม", "ที่เก็บ"}
	}

	records := make([][]string, 0, len(items))
	for _, item := range items {
		category := ""
		if item.Category != nil {
			category = item.Category.Name
		}
		records = append(records, []string{
			item.Name,
			category,
			csvNumber(item.Stock),
			item.Unit,
			csvNumber(item.MinStock),
			csvStockStatus(item, thai),
			csvMoney(item.CostPerUnit),
			csvMoney(item.Stock * item.CostPerUnit),
			csvStorageLabel(item.StorageType, thai),
		})
	}

	filename := "inventory-stock-" + time.Now().In(bangkokLocation()).Format("2006-01-02") + ".csv"
	writeCSVDownload(c, filename, header, records, total)
}
