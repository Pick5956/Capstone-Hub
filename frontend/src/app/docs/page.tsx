import type { Metadata } from "next";
import { DocsArticlePage } from "@/src/components/docs/DocsContent";
import { DEFAULT_DOC_SLUG, docArticleBySlug } from "@/src/lib/docsContent";

const overviewArticle = docArticleBySlug(DEFAULT_DOC_SLUG)!;

export const metadata: Metadata = {
  title: {
    absolute: `${overviewArticle.title.th} | คู่มือ Dishy`,
  },
  description: overviewArticle.summary.th,
  alternates: {
    canonical: "https://dishy.pro/docs",
  },
};

export default function DocsPage() {
  return <DocsArticlePage article={overviewArticle} />;
}
