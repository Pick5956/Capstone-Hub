import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RealtimeConnectionNotice from "./RealtimeConnectionNotice";

describe("RealtimeConnectionNotice", () => {
  it("stays hidden while live updates are connected", () => {
    expect(renderToStaticMarkup(
      <RealtimeConnectionNotice language="th" status="connected" />,
    )).toBe("");
  });

  it("announces reconnecting state in Thai and English", () => {
    const thai = renderToStaticMarkup(
      <RealtimeConnectionNotice language="th" status="reconnecting" />,
    );
    const english = renderToStaticMarkup(
      <RealtimeConnectionNotice language="en" status="reconnecting" />,
    );

    expect(thai).toContain('role="status"');
    expect(thai).toContain("กำลังเชื่อมต่อข้อมูลสดใหม่");
    expect(english).toContain("Reconnecting live updates");
  });
});
