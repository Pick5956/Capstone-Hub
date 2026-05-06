"use client";

import Link from "next/link";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { SettingsShell } from "./_components/SettingsPrimitives";

type SettingsCard = {
  href?: string;
  title: string;
  description: string;
  badge: string;
  disabled?: boolean;
};

function Card({ item }: { item: SettingsCard }) {
  const className = `ui-press block rounded-md border border-gray-200 bg-white p-4 text-left dark:border-gray-800 dark:bg-gray-950 ${
    item.disabled ? "cursor-default opacity-60" : "hover:border-orange-200 hover:bg-orange-50/20 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10"
  }`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">{item.title}</h2>
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:bg-gray-900 dark:text-gray-400">{item.badge}</span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-gray-500 dark:text-gray-400">{item.description}</p>
    </>
  );

  if (!item.href || item.disabled) return <div className={className}>{content}</div>;
  return <Link href={item.href} className={className}>{content}</Link>;
}

export default function SettingsHubPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canManageRestaurant = can(activeMembership, "manage_staff");

  const copy = language === "th"
    ? {
        eyebrow: "Settings",
        title: "ตั้งค่า",
        subtitle: "แยกบัญชีส่วนตัว การแสดงผล และการจัดการร้านออกจากกัน เพื่อให้มือถือกดง่ายและเห็นสิทธิ์ชัดเจน",
        personal: "ของฉัน",
        restaurant: "การจัดการร้าน",
        everyone: "ทุกคน",
        manager: "ผู้จัดการ/เจ้าของ",
        soon: "เร็ว ๆ นี้",
        noAccess: "ไม่มีสิทธิ์",
        accountTitle: "โปรไฟล์และบัญชี",
        accountDesc: "แก้ชื่อ รูปโปรไฟล์ ชื่อเล่น และข้อมูลติดต่อส่วนตัว",
        displayTitle: "ภาษาและการแสดงผล",
        displayDesc: "เลือกภาษาและขนาดตัวอักษรที่ใช้ในเว็บนี้",
        restaurantTitle: "ข้อมูลร้านและการคิดเงิน",
        restaurantDesc: "ตั้งค่าชื่อร้าน เวลาเปิดปิด Service charge, VAT และ PromptPay",
        teamTitle: "ทีมและสิทธิ์",
        teamDesc: "จัดการคำเชิญ บทบาท และสมาชิกในร้าน",
        planTitle: "แพ็กเกจ",
        planDesc: "ระบบ subscription ยังไม่เปิดใช้จริงในรอบนี้",
        notificationsTitle: "แจ้งเตือน",
        notificationsDesc: "ตั้งค่าการแจ้งเตือนขั้นสูงจะทำในรอบถัดไป",
        securityTitle: "ความปลอดภัย",
        securityDesc: "การเปลี่ยนรหัสและการเชื่อมบัญชีเพิ่มเติมยังอยู่ในแผนถัดไป",
      }
    : {
        eyebrow: "Settings",
        title: "Settings",
        subtitle: "Personal account, display preferences, and manager-only restaurant setup are separated for a cleaner mobile flow.",
        personal: "Mine",
        restaurant: "Restaurant management",
        everyone: "Everyone",
        manager: "Manager/Owner",
        soon: "Soon",
        noAccess: "No access",
        accountTitle: "Profile and account",
        accountDesc: "Edit your name, photo, nickname, and contact details.",
        displayTitle: "Language and display",
        displayDesc: "Choose the app language and font size used on this device.",
        restaurantTitle: "Restaurant and billing",
        restaurantDesc: "Manage restaurant identity, service hours, service charge, VAT, and PromptPay.",
        teamTitle: "Team and permissions",
        teamDesc: "Manage invitations, roles, and restaurant members.",
        planTitle: "Plan",
        planDesc: "Subscription management is not active in this sprint.",
        notificationsTitle: "Notifications",
        notificationsDesc: "Advanced notification settings are planned for a later sprint.",
        securityTitle: "Security",
        securityDesc: "Password changes and extra account linking will be handled later.",
      };

  const personalCards: SettingsCard[] = [
    { href: "/settings/account", title: copy.accountTitle, description: copy.accountDesc, badge: copy.everyone },
    { href: "/settings/display", title: copy.displayTitle, description: copy.displayDesc, badge: copy.everyone },
    { title: copy.securityTitle, description: copy.securityDesc, badge: copy.soon, disabled: true },
  ];
  const restaurantCards: SettingsCard[] = [
    {
      href: canManageRestaurant ? "/settings/restaurant" : undefined,
      title: copy.restaurantTitle,
      description: copy.restaurantDesc,
      badge: canManageRestaurant ? copy.manager : copy.noAccess,
      disabled: !canManageRestaurant,
    },
    {
      href: canManageRestaurant ? "/staff" : undefined,
      title: copy.teamTitle,
      description: copy.teamDesc,
      badge: canManageRestaurant ? copy.manager : copy.noAccess,
      disabled: !canManageRestaurant,
    },
    { title: copy.planTitle, description: copy.planDesc, badge: copy.soon, disabled: true },
    { title: copy.notificationsTitle, description: copy.notificationsDesc, badge: copy.soon, disabled: true },
  ];

  return (
    <SettingsShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{copy.personal}</h2>
          <div className="grid gap-3">
            {personalCards.map((item) => <Card key={item.title} item={item} />)}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{copy.restaurant}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {restaurantCards.map((item) => <Card key={item.title} item={item} />)}
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
