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

	AIToolGetSalesSummary: "ยอดขายรวมกับจำนวนออเดอร์ในช่วงที่วิเคราะห์ " +
		"ใช้ตอบ: ยอดขายรวมเท่าไหร่ ขายได้กี่ออเดอร์",
	AIToolGetSalesForPeriod: "ยอดขายของช่วงเวลาที่ผู้ใช้ระบุชื่อมา คือวันนี้ เมื่อวาน " +
		"7 วันล่าสุด หรือสัปดาห์ก่อน ใช้ตอบเมื่อคำถามเอ่ยชื่อช่วงเวลาชัดเจน",
	AIToolGetSalesTrend: "เทียบยอดขาย 7 วันล่าสุดกับ 7 วันก่อนหน้า พร้อมเปอร์เซ็นต์ที่เปลี่ยน " +
		"ใช้ตอบ: ยอดขายดีขึ้นหรือแย่ลง เทียบอาทิตย์ก่อนเป็นไง ทำไมยอดตก ทำไมยอดขึ้น",
	AIToolGetAverageOrderValue: "ยอดขายเฉลี่ยต่อหนึ่งออเดอร์ " +
		"ใช้ตอบ: ลูกค้าจ่ายเฉลี่ยคนละเท่าไหร่ ยอดต่อบิลเท่าไหร่",
	AIToolGetOrderTypeBreakdown: "แยกยอดขายและจำนวนออเดอร์ตามประเภท กินที่ร้าน สั่งกลับ เดลิเวอรี " +
		"ใช้ตอบ: ขายหน้าร้านหรือสั่งกลับมากกว่ากัน",
	AIToolGetPeakPeriods: "วันในสัปดาห์และชั่วโมงที่มีออเดอร์มากที่สุด " +
		"ใช้ตอบ: ช่วงไหนคนเยอะ วันไหนขายดี ควรจัดคนช่วงไหน",

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
	joyboyToolMenuForPeriod: "เมนูพร้อมยอดขาย จำนวนจาน กำไร และ margin ของ \"ช่วงเวลาที่ระบุ\" " +
		"เช่น เดือนนี้ เดือนที่แล้ว เดือนกรกฎาคม ปีนี้ ไม่ใช่ 30 วันล่าสุด " +
		"ใช้ตอบเฉพาะเมื่อคำถามเอ่ยชื่อเดือนหรือปีชัดเจน เช่น เมนูขายดีเดือนที่แล้ว " +
		"เมนูกำไรดีสุดเดือนกรกฎาคม ยอดแต่ละเมนูปีนี้ " +
		"ถ้าคำถามไม่เอ่ยช่วงเวลา ให้ใช้ get_top_selling_menus หรือ get_highest_margin_menu (30 วัน) แทน",
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
		AIToolGetProfitSummary,
	}},
	{"วัตถุดิบและสต๊อก", []AIToolName{
		AIToolGetLowStockIngredients, AIToolGetIngredientReorderForecast, AIToolGetDeadStock,
		AIToolGetTopCostIngredients, AIToolGetInventoryValuation,
	}},
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
