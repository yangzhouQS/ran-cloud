/**
 * vue-i18n 9.x 国际化配置
 *
 * 支持语言：中文（zh-CN）、英文（en）
 * 默认语言：中文（zh-CN）
 * 语言偏好持久化到 localStorage
 */

import type { I18nOptions } from "vue-i18n";
import { createI18n } from "vue-i18n";
import en from "./locales/en";
import zhCN from "./locales/zh-cn";

/** 支持的语言列表 */
export const SUPPORTED_LOCALES = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
] as const;

/** 语言类型 */
export type LocaleValue = (typeof SUPPORTED_LOCALES)[number]["value"];

/** 获取存储的语言或默认语言 */
function getStoredLocale(): LocaleValue {
  const stored = localStorage.getItem("ran-rs-desktop-locale");
  if (stored && SUPPORTED_LOCALES.some(l => l.value === stored)) {
    return stored as LocaleValue;
  }
  return "zh-CN";
}

/** i18n 配置 */
const i18nOptions: I18nOptions = {
  legacy: false, // 使用 Composition API 模式
  locale: getStoredLocale(),
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
    en,
  },
};

/** vue-i18n 实例 */
const i18n = createI18n(i18nOptions);

export default i18n;

/**
 * 切换语言
 * @param locale 目标语言
 */
export function setLocale(locale: LocaleValue): void {
  const { global } = i18n;
  global.locale.value = locale;
  localStorage.setItem("ran-rs-desktop-locale", locale);
  // 更新 Element Plus locale（需要在使用处处理）
  document.documentElement.setAttribute("lang", locale);
}

/**
 * 获取当前语言
 */
export function getLocale(): LocaleValue {
  return (i18n.global.locale.value as LocaleValue) || "zh-CN";
}
