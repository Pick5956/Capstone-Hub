import type { AIActionConfirmation, AIActionPreview } from "@/src/types/ai";

function availabilityLabel(isAvailable: boolean, language: "th" | "en") {
  if (language === "th") return isAvailable ? "เปิดขาย" : "ปิดขาย";
  return isAvailable ? "available" : "unavailable";
}

export function describeAIActionPreview(preview: AIActionPreview, language: "th" | "en") {
  const before = availabilityLabel(preview.current.is_available, language);
  const after = availabilityLabel(preview.requested.is_available, language);
  if (language === "th") {
    return {
      summary: `เปลี่ยนเมนู “${preview.target.name}” จาก${before}เป็น${after}`,
      warnings: [preview.requested.is_available
        ? "ลูกค้าจะสั่งเมนูนี้ได้ทันทีหลังยืนยัน"
        : "ลูกค้าจะสั่งเมนูนี้ไม่ได้หลังยืนยัน"],
    };
  }
  return {
    summary: `Change “${preview.target.name}” from ${before} to ${after}.`,
    warnings: [preview.requested.is_available
      ? "Customers can order it immediately after confirmation."
      : "Customers cannot order it after confirmation."],
  };
}

export function formatAIActionConfirmationMessage(
  confirmation: AIActionConfirmation,
  language: "th" | "en",
) {
  const availability = language === "th"
    ? (confirmation.result.is_available ? "เปิดขาย" : "ปิดขาย")
    : (confirmation.result.is_available ? "available" : "unavailable");

  if (language === "th") {
    const replayed = confirmation.replayed ? " ระบบพบว่าคำขอนี้ดำเนินการไปแล้ว จึงไม่ทำซ้ำครับ" : "";
    return `ดำเนินการสำเร็จ: เมนู “${confirmation.result.name}” เปลี่ยนเป็นสถานะ${availability}แล้วครับ${replayed}`;
  }

  const replayed = confirmation.replayed ? " This action had already completed, so it was not run twice." : "";
  return `Action completed: “${confirmation.result.name}” is now ${availability}.${replayed}`;
}

export function getAIActionErrorMessage(error: unknown, language: "th" | "en") {
  const responseMessage =
    typeof error === "object" && error !== null && "response" in error
      ? (error as { response?: { data?: { error?: string } } }).response?.data?.error?.trim()
      : "";

  return responseMessage || (language === "th"
    ? "ยืนยันการเปลี่ยนแปลงไม่สำเร็จ กรุณาตรวจสอบรายการแล้วลองใหม่"
    : "The change could not be confirmed. Review the action and try again.");
}

export function getAIActionCancellationErrorMessage(language: "th" | "en") {
  return language === "th"
    ? "เซิร์ฟเวอร์ยังยืนยันการยกเลิกไม่ได้ กรุณาตรวจสอบสถานะแล้วลองอีกครั้ง"
    : "The server could not confirm cancellation. Check the preview status and try again.";
}

export function isTerminalAIActionCancellationError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const directStatus = "status" in error ? Number((error as { status?: unknown }).status) : 0;
  const responseStatus = "response" in error
    ? Number((error as { response?: { status?: unknown } }).response?.status)
    : 0;
  const status = responseStatus || directStatus;
  return status === 404 || status === 409 || status === 410;
}
