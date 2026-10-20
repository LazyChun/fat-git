import enUS from "./en_US";
import zhCN from "./zh_CN";

export type LocaleId = "zh_CN" | "en_US";

export type TextFn = (id: string, values?: Record<string, string | number>) => string;

const CATALOGS: Record<LocaleId, Record<string, string>> = {
  zh_CN: zhCN,
  en_US: enUS,
};

const CODE_RE = /^[a-z]+(?:\.[a-zA-Z0-9]+)+$/;

export function normalizeLocale(locale?: string): LocaleId {
  const value = (locale || "").replace("-", "_");
  if (value === "en_US" || value.toLowerCase().startsWith("en")) return "en_US";
  return "zh_CN";
}

export function catalog(locale?: string): Record<string, string> {
  return CATALOGS[normalizeLocale(locale)];
}

function fill(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function translate(
  locale: string | undefined,
  id: string,
  values?: Record<string, string | number>,
): string {
  const messages = catalog(locale);
  const template = messages[id];
  if (!template) return id;
  return fill(template, values);
}

/** 后端用稳定错误码返回提示，界面按当前语言显示；Git 自己的 stderr 原样保留。 */
export function localize(raw: string, text: TextFn): string {
  if (!raw || !CODE_RE.test(raw)) return raw;
  const key = `error.${raw}`;
  const next = text(key);
  return next === key ? raw : next;
}
