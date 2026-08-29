package service

// The catalogue joyboy shows the model when it picks tools.
//
// The descriptions on the provider tool definitions were written for legacy,
// where a classifier narrows the field first and the description only has to
// say what a tool returns. Joyboy has no classifier: the model reads this list
// and decides alone, so a description has to say which question the tool
// answers, in the language the owner asks it.
//
// The cost of getting this wrong is not an error — it is a plausible answer
// built from the wrong tool. Asked "เมนูไหนขายดีแต่กำไรน้อย", the model read
// "Classify menus into Star / Plowhorse / Puzzle / Dog quadrants", failed to
// connect the Thai question to the English jargon, and picked top sellers plus
// the single lowest-margin menu instead — two sets that do not overlap. It then
// correctly reported it could not answer. Asked again, it picked the right tool
// and answered fine. Same question, same session, different answer.
//
// So the descriptions here name the question, not the mechanism.

// joyboyToolGuide describes each tool by the question it answers. Every tool
// offered to the model must appear here; a test holds that.
var joyboyToolGuide = map[AIToolName]string{
	AIToolGetTopSellingMenus: "เมนูขายดี เรียงตามจำนวนจานที่ขายได้ " +
		"ใช้ตอบ: เมนูไหนขายดี เมนูไหนคนสั่งเยอะ เมนูยอดนิยม",
	AIToolGetMenuRevenueRanking: "เมนูเรียงตามรายได้รวมที่ทำได้ ไม่ใช่จำนวนจาน " +
		"ใช้ตอบเฉพาะเมื่อคำถามเอ่ยถึงเงินหรือรายได้ชัดเจน เช่น เมนูไหนทำเงินให้ร้านมากที่สุด " +
		"ถ้าถามแค่ \"เมนูขายดี\" เฉย ๆ ไม่ได้พูดถึงเงิน ให้ใช้ get_top_selling_menus แทน",
	AIToolGetSlowMovingMenus: "เมนูที่ขายได้น้อยที่สุด รวมถึงที่ขายไม่ได้เลย " +
		"ใช้ตอบ: เมนูไหนขายไม่ออก ควรตัดเมนูไหนทิ้ง",
	AIToolGetHighestMarginMenu: "เมนูที่กำไรต่อจานดีที่สุด พร้อมต้นทุนและกำไรต่อจาน " +
		"ใช้ตอบ: เมนูไหนกำไรดีสุด เมนูไหนคุ้มที่สุด",
	AIToolGetLowestMarginMenu: "เมนูที่กำไรต่อจานแย่ที่สุด พร้อมต้นทุนและกำไรต่อจาน " +
		"ใช้ตอบ: เมนูไหนกำไรน้อยสุด เมนูไหนขายแล้วแทบไม่เหลือ",
	AIToolGetLowestCostMenu: "เมนูที่ต้นทุนวัตถุดิบต่อจานถูกที่สุด " +
		"ใช้ตอบ: เมนูไหนต้นทุนถูกสุด",
	AIToolGetMostExpensiveMenu: "เมนูที่ตั้งราคาขายแพงที่สุด เป็นราคาป้าย ไม่ใช่รายได้ " +
		"ใช้ตอบ: เมนูไหนราคาแพงสุด",
	AIToolGetMenuEngineering: "จัดกลุ่มเมนูตามความนิยมคู่กับกำไร เป็น 4 กลุ่ม " +
		"ใช้ตอบคำถามที่พูดถึงสองอย่างพร้อมกัน เช่น เมนูไหนขายดีแต่กำไรน้อย " +
		"เมนูไหนกำไรดีแต่คนไม่ค่อยสั่ง เมนูไหนควรดันควรตัด",

	AIToolGetSalesSummary: "ยอดขายรวมกับจำนวนออเดอร์ของ \"30 วันล่าสุด\" เท่านั้น ช่วงนี้ตายตัว เปลี่ยนไม่ได้ " +
		"ใช้ตอบเฉพาะเมื่อผู้ใช้ไม่ได้ระบุช่วงเวลาเลย เช่น ยอดขายรวมเท่าไหร่ ขายได้กี่ออเดอร์ " +
		"ถ้าผู้ใช้เอ่ยช่วงเวลาใด ๆ ก็ตาม (วันนี้ เมื่อวาน 3 วันที่ผ่านมา สัปดาห์ที่แล้ว เดือนนี้ กรกฎาคม ปีนี้) " +
		"ให้ใช้ get_sales_for_period แทนเสมอ",
	AIToolGetSalesForPeriod: "ยอดขายรวมทั้งร้าน (ไม่แยกเมนู) ของช่วงเวลาที่ผู้ใช้ระบุมา ไม่ว่าจะระบุแบบไหน " +
		"วันเดียว (วันนี้ เมื่อวาน วันที่ 20 สิงหา) · นับถอยหลัง (3 วันที่ผ่านมา 5 วันก่อน 7 วันล่าสุด) · " +
		"สัปดาห์ (สัปดาห์นี้ สัปดาห์ที่แล้ว) · ช่วงคร่อมวัน (ตั้งแต่ต้นเดือนถึงวันนี้ ช่วง 20 ถึง 24 สิงหา) · " +
		"เดือน (เดือนนี้ เดือนที่แล้ว เดือนกรกฎาคม กรกฎาคม 2568) · ปี (ปีนี้ ปีที่แล้ว ปี 2568) · " +
		"และการเทียบสองช่วงเวลา เช่น เทียบเดือนต่อเดือน เทียบปีต่อปี " +
		"ใช้ตอบเมื่อถามยอดขาย/รายได้รวมของช่วงที่ระบุ " +
		"ถ้าถามถึงเมนูในช่วงนั้น (เมนูขายดี/กำไรของเมนู) ให้ใช้ get_menu_metrics_for_period แทน",
	AIToolGetSalesTrend: "เทียบยอดขาย 7 วันล่าสุดกับ 7 วันก่อนหน้า พร้อมเปอร์เซ็นต์ที่เปลี่ยน " +
		"ใช้ตอบ: ยอดขายดีขึ้นหรือแย่ลง เทียบอาทิตย์ก่อนเป็นไง ทำไมยอดตก ทำไมยอดขึ้น",
	AIToolGetAverageOrderValue: "ยอดขายเฉลี่ยต่อหนึ่งออเดอร์ ของ \"30 วันล่าสุด\" เท่านั้น ช่วงนี้ตายตัว " +
		"ใช้ตอบเฉพาะเมื่อผู้ใช้ไม่ได้ระบุช่วงเวลาเลย เช่น ลูกค้าจ่ายเฉลี่ยคนละเท่าไหร่ ยอดต่อบิลเท่าไหร่ " +
		"ถ้าผู้ใช้เอ่ยช่วงเวลาใด ๆ (เมื่อวาน สัปดาห์ที่แล้ว เดือนที่แล้ว กรกฎาคม) " +
		"ให้ใช้ get_sales_for_period แทน เพราะตัวนั้นคิดบิลเฉลี่ยของช่วงที่ถามมาให้ด้วย",
	AIToolGetOrderTypeBreakdown: "แยกยอดขายและจำนวนออเดอร์ตามประเภท กินที่ร้าน สั่งกลับ เดลิเวอรี " +
		"ใช้ตอบ: ขายหน้าร้านหรือสั่งกลับมากกว่ากัน " +
		"รับช่วงเวลาที่ผู้ใช้ระบุได้ด้วย เช่น เดือนที่แล้วสั่งกลับกี่ออเดอร์",
	AIToolGetPeakPeriods: "วันในสัปดาห์และชั่วโมงที่มีออเดอร์มากที่สุด " +
		"ใช้ตอบ: ช่วงไหนคนเยอะ วันไหนขายดี ควรจัดคนช่วงไหน " +
		"รับช่วงเวลาที่ผู้ใช้ระบุได้ด้วย เช่น อาทิตย์ก่อนช่วงไหนคนเยอะสุด " +
		"วันที่คับคั่งที่สุดกับชั่วโมงที่คับคั่งที่สุดเป็นคนละแกนกัน ไม่ใช่ชั่วโมงที่คับคั่งของวันนั้น",

	AIToolGetLowStockIngredients: "รายชื่อวัตถุดิบที่ใกล้หมดหรือหมดแล้ว พร้อมจำนวนที่ควรเติม " +
		"ใช้ตอบ: วัตถุดิบอะไรใกล้หมด ต้องสั่งของอะไรบ้าง",
	AIToolGetIngredientReorderForecast: "ประมาณว่าวัตถุดิบแต่ละตัวจะหมดในกี่วัน จากอัตราการใช้ที่ผ่านมา " +
		"ใช้ตอบ: ของจะหมดเมื่อไหร่ ควรสั่งของเมื่อไหร่",
	AIToolGetDeadStock: "วัตถุดิบที่มีของอยู่ในสต็อกแต่ไม่ถูกใช้เลยในช่วงที่วิเคราะห์ " +
		"ใช้ตอบ: มีของค้างสต็อกไหม เงินจมอยู่ที่ไหน ของอะไรเสี่ยงเสีย",
	AIToolGetTopCostIngredients: "วัตถุดิบเรียงตามเงินที่จ่ายไปจริงในช่วงที่วิเคราะห์ " +
		"ใช้ตอบ: วัตถุดิบตัวไหนแพงสุด เงินหมดไปกับอะไรมากที่สุด",
	AIToolGetInventoryValuation: "มูลค่ารวมของวัตถุดิบที่มีอยู่ในสต็อกตอนนี้ พร้อมจำนวนรายการที่ใกล้หมด " +
		"ใช้ตอบ: สต็อกทั้งหมดมีมูลค่าเท่าไหร่",
}

// joyboyToolsNotOffered lists tools the model is not shown.
//
// get_store_summary bundles five other tools into one block, and bundles them
// lossily: three top menus instead of the ranking, one margin menu instead of
// the list, and a count of at-risk ingredients with no names. It costs the same
// as asking for the five separately, because every tool reads the one snapshot
// already built. Offering it means the model sometimes takes the shallow path
// for no saving. Withholding it makes broad questions cost more tokens and
// risks the model forgetting one of the five areas — which is the thing to
// watch for in testing.
var joyboyToolsNotOffered = map[AIToolName]struct{}{
	AIToolGetStoreSummary: {},
}

// joyboyToolDataCoverage is a joyboy-only tool: legacy answers "how far back
// does the data reach?" through its own keyword path (answerDataCoverage), but
// joyboy exposes it as a tool the model can pick. It is not in getGroqTools(),
// so Catalogue() appends it and Run() handles it directly rather than through
// executeReadOnlyTool — it needs the full history, not the 30-day snapshot.
const joyboyToolDataCoverage AIToolName = "get_data_coverage"

// joyboyToolMenuForPeriod answers menu questions scoped to a named calendar
// period ("เมนูขายดีเดือนที่แล้ว") instead of the rolling 30-day snapshot. It
// reuses legacy's period parser (extractPeriods) and MenuMetricsForRange to
// gather the numbers, but renders them as a raw fact sheet for the model to rank
// and phrase — legacy's own path writes the finished Thai answer, which is the
// one thing joyboy does not want from it.
const joyboyToolMenuForPeriod AIToolName = "get_menu_metrics_for_period"

// joyboyToolSalesForecast predicts the next 7 days of sales and returns a
// chart-ready series (history + bounded future). Legacy answers this through its
// own keyword short-circuit (answerSalesForecast), which joyboy's mode branch
// bypasses, so joyboy exposes it as a tool the model can pick. The numbers and
// the accuracy band are computed in Go (weekday average × recent trend, measured
// by a 28-day backtest) — the model never invents a forecast figure; it only
// phrases the result, and the chart is drawn deterministically on the frontend.
const joyboyToolSalesForecast AIToolName = "get_sales_forecast"

// joyboyToolTableStatus reports the floor as it is right now: how many tables are
// free, taken, or held for a booking. It is the one tool here that reads live
// state rather than a window of history, because "โต๊ะว่างไหม" is only ever a
// question about this minute.
//
// It is read-only, and that is a decision rather than an omission. Every write in
// this assistant is proposed, shown, and executed only when the owner confirms —
// which fits data that is still true a minute later. A table is the fastest
// changing thing in the shop: by the time a "reserve table 5" bar is confirmed,
// the floor staff may have seated someone there. The write would be refused
// safely, but the owner would have been told a change was ready that then was
// not. Booking stays on the table screen, where it is one tap and immediate.
const joyboyToolTableStatus AIToolName = "get_table_status"

// joyboyToolExpenseSummary reads the money that actually left the shop, which no
// other tool covers: every existing figure here is revenue or the recipe cost of
// food already sold, and neither of those is rent, wages or the electricity bill.
const joyboyToolExpenseSummary AIToolName = "get_expense_summary"

// The two lookup tools. Everything else here ranks or totals; these answer about
// one named thing, which is the question an owner asks most and the one the
// assistant used to answer worst — see ai_joyboy_detail.go for what went wrong.
const (
	joyboyToolIngredientDetail AIToolName = "get_ingredient_detail"
	joyboyToolMenuDetail       AIToolName = "get_menu_detail"
)

// joyboyToolShopProfile reads the shop's own identity — its name, branch, type
// and opening hours. Nothing else exposed this, so "ร้านเราชื่ออะไร" was a dead
// end the model filled by dumping a sales total.
const joyboyToolShopProfile AIToolName = "get_shop_profile"

// joyboyExtraTools are the capabilities joyboy offers beyond legacy's tool list.
// Their names are not in getGroqTools(), so Catalogue() adds them. How they run
// then splits: get_data_coverage and search_system_docs are intercepted in
// runJoyboyExtraTool because they cannot be answered from the 30-day snapshot;
// get_profit_summary is a normal snapshot tool that simply isn't in legacy's
// provider list, so runJoyboyExtraTool leaves it alone and it falls through to
// executeReadOnlyTool like every other read-only tool.
var joyboyExtraTools = []AIToolName{
	joyboyToolDataCoverage,
	AIToolSearchSystemDocs,
	AIToolGetProfitSummary,
	joyboyToolMenuForPeriod,
	joyboyToolSalesForecast,
	joyboyToolTableStatus,
	joyboyToolExpenseSummary,
	joyboyToolIngredientDetail,
	joyboyToolMenuDetail,
	joyboyToolShopProfile,
}

// joyboyExtraToolGuide describes the extra tools, same shape as joyboyToolGuide.
var joyboyExtraToolGuide = map[AIToolName]string{
	joyboyToolDataCoverage: "ช่วงข้อมูลที่ระบบมีจริง วันเก่าสุดถึงวันใหม่สุดที่มีการขาย จำนวนวันที่มีข้อมูล " +
		"และยอดขายรวมกับจำนวนออเดอร์รวมของทั้งประวัติตั้งแต่เปิดร้าน (ไม่ใช่แค่ 30 วันล่าสุด) " +
		"ใช้ตอบ: ระบบมีข้อมูลตั้งแต่เมื่อไหร่ ข้อมูลถึงช่วงไหน มีข้อมูลย้อนหลังกี่วัน " +
		"ยอดขายรวมทั้งหมดตั้งแต่เปิดร้าน ออเดอร์รวมทั้งหมด",
	AIToolSearchSystemDocs: "ค้นคู่มือการใช้งานเว็บ Dishy เพื่อตอบวิธีใช้ระบบ " +
		"ใช้ตอบ: ใช้ระบบยังไง เมนูตรงไหน ตั้งค่าอะไรที่ไหน ทำอะไรได้บ้าง ระบบมีข้อจำกัดอะไร แก้ปัญหายังไง",
	AIToolGetProfitSummary: "กำไรรวมทั้งร้านในช่วงที่วิเคราะห์ คือรายได้รวม ลบ ต้นทุนวัตถุดิบรวม " +
		"เหลือกำไรรวม พร้อม margin เฉลี่ยทั้งร้าน เป็นภาพรวมทั้งร้าน ไม่ใช่รายเมนู " +
		"ใช้ตอบ: ร้านกำไรเท่าไหร่ ต้นทุนรวมเท่าไหร่ กำไรสุทธิเท่าไหร่ margin ทั้งร้านกี่เปอร์เซ็นต์ " +
		"ถ้าถามแค่ยอดขายรวมไม่พูดถึงกำไรหรือต้นทุน ให้ใช้ get_sales_summary แทน " +
		"ถ้าถามกำไรของเมนูตัวใดตัวหนึ่ง ให้ใช้ get_highest_margin_menu หรือ get_lowest_margin_menu แทน",
	joyboyToolIngredientDetail: "ข้อมูลของ \"วัตถุดิบตัวที่ผู้ใช้เอ่ยชื่อ\" โดยเฉพาะ " +
		"บอกสต๊อกคงเหลือ หน่วย ขั้นต่ำ ราคาต่อหน่วย มูลค่าคงเหลือ และ **เมนูไหนบ้างที่ใช้วัตถุดิบตัวนี้** " +
		"ใช้ตอบเมื่อคำถามเอ่ยชื่อวัตถุดิบตัวใดตัวหนึ่ง เช่น หมูสับเหลือเท่าไหร่ · กะเพราขั้นต่ำเท่าไหร่ · " +
		"ไข่ไก่ราคาเท่าไหร่ · เมนูไหนใช้กุ้งสดบ้าง · ถ้ากะเพราหมดจะกระทบเมนูไหน " +
		"ต่างจาก get_low_stock_ingredients ที่บอกเฉพาะตัวที่ใกล้หมดทั้งหมด ไม่เจาะจงตัวใดตัวหนึ่ง",
	joyboyToolMenuDetail: "ข้อมูลของ \"เมนูตัวที่ผู้ใช้เอ่ยชื่อ\" โดยเฉพาะ " +
		"บอกราคา สถานะเปิด/ปิดขาย จำนวนที่ขายได้ ยอดขาย ต้นทุน กำไร margin และสูตรว่าใช้วัตถุดิบอะไรบ้าง " +
		"ใช้ตอบเมื่อคำถามเอ่ยชื่อเมนูตัวใดตัวหนึ่ง เช่น ผัดไทยขายได้กี่รายการ · ต้มยำกุ้งกำไรเท่าไหร่ · " +
		"ข้าวผัดปูใช้วัตถุดิบอะไร · ถ้าปิดขายเมนูนี้จะกระทบยอดขายแค่ไหน " +
		"**สำคัญ: ถ้าคำถามเอ่ยชื่อเมนูเจาะจง ให้ใช้เครื่องมือนี้ ห้ามใช้ลิสต์อันดับ** " +
		"เพราะลิสต์อันดับมีแค่ไม่กี่ตัว เมนูที่ไม่อยู่ในลิสต์ไม่ได้แปลว่าไม่มียอดขาย",
	joyboyToolExpenseSummary: "รายจ่ายที่ร้านจ่ายเงินออกไปจริงใน 30 วันล่าสุด แยกตามหมวด " +
		"(วัตถุดิบ ค่าแรง ค่าเช่า ค่าน้ำค่าไฟ อุปกรณ์ อื่น ๆ) พร้อมรายการล่าสุด " +
		"ใช้ตอบ: จ่ายอะไรไปบ้าง รายจ่ายเท่าไหร่ ค่าไฟเดือนนี้เท่าไหร่ หมวดไหนจ่ายเยอะสุด ต้นทุนคงที่เท่าไหร่ " +
		"นี่คือเงินสดที่จ่ายออกไป คนละอย่างกับต้นทุนวัตถุดิบของอาหารที่ขายไปแล้ว " +
		"ถ้าถามกำไรจากการขาย ให้ใช้ get_profit_summary แทน",
	joyboyToolTableStatus: "สถานะโต๊ะในร้าน \"ตอนนี้เดี๋ยวนี้\" ไม่ใช่ข้อมูลย้อนหลัง " +
		"บอกจำนวนโต๊ะทั้งหมด ว่างกี่โต๊ะ มีคนนั่งกี่โต๊ะ จองไว้กี่โต๊ะ ที่นั่งว่างรวมกี่ที่ " +
		"พร้อมรายชื่อโต๊ะว่าง เลขโต๊ะ จำนวนที่นั่ง และโซน " +
		"ใช้ตอบ: โต๊ะว่างกี่โต๊ะ ร้านเต็มยัง มีโต๊ะรับกี่คนได้บ้าง โต๊ะไหนว่าง โต๊ะนี้ว่างไหม " +
		"ตอนนี้มีคนกี่โต๊ะ โซนไหนคนแน่น มีใครจองไว้บ้าง " +
		"ระบบนี้ดูสถานะได้อย่างเดียว จองหรือยกเลิกจองไม่ได้ " +
		"แต่ถ้าผู้ใช้ขอให้จองโต๊ะหรือยกเลิกจอง **ก็ให้เลือกเครื่องมือนี้อยู่ดี** " +
		"จะได้ตอบจากสถานะจริงว่าทำให้ไม่ได้ และบอกว่าต้องไปกดเองที่หน้าจัดการโต๊ะ",
	joyboyToolMenuForPeriod: "เมนูพร้อมยอดขาย จำนวนจาน กำไร และ margin ของ \"ช่วงเวลาที่ระบุ\" " +
		"เช่น เดือนนี้ เดือนที่แล้ว เดือนกรกฎาคม ปีนี้ ไม่ใช่ 30 วันล่าสุด " +
		"ใช้ตอบเฉพาะเมื่อคำถามเอ่ยชื่อเดือนหรือปีชัดเจน เช่น เมนูขายดีเดือนที่แล้ว " +
		"เมนูกำไรดีสุดเดือนกรกฎาคม ยอดแต่ละเมนูปีนี้ " +
		"ถ้าคำถามไม่เอ่ยช่วงเวลา ให้ใช้ get_top_selling_menus หรือ get_highest_margin_menu (30 วัน) แทน",
	joyboyToolSalesForecast: "คาดการณ์ยอดขาย 7 วันข้างหน้า พร้อมช่วงความคลาดเคลื่อนและกราฟ " +
		"คำนวณด้วยสถิติ (ค่าเฉลี่ยยอดขายตามวันในสัปดาห์ × แนวโน้มล่าสุด) เป็นการ \"ทำนายอนาคต\" ไม่ใช่ยอดที่เกิดขึ้นจริง " +
		"ใช้ตอบเมื่อคำถามถามถึงอนาคต เช่น อาทิตย์หน้าจะขายได้เท่าไหร่ พรุ่งนี้น่าจะขายดีไหม คาดการณ์ยอดขายสัปดาห์หน้า ทำนายยอดขาย " +
		"ถ้าถามยอดขายที่เกิดขึ้นไปแล้ว (วันนี้ เดือนนี้ ที่ผ่านมา) ให้ใช้ get_sales_for_period หรือ get_sales_summary แทน " +
		"ต้องบอกผู้ใช้เสมอว่านี่คือการคาดการณ์ ไม่ใช่ตัวเลขจริง",
	joyboyToolShopProfile: "ข้อมูลตัวร้านเอง ชื่อร้าน ชื่อสาขา ประเภทร้าน เวลาเปิด-ปิด จำนวนโต๊ะทั้งหมด " +
		"ใช้ตอบ: ร้านเราชื่ออะไร ร้านเปิดกี่โมง ปิดกี่โมง สาขาอะไร ร้านเราเป็นร้านประเภทไหน มีกี่โต๊ะ " +
		"เป็นข้อมูลตัวตนของร้าน ไม่ใช่ยอดขายหรือสถานะโต๊ะตอนนี้",
}

// isJoyboyExtraTool reports whether a tool is joyboy-only (handled in Run() by
// runJoyboyExtraTool, not through the snapshot / executeReadOnlyTool path).
func isJoyboyExtraTool(name AIToolName) bool {
	_, ok := joyboyExtraToolGuide[name]
	return ok
}

// joyboyToolGroups is the order the catalogue's section headings appear in and
// the tools filed under each. Grouping is presentation only: the model still
// picks freely across sections (chosen the way we settled — organise the flat
// list for readability, never gate the choice behind a section). A tool absent
// from every group still shows, unheaded, after the grouped ones, so a newly
// added tool is never hidden — a test holds that each offered tool has a home.
var joyboyToolGroups = []struct {
	Heading string
	Tools   []AIToolName
}{
	{"เมนู", []AIToolName{
		AIToolGetTopSellingMenus, AIToolGetMenuRevenueRanking, AIToolGetSlowMovingMenus,
		AIToolGetHighestMarginMenu, AIToolGetLowestMarginMenu, AIToolGetLowestCostMenu,
		AIToolGetMostExpensiveMenu, AIToolGetMenuEngineering, joyboyToolMenuForPeriod,
	}},
	{"ยอดขายและกำไร", []AIToolName{
		AIToolGetSalesSummary, AIToolGetSalesForPeriod, AIToolGetSalesTrend,
		AIToolGetAverageOrderValue, AIToolGetOrderTypeBreakdown, AIToolGetPeakPeriods,
		AIToolGetProfitSummary, joyboyToolSalesForecast,
	}},
	{"วัตถุดิบและสต๊อก", []AIToolName{
		AIToolGetLowStockIngredients, AIToolGetIngredientReorderForecast, AIToolGetDeadStock,
		AIToolGetTopCostIngredients, AIToolGetInventoryValuation,
	}},
	{"ดูรายตัวที่ระบุชื่อ", []AIToolName{joyboyToolIngredientDetail, joyboyToolMenuDetail}},
	{"หน้าร้าน", []AIToolName{joyboyToolTableStatus}},
	{"ข้อมูลร้าน", []AIToolName{joyboyToolShopProfile}},
	{"รายจ่าย", []AIToolName{joyboyToolExpenseSummary}},
	{"ข้อมูลระบบ", []AIToolName{joyboyToolDataCoverage}},
	{"คู่มือการใช้งาน", []AIToolName{AIToolSearchSystemDocs}},
}

// joyboyToolGroupHeading returns the section a tool sits under, "" if unfiled.
func joyboyToolGroupHeading(name AIToolName) string {
	for _, group := range joyboyToolGroups {
		for _, tool := range group.Tools {
			if tool == name {
				return group.Heading
			}
		}
	}
	return ""
}

// joyboyToolGroupOrder ranks a tool by its group for a stable catalogue sort.
// Unfiled tools sort last so they still render, just without a heading.
func joyboyToolGroupOrder(name AIToolName) int {
	for i, group := range joyboyToolGroups {
		for _, tool := range group.Tools {
			if tool == name {
				return i
			}
		}
	}
	return len(joyboyToolGroups)
}
