import { describe, expect, it } from "vitest";

import { clearStoredChat, subscribeToChatClear } from "../aiChatStorage";
import { createRequestGeneration } from "../requestGeneration";

describe("createRequestGeneration", () => {
  it("rejects an in-flight response after the conversation is cleared", () => {
    const requests = createRequestGeneration();
    const oldRequest = requests.begin();

    requests.invalidate();

    expect(requests.isCurrent(oldRequest)).toBe(false);
    const newRequest = requests.begin();
    expect(requests.isCurrent(newRequest)).toBe(true);
  });
});

describe("shared chat clearing", () => {
  it("notifies every mounted chat surface for the same conversation", () => {
    const pageClears: string[] = [];
    const floatingClears: string[] = [];
    const unsubscribePage = subscribeToChatClear((key) => pageClears.push(key));
    const unsubscribeFloating = subscribeToChatClear((key) => floatingClears.push(key));

    clearStoredChat("restaurant_ai_chat:1:2");

    expect(pageClears).toEqual(["restaurant_ai_chat:1:2"]);
    expect(floatingClears).toEqual(["restaurant_ai_chat:1:2"]);

    unsubscribePage();
    unsubscribeFloating();
  });
});
