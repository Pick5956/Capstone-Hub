import type { Language } from "@/src/providers/LanguageProvider";
import type { Role } from "@/src/types/role";

export const SYSTEM_ROLE_LABELS: Record<Language, Record<string, string>> = {
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

export function roleLabel(
  role: Role | string | null | undefined,
  language: Language,
): string {
  const roleName = typeof role === "string" ? role : role?.name;
  if (!roleName) return language === "th" ? "พนักงาน" : "Staff";

  if (typeof role !== "string") {
    const override = role?.display_name_override?.trim();
    if (override) return override;
  }

  const localizedSystemName = SYSTEM_ROLE_LABELS[language][roleName];
  if (localizedSystemName) return localizedSystemName;

  const displayName = typeof role === "string" ? "" : role?.display_name?.trim();
  return displayName || roleName;
}
