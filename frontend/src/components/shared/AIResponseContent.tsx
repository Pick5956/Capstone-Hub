import React from "react";
import katex from "katex";

type AIResponseContentProps = {
  content: string;
  compact?: boolean;
};

const DOCS_CITATION_HREF = String.raw`/docs(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?#[a-z0-9]+(?:-[a-z0-9]+)*`;
const DOCS_CITATION_TOKEN = new RegExp(
  String.raw`^\[([^\]\n]+)\]\((${DOCS_CITATION_HREF})\)$`,
);
const INLINE_TOKEN = new RegExp(
  String.raw`(\[[^\]\n]+\]\(${DOCS_CITATION_HREF}\)|\*\*.*?\*\*|\x60[^\x60]+\x60|\\\(.+?\\\))`,
  "g",
);

function mathMarkup(expression: string, displayMode: boolean) {
  return katex.renderToString(expression, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
  });
}

function inlineContent(text: string) {
  const parts = text.split(INLINE_TOKEN).filter(Boolean);

  return parts.map((part, index) => {
    const docsCitation = part.match(DOCS_CITATION_TOKEN);
    if (docsCitation) {
      return (
        <a
          key={index}
          href={docsCitation[2]}
          className="font-semibold text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-800 focus-visible:outline-none dark:text-orange-300 dark:decoration-orange-700 dark:hover:text-orange-200"
        >
          {docsCitation[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-orange-600 dark:text-orange-400">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-gray-200/70 px-1 py-0.5 text-[0.92em] dark:bg-gray-700">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      return (
        <span
          key={index}
          className="inline-block max-w-full align-middle text-[0.98em]"
          dangerouslySetInnerHTML={{ __html: mathMarkup(part.slice(2, -2), false) }}
        />
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export default function AIResponseContent({ content, compact = false }: AIResponseContentProps) {
  const safeContent = typeof content === "string" ? content : "";
  const lines = safeContent
    .replace(/\u00a0|\u202f|\u2007/g, " ")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks: React.ReactNode[] = [];
  const textClass = compact ? "text-xs sm:text-[13px] leading-relaxed" : "text-sm leading-7";

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;

    const inlineDisplayMath = trimmed.match(/^(?:\\\[|\$\$)([\s\S]*?)(?:\\\]|\$\$)$/);
    if (inlineDisplayMath) {
      blocks.push(
        <div
          key={`math-${index}`}
          className={`overflow-x-auto rounded-lg bg-white/50 px-2 py-2 text-gray-900 dark:bg-gray-900/40 dark:text-gray-100 ${compact ? "text-[12px]" : "text-sm"}`}
          dangerouslySetInnerHTML={{ __html: mathMarkup(inlineDisplayMath[1].trim(), true) }}
        />
      );
      continue;
    }

    if (trimmed === "\\[" || trimmed === "$$") {
      const close = trimmed === "\\[" ? "\\]" : "$$";
      const expression: string[] = [];
      while (index + 1 < lines.length && lines[index + 1].trim() !== close) {
        expression.push(lines[index + 1]);
        index += 1;
      }
      if (index + 1 < lines.length) {
        index += 1;
      }
      blocks.push(
        <div
          key={`math-${index}`}
          className={`overflow-x-auto rounded-lg bg-white/50 px-2 py-2 text-gray-900 dark:bg-gray-900/40 dark:text-gray-100 ${compact ? "text-[12px]" : "text-sm"}`}
          dangerouslySetInnerHTML={{ __html: mathMarkup(expression.join("\n").trim(), true) }}
        />
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h3 key={`heading-${index}`} className={`${compact ? "text-sm" : "text-base"} font-semibold text-gray-900 dark:text-gray-100`}>
          {inlineContent(heading[2])}
        </h3>
      );
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`rule-${index}`} className="border-gray-200 dark:border-gray-700" />);
      continue;
    }

    if (trimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = tableCells(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;

      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className={`min-w-full border-collapse ${compact ? "text-[11px]" : "text-xs"}`}>
            <thead className="bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex} className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-left font-semibold dark:border-gray-700">
                    {inlineContent(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                  {header.map((_, cellIndex) => (
                    <td key={cellIndex} className="px-2 py-2 align-top text-gray-700 dark:text-gray-300">
                      {inlineContent(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const ordered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      const start = Number.parseInt(ordered[1], 10);
      const items: string[] = [ordered[2]];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].trim().match(/^\d+\.\s+(.+)$/);
        if (!next) break;
        items.push(next[1]);
        index += 1;
      }
      blocks.push(
        <ol start={start} key={`ordered-${index}`} className={`list-decimal space-y-1 pl-5 text-gray-700 marker:font-semibold marker:text-orange-500 dark:text-gray-300 ${textClass}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item)}</li>)}
        </ol>
      );
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      const items: string[] = [bullet[1]];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].trim().match(/^[-*]\s+(.+)$/);
        if (!next) break;
        items.push(next[1]);
        index += 1;
      }
      blocks.push(
        <ul key={`bullet-${index}`} className={`list-disc space-y-1 pl-5 text-gray-700 marker:text-orange-500 dark:text-gray-300 ${textClass}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item)}</li>)}
        </ul>
      );
      continue;
    }

    blocks.push(
      <p key={`paragraph-${index}`} className={`${textClass} text-gray-700 dark:text-gray-300`}>
        {inlineContent(trimmed)}
      </p>
    );
  }

  return <div className={compact ? "space-y-2" : "space-y-3"}>{blocks}</div>;
}
