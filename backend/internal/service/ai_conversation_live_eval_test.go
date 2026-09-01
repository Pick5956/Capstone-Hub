package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"Project-M/internal/repository"
)

// A live conversation, run straight against the service.
//
// Every other way of testing the assistant's memory needed an HTTP call, which
// needed a login, which needed a password — and testing stalled for an afternoon
// because a throwaway token expired mid-run and the tool that minted them had
// been deleted as a security cleanup. The service does not need any of that: the
// conversation flow takes an actor made of two ids and a role, so a test can hold
// a real conversation with real tools against the real database, and read the
// stored memory back afterwards.
//
// It is off unless asked for, twice over, because it spends provider quota and
// writes turns into the conversation tables:
//
//	AI_EVAL_ENABLED=1 AI_DB_EVAL_ENABLED=1 AI_CONVERSATION_DIGEST_ENABLED=true \
//	  go test ./internal/service/ -run TestLiveConversationRemembersWhatWasDecided -v -timeout 60m
//
// Pace it. Groq's free tier limits tokens per minute, and a question here costs
// three calls; asking them back to back trips the limit and the failure looks
// like a broken assistant rather than a full bucket.
const (
	liveConversationPause   = 30 * time.Second
	liveConversationRetries = 6
)

func liveConversationServiceOrSkip(t *testing.T) (*AIService, AIActorContext) {
	t.Helper()
	if os.Getenv("AI_EVAL_ENABLED") != "1" || os.Getenv("AI_DB_EVAL_ENABLED") != "1" {
		t.Skip("set AI_EVAL_ENABLED=1 and AI_DB_EVAL_ENABLED=1 to hold a live conversation; it spends provider quota")
	}
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))

	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Skipf("live conversation enabled, but %s is not configured", key)
		}
	}
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Bangkok",
		os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"), os.Getenv("DB_PORT"))
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open evaluation database: %v", err)
	}
	pool, err := db.DB()
	if err != nil {
		t.Fatalf("open database pool: %v", err)
	}
	t.Cleanup(func() { _ = pool.Close() })

	// Built exactly the way ProvideAIController builds it. The first draft wired
	// only the repository and the conversation store, and the assistant answered
	// "ผมไม่ทราบว่ากะเพราเหลือเท่าไหร่ กรุณาแจ้งข้อมูลสต็อกให้ผมดู" — a question it
	// answers correctly over HTTP, because the ports it needed were nil here. A
	// harness that under-wires the system does not test the system; it tests a
	// cheaper one and reports the difference as a bug.
	service := ProvideAIServiceWithStores(
		repository.NewAIRepository(db),
		repository.NewAIConversationRepository(db),
		repository.NewAIActionPreviewRepository(db),
		repository.NewMenuRepository(db),
		repository.NewAIActionPlanRepository(db),
		ProvideIngredientService(repository.NewIngredientRepository(db)),
		ProvideMenuService(repository.NewMenuRepository(db)),
		ProvideExpenseService(repository.NewExpenseRepository(db)),
		ProvideTableService(repository.NewTableRepository(db)))
	if len(service.getGroqKeys()) == 0 && len(service.getGeminiKeys()) == 0 {
		t.Skip("live conversation enabled, but no provider key is configured")
	}

	restaurantID := uint(1)
	if raw := strings.TrimSpace(os.Getenv("AI_EVAL_RESTAURANT_ID")); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			t.Fatalf("parse AI_EVAL_RESTAURANT_ID: %v", err)
		}
		restaurantID = uint(parsed)
	}
	// The owner is read from the shop itself rather than configured: the whole
	// point of this file is that a test needs no credentials of its own.
	var ownerID uint
	if err := db.Raw("SELECT owner_id FROM restaurants WHERE id = ?", restaurantID).Scan(&ownerID).Error; err != nil || ownerID == 0 {
		t.Skipf("could not read the owner of restaurant %d: %v", restaurantID, err)
	}
	return service, AIActorContext{RestaurantID: restaurantID, OwnerUserID: ownerID, Role: "owner"}
}

// askWithPatience retries while the provider's per-minute bucket refills. A quota
// wait is not a test failure — treating it as one is what turns a rate limit into
// a phantom bug report.
func askWithPatience(t *testing.T, service *AIService, actor AIActorContext, question, conversationID string) *AIAskResponse {
	t.Helper()
	wait := 30 * time.Second
	for attempt := 0; attempt <= liveConversationRetries; attempt++ {
		response, err := service.AskOperationsForOwner(context.Background(), actor, &AIAskRequest{
			Question:       question,
			ConversationID: conversationID,
		})
		if err == nil {
			return response
		}
		if attempt == liveConversationRetries {
			t.Fatalf("ถาม %q ไม่สำเร็จหลังรอครบทุกรอบ: %v", question, err)
		}
		t.Logf("      ...ติดลิมิต รออีก %s แล้วลองใหม่ (%v)", wait, err)
		time.Sleep(wait)
		wait *= 2
	}
	return nil
}

// The question this whole memory feature exists to answer: after the opening
// turns have scrolled out of the verbatim window, does the assistant still know
// what the owner decided?
//
// The decision is stated in turn 2 and asked about in the last few turns, with
// enough unrelated traffic in between to push the opening off the window. If the
// answer still holds, memory reached past what the model can see directly.
func TestLiveConversationRemembersWhatWasDecided(t *testing.T) {
	service, actor := liveConversationServiceOrSkip(t)

	script := []string{
		"กะเพราเหลือเท่าไหร่",
		"ไม่ต้องสั่งเพิ่มนะ พรุ่งนี้ร้านปิด เดี๋ยวมะรืนค่อยสั่ง",
		"ผมสนใจกำไรมากกว่ายอดขายนะ ต่อไปบอกกำไรก่อน",
		"เมนูไหนกำไรดีสุด",
		"ชาไทยเย็นขายดีมั้ย",
		"โต๊ะว่างกี่โต๊ะ",
		"เมื่อวานขายได้เท่าไหร่",
		"เดือนนี้จ่ายค่าอะไรไปเยอะสุด",
		"ปวดหลังจัง ยืนทั้งวัน",
		"อาทิตย์หน้าน่าจะขายได้เท่าไหร่",
		"เมนูขายไม่ออกมีอะไรบ้าง",
		"มูลค่าสต๊อกตอนนี้เท่าไหร่",
		"ที่คุยเรื่องกะเพราไว้ตอนแรก ตกลงยังไงนะ",
		"แล้วที่ผมบอกว่าสนใจอะไรมากกว่ากัน จำได้มั้ย",
		"สรุปที่คุยกันทั้งหมดให้หน่อย",
	}

	conversationID := ""
	answers := make([]string, 0, len(script))
	for index, question := range script {
		response := askWithPatience(t, service, actor, question, conversationID)
		if strings.TrimSpace(response.ConversationID) != "" {
			conversationID = response.ConversationID
		}
		answers = append(answers, response.Answer)
		t.Logf("[%d] ถาม: %s\n     ตอบ: %s", index+1, question, response.Answer)
		if index < len(script)-1 {
			time.Sleep(liveConversationPause)
		}
	}

	// Turn 13 asks about a decision made in turn 2, eleven turns earlier.
	decision := answers[12]
	if !strings.Contains(decision, "ไม่") || !(strings.Contains(decision, "สั่ง") || strings.Contains(decision, "ปิด")) {
		t.Errorf("the assistant lost the decision made eleven turns earlier:\n%s", decision)
	}
	// Turn 14 asks about a preference stated in turn 3.
	preference := answers[13]
	if !strings.Contains(preference, "กำไร") {
		t.Errorf("the assistant lost the preference stated at the start:\n%s", preference)
	}

	// What was actually stored is the evidence that this came from memory rather
	// than from a lucky guess, so it is printed whether the assertions passed or
	// not — the digest is written by the model and judging it is a person's job.
	t.Logf("conversation_id=%s — บันทึกที่โมเดลเขียนอยู่ใน ai_conversations.state_json แถวนี้", conversationID)
}

// The second memory test, and the one that can actually fail.
//
// The first script asks about a decision using the words "ที่คุยเรื่องกะเพราไว้
// ตอนแรก" — which hands the model both the topic and the instruction to look
// back. Passing it proves the plumbing works. It does not prove the assistant
// would survive a real conversation, and a test written by the same person who
// tuned the prompts is exactly the test that quietly stops measuring anything.
//
// So this one removes the help, four ways:
//
//   1. The decision CHANGES. The owner says "order tomorrow" and then, five
//      turns later, "actually move it to Monday". Remembering the first answer
//      is now wrong. A digest that appends without revising will fail here, and
//      that is the single most likely way this feature breaks in real use.
//   2. The question that asks about it never names it — "ตัวที่ผมให้จดไว้" — so
//      the model has to know what was being talked about, not match a keyword.
//   3. One question asks about something that never happened. Confirming it is
//      a failure. A memory that says yes to everything is worse than none.
//   4. The preference is about HOW to answer, not what to answer, so obeying it
//      cannot be faked by quoting it back.
func TestLiveConversationSurvivesAChangeOfMind(t *testing.T) {
	service, actor := liveConversationServiceOrSkip(t)

	script := []string{
		"วันนี้ขายได้เท่าไหร่แล้ว",
		"หมูสับเหลือเท่าไหร่",
		"งั้นสั่งเพิ่มพรุ่งนี้เลย จดไว้ให้หน่อย",
		"เมนูไหนขายดีสุด",
		"อีกอย่าง ผมไม่ชอบอ่านตัวเลขเยอะ ๆ ต่อไปตอบสั้น ๆ พอนะ",
		"ตอนนี้โต๊ะเต็มมั้ย",
		"เออ เดี๋ยวก่อน ที่จะสั่งพรุ่งนี้ เลื่อนเป็นวันจันทร์แทน เจ้าประจำหยุด",
		"เดือนนี้จ่ายค่าอะไรไปบ้าง",
		"เหนื่อยว่ะ วันนี้คนเยอะกว่าปกติ",
		"ต้มยำกุ้งน้ำข้นต้นทุนเท่าไหร่",
		"แล้วตัวที่ผมให้จดไว้ ตกลงวันไหนนะ",
		"ผมเคยบอกอะไรไว้มั้ยเรื่องวิธีตอบของนาย",
		"เมื่อกี้เราคุยเรื่องเงินเดือนพนักงานกันใช่มั้ย",
		"สรุปสิ่งที่ผมสั่งไว้ทั้งหมดให้หน่อย",
	}

	conversationID := ""
	answers := make([]string, 0, len(script))
	for index, question := range script {
		response := askWithPatience(t, service, actor, question, conversationID)
		if strings.TrimSpace(response.ConversationID) != "" {
			conversationID = response.ConversationID
		}
		answers = append(answers, response.Answer)
		t.Logf("[%d] ถาม: %s\n     ตอบ: %s", index+1, question, response.Answer)
		if index < len(script)-1 {
			time.Sleep(liveConversationPause)
		}
	}

	// The one that matters. Turn 3 said tomorrow, turn 7 said Monday, and turn
	// 11 asks without naming the thing. Saying "พรุ่งนี้" here is not a smaller
	// mistake than saying nothing — it is an assistant confidently repeating an
	// instruction the owner cancelled.
	revised := answers[10]
	if !strings.Contains(revised, "จันทร์") {
		t.Errorf("the assistant did not carry the revised date:\n%s", revised)
	}
	if strings.Contains(revised, "พรุ่งนี้") {
		t.Errorf("the assistant repeated the cancelled date:\n%s", revised)
	}

	// Turn 12: the preference from turn 5, which is about form rather than
	// content and so cannot be answered from any tool.
	style := answers[11]
	if !strings.Contains(style, "สั้น") && !strings.Contains(style, "ตัวเลข") {
		t.Errorf("the assistant lost the instruction about how to answer:\n%s", style)
	}

	// Turn 13 is bait. Nothing in this conversation touched wages. Agreeing is
	// the failure mode that makes a remembering assistant untrustworthy, because
	// the owner has no way to tell an invented memory from a real one.
	bait := answers[12]
	agreed := strings.Contains(bait, "ใช่ครับ") || strings.Contains(bait, "ใช่ค่ะ") ||
		strings.Contains(bait, "ถูกต้องครับ") || strings.Contains(bait, "เราคุยกันเรื่องเงินเดือน")
	if agreed {
		t.Errorf("the assistant agreed to a conversation that never happened:\n%s", bait)
	}

	// Turn 14 should read as a list of what the owner decided, with the revised
	// date, and without wages.
	summary := answers[13]
	if !strings.Contains(summary, "จันทร์") {
		t.Errorf("the closing summary lost the revised date:\n%s", summary)
	}
	if strings.Contains(summary, "เงินเดือน") {
		t.Errorf("the closing summary invented a topic from the bait question:\n%s", summary)
	}

	t.Logf("conversation_id=%s — บันทึกที่โมเดลเขียนอยู่ใน ai_conversations.state_json แถวนี้", conversationID)
}

// A one-question smoke test, so a harness fault costs one call instead of
// fifteen. It exists because the first version of this file answered
// "ผมไม่ทราบว่ากะเพราเหลือเท่าไหร่" — not a model failure but a wiring one — and
// the full conversation had already spent quota proving nothing.
func TestLiveConversationHarnessIsWiredLikeTheApp(t *testing.T) {
	service, actor := liveConversationServiceOrSkip(t)
	response := askWithPatience(t, service, actor, "กะเพราเหลือเท่าไหร่", "")
	t.Logf("ตอบ: %s", response.Answer)
	if strings.Contains(response.Answer, "กรุณาแจ้ง") || strings.Contains(response.Answer, "ไม่ทราบ") {
		t.Fatalf("the assistant asked for data the system already holds — a port is missing:\n%s", response.Answer)
	}
}
