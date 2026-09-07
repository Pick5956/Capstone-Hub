import { describe, expect, it } from "vitest";
import { parseSSE } from "@/src/lib/aiStream";

describe("parseSSE", () => {
  it("reads the events gin writes, with or without a space after the colon", () => {
    const { events, rest } = parseSSE('event:draft\ndata:{"text":"สวัสดี"}\n\nevent: answer\ndata: {"answer":"ครับ"}\n\n');
    expect(events).toEqual([
      { event: "draft", data: '{"text":"สวัสดี"}' },
      { event: "answer", data: '{"answer":"ครับ"}' },
    ]);
    expect(rest).toBe("");
  });

  it("keeps an unfinished event for the next chunk and joins multi-line data", () => {
    const first = parseSSE("event:draft\ndata:line one\ndata:line two\n\nevent:draft\ndata:{\"te");
    expect(first.events).toEqual([{ event: "draft", data: "line one\nline two" }]);
    expect(first.rest).toBe('event:draft\ndata:{"te');
    const second = parseSSE(first.rest + 'xt":"x"}\n\n');
    expect(second.events).toEqual([{ event: "draft", data: '{"text":"x"}' }]);
    expect(second.rest).toBe("");
  });

  it("skips comments and blank keep-alives", () => {
    const { events } = parseSSE(": ping\n\n\n\nevent:answer\ndata:{}\n\n");
    expect(events).toEqual([{ event: "answer", data: "{}" }]);
  });
});
