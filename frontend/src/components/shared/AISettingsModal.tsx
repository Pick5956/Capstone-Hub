"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, ChevronLeft, ChevronRight, Loader2, Settings2, SlidersHorizontal, Trash2, Wand2, X } from "lucide-react";
import {
  AI_ACTION_TYPES,
  deleteAllAIConversations,
  getAISettings,
  updateAISettings,
  type AIActionType,
  type AIInsightKind,
  type AISettingsPatch,
  type AISettingsView,
} from "@/src/lib/ai";
import { cacheOwnerTitle, useFollowUpsSetting } from "@/src/lib/aiPrefs";

// The assistant's settings, in sections.
//
// This began as one switch in a dialog with a one-item sidebar, and its copy
// named things the way the code does ("การลงมือทำ"). It is now three sections
// the way Claude's and ChatGPT's settings are laid out — what the assistant
// calls you, what it may change, what it tells you about — with every row a
// short name and one real example sentence. Switches save the moment they are
// flipped; there is no Save button to forget.
//
// Everything on screen has something real behind it. Rows that would have been
// switches for features that do not exist yet were cut rather than shown dead.

type SectionKey = "general" | "actions" | "notifications";

// The bell's five kinds are four rows: a sales drop and a sales rise are one
// thing to the owner ("ยอดขายเปลี่ยนผิดปกติ").
type InsightRow = { id: string; kinds: AIInsightKind[]; th: [string, string]; en: [string, string] };
const INSIGHT_ROWS: InsightRow[] = [
  { id: "ingredient_low", kinds: ["ingredient_low"], th: ["วัตถุดิบใกล้หมด", "เมื่อเหลือต่ำกว่าขั้นต่ำที่ตั้งไว้ของแต่ละตัว"], en: ["Ingredient running low", "When stock falls under the minimum you set"] },
  { id: "dead_stock", kinds: ["dead_stock"], th: ["ของค้างสต๊อก", "วัตถุดิบที่มีในคลังแต่ไม่ได้ใช้เลยใน 30 วัน"], en: ["Dead stock", "Ingredients on the shelf that nothing used in 30 days"] },
  { id: "sales_change", kinds: ["sales_drop", "sales_up"], th: ["ยอดขายเปลี่ยนผิดปกติ", "7 วันล่าสุดขึ้นหรือลงชัดเจนเมื่อเทียบกับ 7 วันก่อนหน้า"], en: ["Unusual sales change", "The last 7 days clearly up or down against the 7 before"] },
  { id: "plowhorse", kinds: ["plowhorse"], th: ["เมนูขายดีแต่กำไรน้อย", "จานที่สั่งบ่อยแต่ทำเงินให้ร้านน้อย ควรดูต้นทุนหรือราคา"], en: ["Popular but low-margin menu", "Ordered often, earns little — worth a look at cost or price"] },
];

type ActionRow = { type: AIActionType; group: "menu" | "ingredients" | "money"; th: [string, string]; en: [string, string] };
const ACTION_ROWS: ActionRow[] = [
  { type: "set_menu_availability", group: "menu", th: ["เปิด–ปิดขายเมนู", "“ปิดขายต้มยำกุ้งวันนี้”"], en: ["Open or close a menu item", "“Close Tom Yum Kung for today”"] },
  { type: "set_menu_price", group: "menu", th: ["เปลี่ยนราคาเมนู", "“ขึ้นราคาผัดไทยเป็น 95 บาท”"], en: ["Change a menu price", "“Raise Pad Thai to 95 baht”"] },
  { type: "adjust_ingredient_stock", group: "ingredients", th: ["ปรับจำนวนสต๊อก", "“รับหมูสับเข้ามา 5 กิโล”"], en: ["Adjust stock", "“Received 5 kg of minced pork”"] },
  { type: "set_ingredient_min_stock", group: "ingredients", th: ["ตั้งสต๊อกขั้นต่ำ", "“ตั้งขั้นต่ำกะเพราไว้ 2 กิโล”"], en: ["Set a minimum stock", "“Set holy basil minimum to 2 kg”"] },
  { type: "set_ingredient_cost", group: "ingredients", th: ["ตั้งต้นทุนต่อหน่วย", "“ไข่ไก่ตอนนี้ฟองละ 4.50”"], en: ["Set a unit cost", "“Eggs are 4.50 each now”"] },
  { type: "create_ingredient", group: "ingredients", th: ["เพิ่มวัตถุดิบใหม่", "“เพิ่มวัตถุดิบ เห็ดออรินจิ หน่วยเป็นกิโล”"], en: ["Add a new ingredient", "“Add king oyster mushroom, in kg”"] },
  { type: "create_expense", group: "money", th: ["บันทึกรายจ่าย", "“จ่ายค่าแก๊สไป 1,200” หรือถ่ายรูปใบเสร็จส่งให้"], en: ["Record an expense", "“Paid 1,200 for gas”, or send a receipt photo"] },
];

function copy(language: "th" | "en") {
  return language === "th"
    ? {
        settings: "ตั้งค่าผู้ช่วย",
        close: "ปิด",
        back: "กลับ",
        saved: "บันทึกแล้ว",
        saving: "กำลังบันทึก",
        loadError: "โหลดการตั้งค่าไม่สำเร็จ",
        saveError: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
        sections: {
          general: { name: "ทั่วไป", blurb: "ชื่อที่เรียกคุณ · คำถามแนะนำ · ประวัติแชท", subtitle: "ผู้ช่วยเรียกคุณว่าอะไร และเสนออะไรเพิ่มหลังคำตอบ" },
          actions: { name: "สิ่งที่ทำแทนคุณได้", blurb: "เลือกได้ทีละอย่างว่าให้แก้อะไรได้บ้าง", subtitle: "เลือกว่าให้ผู้ช่วยช่วยแก้ข้อมูลร้านเรื่องไหนได้บ้าง ทุกครั้งจะรอคุณกดยืนยันก่อนเสมอ" },
          notifications: { name: "การแจ้งเตือน", blurb: "ของใกล้หมด · ของค้าง · ยอดขายผิดปกติ", subtitle: "เรื่องที่ผู้ช่วยจะเตือนคุณเอง โดยไม่ต้องรอให้ถาม" },
        },
        groupAnswers: "การตอบ",
        titleLabel: "ชื่อที่ผู้ช่วยใช้เรียกคุณ",
        titleHint: "ใช้ตอนทักทายและในคำตอบ เว้นว่างไว้ = “คุณผู้จัดการ”",
        titlePlaceholder: "คุณผู้จัดการ",
        followUps: "คำถามแนะนำใต้คำตอบ",
        followUpsHint: "เสนอคำถามต่อยอด 2–3 ข้อหลังแต่ละคำตอบ (เฉพาะเครื่องนี้)",
        groupHistory: "ประวัติแชท",
        memoryNote: "ผู้ช่วยจำเรื่องที่คุยไว้ 7 วันนับจากข้อความล่าสุด กด “เริ่มแชทใหม่” เมื่อไหร่ก็ลืมเส้นนั้น",
        clearAll: "ล้างประวัติแชททั้งหมด",
        clearAllHint: "ลบทุกบทสนทนาและสิ่งที่ผู้ช่วยจำไว้ ย้อนกลับไม่ได้",
        clearButton: "ล้างประวัติ…",
        clearConfirm: "ลบทั้งหมดเลย",
        clearCancel: "ไม่ลบ",
        cleared: "ลบแล้ว",
        master: "ให้ผู้ช่วยแก้ข้อมูลร้านได้",
        masterHint: "ปิดสวิตช์นี้ = ผู้ช่วยดูข้อมูลได้อย่างเดียว รายการข้างล่างจะไม่มีผล",
        unavailable: "ตอนนี้ความสามารถนี้ถูกปิดจากระบบส่วนกลาง เปิดสวิตช์ไว้ได้ แต่จะยังไม่มีผลจนกว่าระบบจะเปิดให้",
        groupMenu: "เมนู",
        groupIngredients: "วัตถุดิบ",
        groupMoney: "การเงิน",
        example: "เช่น",
        confirmNote: "ทุกคำสั่งจะถูกเตรียมเป็นรายการให้ดูก่อน อยู่ได้ 1 นาที ถ้าไม่กดยืนยันจะถูกยกเลิกเอง · กดยืนยันได้เฉพาะเจ้าของร้าน",
        groupStock: "วัตถุดิบ",
        groupSales: "ยอดขายและเมนู",
        bellNote: "การแจ้งเตือนขึ้นที่กระดิ่งมุมขวาบนตอนเปิดแอป ยังไม่มีการส่งออกไปนอกแอป",
      }
    : {
        settings: "Assistant settings",
        close: "Close",
        back: "Back",
        saved: "Saved",
        saving: "Saving",
        loadError: "Could not load settings",
        saveError: "Could not save, try again",
        sections: {
          general: { name: "General", blurb: "What it calls you · suggestions · chat history", subtitle: "What the assistant calls you, and what it offers after an answer" },
          actions: { name: "What it can do for you", blurb: "Choose, one by one, what it may change", subtitle: "Choose which shop data the assistant may change. Every change waits for your confirmation." },
          notifications: { name: "Notifications", blurb: "Low stock · dead stock · unusual sales", subtitle: "Things the assistant tells you about without being asked" },
        },
        groupAnswers: "Answers",
        titleLabel: "What the assistant calls you",
        titleHint: "Used in greetings and answers. Leave empty for “Manager”",
        titlePlaceholder: "Manager",
        followUps: "Follow-up suggestions under answers",
        followUpsHint: "Offer 2–3 next questions after each answer (this device only)",
        groupHistory: "Chat history",
        memoryNote: "The assistant remembers a thread for 7 days after its last message. “New chat” forgets that thread.",
        clearAll: "Clear all chat history",
        clearAllHint: "Deletes every conversation and everything the assistant remembers. Cannot be undone.",
        clearButton: "Clear…",
        clearConfirm: "Delete everything",
        clearCancel: "Keep",
        cleared: "Deleted",
        master: "Let the assistant change shop data",
        masterHint: "Off = the assistant only reads. Nothing below applies.",
        unavailable: "This capability is currently off system-wide. You can leave the switch on, but it takes effect only once the system enables it.",
        groupMenu: "Menu",
        groupIngredients: "Ingredients",
        groupMoney: "Money",
        example: "e.g.",
        confirmNote: "Every command is prepared as a list for you to check first. It lasts 1 minute and cancels itself if not confirmed · only the owner can confirm",
        groupStock: "Ingredients",
        groupSales: "Sales and menu",
        bellNote: "Notifications appear on the bell at the top right when the app is open. Nothing is sent outside the app yet.",
      };
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-700"
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-1 py-3 first:border-t-0 dark:border-gray-800">
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-[18px] text-gray-800 dark:text-gray-100">{label}</p>
        {hint ? <p className="mt-0.5 text-[11.5px] leading-4 text-gray-500 dark:text-gray-400">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">{title}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[10px] bg-gray-50 px-3 py-2.5 text-[11.5px] leading-[17px] text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">{children}</p>
  );
}

const SECTION_ICONS: Record<SectionKey, typeof Wand2> = { general: SlidersHorizontal, actions: Wand2, notifications: Bell };
const SECTION_ORDER: SectionKey[] = ["general", "actions", "notifications"];

export default function AISettingsModal({
  open,
  onClose,
  language,
  onConversationsCleared,
}: {
  open: boolean;
  onClose: () => void;
  language: "th" | "en";
  /** Called after the owner clears every conversation, so the open chat resets too. */
  onConversationsCleared?: () => void;
}) {
  const t = copy(language);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<AISettingsView | null>(null);
  // "saving" and "saved" are shown by the header for a moment after each change.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedTimer = useRef<number | null>(null);

  // Desktop shows the sidebar and one section; a phone shows the section list
  // first and drills in. One piece of state serves both: on desktop it is
  // always a section, on a phone null means "the list".
  const [section, setSection] = useState<SectionKey | null>("actions");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [followUps, setFollowUps] = useFollowUpsSetting();
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    setConfirmClear(false);
    setClearedCount(null);
    setMobileOpen(false);
    getAISettings()
      .then((res) => {
        setView(res.data);
        setTitleDraft(res.data.owner_title === t.titlePlaceholder ? "" : res.data.owner_title);
        cacheOwnerTitle(res.data.owner_title === t.titlePlaceholder ? "" : res.data.owner_title);
      })
      .catch(() => setError(t.loadError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
  }, []);

  if (!open || typeof document === "undefined") return null;

  // Every switch saves on its own. The screen updates first and the request
  // follows; on failure the previous view comes back and the header says so.
  const apply = async (patch: AISettingsPatch, optimistic: (current: AISettingsView) => AISettingsView) => {
    if (!view) return;
    const previous = view;
    setView(optimistic(view));
    setSaveState("saving");
    try {
      const res = await updateAISettings(patch);
      setView(res.data);
      if (patch.owner_title !== undefined) {
        cacheOwnerTitle(res.data.owner_title === t.titlePlaceholder ? "" : res.data.owner_title);
      }
      setSaveState("saved");
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaveState("idle"), 1600);
    } catch {
      setView(previous);
      setSaveState("error");
    }
  };

  const commitTitle = () => {
    if (!view) return;
    const next = titleDraft.trim();
    const current = view.owner_title === t.titlePlaceholder ? "" : view.owner_title;
    if (next === current) return;
    void apply({ owner_title: next }, (v) => ({ ...v, owner_title: next || t.titlePlaceholder }));
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      const res = await deleteAllAIConversations();
      setClearedCount(res.data.deleted);
      setConfirmClear(false);
      onConversationsCleared?.();
    } catch {
      setSaveState("error");
    } finally {
      setClearing(false);
    }
  };

  const actionsOn = Boolean(view?.actions_enabled);
  const activeSection: SectionKey = section ?? "actions";
  const SectionIcon = SECTION_ICONS[activeSection];

  const renderSection = () => {
    if (!view) return null;
    if (activeSection === "general") {
      return (
        <>
          <Group title={t.groupAnswers}>
            <Row label={t.titleLabel} hint={t.titleHint}>
              <input
                type="text"
                value={titleDraft}
                maxLength={40}
                placeholder={t.titlePlaceholder}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-8 w-44 shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </Row>
            <Row label={t.followUps} hint={t.followUpsHint}>
              <Switch on={followUps} onChange={setFollowUps} label={t.followUps} />
            </Row>
          </Group>
          <Group title={t.groupHistory}>
            <Row label={t.clearAll} hint={confirmClear ? undefined : t.clearAllHint}>
              {clearedCount !== null ? (
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> {t.cleared}
                </span>
              ) : confirmClear ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    disabled={clearing}
                    className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {t.clearCancel}
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={clearing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[12.5px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {t.clearConfirm}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="h-8 shrink-0 rounded-lg border border-red-200 bg-white px-3 text-[12.5px] font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  {t.clearButton}
                </button>
              )}
            </Row>
          </Group>
          <Note>{t.memoryNote}</Note>
        </>
      );
    }
    if (activeSection === "actions") {
      const groups: { key: ActionRow["group"]; title: string }[] = [
        { key: "menu", title: t.groupMenu },
        { key: "ingredients", title: t.groupIngredients },
        { key: "money", title: t.groupMoney },
      ];
      return (
        <>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3.5 dark:border-orange-900/50 dark:bg-orange-950/25">
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-[18px] text-orange-900 dark:text-orange-200">{t.master}</p>
              <p className="mt-0.5 text-[11.5px] leading-4 text-orange-700 dark:text-orange-300/80">{t.masterHint}</p>
            </div>
            <Switch
              on={actionsOn}
              label={t.master}
              onChange={(next) => apply({ actions_enabled: next }, (v) => ({ ...v, actions_enabled: next }))}
            />
          </div>
          {!view.feature_available && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {t.unavailable}
            </p>
          )}
          {groups.map((group) => (
            <Group key={group.key} title={group.title}>
              {ACTION_ROWS.filter((row) => row.group === group.key).map((row) => {
                const [label, example] = language === "th" ? row.th : row.en;
                return (
                  <Row
                    key={row.type}
                    label={label}
                    hint={
                      <>
                        <span className="text-gray-400 dark:text-gray-500">{t.example}</span> {example}
                      </>
                    }
                  >
                    <Switch
                      on={view.action_types[row.type] !== false}
                      disabled={!actionsOn}
                      label={label}
                      onChange={(next) =>
                        apply({ action_types: { [row.type]: next } }, (v) => ({ ...v, action_types: { ...v.action_types, [row.type]: next } }))
                      }
                    />
                  </Row>
                );
              })}
            </Group>
          ))}
          <Note>{t.confirmNote}</Note>
        </>
      );
    }
    return (
      <>
        <Group title={t.groupStock}>
          {INSIGHT_ROWS.filter((row) => row.id === "ingredient_low" || row.id === "dead_stock").map((row) => renderInsightRow(row))}
        </Group>
        <Group title={t.groupSales}>
          {INSIGHT_ROWS.filter((row) => row.id === "sales_change" || row.id === "plowhorse").map((row) => renderInsightRow(row))}
        </Group>
        <Note>{t.bellNote}</Note>
      </>
    );
  };

  const renderInsightRow = (row: InsightRow) => {
    if (!view) return null;
    const [label, hint] = language === "th" ? row.th : row.en;
    const on = row.kinds.every((kind) => view.insight_kinds[kind] !== false);
    return (
      <Row key={row.id} label={label} hint={hint}>
        <Switch
          on={on}
          label={label}
          onChange={(next) => {
            const patch: Partial<Record<AIInsightKind, boolean>> = {};
            for (const kind of row.kinds) patch[kind] = next;
            void apply({ insight_kinds: patch }, (v) => ({ ...v, insight_kinds: { ...v.insight_kinds, ...patch } }));
          }}
        />
      </Row>
    );
  };

  const saveBadge =
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> {t.saving}</span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> {t.saved}</span>
    ) : saveState === "error" ? (
      <span className="text-[11px] text-red-500">{t.saveError}</span>
    ) : null;

  const sectionNav = (
    <>
      {SECTION_ORDER.map((key) => {
        const Icon = SECTION_ICONS[key];
        const active = key === activeSection;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
              active
                ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" /> {t.sections[key].name}
          </button>
        );
      })}
    </>
  );

  // Portalled to <body>. The AI page's root isolates its stacking context (for
  // the aura layers), so a dialog rendered inside it can never rise above the
  // phone's top bar no matter its z-index — on a phone the header with the
  // back button sat under that bar and the sheet could not be left.
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="flex h-full w-full overflow-hidden bg-white shadow-xl dark:bg-gray-950 sm:h-[560px] sm:max-h-[85vh] sm:max-w-3xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Desktop sidebar */}
        <aside className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/50 sm:flex">
          <p className="mb-2 flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <Settings2 className="h-3.5 w-3.5" /> {t.settings}
          </p>
          {sectionNav}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phone: the section list, until a section is opened */}
          {!mobileOpen && (
            <div className="flex min-h-0 flex-1 flex-col sm:hidden">
              <header className="flex items-center justify-between border-b border-gray-200 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] dark:border-gray-800">
                <h2 className="text-[17px] font-semibold text-gray-900 dark:text-white">{t.settings}</h2>
                <button onClick={onClose} aria-label={t.close} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-5 w-5" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-950">
                <div className="flex flex-col overflow-hidden rounded-[14px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  {SECTION_ORDER.map((key) => {
                    const Icon = SECTION_ICONS[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSection(key);
                          setMobileOpen(true);
                        }}
                        className="flex min-h-16 items-center gap-3.5 border-t border-gray-100 px-4 py-3 text-left first:border-t-0 active:bg-gray-50 dark:border-gray-800 dark:active:bg-gray-800"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium leading-5 text-gray-800 dark:text-gray-100">{t.sections[key].name}</span>
                          <span className="mt-0.5 block text-[12px] leading-4 text-gray-500 dark:text-gray-400">{t.sections[key].blurb}</span>
                        </span>
                        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-gray-300 dark:text-gray-600" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* The section itself: always on desktop, after a tap on a phone */}
          <div className={`${mobileOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col sm:flex`}>
            <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] dark:border-gray-800 sm:px-6 sm:pt-[18px]">
              <div className="flex min-w-0 items-start gap-2">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label={t.back}
                  className="-ml-1 mt-0.5 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 sm:hidden"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                    <SectionIcon className="h-4 w-4 text-orange-500 sm:hidden" />
                    {t.sections[activeSection].name}
                  </h2>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{t.sections[activeSection].subtitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {saveBadge}
                <button onClick={onClose} aria-label={t.close} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : error ? (
                <p className="text-sm text-red-500">{error}</p>
              ) : (
                renderSection()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
