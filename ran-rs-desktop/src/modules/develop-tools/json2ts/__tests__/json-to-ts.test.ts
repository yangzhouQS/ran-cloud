import type { ConversionOptions } from "../types";
import { describe, expect, it } from "vitest";
import { convertJsonToTs } from "../services/json-to-ts";
import { defaultConversionOptions } from "../types";

describe("convertJsonToTs - basic types", () => {
  const opts = defaultConversionOptions;

  it("parses a simple string without errors (no object types to define)", () => {
    const result = convertJsonToTs("\"hello\"", opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toBe(""); // primitives produce no type definitions
    expect(result.types).toHaveLength(0);
  });

  it("parses a number without errors", () => {
    const result = convertJsonToTs("42", opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toBe("");
  });

  it("parses a boolean without errors", () => {
    const result = convertJsonToTs("true", opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toBe("");
  });

  it("parses null without errors", () => {
    const result = convertJsonToTs("null", opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toBe("");
  });

  it("parses an empty array without errors", () => {
    const result = convertJsonToTs("[]", opts);
    expect(result.errors).toHaveLength(0);
    // empty array has no object types, so output is empty
    expect(result.output).toBe("");
  });

  it("converts a flat object", () => {
    const result = convertJsonToTs("{\"name\":\"Alice\",\"age\":30}", opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toContain("export interface RootObject");
    expect(result.output).toContain("name: string");
    expect(result.output).toContain("age: number");
  });

  it("handles invalid JSON", () => {
    const result = convertJsonToTs("{invalid}", opts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("JSON 解析失败");
    expect(result.output).toBe("");
    expect(result.types).toHaveLength(0);
  });
});

describe("convertJsonToTs - nested objects", () => {
  const opts = defaultConversionOptions;

  it("handles nested objects", () => {
    const json = "{\"user\":{\"name\":\"Bob\",\"address\":{\"city\":\"NYC\"}}}";
    const result = convertJsonToTs(json, opts);
    expect(result.errors).toHaveLength(0);
    expect(result.types.length).toBeGreaterThanOrEqual(2);
    expect(result.output).toContain("RootObject");
    expect(result.output).toContain("RootObjectUser");
    expect(result.output).toContain("RootObjectUserAddress");
  });

  it("handles arrays of objects", () => {
    const json = "{\"items\":[{\"id\":1,\"title\":\"A\"},{\"id\":2,\"title\":\"B\"}]}";
    const result = convertJsonToTs(json, opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toContain("items:");
    expect(result.output).toContain("id: number");
    expect(result.output).toContain("title: string");
  });

  it("handles arrays of mixed types", () => {
    const json = "{\"values\":[1,\"two\",true]}";
    const result = convertJsonToTs(json, opts);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toContain("|");
  });

  it("handles null fields with treatNullAsOptional", () => {
    const json = "{\"name\":\"test\",\"value\":null}";
    const result = convertJsonToTs(json, { ...opts, treatNullAsOptional: true });
    expect(result.errors).toHaveLength(0);
    // value should be optional (has ?) when treatNullAsOptional is true
    expect(result.output).toMatch(/value\?:/);
  });

  it("handles null fields without treatNullAsOptional", () => {
    const json = "{\"name\":\"test\",\"value\":null}";
    const result = convertJsonToTs(json, { ...opts, treatNullAsOptional: false });
    expect(result.errors).toHaveLength(0);
    // value should be nullable (| null) when treatNullAsOptional is false
    expect(result.output).toContain("| null");
  });
});

describe("convertJsonToTs - export styles", () => {
  it("uses interface by default", () => {
    const result = convertJsonToTs("{\"a\":1}", defaultConversionOptions);
    expect(result.output).toContain("export interface");
    expect(result.output).toContain("}");
  });

  it("uses type alias when configured", () => {
    const opts: ConversionOptions = { ...defaultConversionOptions, exportStyle: "type" };
    const result = convertJsonToTs("{\"a\":1}", opts);
    expect(result.output).toContain("export type");
    expect(result.output).toContain("};");
  });
});

describe("convertJsonToTs - options", () => {
  it("respects rootTypeName", () => {
    const opts: ConversionOptions = { ...defaultConversionOptions, rootTypeName: "MyType" };
    const result = convertJsonToTs("{\"x\":1}", opts);
    expect(result.output).toContain("MyType");
  });

  it("respects indentSize", () => {
    const opts: ConversionOptions = { ...defaultConversionOptions, indentSize: 4 };
    const result = convertJsonToTs("{\"x\":1}", opts);
    expect(result.output).toContain("    x:");
  });

  it("returns NamedTypeDef array in types", () => {
    const result = convertJsonToTs("{\"a\":1,\"b\":\"s\"}", defaultConversionOptions);
    expect(result.types.length).toBeGreaterThanOrEqual(1);
    expect(result.types[0].name).toBe("RootObject");
    expect(result.types[0].body).toContain("a: number");
    expect(result.types[0].body).toContain("b: string");
  });
});

describe("convertJsonToTs - edge cases", () => {
  it("handles deeply nested structures", () => {
    const json = "{\"a\":{\"b\":{\"c\":{\"d\":\"deep\"}}}}";
    const result = convertJsonToTs(json, defaultConversionOptions);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toContain("d: string");
  });

  it("handles arrays with objects having different keys (merge)", () => {
    const json = "{\"items\":[{\"a\":1},{\"b\":2}]}";
    const result = convertJsonToTs(json, defaultConversionOptions);
    expect(result.errors).toHaveLength(0);
    // Merged type should have both a and b as optional
    expect(result.output).toMatch(/a\?:/);
    expect(result.output).toMatch(/b\?:/);
  });

  it("handles empty object", () => {
    const result = convertJsonToTs("{}", defaultConversionOptions);
    expect(result.errors).toHaveLength(0);
    expect(result.output).toContain("export interface RootObject");
  });

  it("handles array of primitives (no object types)", () => {
    const result = convertJsonToTs("[1, 2, 3]", defaultConversionOptions);
    expect(result.errors).toHaveLength(0);
    // primitive array has no object types to define
    expect(result.output).toBe("");
  });
});
