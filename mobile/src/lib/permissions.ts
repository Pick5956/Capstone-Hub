export const permissionGroups = [
  { title: 'หน้าร้านและการชำระเงิน', rows: [
    { key: 'take_order', label: 'รับออเดอร์' }, { key: 'take_payment', label: 'รับชำระเงิน' },
  ] },
  { title: 'ครัวและการเสิร์ฟ', rows: [
    { key: 'view_kitchen', label: 'ดูคิวครัว' }, { key: 'update_order_status', label: 'อัปเดตสถานะอาหาร' },
  ] },
  { title: 'ข้อมูลร้าน', rows: [
    { key: 'view_dashboard', label: 'ดูภาพรวมร้าน' }, { key: 'view_orders', label: 'ดูออเดอร์' }, { key: 'view_tables', label: 'ดูโต๊ะ' },
    { key: 'manage_table', label: 'จัดการโต๊ะ' }, { key: 'manage_menu', label: 'จัดการเมนู' },
    { key: 'view_inventory', label: 'ดูคลังวัตถุดิบ' }, { key: 'manage_inventory', label: 'จัดการคลังวัตถุดิบ' },
    { key: 'view_reports', label: 'ดูรายงานและ AI' }, { key: 'manage_staff', label: 'จัดการพนักงาน' },
  ] },
] as const;

export const allPermissions = permissionGroups.flatMap((group) => group.rows.map((row) => row.key));
export function parsePermissions(value?: string | null) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item !== '*') : []; } catch { return []; } }
