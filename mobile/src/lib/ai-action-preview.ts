import type {
  AIActionConfirmation,
  AIActionPreview,
} from '@/src/types/ai';
import type { DisplayLanguage } from '@/src/lib/display-preferences';

function availabilityLabel(isAvailable: boolean, language: DisplayLanguage): string {
  if (language === 'th') return isAvailable ? 'เปิดขาย' : 'ปิดขาย';
  return isAvailable ? 'Available' : 'Unavailable';
}

function formatExpiry(value: string, language: DisplayLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function describeAIActionPreview(
  preview: AIActionPreview,
  language: DisplayLanguage,
) {
  const copy = language === 'th'
    ? {
        title: 'ตรวจสอบก่อนให้ AI ดำเนินการ',
        description: 'ระบบยังไม่ได้เปลี่ยนข้อมูล กรุณาตรวจสอบรายละเอียดแล้วกดยืนยัน',
        menuLabel: 'เมนู',
        currentLabel: 'สถานะปัจจุบัน',
        requestedLabel: 'สถานะหลังยืนยัน',
        expiresLabel: 'ยืนยันได้ถึง',
        warningsLabel: 'ข้อควรทราบ',
        confirmLabel: 'ยืนยันการเปลี่ยนแปลง',
        confirmingLabel: 'กำลังยืนยัน...',
        cancelLabel: 'ยกเลิก',
        cancellingLabel: 'กำลังยกเลิก...',
      }
    : {
        title: 'Review before AI takes action',
        description: 'Nothing has changed yet. Review the details, then confirm to continue.',
        menuLabel: 'Menu item',
        currentLabel: 'Current status',
        requestedLabel: 'Status after confirmation',
        expiresLabel: 'Confirm before',
        warningsLabel: 'Important',
        confirmLabel: 'Confirm change',
        confirmingLabel: 'Confirming...',
        cancelLabel: 'Cancel',
        cancellingLabel: 'Cancelling...',
      };

  const currentValue = availabilityLabel(preview.current.is_available, language);
  const requestedValue = availabilityLabel(preview.requested.is_available, language);
  const summary = language === 'th'
    ? `เปลี่ยนเมนู “${preview.target.name}” จาก${currentValue}เป็น${requestedValue}`
    : `Change “${preview.target.name}” from ${currentValue.toLowerCase()} to ${requestedValue.toLowerCase()}.`;
  const warnings = language === 'th'
    ? [preview.requested.is_available
        ? 'ลูกค้าจะสั่งเมนูนี้ได้ทันทีหลังยืนยัน'
        : 'ลูกค้าจะสั่งเมนูนี้ไม่ได้หลังยืนยัน']
    : [preview.requested.is_available
        ? 'Customers can order it immediately after confirmation.'
        : 'Customers cannot order it after confirmation.'];

  return {
    ...copy,
    menuName: preview.target.name,
    summary,
    currentValue,
    requestedValue,
    expiresValue: formatExpiry(preview.expires_at, language),
    warnings,
  };
}

export function formatAIActionConfirmationMessage(
  confirmation: AIActionConfirmation,
  language: DisplayLanguage,
): string {
  const availability = availabilityLabel(confirmation.result.is_available, language);
  if (language === 'th') {
    const replayed = confirmation.replayed
      ? ' ระบบพบว่าคำขอนี้ดำเนินการไปแล้ว จึงไม่ทำซ้ำครับ'
      : '';
    return `ดำเนินการสำเร็จ: เมนู “${confirmation.result.name}” เปลี่ยนเป็นสถานะ${availability}แล้วครับ${replayed}`;
  }
  const replayed = confirmation.replayed
    ? ' This action had already completed, so it was not run twice.'
    : '';
  return `Action completed: “${confirmation.result.name}” is now ${availability.toLowerCase()}.${replayed}`;
}

export function getAIActionErrorMessage(
  error: unknown,
  language: DisplayLanguage,
): string {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  if (status === 410) {
    return language === 'th'
      ? 'คำยืนยันหมดอายุแล้ว กรุณาขอให้ AI เตรียมรายการใหม่'
      : 'This confirmation has expired. Ask AI to prepare the action again.';
  }
  if (status === 409) {
    return language === 'th'
      ? 'ข้อมูลเปลี่ยนไปหลังสร้างรายการ กรุณาตรวจสอบแล้วขอรายการใหม่'
      : 'The data changed after this preview was created. Review it and request a new action.';
  }
  return language === 'th'
    ? 'ยืนยันการเปลี่ยนแปลงไม่สำเร็จ กรุณาตรวจสอบรายการแล้วลองใหม่'
    : 'The change could not be confirmed. Review the action and try again.';
}

export function getAIActionCancellationErrorMessage(language: DisplayLanguage): string {
  return language === 'th'
    ? 'เซิร์ฟเวอร์ยังยืนยันการยกเลิกไม่ได้ กรุณาตรวจสอบสถานะแล้วลองอีกครั้ง'
    : 'The server could not confirm cancellation. Check the preview status and try again.';
}

export function isTerminalAIActionCancellationError(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  return status === 404 || status === 409 || status === 410;
}
