import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticlePage } from "@/src/components/docs/DocsContent";
import {
  DEFAULT_DOC_SLUG,
  DOC_ARTICLES,
  docArticleBySlug,
  docArticleHref,
} from "@/src/lib/docsContent";

type DocsArticleRouteProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_ARTICLES
    .filter((article) => article.slug !== DEFAULT_DOC_SLUG)
    .map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: DocsArticleRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const article = docArticleBySlug(slug);
  if (!article || article.slug === DEFAULT_DOC_SLUG) return {};

  return {
    title: article.title.th,
    description: article.summary.th,
    alternates: {
      canonical: `https://dishy.pro${docArticleHref(article)}`,
    },
  };
}

export default async function DocsArticleRoute({ params }: DocsArticleRouteProps) {
  const { slug } = await params;
  const article = docArticleBySlug(slug);
  if (!article || article.slug === DEFAULT_DOC_SLUG) notFound();

  return <DocsArticlePage article={article} />;
}
