"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type SettingsTab = "account" | "restaurant" | "team" | "plan" | "notifications" | "security";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "account",
    label: "บัญชี",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M20 21a8 8 0 10-16 0" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "restaurant",
    label: "ร้าน",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M3 7h18M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    id: "team",
    label: "ทีม",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: "plan",
    label: "แพ็กเกจ",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    id: "notifications",
    label: "แจ้งเตือน",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "ความปลอดภัย",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

const TEAM_MEMBERS = [
  { name: "คุณสมชาย", email: "owner@restaurant.test", role: "เจ้าของร้าน", access: "ทุกเมนู", status: "ใช้งาน" },
  { name: "พี่แอน", email: "cashier@restaurant.test", role: "แคชเชียร์", access: "ออเดอร์ / ชำระเงิน", status: "ใช้งาน" },
  { name: "เชฟอภิชัย", email: "kitchen@restaurant.test", role: "ครัว", access: "คิวครัว / สต็อก", status: "รอเชิญ" },
];

const DEVICES = [
  { name: "Chrome on Windows", place: "นครราชสีมา", lastSeen: "ตอนนี้" },
  { name: "Safari on iPhone", place: "กรุงเทพฯ", lastSeen: "เมื่อวาน 21:14" },
];

function getDisplayName(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return "ผู้ใช้";
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}

function Field({
  label,
  value,
  placeholder,
  type = "text",
}: {
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</span>
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</span>
      <select
        defaultValue={value}
        className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[13px] text-gray-900 dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  description,
  defaultOn = true,
}: {
  label: string;
  description: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);

  return (
    <button
      type="button"
      onClick={() => setOn((current) => !current)}
      className="w-full flex items-center justify-between gap-4 py-3 text-left border-b border-gray-100 dark:border-gray-800 last:border-0"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-gray-900 dark:text-white">{label}</span>
        <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">{description}</span>
      </span>
      <span
        className={`h-6 w-11 rounded-full p-0.5 transition-colors shrink-0 ${
          on ? "bg-orange-600" : "bg-gray-200 dark:bg-gray-700"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function FontSizeControl() {
  const { fontSize, setFontSize } = useTheme();
  const options = [
    { id: "small" as const, label: "เล็ก", sample: "กะทัดรัด" },
    { id: "normal" as const, label: "ปกติ", sample: "แนะนำ" },
    { id: "large" as const, label: "ใหญ่", sample: "อ่านง่าย" },
    { id: "extra-large" as const, label: "ใหญ่มาก", sample: "หน้าจอไกล" },
  ];
  const activeIndex = Math.max(0, options.findIndex((option) => option.id === fontSize));
  const activeOption = options[activeIndex];

  return (
    <div>
      <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{activeOption.label}</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{activeOption.sample}</p>
          </div>
          <span className="rounded-md bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-2 py-1 text-[11px] font-medium text-orange-600 dark:text-orange-400">
            {activeIndex + 1}/{options.length}
          </span>
        </div>

        <div className="relative mt-5 px-1">
          <div className="absolute left-1 right-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-800" />
          <div
            className="absolute left-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-orange-600"
            style={{ width: `calc(${(activeIndex / (options.length - 1)) * 100}% - ${activeIndex === 0 ? 0 : 4}px)` }}
          />
          <div className="relative flex justify-between">
            {options.map((option, index) => {
              const active = index <= activeIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFontSize(option.id)}
                  aria-label={`ปรับขนาดตัวอักษรเป็น${option.label}`}
                  className={`h-5 w-5 rounded-full border-2 transition-colors ${
                    active
                      ? "border-orange-600 bg-orange-600"
                      : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
                  }`}
                />
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={options.length - 1}
            step={1}
            value={activeIndex}
            onChange={(event) => setFontSize(options[Number(event.target.value)].id)}
            aria-label="ปรับขนาดตัวอักษรของเว็บ"
            className="absolute inset-x-0 top-0 h-5 w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFontSize(option.id)}
              className={`text-center text-[11px] font-medium transition-colors ${
                index === activeIndex
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
        <p className="text-[13px] font-medium text-gray-900 dark:text-white">ตัวอย่างข้อความในระบบ</p>
        <p className="mt-1 text-[12px] text-gray-600 dark:text-gray-400">
          ขนาดนี้จะมีผลกับหน้า dashboard, setting, เลือกร้าน และหน้าที่ใช้ text scale ของระบบ
        </p>
      </div>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
          {hint && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AccountSettings() {
  const { user } = useAuth();
  const displayName = getDisplayName(user);
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-4">
      <Panel title="ข้อมูลบัญชี" hint="ข้อมูลนี้ใช้แสดงกับทีมและบันทึกกิจกรรมในร้าน">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900/25 text-orange-700 dark:text-orange-300 flex items-center justify-center text-lg font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400 truncate">{user?.email ?? "ยังไม่มีอีเมล"}</p>
            <button type="button" className="mt-2 h-8 px-3 rounded-md border border-gray-200 dark:border-gray-700 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              เปลี่ยนรูปโปรไฟล์
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="ชื่อ" value={user?.first_name} placeholder="ชื่อ" />
          <Field label="นามสกุล" value={user?.last_name === "-" ? "" : user?.last_name} placeholder="นามสกุล" />
          <Field label="อีเมล" value={user?.email} type="email" />
          <Field label="เบอร์โทร" value={user?.phone} placeholder="08x-xxx-xxxx" />
        </div>
      </Panel>

      <Panel title="การตั้งค่าส่วนตัว" hint="มีผลเฉพาะบัญชีของคุณ ไม่กระทบทีมในร้าน">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="ภาษา" value="ไทย" options={["ไทย", "English"]} />
          <SelectField label="โซนเวลา" value="Asia/Bangkok" options={["Asia/Bangkok", "UTC"]} />
          <SelectField label="หน้าแรกหลังเลือกร้าน" value="ภาพรวมร้าน" options={["ภาพรวมร้าน", "ออเดอร์", "คิวครัว", "รายงาน"]} />
          <SelectField label="รูปแบบเวลา" value="24 ชั่วโมง" options={["24 ชั่วโมง", "12 ชั่วโมง"]} />
        </div>
      </Panel>

      <Panel title="ขนาดตัวอักษร" hint="ปรับให้อ่านง่ายตามอุปกรณ์และระยะการใช้งาน">
        <FontSizeControl />
      </Panel>
    </div>
  );
}

function RestaurantSettings() {
  return (
    <div className="space-y-4">
      <Panel title="ข้อมูลร้าน" hint="ใช้ในใบเสร็จ รายงาน และหน้าที่ลูกค้าหรือพนักงานเห็น">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="ชื่อร้าน" value="ครัวบ้านส้ม" />
          <Field label="ชื่อสาขา" value="สาขาหลัก" />
          <SelectField label="ประเภทร้าน" value="ร้านอาหารไทย" options={["ร้านอาหารไทย", "คาเฟ่", "ชาบู/ปิ้งย่าง", "เดลิเวอรี", "ฟู้ดทรัค"]} />
          <Field label="เบอร์ร้าน" value="044-000-000" />
          <Field label="เลขประจำตัวผู้เสียภาษี" placeholder="0-0000-00000-00-0" />
          <Field label="ที่อยู่" value="ถนนมิตรภาพ นครราชสีมา" />
        </div>
      </Panel>

      <Panel title="เวลาทำการ" hint="ใช้ช่วยจัดกะ แจ้งเตือน และสรุปรายงานตามรอบร้าน">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SelectField label="รอบร้านหลัก" value="กะเย็น" options={["กะเช้า", "กะบ่าย", "กะเย็น", "ทั้งวัน"]} />
          <Field label="เวลาเปิด" value="17:00" type="time" />
          <Field label="เวลาปิด" value="24:00" type="time" />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์", "วันหยุดพิเศษ"].map((day, index) => (
            <button
              key={day}
              type="button"
              className={`h-9 rounded-md border text-[12px] font-medium transition-colors ${
                index < 6
                  ? "border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="การทำงานหน้าร้าน" hint="ค่าเริ่มต้นสำหรับออเดอร์ โต๊ะ และคิวครัว">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <Toggle label="เปิดคิวครัวแบบ real-time" description="เมื่อรับออเดอร์ใหม่ รายการจะเข้าหน้าครัวทันที" />
          <Toggle label="แจ้งเตือนเมื่อออเดอร์เกินเวลา" description="เตือนผู้จัดการเมื่อจานรอนานกว่าเวลาที่กำหนด" />
          <Toggle label="อนุญาตให้รวม/ย้ายโต๊ะ" description="พนักงานหน้าร้านสามารถย้ายออเดอร์ระหว่างโต๊ะได้" />
        </div>
      </Panel>
    </div>
  );
}

function TeamSettings() {
  return (
    <div className="space-y-4">
      <Panel
        title="สมาชิกในร้าน"
        hint="เชิญทีมและกำหนดสิทธิ์ตามหน้าที่"
        right={
          <button type="button" className="h-8 px-3 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-semibold hover:opacity-90 transition-opacity">
            เชิญสมาชิก
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="py-2 font-semibold">ชื่อ</th>
                <th className="py-2 font-semibold">บทบาท</th>
                <th className="py-2 font-semibold">สิทธิ์</th>
                <th className="py-2 font-semibold text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {TEAM_MEMBERS.map((member) => (
                <tr key={member.email} className="border-b border-gray-50 dark:border-gray-800/70 last:border-0">
                  <td className="py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{member.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{member.email}</p>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-300">{member.role}</td>
                  <td className="py-3 text-gray-500 dark:text-gray-400">{member.access}</td>
                  <td className="py-3 text-right">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                      member.status === "ใช้งาน"
                        ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                    }`}>
                      {member.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="แม่แบบสิทธิ์" hint="ใช้เป็นค่าเริ่มต้นตอนเชิญพนักงานใหม่">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { role: "ผู้จัดการ", access: "ทุกเมนู ยกเว้น billing", count: 1 },
            { role: "แคชเชียร์", access: "ออเดอร์ โต๊ะ ชำระเงิน", count: 2 },
            { role: "ครัว", access: "คิวครัว สต็อกวัตถุดิบ", count: 4 },
          ].map((item) => (
            <div key={item.role} className="rounded-md border border-gray-200 dark:border-gray-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{item.role}</h3>
                <span className="text-[11px] text-gray-400">{item.count} คน</span>
              </div>
              <p className="mt-2 text-[12px] text-gray-500 dark:text-gray-400">{item.access}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PlanSettings() {
  return (
    <div className="space-y-4">
      <Panel title="แพ็กเกจปัจจุบัน" hint="ตอนนี้ยังเป็น mock UI ก่อนผูกระบบชำระเงิน">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Free</h3>
              <span className="px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">ใช้งานอยู่</span>
            </div>
            <p className="mt-2 text-[13px] text-gray-600 dark:text-gray-400">เหมาะสำหรับเริ่มตั้งค่าร้านแรก ทดลองระบบออเดอร์ โต๊ะ และคิวครัว</p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["ร้าน", "1"],
                ["สมาชิก", "3"],
                ["โต๊ะ", "20"],
                ["รายงานย้อนหลัง", "7 วัน"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/20 p-3">
            <p className="text-[12px] font-semibold text-orange-900 dark:text-orange-200">ต้องการหลายร้าน?</p>
            <p className="mt-1 text-[11px] text-orange-800/80 dark:text-orange-300/80">Pro จะเปิดเพิ่มร้านหรือสาขา และเพิ่มจำนวนทีมได้</p>
            <button type="button" className="mt-3 h-8 w-full rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-semibold hover:opacity-90 transition-opacity">
              ดูแพ็กเกจ Pro
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="การใช้งานเดือนนี้" hint="ช่วยดูว่าร้านใกล้ชน limit ของแพ็กเกจหรือยัง">
        <div className="space-y-3">
          {[
            { label: "จำนวนร้าน", used: 1, max: 1 },
            { label: "สมาชิก", used: 3, max: 3 },
            { label: "โต๊ะ", used: 18, max: 20 },
          ].map((item) => {
            const pct = Math.min((item.used / item.max) * 100, 100);
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
                  <span className="text-gray-500 dark:text-gray-400">{item.used}/{item.max}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-600" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="space-y-4">
      <Panel title="แจ้งเตือนงานหน้าร้าน" hint="เลือกเหตุการณ์ที่ควรเด้งให้ผู้จัดการเห็นทันที">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <Toggle label="ออเดอร์เกินเวลา" description="แจ้งเตือนเมื่อจานรอนานกว่า 15 นาที" />
          <Toggle label="วัตถุดิบใกล้หมด" description="แจ้งเตือนเมื่อของเหลือต่ำกว่า safety stock" />
          <Toggle label="โต๊ะรอชำระเงินนาน" description="เตือนเมื่อโต๊ะเรียกเก็บเงินแล้วไม่มีการปิดบิล" defaultOn={false} />
          <Toggle label="สรุปยอดปิดกะ" description="ส่งสรุปรายได้ ออเดอร์ และเมนูขายดีหลังปิดร้าน" />
        </div>
      </Panel>

      <Panel title="ช่องทางแจ้งเตือน" hint="ตอนนี้เป็น UI mock ก่อนผูก LINE/Email">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <Toggle label="ในระบบ" description="แจ้งเตือนผ่านแถบ notification ใน dashboard" />
          <Toggle label="อีเมล" description="ส่งเหตุการณ์สำคัญไปที่อีเมลเจ้าของร้าน" />
          <Toggle label="LINE Notify" description="เชื่อมต่อ LINE กลุ่มผู้จัดการร้าน" defaultOn={false} />
        </div>
      </Panel>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-4">
      <Panel title="เข้าสู่ระบบและรหัสผ่าน" hint="จัดการวิธีเข้าระบบของบัญชีนี้">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" className="h-10 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            เปลี่ยนรหัสผ่าน
          </button>
          <button type="button" className="h-10 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            เชื่อมต่อ Google
          </button>
        </div>
        <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          <Toggle label="ยืนยันตัวตนสองชั้น" description="เพิ่มรหัส OTP ก่อนเข้าระบบในอุปกรณ์ใหม่" defaultOn={false} />
          <Toggle label="แจ้งเตือน login ใหม่" description="ส่งอีเมลเมื่อมีการเข้าระบบจากอุปกรณ์ใหม่" />
        </div>
      </Panel>

      <Panel title="อุปกรณ์ที่ใช้งาน" hint="รายการ session ล่าสุดของบัญชีนี้">
        <div className="space-y-2">
          {DEVICES.map((device) => (
            <div key={device.name} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 dark:border-gray-800 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{device.name}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{device.place} · {device.lastSeen}</p>
              </div>
              <button type="button" className="h-8 px-2.5 rounded-md text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                ออกจากระบบ
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="โซนอันตราย" hint="การกระทำเหล่านี้กระทบข้อมูลร้านและทีม">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 px-3 py-3">
          <div>
            <p className="text-[13px] font-semibold text-red-900 dark:text-red-200">ปิดร้านนี้ชั่วคราว</p>
            <p className="mt-0.5 text-[11px] text-red-800/80 dark:text-red-300/80">ทีมจะยังเห็นข้อมูลเดิม แต่รับออเดอร์ใหม่ไม่ได้</p>
          </div>
          <button type="button" className="h-8 px-3 rounded-md border border-red-300 dark:border-red-800 text-[12px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
            ปิดร้าน
          </button>
        </div>
      </Panel>
    </div>
  );
}

function ActiveTabContent({ tab }: { tab: SettingsTab }) {
  if (tab === "account") return <AccountSettings />;
  if (tab === "restaurant") return <RestaurantSettings />;
  if (tab === "team") return <TeamSettings />;
  if (tab === "plan") return <PlanSettings />;
  if (tab === "notifications") return <NotificationSettings />;
  return <SecuritySettings />;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const activeLabel = useMemo(() => TABS.find((tab) => tab.id === activeTab)?.label ?? "", [activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="px-5 md:px-7 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold tracking-tight truncate">ตั้งค่า</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">บัญชี ร้าน ทีม แพ็กเกจ และความปลอดภัย</p>
          </div>
          <button
            type="button"
            className="h-8 px-3 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-semibold hover:opacity-90 transition-opacity"
          >
            บันทึกการเปลี่ยนแปลง
          </button>
        </div>
      </div>

      <div className="px-5 md:px-7 py-5 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
          <aside className="lg:sticky lg:top-[76px] lg:self-start rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2">
            <div className="lg:hidden mb-2 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              หมวดที่เลือก: {activeLabel}
            </div>
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
              {TABS.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`h-10 px-3 rounded-md inline-flex items-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0">
            <ActiveTabContent tab={activeTab} />
          </main>
        </div>
      </div>
    </div>
  );
}
