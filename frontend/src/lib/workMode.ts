import type { Membership } from "../types/restaurant";
import { can } from "./rbac";

export function getDefaultWorkspaceRoute(membership: Membership | null | undefined) {
  const roleName = membership?.role?.name ?? "";
  if (roleName === "chef") return "/kitchen";
  if (roleName === "waiter") return "/pos/tables";
  if (roleName === "cashier") return "/orders";
  if (roleName === "owner" || roleName === "manager") return "/home";

  if (can(membership, "view_kitchen")) return "/kitchen";
  if (can(membership, "take_order")) return "/pos/tables";
  if (can(membership, "view_orders")) return "/orders";
  return "/home";
}

export function getWorkModeName(membership: Membership | null | undefined, language: "th" | "en") {
  const roleName = membership?.role?.name ?? "";
  if (roleName === "chef") return language === "th" ? "โหมดครัว" : "Kitchen mode";
  if (roleName === "waiter") return language === "th" ? "โหมดหน้าร้าน" : "Floor service mode";
  if (roleName === "cashier") return language === "th" ? "โหมดแคชเชียร์" : "Cashier mode";
  if (roleName === "owner" || roleName === "manager") return language === "th" ? "โหมดผู้จัดการ" : "Manager mode";
  return language === "th" ? "โหมดทำงาน" : "Work mode";
}

export function getWorkModeHint(membership: Membership | null | undefined, language: "th" | "en") {
  const roleName = membership?.role?.name ?? "";
  if (roleName === "chef") return language === "th" ? "เปิดจอครัวไว้เพื่อดูคิวและกดพร้อมเสิร์ฟ" : "Keep the kitchen screen open to manage tickets.";
  if (roleName === "waiter") return language === "th" ? "เริ่มจากเลือกโต๊ะ เปิดออเดอร์ แล้วส่งเข้าครัว" : "Start at tables, open orders, then send them to kitchen.";
  if (roleName === "cashier") return language === "th" ? "ติดตามออเดอร์วันนี้ก่อนระบบชำระเงินเต็มรูปแบบ" : "Track today's orders before full payment flow.";
  if (roleName === "owner" || roleName === "manager") return language === "th" ? "ดูภาพรวมร้านและแก้ปัญหาหน้างานจากจุดเดียว" : "Start from live overview and jump into issues.";
  return language === "th" ? "ระบบจะพาไปหน้าที่เหมาะกับสิทธิ์ของบัญชีนี้" : "The system opens the best screen for this account.";
}
