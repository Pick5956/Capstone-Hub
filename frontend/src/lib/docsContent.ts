import rawDocsCatalog from "../../../backend/internal/systemdocs/catalog.json";
import type { Language } from "@/src/providers/LanguageProvider";

export type LocalizedText = Record<Language, string>;

export type DocStep = {
  title: LocalizedText;
  body: LocalizedText;
};

export type DocNote = {
  tone: "note" | "warning";
  title: LocalizedText;
  body: LocalizedText;
};

export type DocSection = {
  id: string;
  keywords?: Record<Language, string[]>;
  title: LocalizedText;
  paragraphs?: LocalizedText[];
  steps?: DocStep[];
  bullets?: LocalizedText[];
  note?: DocNote;
};

export type DocRoute = {
  href: string;
  label: LocalizedText;
};

export type DocArticle = {
  slug: string;
  groupId: string;
  title: LocalizedText;
  summary: LocalizedText;
  audience: LocalizedText;
  keywords: Record<Language, string[]>;
  routes?: DocRoute[];
  sections: DocSection[];
};

export type DocGroup = {
  id: string;
  title: LocalizedText;
};

export type DocSearchEntry = {
  article: DocArticle;
  section?: DocSection;
};

const docsCatalog = rawDocsCatalog as unknown as {
  groups: DocGroup[];
  articles: DocArticle[];
};

export const DOC_GROUPS: DocGroup[] = docsCatalog.groups;
export const DOC_ARTICLES: DocArticle[] = docsCatalog.articles;
export const DEFAULT_DOC_SLUG = "overview";

export function localized(value: LocalizedText, language: Language) {
  return value[language];
}

export function docArticleBySlug(slug: string) {
  return DOC_ARTICLES.find((article) => article.slug === slug);
}

export function docArticleHref(articleOrSlug: DocArticle | string) {
  const slug = typeof articleOrSlug === "string" ? articleOrSlug : articleOrSlug.slug;
  return slug === DEFAULT_DOC_SLUG ? "/docs" : `/docs/${slug}`;
}

export function docSectionAnchor(section: DocSection) {
  return section.id;
}

export function docSectionHref(article: DocArticle, section: DocSection) {
  return `${docArticleHref(article)}#${docSectionAnchor(section)}`;
}

export function docArticleFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "docs") {
    return docArticleBySlug(DEFAULT_DOC_SLUG);
  }
  if (segments.length !== 2 || segments[0] !== "docs") return undefined;
  return docArticleBySlug(decodeURIComponent(segments[1]));
}

export function docGroupById(groupId: string) {
  return DOC_GROUPS.find((group) => group.id === groupId);
}

function articleSearchText(article: DocArticle) {
  const values: string[] = [
    article.title.th,
    article.title.en,
    article.summary.th,
    article.summary.en,
    article.audience.th,
    article.audience.en,
    ...article.keywords.th,
    ...article.keywords.en,
  ];

  for (const section of article.sections) {
    values.push(section.title.th, section.title.en);
    for (const paragraph of section.paragraphs ?? []) values.push(paragraph.th, paragraph.en);
    for (const bullet of section.bullets ?? []) values.push(bullet.th, bullet.en);
    for (const step of section.steps ?? []) values.push(step.title.th, step.title.en, step.body.th, step.body.en);
    if (section.note) values.push(section.note.title.th, section.note.title.en, section.note.body.th, section.note.body.en);
  }

  return normalizeSearchText(values.join(" "));
}

function sectionSearchText(section: DocSection) {
  const values = [
    section.title.th,
    section.title.en,
    ...(section.keywords?.th ?? []),
    ...(section.keywords?.en ?? []),
  ];
  for (const paragraph of section.paragraphs ?? []) values.push(paragraph.th, paragraph.en);
  for (const bullet of section.bullets ?? []) values.push(bullet.th, bullet.en);
  for (const step of section.steps ?? []) values.push(step.title.th, step.title.en, step.body.th, step.body.en);
  if (section.note) values.push(section.note.title.th, section.note.title.en, section.note.body.th, section.note.body.en);
  return normalizeSearchText(values.join(" "));
}

const SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "could", "dish", "dishy", "do", "does", "how", "i", "in",
  "is", "it", "me", "not", "of", "on", "or", "please", "system", "the", "through", "to", "via", "we",
  "what", "where", "with", "you", "การ", "ของ", "ได้", "ที่", "มี", "ยัง", "หรือ", "ไหม",
]);

const THAI_QUESTION_PHRASES = [
  "ได้หรือไม่",
  "หรือไม่",
  "ทำอย่างไร",
  "ทำยังไง",
  "อย่างไร",
  "ยังไง",
  "วิธี",
  "ปัจจุบัน",
  "ในระบบ",
  "ระบบ",
  "dishy",
];

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function meaningfulQueryText(query: string) {
  let value = normalizeSearchText(query);
  for (const phrase of THAI_QUESTION_PHRASES) {
    value = value.replaceAll(phrase, " ");
  }
  return value.replace(/\s+/g, " ").trim();
}

function meaningfulQueryTokens(query: string) {
  return meaningfulQueryText(query)
    .split(" ")
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
}

function characterTrigrams(value: string) {
  const compact = value.replace(/\s+/g, "");
  const characters = Array.from(compact);
  const result = new Set<string>();
  for (let index = 0; index <= characters.length - 3; index += 1) {
    result.add(characters.slice(index, index + 3).join(""));
  }
  return result;
}

function characterMatchScore(query: string, text: string) {
  const grams = characterTrigrams(meaningfulQueryText(query));
  if (!grams.size) return 0;
  const compactText = normalizeSearchText(text).replace(/\s+/g, "");
  let matches = 0;
  for (const gram of grams) {
    if (compactText.includes(gram)) matches += 1;
  }
  return Math.round((matches / grams.size) * 40);
}

function articleAnchorScore(article: DocArticle, query: string) {
  const normalized = meaningfulQueryText(query);
  const tokens = meaningfulQueryTokens(query);
  const titleText = normalizeSearchText(`${article.title.th} ${article.title.en}`);
  const summaryText = normalizeSearchText(`${article.summary.th} ${article.summary.en}`);
  const keywordText = normalizeSearchText([...article.keywords.th, ...article.keywords.en].join(" "));
  const fullText = articleSearchText(article);
  let score = 0;
  let strongMatches = 0;
  let bodyTokenMatches = 0;

  for (const keyword of [...article.keywords.th, ...article.keywords.en]) {
    const candidate = normalizeSearchText(keyword);
    if (candidate.length >= 2 && normalized.includes(candidate)) {
      score += 80 + Math.min(candidate.length, 20);
      strongMatches += 1;
    }
  }

  for (const token of tokens) {
    if (titleText.includes(token)) {
      score += 24;
      strongMatches += 1;
    }
    if (keywordText.includes(token)) {
      score += 18;
      strongMatches += 1;
    }
    if (summaryText.includes(token)) {
      score += 10;
      strongMatches += 1;
    }
    if (fullText.includes(token)) {
      score += 6;
      bodyTokenMatches += 1;
    }
  }

  const meaningful = meaningfulQueryText(query);
  if (meaningful.length >= 3 && fullText.includes(meaningful)) {
    score += 50;
    strongMatches += 1;
  }
  if (strongMatches > 0) return score;
  if (tokens.length === 1 && bodyTokenMatches === 1) return score;
  if (tokens.length > 1 && bodyTokenMatches >= 2) return score;
  return 0;
}

function sectionScore(article: DocArticle, section: DocSection, query: string) {
  const text = sectionSearchText(section);
  const title = normalizeSearchText(`${section.title.th} ${section.title.en}`);
  const normalizedQuery = meaningfulQueryText(query);
  const keywords = [...(section.keywords?.th ?? []), ...(section.keywords?.en ?? [])];
  let score = articleAnchorScore(article, query) + characterMatchScore(query, text);
  for (const keyword of keywords) {
    const candidate = normalizeSearchText(keyword);
    if (candidate.length >= 2 && normalizedQuery.includes(candidate)) score += 120;
  }
  for (const token of meaningfulQueryTokens(query)) {
    if (title.includes(token)) score += 30;
    else if (text.includes(token)) score += 12;
  }
  return score;
}

function rankedDocEntries(query: string) {
  return DOC_ARTICLES
    .map((article, articleIndex) => {
      const anchorScore = articleAnchorScore(article, query);
      if (anchorScore <= 0) return null;
      const sections = article.sections
        .map((section, sectionIndex) => ({
          section,
          sectionIndex,
          score: sectionScore(article, section, query),
        }))
        .sort((left, right) => right.score - left.score || left.sectionIndex - right.sectionIndex);
      const topSection = sections[0];
      if (!topSection) return null;
      return {
        article,
        articleIndex,
        section: topSection.section,
        score: topSection.score,
      };
    })
    .filter((entry): entry is {
      article: DocArticle;
      articleIndex: number;
      section: DocSection;
      score: number;
    } => entry !== null)
    .sort((left, right) => right.score - left.score || left.articleIndex - right.articleIndex);
}

export function searchDocs(query: string) {
  if (!query.trim()) return DOC_ARTICLES;
  return rankedDocEntries(query).map((entry) => entry.article);
}

export function searchDocEntries(query: string): DocSearchEntry[] {
  if (!query.trim()) return DOC_ARTICLES.map((article) => ({ article }));
  return rankedDocEntries(query).map(({ article, section }) => ({ article, section }));
}
