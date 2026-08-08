"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Info,
  TriangleAlert,
} from "lucide-react";
import {
  DOC_ARTICLES,
  DEFAULT_DOC_SLUG,
  docArticleHref,
  docGroupById,
  docSectionAnchor,
  localized,
  type DocArticle,
  type DocSection,
} from "@/src/lib/docsContent";
import { docTutorialFor } from "@/src/lib/docsTutorials";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import DocsTutorialFigure from "./DocsTutorialFigure";

function ArticleSection({
  articleSlug,
  section,
  language,
}: {
  articleSlug: string;
  section: DocSection;
  language: Language;
}) {
  const anchor = docSectionAnchor(section);
  const tutorial = docTutorialFor(articleSlug, section.id);

  return (
    <section
      id={anchor}
      data-doc-section={anchor}
      className="scroll-mt-28"
      aria-labelledby={`${anchor}-title`}
    >
      <h2
        id={`${anchor}-title`}
        tabIndex={-1}
        className="text-2xl font-semibold leading-snug text-gray-950 text-balance outline-none dark:text-white"
      >
        {localized(section.title, language)}
      </h2>

      {section.paragraphs?.map((paragraph, index) => (
        <p
          key={`${anchor}-paragraph-${index}`}
          className="mt-4 max-w-[72ch] text-[16px] leading-8 text-gray-700 text-pretty dark:text-gray-300"
        >
          {localized(paragraph, language)}
        </p>
      ))}

      {tutorial ? <DocsTutorialFigure tutorial={tutorial} language={language} /> : null}

      {!tutorial && section.steps ? (
        <ol className="mt-6 space-y-5">
          {section.steps.map((step, index) => (
            <li key={`${anchor}-step-${index}`} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-[12px] font-semibold tabular-nums text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                {index + 1}
              </span>
              <div className="pt-0.5">
                <p className="text-[15px] font-semibold leading-6 text-gray-950 dark:text-white">
                  {localized(step.title, language)}
                </p>
                <p className="mt-1 text-[14px] leading-7 text-gray-600 dark:text-gray-400">
                  {localized(step.body, language)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {section.bullets ? (
        tutorial ? (
          <details className="group mt-5 max-w-[72ch] rounded-md border border-gray-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-900/60">
            <summary className="flex min-h-11 list-none items-center gap-3 px-4 text-[13px] font-semibold text-gray-800 marker:content-none dark:text-gray-200">
              {language === "th" ? "ข้อควรรู้เพิ่มเติม" : "Additional notes"}
              <ChevronDown className="ml-auto h-4 w-4 text-gray-500 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="border-t border-gray-200 px-4 py-3 pl-9 text-[14px] leading-7 text-gray-700 dark:border-gray-800 dark:text-gray-300">
              {section.bullets.map((bullet, index) => (
                <li key={`${anchor}-bullet-${index}`} className="list-disc pl-1 marker:text-gray-400 dark:marker:text-gray-600">
                  {localized(bullet, language)}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <ul className="mt-5 max-w-[72ch] list-disc space-y-2.5 pl-5 text-[15px] leading-7 text-gray-700 marker:text-gray-400 dark:text-gray-300 dark:marker:text-gray-600">
            {section.bullets.map((bullet, index) => (
              <li key={`${anchor}-bullet-${index}`} className="pl-1">
                {localized(bullet, language)}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {section.note ? (
        <aside
          className={`mt-6 rounded-md border px-4 py-4 ${
            section.note.tone === "warning"
              ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100"
              : "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/25 dark:text-sky-100"
          }`}
        >
          <div className="flex items-start gap-3">
            {section.note.tone === "warning" ? (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="text-[13px] font-semibold">{localized(section.note.title, language)}</p>
              <p className="mt-1 text-[13px] leading-6 opacity-90">{localized(section.note.body, language)}</p>
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );
}

export function DocsArticleContent({ article, language }: { article: DocArticle; language: Language }) {
  const group = docGroupById(article.groupId);
  const articleIndex = DOC_ARTICLES.findIndex((item) => item.slug === article.slug);
  const previousArticle = articleIndex > 0 ? DOC_ARTICLES[articleIndex - 1] : undefined;
  const nextArticle = articleIndex >= 0 && articleIndex < DOC_ARTICLES.length - 1
    ? DOC_ARTICLES[articleIndex + 1]
    : undefined;

  const copy = language === "th"
    ? {
        guide: "คู่มือ Dishy",
        breadcrumb: "ตำแหน่งในคู่มือ",
        audience: "เหมาะสำหรับ",
        relatedPages: "เปิดหน้าที่เกี่ยวข้อง",
        onThisPage: "ในหน้านี้",
        previous: "หัวข้อก่อนหน้า",
        next: "หัวข้อถัดไป",
        pageNavigation: "ไปยังหัวข้อก่อนหน้าหรือถัดไป",
      }
    : {
        guide: "Dishy docs",
        breadcrumb: "Documentation breadcrumb",
        audience: "Best for",
        relatedPages: "Open related pages",
        onThisPage: "On this page",
        previous: "Previous topic",
        next: "Next topic",
        pageNavigation: "Go to the previous or next topic",
      };

  return (
    <article
      id={article.slug}
      data-doc-article={article.slug}
      aria-labelledby={`${article.slug}-title`}
      className="pb-16 pt-8 sm:pb-20 sm:pt-12"
    >
      <nav aria-label={copy.breadcrumb} className="flex min-h-6 flex-wrap items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400">
        {article.slug === DEFAULT_DOC_SLUG ? (
          <span className="font-medium text-gray-700 dark:text-gray-300">{copy.guide}</span>
        ) : (
          <Link href="/docs" className="font-medium hover:text-orange-700 dark:hover:text-orange-300">
            {copy.guide}
          </Link>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-700" aria-hidden="true" />
        <span>{group ? localized(group.title, language) : copy.guide}</span>
      </nav>

      <header className="mt-6 border-b border-gray-200 pb-8 dark:border-gray-800 sm:pb-10">
        <h1
          id={`${article.slug}-title`}
          tabIndex={-1}
          className="max-w-3xl text-3xl font-semibold leading-[1.2] text-gray-950 text-balance outline-none dark:text-white sm:text-4xl"
        >
          {localized(article.title, language)}
        </h1>
        <p className="mt-4 max-w-[68ch] text-[16px] leading-8 text-gray-600 text-pretty dark:text-gray-300 sm:text-[17px]">
          {localized(article.summary, language)}
        </p>
        <p className="mt-5 text-[13px] leading-6 text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{copy.audience}:</span>{" "}
          {localized(article.audience, language)}
        </p>

        {article.routes?.length ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-gray-800 sm:flex-row sm:items-center">
            <p className="shrink-0 text-[13px] font-medium text-gray-500 dark:text-gray-400">{copy.relatedPages}</p>
            <nav aria-label={`${copy.relatedPages}: ${localized(article.title, language)}`} className="flex flex-wrap gap-2">
              {article.routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className="ui-press inline-flex min-h-10 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  {localized(route.label, language)}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </div>
        ) : null}
      </header>

      <details className="group mt-6 rounded-md border border-gray-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-900/60 lg:hidden">
        <summary className="flex min-h-11 list-none items-center gap-3 px-4 text-[13px] font-semibold text-gray-800 marker:content-none dark:text-gray-200">
          {copy.onThisPage}
          <ChevronDown className="ml-auto h-4 w-4 text-gray-500 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          {article.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${docSectionAnchor(section)}`}
                className="block min-h-10 py-2 text-[13px] leading-6 text-gray-600 hover:text-orange-700 dark:text-gray-400 dark:hover:text-orange-300"
              >
                {localized(section.title, language)}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-10 space-y-12 sm:mt-12 sm:space-y-14">
        {article.sections.map((section) => (
          <ArticleSection
            key={section.id}
            articleSlug={article.slug}
            section={section}
            language={language}
          />
        ))}
      </div>

      <nav aria-label={copy.pageNavigation} className="mt-14 grid gap-3 border-t border-gray-200 pt-6 dark:border-gray-800 sm:grid-cols-2">
        {previousArticle ? (
          <Link
            href={docArticleHref(previousArticle)}
            className="group flex min-h-20 items-center gap-3 rounded-md border border-gray-200 px-4 py-3 hover:border-gray-300 hover:bg-slate-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900/70"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{copy.previous}</span>
              <span className="mt-1 block text-[13px] font-semibold leading-5 text-gray-900 dark:text-white">
                {localized(previousArticle.title, language)}
              </span>
            </span>
          </Link>
        ) : <span aria-hidden="true" />}

        {nextArticle ? (
          <Link
            href={docArticleHref(nextArticle)}
            className="group flex min-h-20 items-center justify-end gap-3 rounded-md border border-gray-200 px-4 py-3 text-right hover:border-gray-300 hover:bg-slate-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900/70"
          >
            <span className="min-w-0">
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{copy.next}</span>
              <span className="mt-1 block text-[13px] font-semibold leading-5 text-gray-900 dark:text-white">
                {localized(nextArticle.title, language)}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ) : <span aria-hidden="true" />}
      </nav>
    </article>
  );
}

export function DocsArticlePage({ article }: { article: DocArticle }) {
  const { language } = useLanguage();
  return <DocsArticleContent article={article} language={language} />;
}
