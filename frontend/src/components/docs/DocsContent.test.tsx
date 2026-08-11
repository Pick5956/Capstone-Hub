import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DOC_ARTICLES,
  docArticleBySlug,
  docSectionAnchor,
  docSectionHref,
} from "@/src/lib/docsContent";
import {
  DOC_TUTORIALS,
  docTutorialFor,
} from "@/src/lib/docsTutorials";
import { DocsArticleContent } from "./DocsContent";

function decodeStaticMarkup(html: string) {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

describe("DocsArticleContent", () => {
  const article = docArticleBySlug("kitchen");

  it("renders exactly one selected article instead of the complete catalog", () => {
    expect(article).toBeDefined();
    if (!article) return;

    const html = renderToStaticMarkup(<DocsArticleContent article={article} language="th" />);
    const renderedArticles = Array.from(html.matchAll(/data-doc-article="([^"]+)"/g), (match) => match[1]);

    expect(renderedArticles).toEqual([article.slug]);
    expect(html).toContain(`id="${article.slug}"`);
    for (const otherArticle of DOC_ARTICLES.filter((item) => item.slug !== article.slug)) {
      expect(html).not.toContain(`data-doc-article="${otherArticle.slug}"`);
    }
  });

  it("renders every selected section as a stable link target", () => {
    expect(article).toBeDefined();
    if (!article) return;

    const html = renderToStaticMarkup(<DocsArticleContent article={article} language="th" />);
    for (const section of article.sections) {
      const anchor = docSectionAnchor(section);
      expect(html).toContain(`id="${anchor}"`);
      expect(html).toContain(`href="#${anchor}"`);
      expect(docSectionHref(article, section)).toBe(`/docs/${article.slug}#${anchor}`);
    }

    const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the same anchors for complete Thai and English article surfaces", () => {
    expect(article).toBeDefined();
    if (!article) return;

    const thai = renderToStaticMarkup(<DocsArticleContent article={article} language="th" />);
    const english = renderToStaticMarkup(<DocsArticleContent article={article} language="en" />);

    expect(thai).toContain(article.title.th);
    expect(english).toContain(article.title.en);
    const thaiAnchors = Array.from(thai.matchAll(/data-doc-section="([^"]+)"/g), (match) => match[1]);
    const englishAnchors = Array.from(english.matchAll(/data-doc-section="([^"]+)"/g), (match) => match[1]);
    expect(englishAnchors).toEqual(thaiAnchors);
  });

  it("keeps every visual tutorial attached to a real article section", () => {
    const seen = new Set<string>();

    for (const tutorial of DOC_TUTORIALS) {
      const key = `${tutorial.articleSlug}/${tutorial.sectionId}`;
      const tutorialArticle = docArticleBySlug(tutorial.articleSlug);
      const items = tutorial.panels.flatMap((panel) => panel.items);

      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(tutorialArticle?.sections.some((section) => section.id === tutorial.sectionId)).toBe(true);
      expect(docTutorialFor(tutorial.articleSlug, tutorial.sectionId)).toBe(tutorial);
      expect(tutorial.startAt.th.trim()).not.toBe("");
      expect(tutorial.startAt.en.trim()).not.toBe("");
      expect(tutorial.startAt.th).not.toMatch(/\[[^\]]+\]/);
      expect(tutorial.startAt.en).not.toMatch(/\[[^\]]+\]/);
      expect(tutorial.title.th.trim()).not.toBe("");
      expect(tutorial.title.en.trim()).not.toBe("");
      expect(tutorial.description.th.trim()).not.toBe("");
      expect(tutorial.description.en.trim()).not.toBe("");
      expect(tutorial.result.th.trim()).not.toBe("");
      expect(tutorial.result.en.trim()).not.toBe("");
      if (tutorial.procedureLabel) {
        expect(tutorial.procedureLabel.th.trim()).not.toBe("");
        expect(tutorial.procedureLabel.en.trim()).not.toBe("");
      }
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeLessThanOrEqual(6);
      expect(new Set(items.map((item) => item.number)).size).toBe(items.length);
      expect(items.map((item) => item.number)).toEqual(items.map((_, index) => index + 1));

      for (const panel of tutorial.panels) {
        expect(panel.title.th.trim()).not.toBe("");
        expect(panel.title.en.trim()).not.toBe("");
      }

      for (const item of items) {
        expect(item.label.th.trim()).not.toBe("");
        expect(item.label.en.trim()).not.toBe("");
        expect(item.detail.th.trim()).not.toBe("");
        expect(item.detail.en.trim()).not.toBe("");
      }
    }
  });

  it("renders bilingual task walkthroughs with a numbered procedure", () => {
    const menuArticle = docArticleBySlug("menu");
    expect(menuArticle).toBeDefined();
    if (!menuArticle) return;

    const thai = decodeStaticMarkup(
      renderToStaticMarkup(<DocsArticleContent article={menuArticle} language="th" />),
    );
    const english = decodeStaticMarkup(
      renderToStaticMarkup(<DocsArticleContent article={menuArticle} language="en" />),
    );

    expect(thai).toContain('data-doc-tutorial="menu/organize-menu"');
    expect(thai).toContain('data-doc-tutorial="menu/option-groups"');
    expect(thai).toContain("ตำแหน่งบนหน้าจอ");
    expect(english).toContain("Where to find each control");
    expect(thai.match(/<figure/g)?.length).toBe(2);
    expect(english.match(/<figure/g)?.length).toBe(2);
    expect(thai.match(/data-doc-tutorial-route/g)?.length).toBe(2);
    expect(english.match(/data-doc-tutorial-route/g)?.length).toBe(2);

    const menuTutorials = DOC_TUTORIALS.filter((item) => item.articleSlug === "menu");
    const menuValues = menuTutorials
      .flatMap((tutorial) => tutorial.panels)
      .flatMap((panel) => panel.items)
      .filter((item) => item.value);

    expect(thai.match(/data-doc-tutorial-value/g)?.length).toBe(menuValues.length);
    expect(english.match(/data-doc-tutorial-value/g)?.length).toBe(menuValues.length);

    for (const tutorial of menuTutorials) {
      expect(thai).toContain(tutorial.result.th);
      expect(english).toContain(tutorial.result.en);
      for (const item of tutorial.panels.flatMap((panel) => panel.items)) {
        expect(thai).toContain(item.label.th);
        expect(thai).toContain(item.detail.th);
        expect(english).toContain(item.label.en);
        expect(english).toContain(item.detail.en);
      }
    }
  });

  it("shows one tutorial sequence instead of repeating catalog steps", () => {
    const takeOrders = docArticleBySlug("take-orders");
    expect(takeOrders).toBeDefined();
    if (!takeOrders) return;

    const buildRound = takeOrders.sections.find((section) => section.id === "build-round");
    expect(buildRound?.steps?.length).toBeGreaterThan(0);
    if (!buildRound?.steps?.[0]) return;

    const thai = decodeStaticMarkup(
      renderToStaticMarkup(<DocsArticleContent article={takeOrders} language="th" />),
    );
    const english = decodeStaticMarkup(
      renderToStaticMarkup(<DocsArticleContent article={takeOrders} language="en" />),
    );

    expect(thai).not.toContain(buildRound.steps[0].title.th);
    expect(english).not.toContain(buildRound.steps[0].title.en);
    expect(thai).toContain("ทำตามลำดับ");
    expect(english).toContain("Follow these steps");
  });

  it("keeps supplementary facts available without interrupting the tutorial", () => {
    const tableArticle = docArticleBySlug("tables-and-reservations");
    expect(tableArticle).toBeDefined();
    if (!tableArticle) return;

    const thai = decodeStaticMarkup(
      renderToStaticMarkup(<DocsArticleContent article={tableArticle} language="th" />),
    );
    const english = decodeStaticMarkup(
      renderToStaticMarkup(<DocsArticleContent article={tableArticle} language="en" />),
    );

    expect(thai).toContain("ข้อควรรู้เพิ่มเติม");
    expect(english).toContain("Additional notes");
    expect(thai).toContain("ผังปัจจุบันเป็นตารางแบ่งโซน");
    expect(english).toContain("not a drag-and-drop physical floor plan");
  });
});
