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
