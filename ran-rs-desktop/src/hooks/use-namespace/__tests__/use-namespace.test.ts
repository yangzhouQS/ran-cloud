import { describe, it, expect } from "vitest";
import { useCsNamespace, defaultNamespace } from "../index";

describe("useCsNamespace - basic BEM", () => {
  const ns = useCsNamespace("button");

  it("b() generates block class", () => {
    expect(ns.b()).toBe("ran-button");
  });

  it("b(suffix) generates block-suffix class", () => {
    expect(ns.b("group")).toBe("ran-button-group");
  });

  it("e(element) generates block__element class", () => {
    expect(ns.e("icon")).toBe("ran-button__icon");
  });

  it("e(undefined) returns empty string", () => {
    expect(ns.e(undefined)).toBe("");
  });

  it("m(modifier) generates block--modifier class", () => {
    expect(ns.m("active")).toBe("ran-button--active");
  });

  it("m(undefined) returns empty string", () => {
    expect(ns.m(undefined)).toBe("");
  });

  it("be(suffix, element) generates full BEM", () => {
    expect(ns.be("group", "item")).toBe("ran-button-group__item");
  });

  it("be with missing params returns empty", () => {
    expect(ns.be(undefined, undefined)).toBe("");
    expect(ns.be("group", undefined)).toBe("");
    expect(ns.be(undefined, "item")).toBe("");
  });

  it("em(element, modifier) generates element--modifier", () => {
    expect(ns.em("icon", "large")).toBe("ran-button__icon--large");
  });

  it("bm(suffix, modifier) generates block-suffix--modifier", () => {
    expect(ns.bm("group", "active")).toBe("ran-button-group--active");
  });

  it("bem(suffix, element, modifier) generates full BEM", () => {
    expect(ns.bem("group", "item", "active")).toBe("ran-button-group__item--active");
  });

  it("bem with missing params returns empty", () => {
    expect(ns.bem(undefined, undefined, undefined)).toBe("");
  });
});

describe("useCsNamespace - is() state helper", () => {
  const ns = useCsNamespace("button");

  it("is(name, true) returns is-name", () => {
    expect(ns.is("loading", true)).toBe("is-loading");
  });

  it("is(name, false) returns empty string", () => {
    expect(ns.is("loading", false)).toBe("");
  });

  it("is(name, undefined) returns empty string", () => {
    expect(ns.is("loading", undefined)).toBe("");
  });

  it("is(name) without state defaults to true", () => {
    expect(ns.is("disabled")).toBe("is-disabled");
  });
});

describe("useCsNamespace - CSS variables", () => {
  const ns = useCsNamespace("button");

  it("cssVar generates --ran-* variables", () => {
    const result = ns.cssVar({ color: "red", size: "12px" });
    expect(result["--ran-color"]).toBe("red");
    expect(result["--ran-size"]).toBe("12px");
  });

  it("cssVar skips empty values", () => {
    const result = ns.cssVar({ color: "", size: "12px" });
    expect(result["--ran-color"]).toBeUndefined();
    expect(result["--ran-size"]).toBe("12px");
  });

  it("cssVarName generates variable name", () => {
    expect(ns.cssVarName("color")).toBe("--ran-color");
  });

  it("cssVarBlock generates --ran-button-* variables", () => {
    const result = ns.cssVarBlock({ bg: "blue" });
    expect(result["--ran-button-bg"]).toBe("blue");
  });

  it("cssVarBlockName generates block variable name", () => {
    expect(ns.cssVarBlockName("bg")).toBe("--ran-button-bg");
  });
});

describe("useCsNamespace - custom namespace", () => {
  it("uses custom namespace when provided", () => {
    const ns = useCsNamespace("input", "my-app");
    expect(ns.b()).toBe("my-app-input");
  });

  it("falls back to default namespace", () => {
    expect(defaultNamespace).toBe("ran");
    const ns = useCsNamespace("card");
    expect(ns.namespace.value).toBe("ran");
  });
});
