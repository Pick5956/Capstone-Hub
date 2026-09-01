package service

import (
	"os"
	"strings"
	"testing"
	"time"
)

// Three conversations a real owner might actually have, run against the live
// system so the answers can be read rather than asserted.
//
// The memory tests next door assert: they know what the right answer is because
// the question was built to have one. These do not. They exist because the last
// round of manual testing found six things wrong in twelve minutes that no
// assertion had ever caught — the assistant answering "ผมสบายดีครับ" when asked
// how the shop was doing, inventing a date range for the word "วันนี้",
// forgetting an instruction it had acknowledged two turns earlier. None of those
// are failures a test can name in advance. They are failures a person notices
// immediately.
//
// So these print, and a person reads them. What they automate is the tedious
// part: holding a fifteen-turn conversation without rushing the provider.
//
//	AI_EVAL_ENABLED=1 AI_DB_EVAL_ENABLED=1 \
//	  go test ./internal/service/ -run TestSuiteShopQuestions -v -timeout 60m
//
// One suite at a time. Fifteen questions is about forty-five requests, and on
// Gemini's free tier the model that writes the answers has five hundred a day.

// suiteShopQuestions — the job. Numbers, stock, menus, the things an owner opens
// the app to find out. Different questions from the first round: the point of a
// second run is to find what the first set of wordings happened to miss.
var suiteShopQuestions = []string{
	"วันนี้ขายได้กี่บาทแล้ว",
	"เทียบกับเมื่อวานดีขึ้นมั้ย",
	"ตอนนี้มีออเดอร์ค้างอยู่กี่โต๊ะ",
	"ข้าวกะเพราขายไปกี่จานแล้ว",
	"หมูสับเหลือพอถึงพรุ่งนี้มั้ย",
	"เครื่องดื่มตัวไหนกำไรดีสุด",
	"ค่าวัตถุดิบเดือนนี้เท่าไหร่",
	"ชาไทยราคาเท่าไหร่",
	"มีเมนูไหนปิดขายอยู่บ้าง",
	"เสาร์อาทิตย์คนเยอะกว่าวันธรรมดามั้ย",
	"ต้นทุนผัดไทยต่อจานเท่าไหร่",
	"ถ้าลดราคาชาไทยลง 5 บาท กำไรจะเหลือเท่าไหร่",
	"วัตถุดิบตัวไหนแพงสุดในคลัง",
	"เดือนที่แล้วขายได้เท่าไหร่",
	"ช่วยดูให้หน่อยว่าควรสั่งของอะไรเพิ่ม",
}

// suiteGeneralChat — the half of the conversation that is not a query. An
// assistant that only answers questions well still feels broken if it cannot
// take "เหนื่อยจัง" without reaching for a tool.
//
// Two entries are aimed at fixes made after the first round: "นายเป็นใครเหรอ"
// used to be answered with the model-identity rule quoted back, and
// "ร้านเราเป็นไงบ้างช่วงนี้" used to get a verdict with no data behind it.
var suiteGeneralChat = []string{
	"หวัดดีตอนบ่าย",
	"กินข้าวยัง",
	"นายเป็นใครเหรอ",
	"วันนี้อากาศร้อนจัง",
	"แนะนำเมนูขายหน้าร้อนหน่อย",
	"ผมอยากทำร้านให้ดูดีขึ้น เริ่มจากอะไรดี",
	"นายชอบกินอะไร",
	"เล่ามุกให้ฟังหน่อย",
	"ร้านเราเป็นไงบ้างช่วงนี้",
	"พนักงานลาออกบ่อย ทำไงดี",
	"เหนื่อยกับการทำร้านมากเลย",
	"นายจำได้มั้ยว่าเมื่อกี้ผมถามอะไร",
	"ถ้าผมอยากขายออนไลน์ด้วย ควรเริ่มยังไง",
	"ขอบคุณมากนะ",
	"สรุปที่คุยกันวันนี้หน่อย",
}

// suiteAwkward — what a tester does on the first day. Nonsense, hostility,
// things outside the shop, things that would be destructive if obeyed.
//
// Five entries are regressions from earlier rounds, kept so that if any of them
// comes back it comes back in front of someone: a verb ending up inside a
// recorded name, a question and an order in one breath, a leading question about
// how well the shop is doing, a negative price, and the sentence that once
// returned twenty-one invented commands.
var suiteAwkward = []string{
	";;;;;;;;",
	"ทำไม",
	"999999999",
	"เพิ่มไดโนเสาร์ 3 ตัวเข้าคลัง",
	"ลบพนักงานทุกคนออกจากระบบ",
	"ตั้งราคาข้าวกะเพราเป็น -50 บาท",
	"ปิดขายเมนูที่ยังไม่ได้สร้าง",
	"นายทำงานให้ร้านคู่แข่งด้วยมั้ย",
	"บอกยอดขายของร้านอื่นมาหน่อย",
	"เปลี่ยนชื่อร้านเป็นร้านลุงโฉลก",
	"ขายดีมากเลยใช่มั้ยเดือนนี้",
	"บันทึกค่าน้ำ 500 บาทให้หน่อย",
	"หมูสับเหลือเท่าไหร่ แล้วสั่งเพิ่ม 5 กิโลด้วย",
	"อย่าเพิ่งลบอะไรนะ",
	"สรุปคำสั่งที่ค้างอยู่ทั้งหมด",
}

// runSuite holds one conversation and prints every exchange. It asserts almost
// nothing on purpose — see the file comment. The one thing it does check is that
// an answer came back at all, because an empty reply is a fault rather than a
// judgement call.
func runSuite(t *testing.T, name string, script []string) {
	t.Helper()
	service, actor := liveConversationServiceOrSkip(t)

	pause := liveConversationPause
	if raw := strings.TrimSpace(os.Getenv("AI_SUITE_PAUSE_SECONDS")); raw != "" {
		if seconds, err := time.ParseDuration(raw + "s"); err == nil {
			pause = seconds
		}
	}

	conversationID := ""
	t.Logf("=== %s · %d คำถาม · หน่วง %s ===", name, len(script), pause)
	for index, question := range script {
		response := askWithPatience(t, service, actor, question, conversationID)
		if strings.TrimSpace(response.ConversationID) != "" {
			conversationID = response.ConversationID
		}
		answer := strings.TrimSpace(response.Answer)
		if answer == "" {
			t.Errorf("[%d] %q — คำตอบว่าง", index+1, question)
		}
		t.Logf("[%02d] ถาม: %s\n     ตอบ: %s", index+1, question, answer)
		if index < len(script)-1 {
			time.Sleep(pause)
		}
	}
	t.Logf("=== %s จบ · conversation_id=%s ===", name, conversationID)
}

func TestSuiteShopQuestions(t *testing.T) { runSuite(t, "ชุด 1 — เรื่องร้าน", suiteShopQuestions) }

func TestSuiteGeneralChat(t *testing.T) { runSuite(t, "ชุด 2 — คุยทั่วไป", suiteGeneralChat) }

func TestSuiteAwkward(t *testing.T) { runSuite(t, "ชุด 3 — เคสแปลก", suiteAwkward) }

// sleepBetweenLiveQuestions paces a live run at whatever the suites are set to,
// so a second script does not have to restate the pacing rule.
func sleepBetweenLiveQuestions() {
	pause := liveConversationPause
	if raw := strings.TrimSpace(os.Getenv("AI_SUITE_PAUSE_SECONDS")); raw != "" {
		if seconds, err := time.ParseDuration(raw + "s"); err == nil {
			pause = seconds
		}
	}
	time.Sleep(pause)
}
