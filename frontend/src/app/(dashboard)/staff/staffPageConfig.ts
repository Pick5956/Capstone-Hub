import type { Language } from "@/src/providers/LanguageProvider";
import type { Invitation, Membership, RestaurantAuditLog } from "@/src/types/restaurant";
import type { Role } from "@/src/types/role";

const ROLE_LABELS: Record<Language, Record<string, string>> = {
  th: {
    owner: "เจ้าของร้าน",
    manager: "ผู้จัดการ",
    cashier: "แคชเชียร์",
    waiter: "พนักงานเสิร์ฟ",
    chef: "ครัว",
  },
  en: {
    owner: "Owner",
    manager: "Manager",
    cashier: "Cashier",
    waiter: "Waiter",
    chef: "Chef",
  },
};

export const STATUS_LABELS: Record<Language, Record<string, string>> = {
  th: {
    active: "ใช้งาน",
    suspended: "ระงับ",
    removed: "นำออกแล้ว",
    pending: "รอรับคำเชิญ",
  },
  en: {
    active: "Active",
    suspended: "Suspended",
    removed: "Removed",
    pending: "Pending invitation",
  },
};

export const PERMISSION_SECTIONS = [
  {
    id: "service",
    th: "งานหน้าร้าน",
    en: "Service floor",
    rows: [
      {
        id: "pos",
        th: "รับออเดอร์",
        en: "Order taking",
        descriptionTh: "อนุญาตให้เปิดโต๊ะ เพิ่มรายการอาหาร และชำระเงิน",
        descriptionEn: "Allow opening tables, adding food items, and taking payments.",
        permissions: ["take_order", "take_payment"],
      },
      {
        id: "kitchen-view",
        th: "ดูจอครัว",
        en: "View kitchen",
        descriptionTh: "อนุญาตให้เข้าดูรายการอาหารในครัวได้",
        descriptionEn: "Allow viewing kitchen food tickets.",
        permissions: ["view_kitchen"],
      },
      {
        id: "kitchen-manage",
        th: "จัดการครัว",
        en: "Manage kitchen",
        descriptionTh: "อนุญาตให้อัปเดตสถานะเมนูอาหารในครัว",
        descriptionEn: "Allow updating food item status in the kitchen.",
        permissions: ["update_order_status"],
      },
    ],
  },
  {
    id: "management",
    th: "จัดการร้าน",
    en: "Restaurant management",
    rows: [
      {
        id: "dashboard",
        th: "ดูภาพรวมร้าน",
        en: "View dashboard",
        descriptionTh: "อนุญาตให้ดูสถานะร้านและงานในกะปัจจุบัน",
        descriptionEn: "Allow viewing restaurant status and current shift activity.",
        permissions: ["view_dashboard"],
      },
      {
        id: "orders-view",
        th: "ดูคลังออเดอร์",
        en: "View order archive",
        descriptionTh: "อนุญาตให้ดูประวัติออเดอร์และรายละเอียดบิล",
        descriptionEn: "Allow viewing order history and bill details.",
        permissions: ["view_orders"],
      },
      {
        id: "tables-view",
        th: "ดูผังโต๊ะ",
        en: "View floor plan",
        descriptionTh: "อนุญาตให้ดูผังโต๊ะและสถานะโต๊ะ",
        descriptionEn: "Allow viewing table layout and table status.",
        permissions: ["view_tables"],
      },
      {
        id: "tables-manage",
        th: "จัดการโต๊ะ",
        en: "Manage tables",
        descriptionTh: "อนุญาตให้เพิ่ม แก้ไข หรือลบข้อมูลโต๊ะ",
        descriptionEn: "Allow creating, editing, or deleting table setup.",
        permissions: ["manage_table"],
      },
      {
        id: "menu-manage",
        th: "จัดการเมนูอาหาร",
        en: "Manage menu items",
        descriptionTh: "อนุญาตให้เพิ่ม แก้ไขราคา รูป และสถานะขายของเมนู",
        descriptionEn: "Allow creating and editing menu items, prices, images, and availability.",
        permissions: ["manage_menu"],
      },
      {
        id: "inventory-view",
        th: "ดูสต็อก",
        en: "View stock",
        descriptionTh: "อนุญาตให้ดูคลังวัตถุดิบและจำนวนคงเหลือ",
        descriptionEn: "Allow viewing ingredient stock and remaining quantities.",
        permissions: ["view_inventory"],
      },
      {
        id: "inventory-manage",
        th: "จัดการสต็อก",
        en: "Manage stock",
        descriptionTh: "อนุญาตให้จัดการรายการสต็อกและการเคลื่อนไหว",
        descriptionEn: "Allow managing inventory items and stock movements.",
        permissions: ["manage_inventory"],
      },
      {
        id: "reports-view",
        th: "ดูรายงาน",
        en: "View reports",
        descriptionTh: "อนุญาตให้ดูยอดขาย ต้นทุน และรายงานผู้จัดการ",
        descriptionEn: "Allow viewing sales, cost, and manager reports.",
        permissions: ["view_reports"],
      },
      {
        id: "staff-manage",
        th: "จัดการทีม",
        en: "Manage team",
        descriptionTh: "อนุญาตให้เชิญพนักงาน เปลี่ยนบทบาท และจัดการสิทธิ์",
        descriptionEn: "Allow inviting staff, changing roles, and managing permissions.",
        permissions: ["manage_staff"],
      },
    ],
  },
];

const HIDDEN_PERMISSION_KEYS = new Set(["view_menu"]);
export const ALL_PERMISSION_KEYS = PERMISSION_SECTIONS.flatMap((section) => section.rows.flatMap((row) => row.permissions));
const EDITABLE_PERMISSION_KEYS = new Set(ALL_PERMISSION_KEYS);

export type PermissionTarget =
  | { type: "role"; role: Role }
  | { type: "member"; member: Membership };

export function roleLabel(role: Role | string | null | undefined, language: Language) {
  const roleName = typeof role === "string" ? role : role?.name;
  if (!roleName) return language === "th" ? "พนักงาน" : "Staff";
  const displayName = typeof role === "string" ? "" : role?.display_name?.trim();
  return ROLE_LABELS[language][roleName] ?? (displayName || roleName);
}

export function isCustomRole(role: Role) {
  return !role.is_system && role.restaurant_id != null;
}

export function permissionSummary(role: Role | null | undefined, language: Language) {
  if (!role) return language === "th" ? "พื้นฐาน" : "Basic";
  if (role.permissions === `["*"]`) return language === "th" ? "ทุกเมนู" : "All access";
  try {
    const permissions = parsePermissions(role.permissions);
    if (!permissions.length) return language === "th" ? "พื้นฐาน" : "Basic";
    return language === "th" ? `${permissions.length} สิทธิ์` : `${permissions.length} permissions`;
  } catch {
    return language === "th" ? "พื้นฐาน" : "Basic";
  }
}

export function parsePermissions(raw: string | null | undefined) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? stripHiddenPermissions(parsed) : [];
  } catch {
    return [];
  }
}

export function stripHiddenPermissions(permissions: string[]) {
  return permissions.filter((permission) => EDITABLE_PERMISSION_KEYS.has(permission) && !HIDDEN_PERMISSION_KEYS.has(permission));
}

export function effectiveMemberPermissions(member: Membership) {
  return parsePermissions(member.permissions_override ?? member.role?.permissions);
}

export function memberPermissionSummary(member: Membership, language: Language) {
  if (member.permissions_override == null) {
    return language === "th" ? "ใช้สิทธิ์ตามบทบาท" : "Uses role permissions";
  }
  const permissions = parsePermissions(member.permissions_override);
  return language === "th" ? `กำหนดเอง ${permissions.length} สิทธิ์` : `Custom ${permissions.length} permissions`;
}

export function displayUserName(member: Membership, language: Language) {
  const user = member.user;
  if (!user) return language === "th" ? "สมาชิก" : "Member";
  if (user.nickname?.trim()) return user.nickname.trim();
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}

export function formatDate(value: string | null | undefined, language: Language) {
  const fallback = language === "th" ? "ไม่กำหนด" : "No expiry";
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(language === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function inviteUrl(token: string) {
  if (typeof window === "undefined") return `/invitations/${token}`;
  return `${window.location.origin}/invitations/${token}`;
}

export function inviteMailto(invitation: Invitation, language: Language) {
  const restaurantName = invitation.restaurant?.name ?? "Restaurant Hub";
  const subject = language === "th"
    ? `คำเชิญเข้าร่วมร้าน ${restaurantName}`
    : `Invitation to join ${restaurantName}`;
  const body = language === "th"
    ? [
        `สวัสดี${invitation.email ? ` ${invitation.email}` : ""},`,
        "",
        `คุณได้รับคำเชิญเข้าร่วมร้าน ${restaurantName} ในบทบาท ${roleLabel(invitation.role, language)}`,
        `เปิดลิงก์นี้เพื่อดูรายละเอียดและรับคำเชิญ: ${inviteUrl(invitation.token)}`,
        "",
        "หากลิงก์หมดอายุ กรุณาติดต่อผู้จัดการร้านเพื่อขอลิงก์ใหม่",
      ].join("\n")
    : [
        `Hello${invitation.email ? ` ${invitation.email}` : ""},`,
        "",
        `You have been invited to join ${restaurantName} as ${roleLabel(invitation.role, language)}.`,
        `Open this link to review and accept the invitation: ${inviteUrl(invitation.token)}`,
        "",
        "If the link expires, ask the restaurant manager for a new invitation.",
      ].join("\n");

  return `mailto:${encodeURIComponent(invitation.email)}?${new URLSearchParams({ subject, body }).toString()}`;
}

function parseAuditDetails(details: string) {
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function auditMessage(log: RestaurantAuditLog, language: Language) {
  const details = parseAuditDetails(log.details);
  const roleName = typeof details.role_name === "string" ? details.role_name : "";
  const email = typeof details.email === "string" ? details.email : "";
  const fromStatus = typeof details.from_status === "string" ? details.from_status : "";
  const toStatus = typeof details.to_status === "string" ? details.to_status : "";
  const fromRole = typeof details.from_role === "string" ? details.from_role : "";
  const toRole = typeof details.to_role === "string" ? details.to_role : "";

  if (log.action === "invitation_created") {
    return language === "th"
      ? `สร้างคำเชิญ ${roleLabel(roleName, language)}${email ? ` · ${email}` : ""}`
      : `Created invitation for ${roleLabel(roleName, language)}${email ? ` · ${email}` : ""}`;
  }
  if (log.action === "invitation_revoked") {
    return language === "th" ? `ยกเลิกคำเชิญ${email ? ` · ${email}` : ""}` : `Revoked invitation${email ? ` · ${email}` : ""}`;
  }
  if (log.action === "invitation_accepted") {
    return language === "th"
      ? `รับคำเชิญเข้าร่วมร้าน${roleName ? ` เป็น ${roleLabel(roleName, language)}` : ""}`
      : `Accepted invitation${roleName ? ` as ${roleLabel(roleName, language)}` : ""}`;
  }
  if (log.action === "member_status_changed") {
    return language === "th"
      ? `เปลี่ยนสถานะสมาชิก ${STATUS_LABELS.th[fromStatus] ?? fromStatus} -> ${STATUS_LABELS.th[toStatus] ?? toStatus}`
      : `Changed member status ${STATUS_LABELS.en[fromStatus] ?? fromStatus} -> ${STATUS_LABELS.en[toStatus] ?? toStatus}`;
  }
  if (log.action === "member_role_changed") {
    return language === "th"
      ? `เปลี่ยนบทบาท ${ROLE_LABELS.th[fromRole] ?? fromRole} -> ${ROLE_LABELS.th[toRole] ?? toRole}`
      : `Changed role ${ROLE_LABELS.en[fromRole] ?? fromRole} -> ${ROLE_LABELS.en[toRole] ?? toRole}`;
  }
  return log.action;
}

export function actorName(log: RestaurantAuditLog, language: Language) {
  const user = log.actor_user;
  if (!user) return language === "th" ? "ระบบ" : "System";
  if (user.nickname?.trim()) return user.nickname.trim();
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}
