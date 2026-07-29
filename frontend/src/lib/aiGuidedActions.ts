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

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function getGuidedActions(
  question: string,
  answer: string,
  membership: Membership | null | undefined,
  language: "th" | "en",
): AIGuidedAction[] {
  const text = `${question} ${answer}`.toLowerCase();
  const actions: AIGuidedAction[] = [];
  const add = (action: AIGuidedAction) => {
    if (!actions.some((existing) => existing.id === action.id)) {
      actions.push(action);
    }
  };

  if (includesAny(text, ["stock", "inventory", "ingredient", "restock", "วัตถุดิบ", "สต๊อก", "คลัง", "เติม"])) {
    if (can(membership, "manage_inventory") || can(membership, "view_inventory")) {
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
  }

  if (includesAny(text, ["margin", "profit", "menu", "กำไร", "มาร์จิ้น", "เมนู"])) {
    if (can(membership, "manage_menu") || can(membership, "view_menu")) {
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
  }

  if (includesAny(text, ["vat", "promptpay", "service charge", "คิดเงิน", "ภาษี", "พร้อมเพย์"])) {
    if (can(membership, "manage_staff")) {
      add({
        id: "restaurant-billing",
        href: "/settings/restaurant",
        label: language === "th" ? "เปิดการตั้งค่าร้าน" : "Open restaurant settings",
      });
    }
  }

  if (can(membership, "view_reports") && includesAny(text, ["sales", "revenue", "ยอดขาย", "รายได้", "กำไร", "stock", "สต๊อก"])) {
    add({
      id: "open-report",
      href: "/reports",
      label: language === "th" ? "ดูรายงานเต็ม" : "View full report",
    });
  }

  // Follow-up question chips: clicking re-asks a related question (uses `prompt`).
  const followUps: AIGuidedAction[] = [];
  const addFollowUp = (id: string, labelTh: string, labelEn: string, promptTh: string, promptEn: string) => {
    followUps.push({ id, label: language === "th" ? labelTh : labelEn, prompt: language === "th" ? promptTh : promptEn });
  };

  if (includesAny(text, ["ขายดี", "ยอดนิยม", "top selling", "best selling", "popular"])) {
    addFollowUp("fu-top-margin", "เมนูกำไรดีสุด", "Top-margin menu", "เมนูไหนกำไรดีสุด", "which menu has the highest margin");
    addFollowUp("fu-slow", "เมนูขายไม่ออก", "Slow movers", "เมนูไหนขายไม่ออก", "which menus are not selling");
  }
  if (includesAny(text, ["ยอดขาย", "รายได้", "sales", "revenue"])) {
    addFollowUp("fu-trend", "เทียบสัปดาห์ก่อน", "vs last week", "ยอดขายเทียบกับสัปดาห์ก่อนเป็นยังไง", "how do sales compare to last week");
    addFollowUp("fu-peak", "ช่วงไหนคนเยอะ", "Peak times", "ช่วงเวลาไหนขายดีที่สุด", "what are the peak hours");
  }
  if (includesAny(text, ["กำไร", "margin", "มาร์จิ้น", "profit"])) {
    addFollowUp("fu-low-margin", "เมนูกำไรน้อยสุด", "Lowest-margin menu", "เมนูไหนกำไรน้อยสุด", "which menu has the lowest margin");
  }
  if (includesAny(text, ["สต๊อก", "วัตถุดิบ", "คลัง", "stock", "inventory", "ingredient"])) {
    addFollowUp("fu-reorder", "ควรสั่งของเมื่อไหร่", "When to reorder", "วัตถุดิบไหนควรสั่งเพิ่มและเมื่อไหร่", "which ingredients should I reorder and when");
    addFollowUp("fu-dead", "ของค้างสต๊อก", "Dead stock", "มีวัตถุดิบค้างสต๊อกที่ไม่ได้ใช้ไหม", "is there any dead stock");
  }

  return [...followUps, ...actions].slice(0, 3);
}
