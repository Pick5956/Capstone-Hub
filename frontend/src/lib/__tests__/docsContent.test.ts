import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOC_SLUG,
  DOC_ARTICLES,
  DOC_GROUPS,
  docArticleBySlug,
  docArticleFromPathname,
  docArticleHref,
  docSectionAnchor,
  docSectionHref,
  searchDocEntries,
  searchDocs,
  type LocalizedText,
} from "../docsContent";

function expectLocalizedText(value: LocalizedText) {
  expect(value.th.trim()).not.toBe("");
  expect(value.en.trim()).not.toBe("");
}

describe("documentation catalog", () => {
  it("uses stable unique identifiers for every group, article, and section", () => {
    const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const groupIds = DOC_GROUPS.map((group) => group.id);
    const articleSlugs = DOC_ARTICLES.map((article) => article.slug);

    expect(new Set(groupIds).size).toBe(groupIds.length);
    expect(new Set(articleSlugs).size).toBe(articleSlugs.length);
    expect(groupIds.every((id) => identifier.test(id))).toBe(true);
    expect(articleSlugs.every((slug) => identifier.test(slug))).toBe(true);
    expect(articleSlugs).toContain(DEFAULT_DOC_SLUG);

    for (const article of DOC_ARTICLES) {
      const sectionIds = article.sections.map((section) => section.id);
      expect(new Set(sectionIds).size).toBe(sectionIds.length);
      expect(sectionIds.every((id) => identifier.test(id))).toBe(true);
    }
  });

  it("maps every article to a unique public route and resolves it back", () => {
    const hrefs = DOC_ARTICLES.map(docArticleHref);
    expect(new Set(hrefs).size).toBe(DOC_ARTICLES.length);
    expect(docArticleHref(DEFAULT_DOC_SLUG)).toBe("/docs");

    for (const article of DOC_ARTICLES) {
      expect(docArticleBySlug(article.slug)).toBe(article);
      expect(docArticleFromPathname(docArticleHref(article))).toBe(article);
    }

    expect(docArticleBySlug("not-a-topic")).toBeUndefined();
    expect(docArticleFromPathname("/docs/not-a-topic")).toBeUndefined();
    expect(docArticleFromPathname("/docs/kitchen/extra")).toBeUndefined();
  });

  it("builds stable section citations from the same catalog identifiers used by the page", () => {
    const article = docArticleBySlug("billing-and-payments");
    const section = article?.sections.find((item) => item.id === "payment-methods");

    expect(article).toBeDefined();
    expect(section).toBeDefined();
    if (!article || !section) return;

    expect(docSectionAnchor(section)).toBe("payment-methods");
    expect(docSectionHref(article, section)).toBe(
      "/docs/billing-and-payments#payment-methods",
    );
  });

  it("contains at least one bilingual article in every navigation group", () => {
    for (const group of DOC_GROUPS) {
      expectLocalizedText(group.title);
      expect(DOC_ARTICLES.some((article) => article.groupId === group.id)).toBe(true);
    }
  });

  it("provides Thai and English text for every user-facing content field", () => {
    for (const article of DOC_ARTICLES) {
      expectLocalizedText(article.title);
      expectLocalizedText(article.summary);
      expectLocalizedText(article.audience);
      expect(article.keywords.th.length).toBeGreaterThan(0);
      expect(article.keywords.en.length).toBeGreaterThan(0);
      expect(article.keywords.th.every((keyword) => keyword.trim().length > 0)).toBe(true);
      expect(article.keywords.en.every((keyword) => keyword.trim().length > 0)).toBe(true);

      for (const route of article.routes ?? []) {
        expect(route.href.startsWith("/")).toBe(true);
        expectLocalizedText(route.label);
      }

      for (const section of article.sections) {
        expectLocalizedText(section.title);
        section.paragraphs?.forEach(expectLocalizedText);
        section.bullets?.forEach(expectLocalizedText);
        section.steps?.forEach((step) => {
          expectLocalizedText(step.title);
          expectLocalizedText(step.body);
        });
        if (section.note) {
          expectLocalizedText(section.note.title);
          expectLocalizedText(section.note.body);
        }
      }
    }
  });
});

describe("documentation search", () => {
  it("returns the complete catalog for an empty query", () => {
    expect(searchDocs("")).toEqual(DOC_ARTICLES);
    expect(searchDocs("   ")).toEqual(DOC_ARTICLES);
  });

  it("searches Thai content beyond the article title", () => {
    expect(searchDocs("เงินทอน").map((article) => article.slug)).toContain("billing-and-payments");
    expect(searchDocs("คำเชิญหมดอายุ").map((article) => article.slug)).toContain("troubleshooting");
  });

  it("searches English content case-insensitively", () => {
    expect(searchDocs("PROMPTPAY").map((article) => article.slug)).toContain("billing-and-payments");
    expect(searchDocs("purchase ORDER").map((article) => article.slug)).toContain("current-limitations");
  });

  it("searches keywords and returns no result for unrelated text", () => {
    expect(searchDocs("KDS").map((article) => article.slug)).toContain("kitchen");
    expect(searchDocs("definitely-not-a-dishy-topic")).toEqual([]);
  });

  it("points a search result at the best matching section when possible", () => {
    const changeResult = searchDocEntries("เงินทอน")
      .find((entry) => entry.article.slug === "billing-and-payments");
    expect(changeResult?.section?.id).toBe("payment-methods");

    expect(searchDocEntries("").every((entry) => entry.section === undefined)).toBe(true);
  });

  it.each([
    ["PromptPay ยืนยันอัตโนมัติหรือไม่", "billing-and-payments", "payment-methods"],
    ["ลูกค้าชำระเงินผ่าน QR โต๊ะได้หรือไม่", "customer-qr-ordering", "staff-boundary"],
    ["วิธีเชิญพนักงาน", "team-and-permissions", "invite-staff"],
    ["วิธีส่งอาหารเข้าครัว", "take-orders", "build-round"],
    ["How do I invite staff?", "team-and-permissions", "invite-staff"],
  ])("ranks a natural bilingual question at the relevant section: %s", (query, slug, sectionId) => {
    const result = searchDocEntries(query).find(
      (entry) => entry.article.slug === slug && entry.section?.id === sectionId,
    );

    expect(result).toBeDefined();
  });

  it("fails closed for an undocumented product capability", () => {
    expect(searchDocEntries("Dishy มีระบบจองวงดนตรีอัตโนมัติหรือไม่")).toEqual([]);
  });
});
