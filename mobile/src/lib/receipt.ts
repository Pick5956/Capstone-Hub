import type { DisplayLanguage } from '@/src/lib/display-preferences';
import type { Bill } from '@/src/types/order';
import type { Restaurant } from '@/src/types/restaurant';

function receiptMoney(value: number, language: DisplayLanguage): string {
  return `฿${Number(value || 0).toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function staffName(bill: Bill): string {
  const staff = bill.order.staff;
  if (!staff) return '-';
  return staff.nickname?.trim()
    || [staff.first_name, staff.last_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
    || '-';
}

function receiptDate(bill: Bill, language: DisplayLanguage): string {
  const payment = bill.payments.at(-1);
  const value = payment?.paid_at
    || bill.order.closed_at
    || bill.order.opened_at
    || bill.order.order_date;
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function locationLabel(bill: Bill, language: DisplayLanguage): string {
  return bill.order.table?.display_label
    || (bill.order.order_type === 'takeaway'
      ? language === 'th' ? 'ซื้อกลับบ้าน' : 'Takeaway'
      : bill.order.order_number);
}

export function buildReceiptShareText(
  bill: Bill,
  restaurant?: Pick<Restaurant, 'name' | 'branch_name' | 'address' | 'phone'>,
  language: DisplayLanguage = 'th',
): string {
  const payment = bill.payments.at(-1);
  const copy = (thai: string, english: string) => language === 'th' ? thai : english;
  const lines = [
    restaurant?.name?.trim() || 'Dishy',
    restaurant?.branch_name?.trim() || '',
    restaurant?.address?.trim() || '',
    restaurant?.phone?.trim() ? `Tel. ${restaurant.phone.trim()}` : '',
    copy('ใบเสร็จรับเงิน', 'Receipt'),
    `${copy('เลขอ้างอิง', 'Reference')} ${bill.order.order_number}`,
    `${copy('วันที่', 'Date')} ${receiptDate(bill, language)}`,
    `${copy('โต๊ะ / ช่องทาง', 'Table / channel')} ${locationLabel(bill, language)}`,
    `${copy('พนักงาน', 'Staff')} ${staffName(bill)}`,
    '',
    ...bill.items.flatMap((item) => [
      `${item.quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')} × ${item.menu_name}  ${receiptMoney(item.subtotal, language)}`,
      item.selected_options?.length
        ? `+ ${item.selected_options.map((option) => option.option_name).join(', ')}`
        : '',
      item.note?.trim() ? `* ${item.note.trim()}` : '',
    ]),
    '',
    `${copy('ยอดอาหาร', 'Food subtotal')} ${receiptMoney(bill.subtotal, language)}`,
    bill.discount_amount > 0 ? `${copy('ส่วนลด', 'Discount')} −${receiptMoney(bill.discount_amount, language)}` : '',
    bill.service_charge_enabled || bill.service_charge_amount > 0
      ? `${copy('ค่าบริการ', 'Service charge')} ${receiptMoney(bill.service_charge_amount, language)}`
      : '',
    bill.vat_enabled || bill.vat_amount > 0 ? `VAT ${receiptMoney(bill.vat_amount, language)}` : '',
    `${copy('ยอดสุทธิ', 'Grand total')} ${receiptMoney(bill.grand_total, language)}`,
    payment
      ? `${copy('ชำระโดย', 'Paid by')} ${payment.method === 'cash' ? copy('เงินสด', 'Cash') : 'PromptPay QR'}`
      : copy('ยังไม่ชำระ', 'Unpaid'),
    '',
    copy('ขอบคุณที่ใช้บริการ', 'Thank you'),
  ];

  return lines.filter((line, index) => line || lines[index - 1] !== '').join('\n').trim();
}
