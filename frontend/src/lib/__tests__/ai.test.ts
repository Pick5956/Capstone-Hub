import { beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../apiClient", () => ({ apiClient }));

import { askOperationsAI, confirmAIAction, deleteAIConversation } from "@/src/lib/ai";

describe("AI conversation API", () => {
  beforeEach(() => {
    apiClient.delete.mockReset();
    apiClient.post.mockReset();
  });

  it("passes a normalized conversation ID with the ask request", () => {
    askOperationsAI(
      "แล้วเมื่อวานล่ะ",
      [{ id: "turn-1-assistant", role: "assistant", content: "วันนี้ขายได้ 10,000 บาท" }],
      " conversation-123 ",
    );

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/ai/operations/ask", {
      question: "แล้วเมื่อวานล่ะ",
      history: [{ id: "turn-1-assistant", role: "assistant", content: "วันนี้ขายได้ 10,000 บาท" }],
      conversation_id: "conversation-123",
    });
  });

  it("omits an empty conversation ID during the local-history transition", () => {
    askOperationsAI("สรุปยอดขาย", [], "  ");

    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/ai/operations/ask", {
      question: "สรุปยอดขาย",
      history: [],
    });
  });

  it("URL-encodes the conversation ID used by the delete endpoint", () => {
    deleteAIConversation("conversation/123");

    expect(apiClient.delete).toHaveBeenCalledWith(
      "/api/v1/ai/operations/conversations/conversation%2F123",
    );
  });

  it("sends only the confirmation token when confirming an action preview", () => {
    confirmAIAction("preview/123", "one-time-secret");

    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/v1/ai/operations/actions/preview%2F123/confirm",
      { confirmation_token: "one-time-secret" },
    );
  });
});
