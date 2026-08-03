import type { DisplayLanguage } from '@/src/lib/display-preferences';

const permissionDefinitions = [
  {
    title: { th: 'หน้าร้านและการชำระเงิน', en: 'Front of house & payments' },
    rows: [
      { key: 'take_order', label: { th: 'รับออเดอร์', en: 'Take orders' } },
      { key: 'take_payment', label: { th: 'รับชำระเงิน', en: 'Take payments' } },
    ],
  },
  {
    title: { th: 'ครัวและการเสิร์ฟ', en: 'Kitchen & service' },
    rows: [
      { key: 'view_kitchen', label: { th: 'ดูคิวครัว', en: 'View kitchen queue' } },
      { key: 'update_order_status', label: { th: 'อัปเดตสถานะอาหาร', en: 'Update food status' } },
    ],
  },
  {
    title: { th: 'ข้อมูลร้าน', en: 'Restaurant data' },
    rows: [
      { key: 'view_dashboard', label: { th: 'ดูภาพรวมร้าน', en: 'View dashboard' } },
      { key: 'view_orders', label: { th: 'ดูออเดอร์', en: 'View orders' } },
      { key: 'view_tables', label: { th: 'ดูโต๊ะ', en: 'View tables' } },
      { key: 'manage_table', label: { th: 'จัดการโต๊ะ', en: 'Manage tables' } },
      { key: 'manage_menu', label: { th: 'จัดการเมนู', en: 'Manage menu' } },
      { key: 'view_inventory', label: { th: 'ดูคลังวัตถุดิบ', en: 'View inventory' } },
      { key: 'manage_inventory', label: { th: 'จัดการคลังวัตถุดิบ', en: 'Manage inventory' } },
      { key: 'view_reports', label: { th: 'ดูรายงานและ AI', en: 'View reports & AI' } },
      { key: 'manage_staff', label: { th: 'จัดการพนักงาน', en: 'Manage staff' } },
    ],
  },
] as const;

export function permissionGroupsFor(language: DisplayLanguage = 'th') {
  return permissionDefinitions.map((group) => ({
    title: group.title[language],
    rows: group.rows.map((row) => ({
      key: row.key,
      label: row.label[language],
    })),
  }));
}

export const allPermissions = permissionDefinitions.flatMap((group) => (
  group.rows.map((row) => row.key)
));
export function parsePermissions(value?: string | null) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item !== '*') : []; } catch { return []; } }
