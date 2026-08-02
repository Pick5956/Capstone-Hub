import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReceiptShareText } from './receipt.ts';

test('shared receipt carries the same restaurant and payment context as web receipts', () => {
  const bill = {
    order: {
      order_number: 'A001',
      order_type: 'dine_in',
      opened_at: '2026-07-29T10:00:00Z',
      closed_at: '2026-07-29T10:30:00Z',
      table: { display_label: 'โต๊ะ A1' },
      staff: { nickname: 'มะลิ', first_name: '', last_name: '' },
    },
    items: [{
      ID: 1,
      menu_name: 'ข้าวผัด',
      quantity: 2,
      subtotal: 120,
      selected_options: [{ ID: 1, option_name: 'ไข่ดาว' }],
      note: 'ไม่ใส่หอม',
    }],
    subtotal: 120,
    discount_amount: 0,
    service_charge_enabled: false,
    service_charge_amount: 0,
    vat_enabled: false,
    vat_amount: 0,
    grand_total: 120,
    payment_status: 'paid',
    payments: [{
      method: 'promptpay_qr',
      paid_at: '2026-07-29T10:30:00Z',
    }],
  };
  const restaurant = {
    name: 'ร้านตัวอย่าง',
    branch_name: 'สาขากลาง',
    address: 'กรุงเทพฯ',
    phone: '0000000000',
  };

  const receipt = buildReceiptShareText(bill, restaurant);

  for (const expected of [
    'ร้านตัวอย่าง',
    'สาขากลาง',
    'กรุงเทพฯ',
    'Tel. 0000000000',
    'เลขอ้างอิง A001',
    'โต๊ะ / ช่องทาง โต๊ะ A1',
    'พนักงาน มะลิ',
    '2 × ข้าวผัด',
    'ไข่ดาว',
    'ไม่ใส่หอม',
    'ชำระโดย PromptPay QR',
  ]) {
    assert.match(receipt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('shared receipt falls back safely when optional identity fields are absent', () => {
  const receipt = buildReceiptShareText({
    order: {
      order_number: 'A002',
      order_type: 'takeaway',
      opened_at: 'not-a-date',
    },
    items: [],
    subtotal: 0,
    discount_amount: 0,
    service_charge_enabled: false,
    service_charge_amount: 0,
    vat_enabled: false,
    vat_amount: 0,
    grand_total: 0,
    payment_status: 'unpaid',
    payments: [],
  });

  assert.match(receipt, /Dishy/);
  assert.match(receipt, /โต๊ะ \/ ช่องทาง ซื้อกลับบ้าน/);
  assert.match(receipt, /วันที่ -/);
  assert.match(receipt, /พนักงาน -/);
});

test('shared receipt localizes labels, money, dates, and payment method in English', () => {
  const receipt = buildReceiptShareText({
    order: {
      order_number: 'A003',
      order_type: 'takeaway',
      opened_at: '2026-07-29T10:00:00Z',
      staff: { nickname: 'May', first_name: '', last_name: '' },
    },
    items: [{
      ID: 1,
      menu_name: 'Fried rice',
      quantity: 2,
      subtotal: 1200,
      selected_options: [],
    }],
    subtotal: 1200,
    discount_amount: 0,
    service_charge_enabled: false,
    service_charge_amount: 0,
    vat_enabled: false,
    vat_amount: 0,
    grand_total: 1200,
    payment_status: 'paid',
    payments: [{ method: 'cash', paid_at: '2026-07-29T10:30:00Z' }],
  }, undefined, 'en');

  for (const expected of [
    'Receipt',
    'Reference A003',
    'Date ',
    'Table / channel Takeaway',
    'Staff May',
    '2 × Fried rice  ฿1,200.00',
    'Food subtotal ฿1,200.00',
    'Grand total ฿1,200.00',
    'Paid by Cash',
    'Thank you',
  ]) {
    assert.match(receipt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
