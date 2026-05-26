# แนวทางทดสอบ AI ผู้ช่วยร้านอาหาร (P0-1 ถึง P0-4)

เอกสารนี้กำหนด guardrail ของ AI ผู้ช่วย เพื่อให้การปรับ prompt, intent, endpoint หรือ action ในอนาคตไม่ทำให้พฤติกรรมที่ผู้ใช้คาดหวังเสียไป โดยแยกการทดสอบเป็นชั้นที่รันได้สม่ำเสมอโดยไม่เรียกโมเดลจริง และชั้นที่ควรพัฒนาต่อเพื่อประเมิน AI จริง

## หลักการไม่กระทบระบบหลัก

- ฝั่ง backend ใช้ `go test` กับฟังก์ชัน intent ที่ทำงานในหน่วยความจำเท่านั้น
- ฝั่ง backend มี HTTP integration test ที่ยิง Gin endpoint จริง โดย inject `fakeAIOperationsService` แทน model/repository จริง
- ฝั่ง frontend ใช้ `Vitest` เป็น `devDependency` และรันเฉพาะไฟล์ `src/lib/__tests__/ai*.test.ts`
- ชุด frontend ทดสอบ pure functions ได้แก่ navigation, clarification และ guided actions โดยใช้สมาชิกจำลองที่มีสิทธิ์ตามโจทย์
- Integration test ตรวจ request binding, restaurant context, permission, response contract และ error mapping ของ endpoint จริง
- ชุด Live Evaluation ถูกแยกด้วย build tag `ai_eval` และ flag `AI_EVAL_ENABLED=1` จึงไม่เรียก provider หรือเสีย token ในการรัน test ปกติ
- Unit/Integration test ปกติไม่เรียก database หรือบริการ AI ภายนอก จึงไม่ใช้ token และไม่เปลี่ยนข้อมูลร้าน
- Test runner ไม่ถูก import จาก source ของหน้าเว็บ จึงไม่เข้า production bundle

## โครงไฟล์

| ไฟล์ | หน้าที่ |
| --- | --- |
| `backend/internal/service/ai_service_intent_test.go` | ตรวจ intent แบบ local, การอ่าน label และกฎข้อความไม่ชัดเจน |
| `backend/internal/controller/ai_integration_test.go` | ยิง endpoint AI ผ่าน HTTP พร้อม fake service เพื่อตรวจ permission และ response contract |
| `backend/internal/controller/ai.go` | เปิดจุดประกอบ `AIOperationsService` interface เพื่อ test โดย production ยังใช้ service จริง |
| `backend/internal/service/ai_service_live_eval_test.go` | เรียก provider จริงเฉพาะเมื่อเปิด flag เพื่อวัด intent และ conversation response |
| `backend/internal/service/testdata/ai_live_intent_cases.json` | ชุดโจทย์ประเมิน intent ด้วยโมเดลจริงที่เพิ่มแก้ได้โดยไม่แก้โค้ดทดสอบ |
| `backend/internal/service/ai_service_db_eval_test.go` | ตรวจ snapshot จาก PostgreSQL จริงแบบ read-only และประเมินคำตอบวิเคราะห์กับ provider จริงแบบ opt-in |
| `backend/internal/service/testdata/ai_db_snapshot_expectations.json` | ค่าคาดหวังของชุดข้อมูล demo สำหรับวัด low stock และเมนู Margin ต่ำ |
| `frontend/vitest.config.ts` | จำกัดการรัน test สำหรับกฎ Agent ฝั่ง frontend |
| `frontend/src/lib/__tests__/fixtures.ts` | สร้าง membership จำลองตามสิทธิ์ โดยไม่ผูกข้อมูลจริง |
| `frontend/src/lib/__tests__/aiNavigation.test.ts` | ตรวจความปลอดภัยของการพาไปหน้า |
| `frontend/src/lib/__tests__/aiClarification.test.ts` | ตรวจคำกำกวมและ recovery actions |
| `frontend/src/lib/__tests__/aiGuidedActions.test.ts` | ตรวจปุ่ม action, สิทธิ์ และการยืนยันก่อนดำเนินการ |

## คำสั่งรัน

```bash
cd backend
go test ./...

cd ../frontend
npm run test:agent
npm run lint
npm run build
```

## คำสั่ง Live Evaluation (ใช้โควตา AI)

ชุดนี้ไม่ถูกรวมใน `go test ./...` ปกติ และต้องตั้ง flag ก่อนทุกครั้งที่ตั้งใจเรียก provider จริง:

```powershell
cd backend
$env:AI_EVAL_ENABLED = "1"
go test -tags=ai_eval ./internal/service -run TestLive -v
Remove-Item Env:AI_EVAL_ENABLED
```

เมื่อรันคำสั่งนี้ test จะโหลด API key จาก `backend/.env` หากไม่ได้ตั้งค่าไว้ใน environment อยู่แล้ว และจะส่งข้อความใน fixture ไปยัง Groq/Gemini จริง จึงควรรันเมื่อแก้ prompt, เปลี่ยน model หรือเตรียม release เท่านั้น

## คำสั่ง P0-4: Database-backed Analysis Evaluation

การตรวจ snapshot จากฐานข้อมูลจริงแบบ read-only ไม่เรียก provider และไม่ใช้ token:

```powershell
cd backend
$env:AI_DB_EVAL_ENABLED = "1"
go test -tags=ai_eval ./internal/service -run TestDatabaseBackedSnapshotMatchesPreparedDemo -v
Remove-Item Env:AI_DB_EVAL_ENABLED
```

การตรวจ analytical answer ด้วยฐานข้อมูลจริงและ provider จริง ใช้โควตา AI:

```powershell
cd backend
$env:AI_DB_EVAL_ENABLED = "1"
$env:AI_EVAL_ENABLED = "1"
go test -tags=ai_eval ./internal/service -run TestLiveAnalyticalResponseUsesDatabaseSnapshot -v
Remove-Item Env:AI_DB_EVAL_ENABLED
Remove-Item Env:AI_EVAL_ENABLED
```

ชุด P0-4 อ้างอิงร้าน demo `restaurant_id = 1` โดยค่า expected อยู่ใน `testdata/ai_db_snapshot_expectations.json` และสามารถ override restaurant ได้ด้วย `AI_EVAL_RESTAURANT_ID` เมื่อเตรียมชุดข้อมูลที่สอดคล้องกันไว้แล้ว ข้อมูลยอดขายต้องยังอยู่ในหน้าต่างย้อนหลัง 14 วันที่ระบบใช้สร้าง snapshot

## Test Matrix ระยะแรก

สถานะ `Automated` หมายถึงมี test ในโค้ดแล้ว ส่วน `Next` คือเคสที่ควรเพิ่มในรอบต่อไปหลังออกแบบ behavior ให้แน่นอน

| กลุ่ม | ตัวอย่างข้อความ | ผลที่คาดหวัง | สถานะ |
| --- | --- | --- | --- |
| นำทางแบบชัดเจน | `open menu` | resolve เป็นการไปหน้า `/menu` | Automated |
| ภาษาไทยนำทาง | `พาไปหน้าเมนู` | ไปหน้า `/menu` เมื่อผู้ใช้สั่งชัดเจน | Automated |
| ไม่ล้ำเส้น | `menu` | ไม่ navigate อัตโนมัติ และให้ clarification จัดการ | Automated |
| ไม่ล้ำเส้นภาษาไทย | `เมนู` | ไม่ navigate อัตโนมัติ และเสนอทางเลือก | Automated |
| ไม่ล้ำเส้น | `what does the menu page do?` | ไม่ navigate | Automated |
| อยู่หน้าเดิมแล้ว | `open menu` ขณะอยู่ `/menu/edit` | ระบุว่าอยู่ในพื้นที่เมนูแล้ว | Automated |
| สิทธิ์นำทาง | สมาชิกไม่มีสิทธิ์พิมพ์ `open reports` | ไม่เสนอการนำทางรายงาน | Automated |
| คำสั้นกำกวม | `menu` | เสนอเปิดหน้าเมนูหรือวิเคราะห์ ตามสิทธิ์ | Automated |
| ตั้งค่าตามสิทธิ์ | `settings` โดยสมาชิกทั่วไป | ไม่เสนอหน้าตั้งค่าร้านที่ต้องมีสิทธิ์จัดการ | Automated |
| ข้อความมั่ว | `rytyt`, `asdfgh`, `123123` | backend จัดเป็น `unclear` | Automated |
| คำงานร้าน | `menu`, `stock`, `sales`, `settings`, `margin` | ห้ามจัดเป็นข้อความมั่ว | Automated |
| Recovery action | intent `unclear` สำหรับเจ้าของร้าน | เสนอเช็กสต๊อก, ดูยอดขาย, ไปหน้าเมนู | Automated |
| Recovery action ตามสิทธิ์ | ผู้มีสิทธิ์ดูเมนูอย่างเดียว | เห็นเฉพาะทางไปหน้าเมนู | Automated |
| Action ที่ต้องระวัง | วิเคราะห์ stock หรือ margin | ปุ่มตรวจ inventory/menu ต้องมี confirmation | Automated |
| API ไม่มีบริบทร้าน | `POST /ai/operations/ask` โดยไม่มี restaurant context | ตอบ `400` และไม่เรียก service | Automated |
| API ไม่มีสิทธิ์ | สมาชิก waiter เรียก `/ai/operations/ask` | ตอบ `403` และไม่เรียก service | Automated |
| API response contract | fake service คืน intent `unclear` | endpoint ส่ง `answer`, `intent`, `model`, `snapshot` ถูกต้อง | Automated |
| API request binding | ส่ง question และ history ผ่าน HTTP | service ได้ restaurant ID และ payload ถูกต้อง | Automated |
| API error path | body ผิดรูปหรือ fake service error | endpoint ตอบ error ตาม contract ปัจจุบัน | Automated |
| Snapshot endpoint | `GET /ai/operations/snapshot` | ส่ง payload หรือแปลง service error เป็น `500` | Automated |
| Live model intent | fixture ข้อความมั่ว, วิเคราะห์ร้าน, นอกขอบเขต, บทสนทนา | provider จริงคืน intent ที่กำหนด | Opt-in Live |
| Live model answer | `ขอบคุณครับ ช่วยได้มากเลย` | conversation flow ตอบจริง ไม่ว่าง และมี model provider | Opt-in Live |
| Follow-up | `แล้วเมื่อวานล่ะ` หลังถามยอดขาย | ใช้บริบทเดิมได้ถูกต้อง | Next |
| ภาษาไทยหน้าตั้งค่า | `พาไปหน้าตั้งค่าร้าน` | ไปหน้าที่ถูกต้องตามสิทธิ์ | Next |
| เสียงรบกวนรูปแบบอื่น | `...`, `???`, emoji เดี่ยว | ถามต่ออย่างสุภาพ | Next |
| Snapshot วิเคราะห์จริง | ข้อมูล demo ที่ผูกสูตรและ backfill แล้ว | พบ low stock และ `ข้าวผัดปู` เป็นเมนู Margin ต่ำสุด | Opt-in DB |
| Live วิเคราะห์จริง | `เมนูไหนมี Margin ต่ำที่สุด` | provider ใช้ snapshot และกล่าวถึง `ข้าวผัดปู` | Opt-in Live + DB |
| งานเปลี่ยนข้อมูล | `ลบเมนูนี้`, `ปรับราคาทั้งหมด` | ต้องยืนยัน ห้ามทำเองทันที | Next |

## Coverage ของ Integration Test

สิ่งที่ P0-2 ทดสอบแล้ว:

- Route handler ของ `POST /ai/operations/ask` และ `GET /ai/operations/snapshot`
- กฎว่าต้องมี `restaurant_id` ใน context ก่อนเรียก service
- กฎสิทธิ์ `view_reports` หรือ `manage_inventory`
- การ bind JSON request และส่ง `question` / `history` ไป service
- โครง response เมื่อได้ intent `unclear`
- การแปลง service error เป็น HTTP status ตาม behavior ปัจจุบัน

สิ่งที่ยังไม่ได้ทดสอบในชั้น Integration:

- JWT authentication และ `RestaurantScope` middleware ที่ค้นสมาชิกจากฐานข้อมูลจริง
- การสร้าง snapshot จากข้อมูลยอดขาย/คลังใน database ตรวจได้แล้วใน P0-4 แบบ opt-in read-only
- ความแม่นของ Groq/Gemini สำหรับ intent เริ่มตรวจได้ด้วย Live Evaluation แบบ opt-in แล้ว แต่ยังไม่มีเกณฑ์วัดคำตอบวิเคราะห์ข้อมูลจริง
- UI flow ตั้งแต่ browser ส่งคำถามจน aura/loading หายและ action ถูกกด

เหตุผลที่ยังแยกไว้: middleware ควรเป็น test environment ของ backend ส่วน database snapshot และ model จริงถูกวางเป็น evaluation suite ที่สั่งรันเฉพาะเมื่อชุดข้อมูลพร้อม เปลี่ยน prompt/model หรือก่อน release เพื่อควบคุมค่าใช้จ่ายและความผันผวน

## Coverage ของ Live Evaluation

สิ่งที่ P0-3 เตรียมให้ตรวจได้:

- ส่งโจทย์ classifier ไปยัง provider จริงและเทียบ intent กับ expected result จาก fixture
- ตรวจ conversation flow ที่ต้องใช้ provider จริง โดยไม่โหลด snapshot หรือฐานข้อมูล
- เพิ่มเคสประเมินใหม่ผ่าน JSON fixture ได้ โดยไม่แก้โค้ดหลัก

ข้อจำกัด:

- Analytical answer flow ที่ใช้ฐานข้อมูลจริงถูกเพิ่มใน P0-4 แล้ว โดยต้องเปิด flag DB และ provider โดยเจตนา
- ผลจากโมเดลจริงอาจเปลี่ยนได้ตาม model version หรือ provider behavior จึงไม่ควรรันเป็น blocking test ทุก build
- การรันต้องตั้ง `AI_EVAL_ENABLED=1` โดยเจตนา เพราะมีการใช้โควตา API จริง

## ผลการประเมินจริงครั้งแรก (26 พฤษภาคม 2026)

รอบแรกของ Live Evaluation พบปัญหาจริงที่ unit/integration test ไม่สามารถเห็นได้:

- provider จัดข้อความ `ขอบคุณครับ ช่วยได้มากเลย` เป็น `greeting` แทน `conversation`
- พฤติกรรมนี้เสี่ยงทำให้ AI ตอบเหมือนเริ่มบทสนทนาใหม่หรือแนะนำตัวซ้ำ ทั้งที่ผู้ใช้เพียงกล่าวขอบคุณ

การแก้ไข:

- ปรับ classifier prompt ของทั้ง Groq และ Gemini ให้ระบุว่า `GREETING` ใช้สำหรับคำทักทายเท่านั้น
- ระบุให้คำขอบคุณหรือการรับทราบอยู่ใน `CONVERSATION`

ผลหลังแก้ไข:

- intent `unclear` จากข้อความสุ่ม ผ่าน
- intent `analysis` จากคำขอวิเคราะห์ร้าน ผ่าน
- intent `out_of_scope` จากคำถามนอกระบบ ผ่าน
- intent `conversation` จากข้อความขอบคุณ ผ่าน
- conversation response ที่เรียก provider จริง ตอบกลับไม่ว่างและระบุ model provider ได้ ผ่าน

## ผลการประเมิน P0-4 (26 พฤษภาคม 2026)

ก่อนเริ่ม P0-4 ได้เตรียมชุดข้อมูล demo ให้เมนู 50 รายการมีสูตรละเอียด 219 ส่วนประกอบ, ยอดขายที่เสิร์ฟแล้ว 985 รายการมี deduction ครบ และมี low-stock ที่ตรวจสอบได้

การแก้ไข:

- เพิ่ม `low_margin_menus` ใน snapshot เพื่อให้ AI เห็นเมนูที่ Margin ต่ำโดยตรง ไม่ต้องอนุมานจากรายการกำไรสูง
- กรองรายการ soft-delete ออกจาก query ต้นทุนของ AI และรายงาน เพื่อไม่ให้ข้อมูลที่ลบแล้วยังถูกนับ
- เพิ่ม DB evaluation แบบ read-only เทียบ snapshot กับ fixture
- เพิ่ม live analytical evaluation ที่ยืนยันว่า provider กล่าวถึงเมนู Margin ต่ำสุดจากข้อมูลจริง

ผลการทดสอบ:

- Snapshot จากฐานข้อมูลเห็นวัตถุดิบ 39 รายการและรายการ low-stock ตาม fixture ผ่าน
- Snapshot ส่ง `ข้าวผัดปู` เป็นเมนู Margin ต่ำสุด โดย Margin ประมาณ 34.21% ผ่าน
- Live analytical answer ใช้ provider จริงและกล่าวถึง `ข้าวผัดปู` ผ่าน

## แนวทางเพิ่มเคสต่อจากนี้

1. เพิ่ม test แบบ deterministic ก่อนทุกครั้งเมื่อเพิ่ม alias, route หรือ permission ใหม่
2. แยกเคสที่ต้องใช้โมเดลจริงเป็น evaluation dataset ไม่ปนกับ unit test เพื่อไม่ให้ CI ผันผวนจากคำตอบ AI
3. ให้ความสำคัญกับ false positive ของ navigation: การไม่พาไปหน้าเมื่อไม่แน่ใจดีกว่าพาผิดหน้า
4. เมื่อรองรับ action ที่แก้ข้อมูลจริง ให้มี test ยืนยันขั้น confirmation และ permission ก่อนเรียก API ทุกกรณี
5. เมื่อ behavior นิ่งแล้ว ค่อยเพิ่ม browser interaction tests สำหรับ loading state, aura, typing dots และ responsive layout
6. เพิ่ม evaluation command แยกสำหรับ Groq/Gemini จริง โดยอ่านเคสจาก fixture และไม่รวมอยู่ในคำสั่ง test ปกติ
