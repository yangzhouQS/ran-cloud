import { describe, it, expect, beforeEach } from "vitest";

beforeEach(() => {
  localStorage.clear();
});

describe("i18n - configuration", () => {
  it("SUPPORTED_LOCALES has correct entries", async () => {
    const { SUPPORTED_LOCALES } = await import("../index");
    expect(SUPPORTED_LOCALES).toHaveLength(2);
    expect(SUPPORTED_LOCALES[0].value).toBe("zh-CN");
    expect(SUPPORTED_LOCALES[1].value).toBe("en");
  });

  it("default locale is zh-CN when no stored locale", async () => {
    const { getLocale } = await import("../index");
    expect(getLocale()).toBe("zh-CN");
  });
});

describe("i18n - setLocale", () => {
  it("changes locale and persists", async () => {
    const { setLocale, getLocale } = await import("../index");
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(localStorage.getItem("ran-rs-desktop-locale")).toBe("en");
  });

  it("sets document lang attribute", async () => {
    const { setLocale } = await import("../index");
    setLocale("en");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("switches back to zh-CN", async () => {
    const { setLocale, getLocale } = await import("../index");
    setLocale("en");
    setLocale("zh-CN");
    expect(getLocale()).toBe("zh-CN");
  });
});

describe("i18n - locale messages", () => {
  it("zh-CN has common section", async () => {
    const zhCN = await import("../locales/zh-cn");
    expect(zhCN.default).toHaveProperty("common");
  });

  it("en has common section", async () => {
    const en = await import("../locales/en");
    expect(en.default).toHaveProperty("common");
  });

  it("both have same top-level keys", async () => {
    const zhCN = await import("../locales/zh-cn");
    const en = await import("../locales/en");
    expect(Object.keys(zhCN.default).sort()).toEqual(Object.keys(en.default).sort());
  });
});
