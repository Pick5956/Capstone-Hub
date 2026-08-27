import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import InlineDbConfirmBar, {
  RING_CIRCUMFERENCE,
  barView,
  canConfirm,
  formatCountdown,
  isTerminal,
  ringDashoffset,
} from "./InlineDbConfirmBar";

describe("InlineDbConfirmBar helpers", () => {
  it("formats the countdown as m:ss and floors at zero", () => {
    expect(formatCountdown(272_000)).toBe("4:32");
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(-500)).toBe("0:00");
  });

  it("empties the ring as time runs out and fills it in any terminal state", () => {
    const total = 300_000;
    expect(ringDashoffset("pending", total, total)).toBeCloseTo(0, 5); // full time → full ring
    expect(ringDashoffset("pending", total / 2, total)).toBeCloseTo(RING_CIRCUMFERENCE / 2, 5);
    expect(ringDashoffset("pending", 0, total)).toBeCloseTo(RING_CIRCUMFERENCE, 5); // out of time
    for (const s of ["confirming", "done", "cancelled", "expired"] as const) {
      expect(ringDashoffset(s, 0, total)).toBe(0); // terminal / confirming → full ring
    }
  });

  it("only allows confirming from pending (guards double-clicks)", () => {
    expect(canConfirm("pending")).toBe(true);
    for (const s of ["confirming", "done", "cancelled", "expired"] as const) {
      expect(canConfirm(s)).toBe(false);
    }
    expect(isTerminal("done") && isTerminal("cancelled") && isTerminal("expired")).toBe(true);
    expect(isTerminal("pending") || isTerminal("confirming")).toBe(false);
  });

  it("maps each state to the right status text, highlight and buttons", () => {
    const base = { detail: "แก้ข้อมูลจริง 1 รายการ", remainingMs: 272_000, language: "th" as const };

    const pending = barView("pending", base);
    expect(pending.statusText).toContain("แก้ข้อมูลจริง 1 รายการ");
    expect(pending.statusText).toContain("กดยืนยันภายใน 4:32");
    expect(pending.highlight).toBe("to");
    expect(pending.glow).toBe(true);
    expect(pending.buttons).toBe("confirm");

    expect(barView("confirming", base).icon).toBe("spinner");
    expect(barView("pending", { ...base, error: "พลาด" }).statusText).toBe("พลาด");

    const done = barView("done", base);
    expect(done.statusText).toBe("บันทึกลงระบบแล้ว · มีผลทันที");
    expect(done.icon).toBe("check");
    expect(done.highlight).toBe("to");
    expect(done.buttons).toBe("undo");

    const cancelled = barView("cancelled", base);
    expect(cancelled.statusText).toBe("ยกเลิกแล้ว · ไม่มีการแก้ข้อมูล");
    expect(cancelled.icon).toBe("x");
    expect(cancelled.highlight).toBe("from"); // the old value comes back
    expect(cancelled.buttons).toBe("reissue");

    expect(barView("expired", base).statusText).toBe("คำสั่งหมดอายุ · ไม่มีการแก้ข้อมูล");
    expect(barView("done", { ...base, language: "en" }).statusText).toBe("Saved · takes effect now");
  });
});

describe("InlineDbConfirmBar render", () => {
  it("renders as a labelled group with the item, both labels and a confirm button", () => {
    const html = renderToStaticMarkup(
      <InlineDbConfirmBar
        itemName="ต้มยำกุ้งน้ำข้น"
        fromLabel="เปิดขาย"
        toLabel="ปิดขาย"
        detail="แก้ข้อมูลจริง 1 รายการ"
        expiresAt={new Date(Date.now() + 300_000).toISOString()}
        onConfirm={async () => {}}
        onCancel={() => {}}
        language="th"
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain("ต้มยำกุ้งน้ำข้น");
    expect(html).toContain("เปิดขาย");
    expect(html).toContain("ปิดขาย");
    expect(html).toContain("ยืนยัน");
    expect(html).toContain("aria-live=\"polite\"");
  });
});
