import { can } from "@/src/lib/rbac";
import type { Membership } from "@/src/types/restaurant";
import type { AINavigation } from "@/src/types/ai";

export type AIGuidedAction = {
  id: string;
  href?: string;
  prompt?: string;
  label: string;
  description?: string;
  requiresConfirmation?: boolean;
};

type Topic = "inventory" | "menu" | "margin" | "sales" | "sales-volume" | "billing";

// TOOL_TOPICS maps the backend's structured tool name to the topics that drive
// the guided actions and follow-up chips. Deriving chips from the tool (not from
// the answer TEXT) keeps them stable across phrasings and immune to the answer
// occasionally mentioning an unrelated word — e.g. a price answer must never show
// sales-trend chips just because the prose happened to contain "ยอดขาย".
const TOOL_TOPICS: Record<string, Topic[]> = {
  get_most_expensive_menu: ["menu"],
  get_highest_margin_menu: ["menu", "margin"],
  get_lowest_margin_menu: ["menu", "margin"],
  get_lowest_cost_menu: ["menu", "margin"],
  get_menu_engineering: ["menu", "margin"],
  get_top_selling_menus: ["menu", "sales-volume"],
  get_menu_revenue_ranking: ["menu", "sales"],
  get_slow_moving_menus: ["menu"],
  get_sales_summary: ["sales"],
  get_sales_for_period: ["sales"],
  get_sales_trend: ["sales"],
  get_average_order_value: ["sales"],
  get_order_type_breakdown: ["sales"],
  get_peak_periods: ["sales"],
  get_store_summary: ["sales", "menu"],
  get_low_stock_ingredients: ["inventory"],
  get_inventory_valuation: ["inventory"],
  get_ingredient_reorder_forecast: ["inventory"],
  get_dead_stock: ["inventory"],
  get_top_cost_ingredients: ["inventory"],
  get_ingredient_detail: ["inventory"],
  // Added when the assistant grew these tools. A tool missing from this map used
  // to fall through to reading the answer prose, which is how a peak-hours reply
  // ended up offering "เมนูกำไรดีสุด": the word "ขายดี" appeared in the sentence.
  get_menu_detail: ["menu"],
  get_menu_list: ["menu"],
  get_menu_metrics_for_period: ["menu", "sales"],
  get_menu_profit_by_category: ["menu", "margin"],
  get_profit_summary: ["margin", "sales"],
  get_expense_summary: ["sales"],
  get_customer_count: ["sales"],
  get_cancelled_orders: ["sales"],
  get_payment_mix: ["sales", "billing"],
  get_sales_forecast: ["sales"],
  // Deliberately no topics: these answer about the shop itself or the floor
  // right now, and none of the topic chips ("เทียบสัปดาห์ก่อน", "เมนูกำไรดีสุด")
  // follow from them.
  get_shop_profile: [],
  get_table_status: [],
  get_active_orders: [],
  // One bill. Asked "โต๊ะ F01 สั่งอะไรไป" this fell through to reading the prose,
  // matched "ยอด" inside "ยอดสุทธิ", and offered "เทียบสัปดาห์ก่อน" under a list of
  // four dishes — a week of sales does not follow from one table's bill.
  get_order_detail: [],
  get_data_coverage: [],
  search_system_docs: [],
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

// topicsFromText is the fallback when there is no structured tool (a free-form
// LLM answer). It reads the question + answer for topic keywords.
function topicsFromText(text: string): Set<Topic> {
  const topics = new Set<Topic>();
  if (includesAny(text, ["stock", "inventory", "ingredient", "restock", "วัตถุดิบ", "สต๊อก", "คลัง", "เติม"])) topics.add("inventory");
  if (includesAny(text, ["margin", "profit", "กำไร", "มาร์จิ้น"])) topics.add("margin");
  if (includesAny(text, ["ขายดี", "ยอดนิยม", "top selling", "best selling", "popular", "สั่งบ่อย"])) topics.add("sales-volume");
  if (includesAny(text, ["menu", "เมนู", "จาน", "dish"])) topics.add("menu");
  if (includesAny(text, ["sales", "revenue", "ยอดขาย", "รายได้", "ยอด"])) topics.add("sales");
  if (includesAny(text, ["vat", "promptpay", "service charge", "คิดเงิน", "ภาษี", "พร้อมเพย์"])) topics.add("billing");
  return topics;
}

// canTopic gates a topic's chips behind the permission needed to act on it, so a
// member never sees a follow-up or shortcut they cannot use.
function canTopic(membership: Membership | null | undefined, topic: Topic): boolean {
  switch (topic) {
    case "inventory":
      return can(membership, "manage_inventory") || can(membership, "view_inventory");
    case "menu":
    case "margin":
      return can(membership, "manage_menu") || can(membership, "view_menu");
    case "sales":
    case "sales-volume":
      return can(membership, "view_reports");
    case "billing":
      return can(membership, "manage_restaurant_settings");
  }
}

// How many chips sit under one answer. The model writes three; a period pivot
// or two may come first when the backend flagged an assumed time window.
const MAX_ANSWER_CHIPS = 5;

/**
 * The chips under an answer. When the model wrote follow-ups (in the owner's
 * words, grounded in what it just said) those are the chips, verbatim — the
 * label is the prompt. The fixed tool-keyed list below is the fallback for an
 * answer without them, so no answer ever ends without a way forward.
 *
 * Period pivots stay in front either way: the backend knows for certain when
 * it assumed a time window, and resolving that is the most likely next tap.
 */
export function getAnswerChips(
  question: string,
  answer: string,
  membership: Membership | null | undefined,
  language: "th" | "en",
  tool?: string | string[],
  scopeAssumed?: boolean,
  followUps?: string[],
  navigate?: AINavigation | null,
): AIGuidedAction[] {
  // "Take me there" goes first: when an answer explained a page, going to
  // it is the most likely next tap, and it is the one chip that is a link.
  const go: AIGuidedAction[] = navigate?.href
    ? [{ id: "nav-answer", href: navigate.href, label: language === "th" ? `พาไปหน้า${navigate.label}` : `Go to ${navigate.label}` }]
    : [];
  const written = (followUps ?? []).map((text) => text.trim()).filter(Boolean);
  if (written.length === 0) {
    return [...go, ...getGuidedActions(question, answer, membership, language, tool, scopeAssumed)].slice(0, MAX_ANSWER_CHIPS);
  }
  const pivots = scopeAssumed
    ? getGuidedActions(question, answer, membership, language, tool, scopeAssumed).filter((action) => action.id.startsWith("fu-scope-"))
    : [];
  const chips = written.map((text, index) => ({ id: `fu-model-${index}`, label: text, prompt: text }));
  return [...go, ...pivots, ...chips].slice(0, MAX_ANSWER_CHIPS);
}

export function getGuidedActions(
  question: string,
  answer: string,
  membership: Membership | null | undefined,
  language: "th" | "en",
  tool?: string | string[],
  scopeAssumed?: boolean,
): AIGuidedAction[] {
  // Which tools actually produced the answer. The backend sends every one of
  // them; a single name is still accepted for the older callers.
  const used = (Array.isArray(tool) ? tool : tool ? [tool] : [])
    .map((name) => name.trim())
    .filter(Boolean);

  // No tool ran, so no shop data was read: this was a greeting, a chat reply, or
  // a refusal. Chips here are the "มั่ว" the owner complained about — every
  // answer wearing the same three buttons whether or not they follow from it.
  // The one exception is a period pivot, which the backend asks for explicitly.
  if (used.length === 0 && !scopeAssumed) return [];

  // Topics come from what was READ, never from how the answer was worded. Text
  // matching is the last resort, for an answer whose tool this map does not know.
  const topics = new Set<Topic>();
  let knownTool = false;
  for (const name of used) {
    const mapped = TOOL_TOPICS[name];
    if (!mapped) continue;
    knownTool = true;
    for (const topic of mapped) topics.add(topic);
  }
  if (!knownTool && used.length > 0) {
    for (const topic of topicsFromText(`${question} ${answer}`.toLowerCase())) topics.add(topic);
  }
  const has = (topic: Topic) => topics.has(topic) && canTopic(membership, topic);

  const actions: AIGuidedAction[] = [];
  const add = (action: AIGuidedAction) => {
    if (!actions.some((existing) => existing.id === action.id)) actions.push(action);
  };

  if (has("inventory")) {
    add({
      id: "review-inventory",
      href: "/inventory",
      label: language === "th" ? "ตรวจรายการในคลัง" : "Review inventory",
      description: language === "th"
        ? "ระบบจะเปิดหน้าคลังให้ตรวจสอบก่อนเท่านั้น ยังไม่มีการปรับจำนวนสต๊อกอัตโนมัติ"
        : "This opens inventory for review only. No stock quantities will be changed automatically.",
      requiresConfirmation: true,
    });
  }

  if (has("menu") || has("margin")) {
    add({
      id: "review-menu",
      href: "/menu",
      label: language === "th" ? "เปิดหน้าเมนูเพื่อตรวจสอบ" : "Review menu",
      description: language === "th"
        ? "เปิดรายการเมนูเพื่อดูสูตรและราคา ก่อนตัดสินใจปรับจริง"
        : "Open the menu list to review recipes and prices before making changes.",
      requiresConfirmation: true,
    });
  }

  if (has("billing")) {
    add({
      id: "restaurant-billing",
      href: "/settings/restaurant",
      label: language === "th" ? "เปิดการตั้งค่าร้าน" : "Open restaurant settings",
    });
  }

  if (can(membership, "view_reports") && (topics.has("sales") || topics.has("sales-volume") || topics.has("margin") || topics.has("inventory"))) {
    add({
      id: "open-report",
      href: "/reports",
      label: language === "th" ? "ดูรายงานเต็ม" : "View full report",
    });
  }

  // Follow-up question chips: clicking asks exactly the words on the chip. The
  // label IS the prompt — a chip that reads one thing and sends another makes
  // the answer look like it ignored the tap.
  const followUps: AIGuidedAction[] = [];
  const addFollowUp = (id: string, promptTh: string, promptEn: string) => {
    if (followUps.some((existing) => existing.id === id)) return;
    const prompt = language === "th" ? promptTh : promptEn;
    followUps.push({ id, label: prompt, prompt });
  };

  // The backend answered a scope-less metric question for its default window and
  // flagged it. Offer period pivots as the FIRST chips — that is the ambiguity the
  // user most likely wants to resolve — so they surface ahead of the topic chips
  // below and win the slice(0, 3) cut. The metric is read only to phrase the
  // re-ask prompt; the "was scope assumed?" decision stays the backend's.
  if (scopeAssumed) {
    const q = question.toLowerCase();
    const isQty = q.includes("กี่จาน") || q.includes("กี่ที่") || q.includes("จำนวนที่ขาย");
    const metric = isQty ? "จาน" : q.includes("กำไร") || q.includes("profit") ? "กำไร" : "ยอดขาย";
    // Re-ask the SAME metric scoped to the period. Dish-count phrasing needs its own
    // shape ("วันนี้ขายได้กี่จาน"); baht metrics take "<metric><period>เท่าไหร่".
    const mk = (period: string) => (isQty ? `${period}ขายได้กี่จาน` : `${metric}${period}เท่าไหร่`);
    const en = isQty ? "dishes sold" : metric;
    addFollowUp("fu-scope-today", mk("วันนี้"), `${en} today`);
    addFollowUp("fu-scope-month", mk("เดือนนี้"), `${en} this month`);
    addFollowUp("fu-scope-prev", mk("เดือนที่แล้ว"), `${en} last month`);
  }

  if (has("sales-volume")) {
    addFollowUp("fu-top-margin", "เมนูไหนกำไรดีสุด", "Which menu has the highest margin");
    addFollowUp("fu-slow", "เมนูไหนขายไม่ออก", "Which menus are not selling");
  }
  if (has("sales")) {
    addFollowUp("fu-trend", "ยอดขายสัปดาห์นี้เทียบสัปดาห์ที่แล้ว", "Sales this week vs last week");
    addFollowUp("fu-peak", "ช่วงเวลาไหนคนเยอะที่สุด", "Which hours are busiest");
  }
  if (has("margin")) {
    addFollowUp("fu-low-margin", "เมนูไหนกำไรน้อยสุด", "Which menu has the lowest margin");
  }
  // A generic menu question (e.g. a price / most-expensive answer) with no margin
  // or sales angle — nudge toward the two most useful next menu questions.
  if (has("menu") && !topics.has("margin") && !topics.has("sales-volume") && !topics.has("sales")) {
    addFollowUp("fu-top-margin", "เมนูไหนกำไรดีสุด", "Which menu has the highest margin");
    addFollowUp("fu-best-selling", "เมนูไหนขายดีที่สุด", "Which menu sells best");
  }
  if (has("inventory")) {
    addFollowUp("fu-reorder", "วัตถุดิบไหนควรสั่งเพิ่ม", "Which ingredients should I reorder");
    addFollowUp("fu-dead", "มีวัตถุดิบค้างสต๊อกไหม", "Is there any dead stock");
  }

  return [...followUps, ...actions].slice(0, 3);
}
