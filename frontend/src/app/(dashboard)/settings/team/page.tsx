"use client";

import Link from "next/link";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { can } from "@/src/lib/rbac";
import { SettingsPanel, SettingsShell } from "../_components/SettingsPrimitives";

export default function TeamSettingsPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const allowed = can(activeMembership, "manage_staff");
  const copy = language === "th"
    ? {
        eyebrow: "Team",
        title: "ทีมและสิทธิ์",
        subtitle: "การเชิญสมาชิกและเปลี่ยนบทบาทอยู่ที่หน้าพนักงาน เพื่อไม่ให้ settings ซ้ำกับ workflow หลัก",
        back: "ตั้งค่า",
        denied: "เฉพาะผู้จัดการหรือเจ้าของร้านเท่านั้น",
        panel: "ไปหน้าพนักงาน",
        hint: "ใช้หน้านี้เพื่อสร้างคำเชิญ เปลี่ยนบทบาท ระงับสมาชิก และดู audit log",
        button: "เปิดหน้าพนักงาน",
      }
    : {
        eyebrow: "Team",
        title: "Team and permissions",
        subtitle: "Invitations and role changes stay on the staff page so settings does not duplicate the core workflow.",
        back: "Settings",
        denied: "Only managers or owners can manage team settings.",
        panel: "Open staff management",
        hint: "Use this page to create invitations, change roles, suspend members, and review audit logs.",
        button: "Open staff page",
      };

  if (!allowed) return <PermissionDenied title={copy.denied} />;

  return (
    <SettingsShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} backLabel={copy.back}>
      <SettingsPanel title={copy.panel} hint={copy.hint}>
        <Link href="/staff" className="ui-press inline-flex h-10 items-center rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white dark:bg-white dark:text-gray-900">
          {copy.button}
        </Link>
      </SettingsPanel>
    </SettingsShell>
  );
}
