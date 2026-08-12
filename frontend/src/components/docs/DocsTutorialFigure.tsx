import { localized } from "@/src/lib/docsContent";
import type {
  DocTutorial,
  DocTutorialItem,
  DocTutorialTone,
} from "@/src/lib/docsTutorials";
import type { Language } from "@/src/providers/LanguageProvider";

const toneClasses: Record<DocTutorialTone, string> = {
  neutral:
    "border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100",
  primary:
    "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950",
  ready:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100",
  info:
    "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100",
};

function TutorialControl({
  item,
  language,
}: {
  item: DocTutorialItem;
  language: Language;
}) {
  const label = localized(item.label, language);
  const value = item.value ? localized(item.value, language) : undefined;
  const tone = item.tone ?? "neutral";
  const shared = `relative min-w-0 border ${toneClasses[tone]}`;
  const marker = (
    <span className="absolute left-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-orange-700 px-1 text-[11px] font-semibold tabular-nums leading-none text-white dark:bg-orange-500 dark:text-gray-950">
      {item.number}
    </span>
  );

  if (item.kind === "action") {
    return (
      <div className={`${shared} flex min-h-12 items-center justify-center rounded-md px-10 py-3 text-center text-[13px] font-semibold`}>
        {marker}
        <span>{label}</span>
      </div>
    );
  }

  if (item.kind === "summary") {
    return (
      <div className={`${shared} flex min-h-14 items-center gap-3 rounded-md px-3 py-3 pl-10`}>
        {marker}
        <span className="min-w-0 flex-1 text-[12px] font-medium">{label}</span>
        {value ? (
          <span className="min-w-0 max-w-[55%] break-words text-right text-[13px] font-semibold tabular-nums">
            {value}
          </span>
        ) : null}
      </div>
    );
  }

  if (item.kind === "status") {
    return (
      <div className={`${shared} flex min-h-14 items-center gap-3 rounded-md px-3 py-3 pl-10`}>
        {marker}
        <span className="min-w-0 flex-1 text-[12px] font-medium">{label}</span>
        {value ? (
          <span className="min-w-0 max-w-[55%] break-words rounded-md border border-current/20 px-2 py-1 text-right text-[11px] font-semibold">
            {value}
          </span>
        ) : null}
      </div>
    );
  }

  if (item.kind === "choice") {
    return (
      <div className={`${shared} min-h-16 rounded-md px-3 py-3 pl-10`}>
        {marker}
        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {value ? (
          <p className="mt-1 inline-flex min-h-7 items-center rounded-md border border-gray-300 bg-slate-50 px-2 text-[12px] font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            {value}
          </p>
        ) : null}
      </div>
    );
  }

  if (item.kind === "card") {
    return (
      <div className={`${shared} min-h-16 rounded-md px-3 py-3 pl-10`}>
        {marker}
        <p className="text-[13px] font-semibold">{label}</p>
        {value ? <p className="mt-1 text-[11px] opacity-75">{value}</p> : null}
      </div>
    );
  }

  return (
    <div className={`${shared} min-h-16 rounded-md px-3 py-3 pl-10`}>
      {marker}
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-2 min-h-7 border-b border-gray-300 pb-1 text-[12px] font-medium text-gray-800 dark:border-gray-700 dark:text-gray-100">
        {value ?? "\u00a0"}
      </div>
    </div>
  );
}

export default function DocsTutorialFigure({
  tutorial,
  language,
}: {
  tutorial: DocTutorial;
  language: Language;
}) {
  const figureId = `docs-tutorial-${tutorial.articleSlug}-${tutorial.sectionId}`;
  const titleId = `${figureId}-title`;
  const descriptionId = `${figureId}-description`;
  const stepsId = `${figureId}-steps`;
  const split = tutorial.layout !== "single";
  const mapLabel = language === "th" ? "ตำแหน่งบนหน้าจอ" : "Where to find each control";
  const routeLabel = language === "th" ? "เริ่มจาก" : "Start from";
  const stepsLabel = tutorial.procedureLabel
    ? localized(tutorial.procedureLabel, language)
    : language === "th" ? "ทำตามลำดับ" : "Follow these steps";
  const resultLabel = language === "th" ? "เมื่อทำสำเร็จ" : "When complete";
  const sampleNote = language === "th"
    ? "ภาพนี้เป็นแผนผังจากข้อมูลตัวอย่าง ตำแหน่งอาจเปลี่ยนตามขนาดหน้าจอ โปรดอ้างอิงชื่อปุ่มและช่องกรอกในแต่ละขั้นตอน"
    : "This is a schematic with sample data. Positions may change by screen size; use the control names called out in each step.";
  const legendItems = tutorial.panels
    .flatMap((panel) => panel.items.map((item) => ({ item, panel })))
    .sort((a, b) => a.item.number - b.item.number);

  return (
    <figure
      data-doc-tutorial={`${tutorial.articleSlug}/${tutorial.sectionId}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="mt-7 max-w-[72ch]"
    >
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-md border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950"
      >
        <div className="flex min-h-12 min-w-0 items-center gap-3 border-b border-gray-200 bg-slate-50 px-3 dark:border-gray-800 dark:bg-gray-900">
          <span className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
            {mapLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-900 dark:text-white">
            {localized(tutorial.title, language)}
          </span>
        </div>

        <div
          className={split
            ? "divide-y divide-gray-200 md:grid md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-gray-800"
            : "divide-y divide-gray-200 dark:divide-gray-800"}
        >
          {tutorial.panels.map((panel, panelIndex) => {
            const spansFullRow = split
              && tutorial.panels.length % 2 === 1
              && panelIndex === tutorial.panels.length - 1;

            return (
              <section
                key={panel.title.en}
                className={`min-w-0 p-3 sm:p-4 ${spansFullRow ? "md:col-span-2" : ""}`}
              >
                <p className="mb-3 text-[12px] font-semibold text-gray-900 dark:text-white">
                  {localized(panel.title, language)}
                </p>
                <div
                  className={split && !spansFullRow
                    ? "grid min-w-0 gap-3"
                    : "grid min-w-0 gap-3 sm:grid-cols-2"}
                >
                  {panel.items.map((item) => (
                    <div
                      key={item.number}
                      className={item.span === "full" ? "min-w-0 sm:col-span-2" : "min-w-0"}
                    >
                      <TutorialControl item={item} language={language} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <figcaption className="mt-4">
        <p id={titleId} className="text-[15px] font-semibold leading-6 text-gray-950 dark:text-white">
          {localized(tutorial.title, language)}
        </p>
        <p id={descriptionId} className="mt-1 text-[13px] leading-6 text-gray-600 dark:text-gray-400">
          {localized(tutorial.description, language)}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{sampleNote}</p>
        <p className="mt-2 text-[12px] leading-5 text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-800 dark:text-gray-200">{routeLabel}:</span>{" "}
          <span data-doc-tutorial-route className="font-medium text-gray-800 dark:text-gray-200">
            {localized(tutorial.startAt, language)}
          </span>
        </p>

        <section data-doc-tutorial-legend aria-labelledby={stepsId} className="mt-4 border-y border-gray-200 dark:border-gray-800">
          <h3 id={stepsId} className="py-3 text-[14px] font-semibold text-gray-950 dark:text-white">
            {stepsLabel}
          </h3>
          <ol role="list" className="border-t border-gray-200 dark:border-gray-800">
            {legendItems.map(({ item, panel }) => {
              const value = item.value ? localized(item.value, language) : undefined;

              return (
                <li key={item.number} className="flex min-w-0 gap-3 border-t border-gray-100 py-4 first:border-t-0 dark:border-gray-900">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-orange-700 px-1 text-[12px] font-semibold tabular-nums text-white dark:bg-orange-500 dark:text-gray-950"
                  >
                    {item.number}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium leading-5 text-gray-500 dark:text-gray-400">
                      {localized(panel.title, language)}
                    </span>
                    <span className="block text-[14px] font-semibold leading-6 text-gray-950 dark:text-white">
                      {localized(item.label, language)}
                    </span>
                    {value ? (
                      <span
                        data-doc-tutorial-value={item.number}
                        className="mt-1 block w-fit rounded-md bg-slate-100 px-2 py-1 text-[12px] font-medium leading-5 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                      >
                        {value}
                      </span>
                    ) : null}
                    <span className="mt-1 block max-w-[68ch] text-[13px] leading-6 text-gray-700 dark:text-gray-300">
                      {localized(item.detail, language)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <p className="mt-4 rounded-md border border-gray-200 bg-slate-50 px-3 py-2.5 text-[13px] leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
          <span className="font-semibold text-gray-950 dark:text-white">{resultLabel}:</span>{" "}
          {localized(tutorial.result, language)}
        </p>
      </figcaption>
    </figure>
  );
}
