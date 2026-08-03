import type { AIActionConfirmation } from "@/src/types/ai";

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
