import { can } from "@/src/lib/rbac";
import type { Membership } from "@/src/types/restaurant";

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
  get_payment_mix: ["sales", "billing"],
  get_sales_forecast: ["sales"],
  // Deliberately no topics: these answer about the shop itself or the floor
  // right now, and none of the topic chips ("เทียบสัปดาห์ก่อน", "เมนูกำไรดีสุด")
  // follow from them.
  get_shop_profile: [],
  get_table_status: [],
  get_active_orders: [],
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

  // Follow-up question chips: clicking re-asks a related question (uses `prompt`).
  const followUps: AIGuidedAction[] = [];
  const addFollowUp = (id: string, labelTh: string, labelEn: string, promptTh: string, promptEn: string) => {
    if (followUps.some((existing) => existing.id === id)) return;
    followUps.push({ id, label: language === "th" ? labelTh : labelEn, prompt: language === "th" ? promptTh : promptEn });
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
    addFollowUp("fu-scope-today", "วันนี้", "Today", mk("วันนี้"), `${en} today`);
    addFollowUp("fu-scope-month", "เดือนนี้", "This month", mk("เดือนนี้"), `${en} this month`);
    addFollowUp("fu-scope-prev", "เดือนก่อน", "Last month", mk("เดือนที่แล้ว"), `${en} last month`);
  }

  if (has("sales-volume")) {
    addFollowUp("fu-top-margin", "เมนูกำไรดีสุด", "Top-margin menu", "เมนูไหนกำไรดีสุด", "which menu has the highest margin");
    addFollowUp("fu-slow", "เมนูขายไม่ออก", "Slow movers", "เมนูไหนขายไม่ออก", "which menus are not selling");
  }
  if (has("sales")) {
    addFollowUp("fu-trend", "เทียบสัปดาห์ก่อน", "vs last week", "ยอดขายเทียบกับสัปดาห์ก่อนเป็นยังไง", "how do sales compare to last week");
    addFollowUp("fu-peak", "ช่วงไหนคนเยอะ", "Peak times", "ช่วงเวลาไหนขายดีที่สุด", "what are the peak hours");
  }
  if (has("margin")) {
    addFollowUp("fu-low-margin", "เมนูกำไรน้อยสุด", "Lowest-margin menu", "เมนูไหนกำไรน้อยสุด", "which menu has the lowest margin");
  }
  // A generic menu question (e.g. a price / most-expensive answer) with no margin
  // or sales angle — nudge toward the two most useful next menu questions.
  if (has("menu") && !topics.has("margin") && !topics.has("sales-volume") && !topics.has("sales")) {
    addFollowUp("fu-top-margin", "เมนูกำไรดีสุด", "Top-margin menu", "เมนูไหนกำไรดีสุด", "which menu has the highest margin");
    addFollowUp("fu-best-selling", "เมนูขายดีสุด", "Best sellers", "เมนูไหนขายดีที่สุด", "which menu sells best");
  }
  if (has("inventory")) {
    addFollowUp("fu-reorder", "ควรสั่งของเมื่อไหร่", "When to reorder", "วัตถุดิบไหนควรสั่งเพิ่มและเมื่อไหร่", "which ingredients should I reorder and when");
    addFollowUp("fu-dead", "ของค้างสต๊อก", "Dead stock", "มีวัตถุดิบค้างสต๊อกที่ไม่ได้ใช้ไหม", "is there any dead stock");
  }

  return [...followUps, ...actions].slice(0, 3);
}
