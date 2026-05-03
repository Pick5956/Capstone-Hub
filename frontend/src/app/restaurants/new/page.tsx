"use client";

import { useState } from "react";
import Link from "next/link";
import { BackToRestaurants, PLAN, RESTAURANT_TYPES, WorkspaceShell } from "../restaurantWorkspaceUi";

function Field({
  label,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</span>
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
      />
    </label>
  );
}

function Step({
  number,
  title,
  active,
}: {
  number: string;
  title: string;
  active?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${active ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300" : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400"}`}>
      <span className="h-5 w-5 rounded-full bg-current/10 inline-flex items-center justify-center text-[11px] font-semibold">{number}</span>
      <span className="text-[12px] font-medium">{title}</span>
    </div>
  );
}

export default function NewRestaurantPage() {
  const [type, setType] = useState(RESTAURANT_TYPES[0]);
  const planFull = PLAN.usedRestaurants >= PLAN.maxRestaurants;

  return (
    <WorkspaceShell
      title="สร้างร้านใหม่"
      description="ขั้นตอนนี้ใช้สำหรับเจ้าของร้านหรือผู้ดูแลที่ต้องการเปิดร้านแรกหรือเพิ่มสาขาใหม่"
    >
      <div className="mt-6 flex items-center justify-between gap-3">
        <BackToRestaurants />
        <Link href="/settings" className="text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline">
          ดูแพ็กเกจ
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <section className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">ข้อมูลเริ่มต้นของร้าน</h2>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">ยังเป็น UI mock ก่อนผูก backend และ plan จริง</p>
          </div>

          {planFull ? (
            <div className="p-4">
              <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 px-4 py-3">
                <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">แพ็กเกจ Free เปิดร้านได้ 1 ร้าน</p>
                <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">อัปเกรดเป็น Pro เพื่อสร้างร้านหรือสาขาเพิ่ม</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="ชื่อร้าน" placeholder="เช่น ครัวบ้านส้ม" />
                <Field label="ชื่อสาขา" placeholder="สาขาหลัก" />
                <label className="block">
                  <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">ประเภทร้าน</span>
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
                  >
                    {RESTAURANT_TYPES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <Field label="เบอร์ร้าน" placeholder="044-000-000" />
              </div>

              <Field label="ที่อยู่ร้าน" placeholder="ที่อยู่สำหรับใบเสร็จและข้อมูลร้าน" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="เวลาเปิด" type="time" value="17:00" />
                <Field label="เวลาปิด" type="time" value="24:00" />
                <Field label="จำนวนโต๊ะเริ่มต้น" type="number" value="12" />
              </div>

              <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-3">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-white">หลังสร้างร้านแล้ว</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {["ตั้งค่าเมนู", "จัดผังโต๊ะ", "เชิญทีม"].map((item) => (
                    <div key={item} className="rounded-md bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-3 py-2 text-[12px] font-medium text-gray-700 dark:text-gray-300">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" className="h-10 w-full rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold hover:opacity-90 transition-opacity">
                สร้างร้านและเริ่มตั้งค่า
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <Step number="1" title="ข้อมูลร้าน" active />
          <Step number="2" title="สาขาและเวลาเปิดปิด" active />
          <Step number="3" title="เมนูและโต๊ะ" />
          <Step number="4" title="เชิญทีม" />
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">Business rule</p>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">การสร้างร้านควรเช็ค limit จาก subscription ที่ account/workspace ไม่ใช่จาก user โดยตรง</p>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}

