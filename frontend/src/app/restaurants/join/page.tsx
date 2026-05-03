"use client";

import { BackToRestaurants, WorkspaceShell } from "../restaurantWorkspaceUi";

function InvitePreview() {
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">ตัวอย่างคำเชิญ</p>
      <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-gray-900 dark:text-white">ครัวบ้านส้ม</p>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">สาขาหลัก · ร้านอาหารไทย</p>
          </div>
          <span className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            แคชเชียร์
          </span>
        </div>
        <p className="mt-3 text-[12px] text-gray-600 dark:text-gray-400">ผู้จัดการร้านเชิญให้คุณเข้าร่วมทีม เพื่อดูออเดอร์ โต๊ะ และการชำระเงิน</p>
      </div>
    </div>
  );
}

export default function JoinRestaurantPage() {
  return (
    <WorkspaceShell
      title="เข้าร่วมร้าน"
      description="สำหรับพนักงานที่ได้รับรหัสเชิญหรือลิงก์จากเจ้าของร้าน/ผู้จัดการ"
    >
      <div className="mt-6">
        <BackToRestaurants />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <section className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">กรอกรหัสเชิญ</h2>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">รหัสเชิญควรมาจากหน้า Settings &gt; ทีม ของร้าน</p>
          </div>

          <div className="p-4 space-y-4">
            <label className="block">
              <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">รหัสเชิญร้าน</span>
              <input
                placeholder="เช่น RH-8K2M"
                className="h-11 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-[15px] tracking-[0.14em] uppercase outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" className="h-10 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold hover:opacity-90 transition-opacity">
                ตรวจสอบคำเชิญ
              </button>
              <button type="button" className="h-10 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                วางลิงก์เชิญ
              </button>
            </div>

            <div className="rounded-md border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-900/15 px-3 py-2">
              <p className="text-[12px] font-medium text-sky-900 dark:text-sky-200">สำหรับ backend ต่อไป</p>
              <p className="mt-0.5 text-[11px] text-sky-800/80 dark:text-sky-300/80">ตรวจ invite code, เช็ค expiry, สร้าง restaurant_members และกำหนด role จากคำเชิญ</p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <InvitePreview />
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">พนักงานควรเห็นอะไรหลัง join?</h3>
            <ul className="mt-2 space-y-1.5 text-[12px] text-gray-500 dark:text-gray-400">
              <li>· ร้านที่เข้าร่วมในหน้าเลือกร้าน</li>
              <li>· dashboard ตามสิทธิ์ของ role</li>
              <li>· ปุ่มเปลี่ยนร้านถ้าอยู่หลายร้าน</li>
            </ul>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}

