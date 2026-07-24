import { describe, expect, it } from "vitest";

import {
  matchesOrderEventFilter,
  parseOrderChangeEvent,
  parseServerSentEvents,
} from "../orderEvents";

describe("parseServerSentEvents", () => {
  it("keeps partial messages until the next stream chunk", () => {
    const first = parseServerSentEvents("", "id: 7\nevent: orders.changed\ndata: {\"order_id\":");
    expect(first.messages).toEqual([]);

    const second = parseServerSentEvents(first.buffer, "42}\n\n");
    expect(second.buffer).toBe("");
    expect(second.messages).toEqual([
      { id: "7", event: "orders.changed", data: '{"order_id":42}' },
    ]);
  });

  it("ignores heartbeat comments and parses multiple messages", () => {
    const parsed = parseServerSentEvents(
      "",
      ": keepalive\n\nevent: connected\ndata: {}\n\nevent: orders.changed\ndata: one\ndata: two\n\n",
    );

    expect(parsed.messages).toEqual([
      { event: "connected", data: "{}", id: undefined },
      { event: "orders.changed", data: "one\ntwo", id: undefined },
    ]);
  });
});

describe("parseOrderChangeEvent", () => {
  it("accepts valid order invalidations and rejects malformed payloads", () => {
    expect(parseOrderChangeEvent({
      event: "orders.changed",
      data: '{"type":"orders.changed","action":"item.status_updated","order_id":42,"occurred_at":"2026-07-20T00:00:00Z"}',
    })).toMatchObject({ action: "item.status_updated", order_id: 42 });
    expect(parseOrderChangeEvent({ event: "orders.changed", data: "not-json" })).toBeNull();
    expect(parseOrderChangeEvent({ event: "connected", data: "{}" })).toBeNull();
  });
});

describe("matchesOrderEventFilter", () => {
  const event = {
    type: "orders.changed" as const,
    action: "item.status_updated",
    order_id: 42,
    occurred_at: "2026-07-20T00:00:00Z",
  };

  it("limits order detail refreshes to the current order", () => {
    expect(matchesOrderEventFilter(event, { kind: "order", orderId: 42 })).toBe(true);
    expect(matchesOrderEventFilter(event, { kind: "order", orderId: 99 })).toBe(false);
  });

  it("keeps only kitchen-relevant actions for KDS", () => {
    expect(matchesOrderEventFilter(event, { kind: "kitchen" })).toBe(true);
    expect(matchesOrderEventFilter({ ...event, action: "order.sent_to_kitchen" }, { kind: "kitchen" })).toBe(true);
    expect(matchesOrderEventFilter({ ...event, action: "order.paid" }, { kind: "kitchen" })).toBe(false);
    expect(matchesOrderEventFilter({ ...event, action: "item.added" }, { kind: "kitchen" })).toBe(false);
  });
});
