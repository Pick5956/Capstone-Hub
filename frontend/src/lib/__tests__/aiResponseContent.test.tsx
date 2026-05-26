import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AIResponseContent from "@/src/components/shared/AIResponseContent";

describe("AIResponseContent", () => {
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
});
