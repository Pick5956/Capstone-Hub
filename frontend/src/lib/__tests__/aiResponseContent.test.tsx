import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AIResponseContent from "@/src/components/shared/AIResponseContent";

describe("AIResponseContent", () => {
  it.each([undefined, null, { answer: "unexpected object" }])(
    "does not crash the page when message content is malformed: %s",
    (content) => {
      expect(() => renderToStaticMarkup(
        <AIResponseContent content={content as never} />
      )).not.toThrow();
    },
  );

  it("renders an exact internal Dishy docs citation as a clickable link", () => {
    const markup = renderToStaticMarkup(
      <AIResponseContent
        content={"อ่านต่อ: [วิธีรับเงิน](/docs/billing-and-payments#payment-methods)"}
      />
    );

    expect(markup).toContain(
      '<a href="/docs/billing-and-payments#payment-methods"',
    );
    expect(markup).toContain(">วิธีรับเงิน</a>");
  });

  it("renders the exact consecutive invite-staff steps without crashing", () => {
    const answer = `1. เลือกบทบาท — เลือกบทบาทมาตรฐานหรือบทบาทที่ร้านสร้างเอง
2. สร้างลิงก์คำเชิญ — อีเมลเป็นข้อมูลเสริม ลิงก์คำเชิญเป็นสิ่งที่สมาชิกใช้เปิดและยอมรับ
3. ติดตามสถานะ — ดูคำเชิญที่รอรับ ยกเลิกลิงก์เดิม หรือสร้างใหม่เมื่อหมดอายุ

อ่านต่อ: [ทีม บทบาท และสิทธิ์ — เชิญสมาชิก](/docs/team-and-permissions#invite-staff)`;

    expect(() => renderToStaticMarkup(
      <AIResponseContent content={answer} compact />
    )).not.toThrow();

    const markup = renderToStaticMarkup(
      <AIResponseContent content={answer} compact />
    );
    expect(markup).toContain("<ol");
    expect(markup).toContain("สร้างลิงก์คำเชิญ");
    expect(markup).toContain('<a href="/docs/team-and-permissions#invite-staff"');
  });

  it("renders a citation to the overview article's canonical root route", () => {
    const markup = renderToStaticMarkup(
      <AIResponseContent content={"อ่านต่อ: [ภาพรวม Dishy](/docs#workflow)"} />
    );

    expect(markup).toContain('<a href="/docs#workflow"');
  });

  it.each([
    ["external", "https://example.com/docs/billing-and-payments#payment-methods"],
    ["javascript", "javascript:alert(1)"],
    ["query-bearing", "/docs/billing-and-payments?source=ai#payment-methods"],
    ["missing-fragment", "/docs/billing-and-payments"],
    ["uppercase", "/docs/Billing-and-payments#payment-methods"],
    ["underscore", "/docs/billing_and_payments#payment-methods"],
    ["malformed-kebab", "/docs/billing--payments#payment-methods"],
  ])("renders a rejected %s Markdown link as plain text", (_, href) => {
    const citation = `[อ่านต่อ](${href})`;
    const markup = renderToStaticMarkup(<AIResponseContent content={citation} />);

    expect(markup).not.toContain("<a");
    expect(markup).toContain(citation);
  });

  it("renders display formulas from AI answers instead of exposing LaTeX syntax", () => {
    const markup = renderToStaticMarkup(
      <AIResponseContent
        content={`มาร์จิ้น (Margin) คำนวณจาก

\\[
\\text{Margin (\\%)} = \\frac{\\text{กำไรสุทธิ}}{\\text{รายได้รวม}} \\times 100
\\]

- กำไรสุทธิ = รายได้ - ต้นทุน`}
      />
    );

    expect(markup).toContain("katex-display");
    expect(markup).toContain("<mfrac>");
    expect(markup).toContain("<ul");
    expect(markup).not.toContain("\\[");
  });

  it("renders inline formulas inside regular paragraphs", () => {
    const markup = renderToStaticMarkup(
      <AIResponseContent content={"ค่า \\(40\\%\\) หมายถึงกำไรต่อรายได้"} compact />
    );

    expect(markup).toContain("katex");
    expect(markup).not.toContain("\\(40");
  });

  it("preserves ordered list numbers when detail paragraphs split menu ranking items", () => {
    const markup = renderToStaticMarkup(
      <AIResponseContent
        content={`เมนูที่ขายดีที่สุดในช่วงวิเคราะห์มีดังนี้ครับ:

1. **สังขยาใบเตย**
• จำนวนที่ขายได้: 36 จาน

2. **โรตีกล้วย**
• จำนวนที่ขายได้: 34 จาน

3. **พะแนงหมู**
• จำนวนที่ขายได้: 32 จาน`}
        compact
      />
    );

    expect(markup).toContain('<ol start="1"');
    expect(markup).toContain('<ol start="2"');
    expect(markup).toContain('<ol start="3"');
  });
});
