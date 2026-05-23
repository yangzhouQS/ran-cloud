import type { FieldDef, ObjectType, TypeNode } from "../types";
import { describe, expect, it } from "vitest";
import { applyAliases, computeStructuralHash, mergeIdenticalTypes } from "../services/type-merger";

function makeField(kind: string, opts?: Partial<FieldDef>): FieldDef {
  const typeNode = { kind } as TypeNode;
  return { typeNode, optional: false, nullable: false, ...opts };
}

function makeObject(name: string, fields: Record<string, FieldDef>): ObjectType {
  return { kind: "object", name, fields };
}

describe("computeStructuralHash", () => {
  it("returns consistent hash for same structure", () => {
    const obj1 = makeObject("A", { x: makeField("string"), y: makeField("number") });
    const obj2 = makeObject("B", { x: makeField("string"), y: makeField("number") });
    expect(computeStructuralHash(obj1)).toBe(computeStructuralHash(obj2));
  });

  it("returns different hash for different structure", () => {
    const obj1 = makeObject("A", { x: makeField("string") });
    const obj2 = makeObject("B", { x: makeField("number") });
    expect(computeStructuralHash(obj1)).not.toBe(computeStructuralHash(obj2));
  });

  it("is order-independent (sorted keys)", () => {
    const obj1 = makeObject("A", { a: makeField("string"), b: makeField("number") });
    const obj2 = makeObject("B", { b: makeField("number"), a: makeField("string") });
    expect(computeStructuralHash(obj1)).toBe(computeStructuralHash(obj2));
  });

  it("handles nested object types", () => {
    const inner = makeObject("Inner", { val: makeField("boolean") });
    const fieldDef: FieldDef = { typeNode: inner, optional: false, nullable: false };
    const obj = makeObject("Outer", { child: fieldDef });
    const hash = computeStructuralHash(obj);
    expect(hash).toContain("child");
    expect(hash).toContain("boolean");
  });

  it("handles array types", () => {
    const arrType: TypeNode = { kind: "array", elementType: { kind: "string" } as TypeNode };
    const fieldDef: FieldDef = { typeNode: arrType, optional: false, nullable: false };
    const obj = makeObject("A", { items: fieldDef });
    const hash = computeStructuralHash(obj);
    expect(hash).toContain("Array<string>");
  });

  it("handles union types", () => {
    const unionType: TypeNode = {
      kind: "union",
      members: [{ kind: "string" } as TypeNode, { kind: "number" } as TypeNode],
    };
    const fieldDef: FieldDef = { typeNode: unionType, optional: false, nullable: false };
    const obj = makeObject("A", { value: fieldDef });
    const hash = computeStructuralHash(obj);
    expect(hash).toContain("|");
  });

  it("handles empty object", () => {
    const obj = makeObject("Empty", {});
    const hash = computeStructuralHash(obj);
    expect(hash).toBe("");
  });
});

describe("mergeIdenticalTypes", () => {
  it("deduplicates identical types", () => {
    const obj1 = makeObject("TypeA", { x: makeField("string") });
    const obj2 = makeObject("TypeB", { x: makeField("string") });
    const { merged, aliasMap } = mergeIdenticalTypes([obj1, obj2]);
    expect(merged).toHaveLength(1);
    expect(aliasMap.has("TypeB")).toBe(true);
    expect(aliasMap.get("TypeB")).toBe("TypeA");
  });

  it("keeps different types separate", () => {
    const obj1 = makeObject("TypeA", { x: makeField("string") });
    const obj2 = makeObject("TypeB", { x: makeField("number") });
    const { merged, aliasMap } = mergeIdenticalTypes([obj1, obj2]);
    expect(merged).toHaveLength(2);
    expect(aliasMap.size).toBe(0);
  });

  it("handles empty list", () => {
    const { merged, aliasMap } = mergeIdenticalTypes([]);
    expect(merged).toHaveLength(0);
    expect(aliasMap.size).toBe(0);
  });

  it("handles single type", () => {
    const obj = makeObject("Only", { x: makeField("string") });
    const { merged, aliasMap } = mergeIdenticalTypes([obj]);
    expect(merged).toHaveLength(1);
    expect(aliasMap.size).toBe(0);
  });

  it("handles 3+ identical types", () => {
    const objs = [
      makeObject("A", { x: makeField("string") }),
      makeObject("B", { x: makeField("string") }),
      makeObject("C", { x: makeField("string") }),
    ];
    const { merged, aliasMap } = mergeIdenticalTypes(objs);
    expect(merged).toHaveLength(1);
    expect(aliasMap.size).toBe(2);
  });
});

describe("applyAliases", () => {
  it("replaces object name when alias exists", () => {
    const aliasMap = new Map<string, string>([["OldName", "NewName"]]);
    const obj = makeObject("OldName", { x: makeField("string") });
    const result = applyAliases(obj, aliasMap) as ObjectType;
    expect(result.name).toBe("NewName");
  });

  it("keeps name when no alias", () => {
    const aliasMap = new Map<string, string>();
    const obj = makeObject("KeepName", { x: makeField("string") });
    const result = applyAliases(obj, aliasMap) as ObjectType;
    expect(result.name).toBe("KeepName");
  });

  it("applies aliases to nested object types", () => {
    const aliasMap = new Map<string, string>([["Inner", "RenamedInner"]]);
    const inner = makeObject("Inner", { val: makeField("string") });
    const fieldDef: FieldDef = { typeNode: inner, optional: false, nullable: false };
    const outer = makeObject("Outer", { child: fieldDef });
    const result = applyAliases(outer, aliasMap) as ObjectType;
    const childType = result.fields.child.typeNode as ObjectType;
    expect(childType.name).toBe("RenamedInner");
  });

  it("passes through primitive types unchanged", () => {
    const aliasMap = new Map<string, string>([["X", "Y"]]);
    const primitive = { kind: "string" } as TypeNode;
    const result = applyAliases(primitive, aliasMap);
    expect(result.kind).toBe("string");
  });

  it("applies aliases inside array types", () => {
    const aliasMap = new Map<string, string>([["Item", "NewItem"]]);
    const inner = makeObject("Item", { val: makeField("number") });
    const arrType: TypeNode = { kind: "array", elementType: inner };
    const fieldDef: FieldDef = { typeNode: arrType, optional: false, nullable: false };
    const outer = makeObject("Outer", { items: fieldDef });
    const result = applyAliases(outer, aliasMap) as ObjectType;
    const arrResult = result.fields.items.typeNode as { elementType: ObjectType };
    expect(arrResult.elementType.name).toBe("NewItem");
  });

  it("applies aliases inside union types", () => {
    const aliasMap = new Map<string, string>([["A", "RenamedA"]]);
    const objA = makeObject("A", { x: makeField("string") });
    const unionType: TypeNode = { kind: "union", members: [objA, { kind: "number" } as TypeNode] };
    const result = applyAliases(unionType, aliasMap) as { members: TypeNode[] };
    const firstMember = result.members[0] as ObjectType;
    expect(firstMember.name).toBe("RenamedA");
  });

  it("handles empty alias map", () => {
    const obj = makeObject("Test", { a: makeField("string"), b: makeField("number") });
    const result = applyAliases(obj, new Map()) as ObjectType;
    expect(result.name).toBe("Test");
    expect(Object.keys(result.fields)).toEqual(["a", "b"]);
  });
});
