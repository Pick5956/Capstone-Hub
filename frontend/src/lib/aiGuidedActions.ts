import { can } from "@/src/lib/rbac";
import type { Membership } from "@/src/types/restaurant";

export type AIGuidedAction = {
  id: string;
  href: string;
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
    if (!actions.some((existing) => existing.href === action.href)) {
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

  return actions.slice(0, 2);
}
