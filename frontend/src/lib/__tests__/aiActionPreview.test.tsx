import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AIActionPreviewCard from "@/src/components/shared/AIActionPreviewCard";
import { formatAIActionConfirmationMessage } from "@/src/lib/aiActionPreview";
import type { AIActionConfirmation, AIActionPreview } from "@/src/types/ai";

const preview: AIActionPreview = {
  id: "preview-1",
  action_type: "set_menu_availability",
  status: "pending",
  expires_at: "2026-08-03T12:30:00Z",
  confirmation_token: "must-not-appear-in-markup",
  summary: "Temporarily stop selling this item.",
  target: { menu_item_id: 42, name: "Pad Thai" },
  current: { is_available: true },
  requested: { is_available: false },
  warnings: ["Customers will still see the item as unavailable."],
};

describe("AIActionPreviewCard", () => {
  it("shows the before/after state in English without rendering the secret token", () => {
    const markup = renderToStaticMarkup(
      <AIActionPreviewCard
        preview={preview}
        language="en"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(markup).toContain("Review before AI takes action");
    expect(markup).toContain("Current status");
    expect(markup).toContain("Available");
    expect(markup).toContain("Unavailable");
    expect(markup).toContain("Confirm change");
    expect(markup).not.toContain(preview.confirmation_token);
  });

  it("renders Thai confirmation and cancellation labels", () => {
    const markup = renderToStaticMarkup(
      <AIActionPreviewCard
        preview={preview}
        language="th"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(markup).toContain("ตรวจสอบก่อนให้ AI ดำเนินการ");
    expect(markup).toContain("ยืนยันการเปลี่ยนแปลง");
    expect(markup).toContain("ยกเลิก");
  });
});

describe("formatAIActionConfirmationMessage", () => {
  const confirmation: AIActionConfirmation = {
    action_id: "action-1",
    status: "executed",
    replayed: false,
    executed_at: "2026-08-03T12:00:00Z",
    message: "executed",
    result: { menu_item_id: 42, name: "Pad Thai", is_available: false },
  };

  it("formats a localized assistant result after confirmation", () => {
    expect(formatAIActionConfirmationMessage(confirmation, "th")).toContain("ปิดขาย");
    expect(formatAIActionConfirmationMessage(confirmation, "en")).toContain("unavailable");
  });
});
