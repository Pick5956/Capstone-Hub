export type AppLanguage = "th" | "en";

export function localeForLanguage(language: AppLanguage) {
  return language === "th" ? "th-TH" : "en-US";
}

// `signDisplay: "exceptZero"` is the one worth knowing: it prints the + on a
// gain that the default drops, and leaves a flat zero unsigned.
export function formatCurrency(
  value: number,
  language: AppLanguage,
  maximumFractionDigits = 0,
  signDisplay: Intl.NumberFormatOptions["signDisplay"] = "auto",
) {
  return new Intl.NumberFormat(localeForLanguage(language), {
    style: "currency",
    currency: "THB",
    maximumFractionDigits,
    signDisplay,
  }).format(value);
}

export function formatNumber(value: number, language: AppLanguage, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(localeForLanguage(language), {
    maximumFractionDigits,
  }).format(value);
}

export function formatAdaptiveNumber(value: number, language: AppLanguage) {
  return formatNumber(value, language, value % 1 === 0 ? 0 : 2);
}
