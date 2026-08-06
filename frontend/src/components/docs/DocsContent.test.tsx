import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DOC_ARTICLES,
  docArticleBySlug,
  docSectionAnchor,
  docSectionHref,
} from "@/src/lib/docsContent";
import { DocsArticleContent } from "./DocsContent";

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
});
