export type AppLanguage = "th" | "en";

export function localeForLanguage(language: AppLanguage) {
  return language === "th" ? "th-TH" : "en-US";
}

export function formatCurrency(value: number, language: AppLanguage, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(localeForLanguage(language), {
    style: "currency",
    currency: "THB",
    maximumFractionDigits,
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
