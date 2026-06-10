import { can } from "@/src/lib/rbac";
import type { AIGuidedAction } from "@/src/lib/aiGuidedActions";
import type { Membership } from "@/src/types/restaurant";

type AIClarification = {
  message: string;
  actions: AIGuidedAction[];
};

function normalize(text: string) {
  return text.toLowerCase().replace(/[?!.,/]+/g, "").replace(/\s+/g, " ").trim();
}

function canAnalyze(membership: Membership | null | undefined) {
  return can(membership, "view_reports") || can(membership, "manage_inventory");
}

export function resolveClarificationRequest(
  input: string,
  membership: Membership | null | undefined,
  language: "th" | "en",
): AIClarification | null {
  const text = normalize(input);

  if (["เมนู", "menu"].includes(text)) {
    const actions: AIGuidedAction[] = [];
    if (can(membership, "view_menu") || can(membership, "manage_menu")) {
      actions.push({ id: "menu-page", href: "/menu", label: language === "th" ? "เปิดหน้าจัดการเมนู" : "Open menu page" });
    }
    if (canAnalyze(membership)) {
      actions.push({ id: "menu-top", prompt: language === "th" ? "เมนูไหนขายดีที่สุดในช่วง 14 วันล่าสุด?" : "Which menu items sold best in the last 14 days?", label: language === "th" ? "ดูเมนูขายดี" : "Analyze top sellers" });
      actions.push({ id: "menu-margin", prompt: language === "th" ? "เมนูไหนมี margin ต่ำและควรตรวจสอบ?" : "Which menu items have low margins and should be reviewed?", label: language === "th" ? "ตรวจเมนูกำไรต่ำ" : "Review low margins" });
    }
    return actions.length ? {
      message: language === "th" ? "ต้องการทำอะไรเกี่ยวกับเมนูครับ?" : "What would you like to do with menus?",
      actions,
    } : null;
  }

  if (["คลัง", "สต๊อก", "สต็อก", "วัตถุดิบ", "inventory", "stock"].includes(text)) {
    const actions: AIGuidedAction[] = [];
    if (can(membership, "view_inventory") || can(membership, "manage_inventory")) {
      actions.push({ id: "inventory-page", href: "/inventory", label: language === "th" ? "เปิดหน้าคลังวัตถุดิบ" : "Open inventory" });
    }
    if (canAnalyze(membership)) {
      actions.push({ id: "inventory-risk", prompt: language === "th" ? "วัตถุดิบอะไรใกล้หมดและควรเติมก่อน?" : "Which ingredients are low and should be restocked first?", label: language === "th" ? "ดูของใกล้หมด" : "Check stock risks" });
    }
    return actions.length ? {
      message: language === "th" ? "ต้องการเปิดคลัง หรือให้ช่วยตรวจวัตถุดิบที่เสี่ยงหมดครับ?" : "Would you like to open inventory or analyze stock risks?",
      actions,
    } : null;
  }

  if (["รายงาน", "ยอดขาย", "รายได้", "report", "reports", "sales", "revenue"].includes(text) && can(membership, "view_reports")) {
    return {
      message: language === "th" ? "ต้องการเปิดรายงาน หรือให้สรุปยอดขายก่อนครับ?" : "Would you like to open reports or get a sales summary?",
      actions: [
        { id: "reports-page", href: "/reports", label: language === "th" ? "เปิดหน้ารายงาน" : "Open reports" },
        { id: "sales-summary", prompt: language === "th" ? "สรุปยอดขายและกำไรในช่วง 14 วันล่าสุดให้หน่อย" : "Summarize sales and profit for the last 14 days.", label: language === "th" ? "สรุปยอดขาย" : "Summarize sales" },
      ],
    };
  }

  if (["ตั้งค่า", "settings", "setting"].includes(text)) {
    const actions: AIGuidedAction[] = [
      { id: "settings-page", href: "/settings", label: language === "th" ? "เปิดหน้าตั้งค่า" : "Open settings" },
      { id: "settings-account", href: "/settings/account", label: language === "th" ? "บัญชีของฉัน" : "My account" },
      { id: "settings-display", href: "/settings/display", label: language === "th" ? "ภาษาและการแสดงผล" : "Language and display" },
    ];
    if (can(membership, "manage_staff")) {
      actions.push({ id: "settings-restaurant", href: "/settings/restaurant", label: language === "th" ? "ข้อมูลร้านและการคิดเงิน" : "Restaurant and billing" });
    }
    return {
      message: language === "th" ? "ต้องการตั้งค่าส่วนไหนครับ?" : "Which settings would you like to open?",
      actions,
    };
  }

  return null;
}

export function getUnclearRequestActions(
  membership: Membership | null | undefined,
  language: "th" | "en",
): AIGuidedAction[] {
  const actions: AIGuidedAction[] = [];
  if (canAnalyze(membership)) {
    actions.push({
      id: "unclear-stock-risk",
      prompt: language === "th" ? "วัตถุดิบอะไรใกล้หมดและควรเติมก่อน?" : "Which ingredients are low and should be restocked first?",
      label: language === "th" ? "ตรวจสต๊อก" : "Check stock",
    });
    if (can(membership, "view_reports")) {
      actions.push({
        id: "unclear-sales-summary",
        prompt: language === "th" ? "สรุปยอดขายและกำไรในช่วง 14 วันล่าสุดให้หน่อย" : "Summarize sales and profit for the last 14 days.",
        label: language === "th" ? "ดูยอดขาย" : "View sales",
      });
    }
  }
  if (can(membership, "view_menu") || can(membership, "manage_menu")) {
    actions.push({
      id: "unclear-menu-page",
      href: "/menu",
      label: language === "th" ? "ไปหน้าเมนู" : "Open menu",
    });
  }
  return actions.slice(0, 3);
}
