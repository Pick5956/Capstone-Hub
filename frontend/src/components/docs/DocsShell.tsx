"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import AppLogo from "@/src/components/shared/AppLogo";
import AppWordmark from "@/src/components/shared/AppWordmark";
import LanguageToggle from "@/src/components/shared/LanguageToggle";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import {
  DEFAULT_DOC_SLUG,
  DOC_ARTICLES,
  DOC_GROUPS,
  docArticleBySlug,
  docArticleFromPathname,
  docArticleHref,
  docSectionAnchor,
  docSectionHref,
  localized,
  searchDocEntries,
  type DocArticle,
  type DocSection,
} from "@/src/lib/docsContent";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const ALWAYS_RESTORE_FOCUS = () => true;

function useModalFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  initialRef: RefObject<HTMLElement | null>,
  returnRef: RefObject<HTMLElement | null>,
  shouldRestoreFocus: () => boolean = ALWAYS_RESTORE_FOCUS,
) {
  useEffect(() => {
    if (!open) return;
    const returnTarget = returnRef.current;
    const frame = window.requestAnimationFrame(() => initialRef.current?.focus());

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleTab);
      if (shouldRestoreFocus()) {
        window.requestAnimationFrame(() => returnTarget?.focus());
      }
    };
  }, [initialRef, open, panelRef, returnRef, shouldRestoreFocus]);
}

function SidebarNavigation({
  activeSlug,
  language,
  label,
  mobile = false,
  onNavigate,
}: {
  activeSlug: string;
  language: "th" | "en";
  label: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const activeLink = activeLinkRef.current;
    if (!nav || !activeLink || !activeLink.getClientRects().length) return;

    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const inset = 12;
    if (linkRect.top < navRect.top + inset) {
      nav.scrollTop -= navRect.top + inset - linkRect.top;
    } else if (linkRect.bottom > navRect.bottom - inset) {
      nav.scrollTop += linkRect.bottom - navRect.bottom + inset;
    }
  }, [activeSlug]);

  return (
    <nav
      ref={navRef}
      aria-label={label}
      data-docs-sidebar-scroll
      className="sidebar-nav-scroll h-full overflow-y-auto overscroll-contain px-3 py-5"
    >
      {DOC_GROUPS.map((group) => {
        const articles = DOC_ARTICLES.filter((article) => article.groupId === group.id);
        return (
          <section key={group.id} aria-labelledby={`docs-nav-${mobile ? "mobile-" : ""}${group.id}`} className="mb-6 last:mb-2">
            <h2
              id={`docs-nav-${mobile ? "mobile-" : ""}${group.id}`}
              className="px-3 text-[12px] font-semibold leading-5 text-gray-950 dark:text-gray-200"
            >
              {localized(group.title, language)}
            </h2>
            <ul className="mt-1.5 space-y-0.5">
              {articles.map((article) => {
                const active = activeSlug === article.slug;
                return (
                  <li key={article.slug}>
                    <Link
                      ref={active ? activeLinkRef : undefined}
                      href={docArticleHref(article)}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center rounded-md px-3 py-2 text-[13px] font-medium leading-5 transition-colors ${
                        mobile ? "min-h-11" : "min-h-9"
                      } ${
                        active
                          ? "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
                      }`}
                    >
                      {localized(article.title, language)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

function ThemeButton({ compact = false }: { compact?: boolean }) {
  const { language } = useLanguage();
  const { mounted, theme, toggle } = useTheme();
  const dark = mounted && theme === "dark";
  const title = dark
    ? language === "th" ? "เปลี่ยนเป็นโหมดสว่าง" : "Switch to light mode"
    : language === "th" ? "เปลี่ยนเป็นโหมดมืด" : "Switch to dark mode";
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={title}
      title={title}
      className={compact
        ? "ui-press inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
        : "ui-press flex min-h-11 w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3 text-left text-[13px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact ? <span>{title}</span> : null}
    </button>
  );
}

export default function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const defaultArticle = docArticleBySlug(DEFAULT_DOC_SLUG) ?? DOC_ARTICLES[0];
  const activeArticle = docArticleFromPathname(pathname) ?? defaultArticle;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mobilePanelRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const suppressSearchReturnFocusRef = useRef(false);
  const pendingSearchFocusRef = useRef<string | null>(null);
  const results = useMemo(() => searchDocEntries(searchQuery), [searchQuery]);
  const shouldRestoreSearchFocus = useCallback(() => !suppressSearchReturnFocusRef.current, []);

  const copy = language === "th"
    ? {
        docs: "คู่มือ",
        nav: "สารบัญคู่มือ",
        search: "ค้นหาคู่มือ",
        searchHint: "ค้นหาเมนู ขั้นตอน หรือปัญหา",
        searchDialog: "ค้นหาในคู่มือ Dishy",
        resultCount: (count: number) => `พบ ${count} หัวข้อ`,
        noResults: "ไม่พบหัวข้อที่ตรง ลองใช้คำสั้นลงหรือชื่อหน้าจอ",
        close: "ปิด",
        menu: "เปิดสารบัญ",
        app: "เข้าใช้งาน Dishy",
        language: "ภาษา",
      }
    : {
        docs: "Docs",
        nav: "Guide navigation",
        search: "Search docs",
        searchHint: "Search features, steps, or problems",
        searchDialog: "Search Dishy documentation",
        resultCount: (count: number) => `${count} topics found`,
        noResults: "No matching topic. Try a shorter term or a screen name.",
        close: "Close",
        menu: "Open guide navigation",
        app: "Open Dishy",
        language: "Language",
      };

  const closeSearch = () => setSearchOpen(false);
  const searchBackdrop = useBackdropClose(closeSearch);
  const mobileBackdrop = useBackdropClose(() => setMobileNavOpen(false));

  useModalFocus(searchOpen, searchPanelRef, searchInputRef, searchTriggerRef, shouldRestoreSearchFocus);
  useModalFocus(mobileNavOpen, mobilePanelRef, mobileCloseRef, mobileTriggerRef);

  useEffect(() => {
    const docsLabel = language === "th" ? "คู่มือ Dishy" : "Dishy docs";
    document.title = `${localized(activeArticle.title, language)} | ${docsLabel}`;
  }, [activeArticle.title, language]);

  useEffect(() => {
    if (searchOpen || !pendingSearchFocusRef.current) return;
    let frame = 0;
    let attempts = 0;

    const focusDestination = () => {
      const targetId = pendingSearchFocusRef.current;
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (target) {
        target.focus({ preventScroll: true });
        pendingSearchFocusRef.current = null;
        return;
      }
      attempts += 1;
      if (attempts < 4) frame = window.requestAnimationFrame(focusDestination);
    };

    frame = window.requestAnimationFrame(focusDestination);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, searchOpen]);

  useEffect(() => {
    const open = searchOpen || mobileNavOpen;
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen, searchOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        suppressSearchReturnFocusRef.current = false;
        searchTriggerRef.current = window.innerWidth >= 1024
          ? desktopSearchTriggerRef.current
          : mobileSearchTriggerRef.current;
        setMobileNavOpen(false);
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileNavOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openSearch = (trigger: HTMLButtonElement) => {
    suppressSearchReturnFocusRef.current = false;
    searchTriggerRef.current = trigger;
    setSearchOpen(true);
  };

  const closeNavigation = () => setMobileNavOpen(false);
  const navigateFromSearch = (article: DocArticle, section?: DocSection) => {
    suppressSearchReturnFocusRef.current = true;
    pendingSearchFocusRef.current = section
      ? `${docSectionAnchor(section)}-title`
      : `${article.slug}-title`;
    setSearchOpen(false);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div
        inert={searchOpen || mobileNavOpen ? true : undefined}
        aria-hidden={searchOpen || mobileNavOpen ? true : undefined}
      >
        <a
          href="#docs-content"
          className="fixed left-3 top-2 z-[70] -translate-y-20 rounded-md bg-orange-700 px-3 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0 dark:bg-orange-700 dark:text-white"
        >
          {language === "th" ? "ข้ามไปเนื้อหา" : "Skip to content"}
        </a>

        <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="flex h-full items-center gap-3 px-3 sm:px-5">
          <Link
            href="/docs"
            className="flex min-w-0 shrink-0 items-center gap-2.5 lg:w-[17rem]"
            aria-label={language === "th" ? "หน้าแรกคู่มือ Dishy" : "Dishy docs home"}
          >
            <AppLogo decorative size={34} priority />
            <AppWordmark decorative height={15} className="text-gray-950 dark:text-white" />
            <span className="hidden h-5 w-px bg-gray-200 dark:bg-gray-800 sm:block" aria-hidden="true" />
            <span className="hidden text-[13px] font-medium text-gray-500 dark:text-gray-400 sm:inline">{copy.docs}</span>
          </Link>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:ml-0 lg:justify-between">
            <button
              ref={desktopSearchTriggerRef}
              type="button"
              onClick={(event) => openSearch(event.currentTarget)}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-controls="docs-search-dialog"
              className="ui-press hidden h-10 w-full max-w-md items-center gap-2 rounded-md border border-gray-200 bg-slate-50 px-3 text-left text-[13px] text-gray-500 hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400 dark:hover:bg-gray-900 lg:flex"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{copy.search}</span>
              <kbd className="ml-auto rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">Ctrl K</kbd>
            </button>

            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <ThemeButton compact />
              <LanguageToggle />
              <Link
                href="/restaurants"
                className="ui-press hidden h-10 items-center gap-2 rounded-md bg-orange-700 px-3.5 text-[12px] font-semibold text-white hover:bg-orange-800 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-800 xl:inline-flex"
              >
                {copy.app}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <button
              ref={mobileSearchTriggerRef}
              type="button"
              onClick={(event) => openSearch(event.currentTarget)}
              aria-label={copy.search}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-controls="docs-search-dialog"
              className="ui-press inline-flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 lg:hidden"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              ref={mobileTriggerRef}
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={copy.menu}
              aria-expanded={mobileNavOpen}
              aria-controls="docs-mobile-navigation"
              className="ui-press inline-flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        </header>

        <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-72 overflow-hidden border-r border-gray-200 bg-slate-50/70 dark:border-gray-800 dark:bg-gray-950 lg:block">
          <SidebarNavigation activeSlug={activeArticle.slug} language={language} label={copy.nav} />
        </aside>

        <div className="pt-16 lg:pl-72">
          <main id="docs-content" className="mx-auto min-h-[calc(100dvh-4rem)] max-w-[860px] scroll-mt-20 px-5 sm:px-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>

      {searchOpen ? (
        <div {...searchBackdrop} className="motion-overlay fixed inset-0 z-[60] flex items-start justify-center bg-gray-950/55 p-3 pt-[8dvh] sm:p-6 sm:pt-[12dvh]">
          <div
            ref={searchPanelRef}
            id="docs-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="docs-search-title"
            className="motion-dialog flex max-h-[78dvh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950"
          >
            <div className="flex items-center gap-3 border-b border-gray-200 px-3 dark:border-gray-800 sm:px-4">
              <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
              <label id="docs-search-title" htmlFor="docs-search-input" className="sr-only">{copy.searchDialog}</label>
              <input
                ref={searchInputRef}
                id="docs-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={copy.searchHint}
                autoComplete="off"
                className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-gray-950 outline-none placeholder:text-gray-500 dark:text-white dark:placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={closeSearch}
                aria-label={copy.close}
                className="ui-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="sr-only" aria-live="polite">{copy.resultCount(results.length)}</p>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
              {results.length ? (
                <ul className="space-y-1" aria-label={copy.resultCount(results.length)}>
                  {results.map(({ article, section }) => {
                    const group = DOC_GROUPS.find((item) => item.id === article.groupId);
                    const href = section
                      ? docSectionHref(article, section)
                      : docArticleHref(article);
                    return (
                      <li key={`${article.slug}:${section?.id ?? "article"}`}>
                        <Link
                          href={href}
                          onClick={() => navigateFromSearch(article, section)}
                          className="group flex min-h-16 items-start gap-3 rounded-md px-3 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-gray-900 dark:focus-visible:bg-gray-900"
                        >
                          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                            <BookOpen className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-gray-900 group-hover:text-orange-700 dark:text-white dark:group-hover:text-orange-300">
                              {localized(article.title, language)}
                            </span>
                            <span className="mt-0.5 block text-[12px] leading-5 text-gray-500 dark:text-gray-400">
                              {localized(article.summary, language)}
                            </span>
                            {group ? (
                              <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                                {localized(group.title, language)}
                                {section ? ` / ${localized(section.title, language)}` : ""}
                              </span>
                            ) : null}
                          </span>
                          <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500 dark:text-gray-700" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center">
                  <Search className="h-6 w-6 text-gray-300 dark:text-gray-700" aria-hidden="true" />
                  <p className="mt-3 max-w-sm text-[13px] leading-6 text-gray-500 dark:text-gray-400">{copy.noResults}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {mobileNavOpen ? (
        <div {...mobileBackdrop} className="motion-overlay fixed inset-0 z-[60] bg-gray-950/55 lg:hidden">
          <aside
            ref={mobilePanelRef}
            id="docs-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="docs-mobile-navigation-title"
            className="motion-dialog-stationary flex h-[100dvh] w-11/12 max-w-sm flex-col border-r border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
          >
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
              <AppLogo decorative size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-gray-950 dark:text-white">
                  <AppWordmark height={13} />
                  <span className="text-[13px] font-semibold">{copy.docs}</span>
                </div>
                <p id="docs-mobile-navigation-title" className="text-[11px] text-gray-500 dark:text-gray-400">{copy.nav}</p>
              </div>
              <button
                ref={mobileCloseRef}
                type="button"
                onClick={closeNavigation}
                aria-label={copy.close}
                className="ui-press ml-auto inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <SidebarNavigation activeSlug={activeArticle.slug} language={language} label={copy.nav} mobile onNavigate={closeNavigation} />
            </div>

            <div className="shrink-0 space-y-2 border-t border-gray-200 p-3 dark:border-gray-800">
              <p className="px-1 text-[11px] font-semibold text-gray-600 dark:text-gray-400">{copy.language}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["th", "en"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLanguage(value)}
                    aria-pressed={language === value}
                    className={`ui-press h-11 rounded-md border text-[13px] font-semibold ${
                      language === value
                        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
                    }`}
                  >
                    {value === "th" ? "ไทย" : "English"}
                  </button>
                ))}
              </div>
              <ThemeButton />
              <Link
                href="/restaurants"
                className="ui-press flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-orange-700 px-4 text-[13px] font-semibold text-white hover:bg-orange-800 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-800"
              >
                {copy.app}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
