/**
 * api.test.ts — isRustApi 类型守卫测试（Tier 1）
 */
import { describe, expect, it } from "vitest";
import { isRustApi } from "../../plugin/types/api";

describe("isRustApi", () => {
  it("should return true for Rust API methods", () => {
    const rustMethods = [
      "getSchemas",
      "getTables",
      "getColumns",
      "runQuery",
      "getData",
      "setData",
      "getAppInfo",
      "getConnectionInfo",
    ];
    for (const method of rustMethods) {
      expect(isRustApi(method), `${method} should be Rust API`).toBe(true);
    }
  });

  it("should return false for frontend API methods", () => {
    const frontendMethods = [
      "clipboardReadText",
      "clipboardWriteText",
      "notyInfo",
      "notySuccess",
      "notyError",
      "notyWarning",
      "confirm",
      "getViewContext",
      "openExternal",
    ];
    for (const method of frontendMethods) {
      expect(isRustApi(method), `${method} should not be Rust API`).toBe(false);
    }
  });

  it("should return false for unknown methods", () => {
    expect(isRustApi("unknownMethod")).toBe(false);
    expect(isRustApi("")).toBe(false);
  });
});
