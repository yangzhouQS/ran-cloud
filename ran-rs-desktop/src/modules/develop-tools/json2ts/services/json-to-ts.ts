import type {
  ArrayType,
  ConversionOptions,
  ConversionResult,
  FieldDef,
  NamedTypeDef,
  ObjectType,
  PrimitiveType,
  TypeNode,
  UnionType,
} from "../types";
import { applyAliases, mergeIdenticalTypes } from "./type-merger";

// ==================== 工具方法 ====================

/** 将字符串转为 PascalCase */
function pascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/** 生成唯一名称（处理冲突） */
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }
  let i = 2;
  while (used.has(`${base}${i}`)) {
    i++;
  }
  return `${base}${i}`;
}

// ==================== 类型推断 ====================

/** 收集所有 ObjectType 节点 */
function collectObjectTypes(node: TypeNode): ObjectType[] {
  const result: ObjectType[] = [];

  function walk(n: TypeNode): void {
    switch (n.kind) {
      case "object":
        result.push(n);
        for (const field of Object.values(n.fields)) {
          walk(field.typeNode);
        }
        break;
      case "array":
        walk(n.elementType);
        break;
      case "union":
        for (const member of n.members) {
          walk(member);
        }
        break;
    }
  }

  walk(node);
  return result;
}

/** 推断值的类型 */
function inferType(
  value: unknown,
  fieldName: string,
  options: ConversionOptions,
  usedNames: Set<string>,
): TypeNode {
  // null
  if (value === null || value === undefined) {
    return { kind: value === null ? "null" : "undefined" } as PrimitiveType;
  }

  // 基本类型
  if (typeof value === "string") {
    return { kind: "string" } as PrimitiveType;
  }
  if (typeof value === "number") {
    return { kind: "number" } as PrimitiveType;
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" } as PrimitiveType;
  }

  // 数组
  if (Array.isArray(value)) {
    return inferArrayType(value, fieldName, options, usedNames);
  }

  // 对象
  if (typeof value === "object") {
    return inferObjectType(
      value as Record<string, unknown>,
      fieldName,
      options,
      usedNames,
    );
  }

  return { kind: "string" } as PrimitiveType;
}

/** 推断数组类型 */
function inferArrayType(
  arr: unknown[],
  fieldName: string,
  options: ConversionOptions,
  usedNames: Set<string>,
): ArrayType | TypeNode {
  if (arr.length === 0) {
    // 空数组无法推断元素类型，使用 unknown 占位
    return { kind: "array", elementType: { kind: "undefined" } } as ArrayType;
  }

  // 推断每个元素的类型
  const elementTypes = arr.map((item) =>
    inferType(item, fieldName, options, usedNames),
  );

  // 过滤掉 undefined（来自空数组推断占位）
  const filteredTypes = elementTypes.filter((t) => t.kind !== "undefined");

  // 去重：按 kind 和结构比较
  const uniqueTypes = deduplicateTypes(filteredTypes.length > 0 ? filteredTypes : elementTypes);

  if (uniqueTypes.length === 1) {
    return {
      kind: "array",
      elementType: uniqueTypes[0],
    } as ArrayType;
  }

  // 多种类型 → 联合类型数组
  // 对于对象数组，尝试合并相同结构的对象
  const objectTypes = uniqueTypes.filter((t) => t.kind === "object") as ObjectType[];
  const nonObjectTypes = uniqueTypes.filter((t) => t.kind !== "object");

  if (objectTypes.length > 1) {
    // 尝试合并对象类型
    const merged = mergeArrayObjectTypes(objectTypes, fieldName, options, usedNames);
    const members = [...nonObjectTypes, ...merged];
    return {
      kind: "array",
      elementType:
        members.length === 1
          ? members[0]
          : ({ kind: "union", members } as UnionType),
    } as ArrayType;
  }

  return {
    kind: "array",
    elementType: { kind: "union", members: uniqueTypes } as UnionType,
  } as ArrayType;
}

/** 合并数组中的多个对象类型（合并字段，缺失字段标记为可选） */
function mergeArrayObjectTypes(
  objects: ObjectType[],
  fieldName: string,
  options: ConversionOptions,
  usedNames: Set<string>,
): ObjectType[] {
  if (objects.length <= 1) return objects;

  const allKeys = new Set<string>();
  const keyPresence: Record<string, number> = {};

  for (const obj of objects) {
    for (const key of Object.keys(obj.fields)) {
      allKeys.add(key);
      keyPresence[key] = (keyPresence[key] ?? 0) + 1;
    }
  }

  const mergedName = uniqueName(pascalCase(fieldName), usedNames);
  usedNames.add(mergedName);

  const mergedFields: Record<string, FieldDef> = {};

  for (const key of allKeys) {
    const isOptional = keyPresence[key] < objects.length;
    const fieldTypes: TypeNode[] = [];

    for (const obj of objects) {
      const field = obj.fields[key];
      if (field) {
        fieldTypes.push(field.typeNode);
      }
    }

    const uniqueFieldTypes = deduplicateTypes(fieldTypes);
    const typeNode =
      uniqueFieldTypes.length === 1
        ? uniqueFieldTypes[0]
        : ({ kind: "union", members: uniqueFieldTypes } as UnionType);

    const hasNull = uniqueFieldTypes.some((t) => t.kind === "null");
    const nonNullTypes = uniqueFieldTypes.filter((t) => t.kind !== "null");
    const finalType =
      nonNullTypes.length === 0
        ? ({ kind: "null" } as PrimitiveType)
        : nonNullTypes.length === 1
          ? nonNullTypes[0]
          : ({ kind: "union", members: nonNullTypes } as UnionType);

    mergedFields[key] = {
      typeNode: hasNull ? finalType : typeNode,
      optional: isOptional || (hasNull && options.treatNullAsOptional),
      nullable: hasNull && !options.treatNullAsOptional,
    };
  }

  return [{ kind: "object", name: mergedName, fields: mergedFields } as ObjectType];
}

/** 去重类型列表 */
function deduplicateTypes(types: TypeNode[]): TypeNode[] {
  const seen = new Set<string>();
  const result: TypeNode[] = [];

  for (const t of types) {
    const key = typeKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
  }

  return result;
}

/** 生成类型唯一键 */
function typeKey(node: TypeNode): string {
  switch (node.kind) {
    case "object":
      return `obj:${node.name}`;
    case "array":
      return `arr:${typeKey(node.elementType)}`;
    case "union":
      return `union:${node.members.map(typeKey).sort().join("|")}`;
    default:
      return node.kind;
  }
}

/** 推断对象类型 */
function inferObjectType(
  obj: Record<string, unknown>,
  fieldName: string,
  options: ConversionOptions,
  usedNames: Set<string>,
): ObjectType {
  const name = uniqueName(pascalCase(fieldName), usedNames);
  usedNames.add(name);

  const fields: Record<string, FieldDef> = {};

  for (const [key, value] of Object.entries(obj)) {
    const childName = `${name}${pascalCase(key)}`;
    const typeNode = inferType(value, childName, options, usedNames);

    const isNull = value === null;
    const isUndefined = value === undefined;

    fields[key] = {
      typeNode,
      optional: (isNull && options.treatNullAsOptional) || isUndefined,
      nullable: isNull && !options.treatNullAsOptional,
    };
  }

  return { kind: "object", name, fields };
}

// ==================== 格式化 ====================

/** 将 TypeNode 转为 TypeScript 类型字符串 */
function formatTypeRef(node: TypeNode): string {
  switch (node.kind) {
    case "string":
    case "number":
    case "boolean":
      return node.kind;
    case "null":
      return "null";
    case "undefined":
      return "unknown";
    case "object":
      return node.name;
    case "array": {
      const inner = formatTypeRef(node.elementType);
      if (
        node.elementType.kind === "union" ||
        node.elementType.kind === "object"
      ) {
        return `Array<${inner}>`;
      }
      return `${inner}[]`;
    }
    case "union": {
      const nonNull = node.members.filter((m) => m.kind !== "null" && m.kind !== "undefined");
      const hasNull = node.members.some((m) => m.kind === "null");

      if (nonNull.length === 0) {
        return "null";
      }

      const parts = nonNull.map(formatTypeRef);
      if (hasNull) {
        parts.push("null");
      }
      return parts.join(" | ");
    }
  }
}

/** 格式化单个 interface */
function formatInterface(
  obj: ObjectType,
  options: ConversionOptions,
): NamedTypeDef {
  const indent = " ".repeat(options.indentSize);
  const lines: string[] = [];

  for (const [key, field] of Object.entries(obj.fields)) {
    let typeStr = formatTypeRef(field.typeNode);

    if (field.nullable) {
      typeStr = `${typeStr} | null`;
    }

    const optionalMark = field.optional ? "?" : "";
    lines.push(`${indent}${key}${optionalMark}: ${typeStr};`);
  }

  const body = lines.join("\n");
  return { name: obj.name, body };
}

/** 格式化单个 type */
function formatTypeAlias(
  obj: ObjectType,
  options: ConversionOptions,
): NamedTypeDef {
  const indent = " ".repeat(options.indentSize);
  const lines: string[] = [];

  for (const [key, field] of Object.entries(obj.fields)) {
    let typeStr = formatTypeRef(field.typeNode);

    if (field.nullable) {
      typeStr = `${typeStr} | null`;
    }

    const optionalMark = field.optional ? "?" : "";
    lines.push(`${indent}${key}${optionalMark}: ${typeStr};`);
  }

  const body = lines.join("\n");
  return { name: obj.name, body };
}

/** 将所有类型定义格式化为输出字符串 */
function formatOutput(
  definitions: NamedTypeDef[],
  options: ConversionOptions,
): string {
  const lines: string[] = [];

  for (const def of definitions) {
    if (options.exportStyle === "interface") {
      lines.push(`export interface ${def.name} {`);
    } else {
      lines.push(`export type ${def.name} = {`);
    }
    lines.push(def.body);
    if (options.exportStyle === "type") {
      lines.push("};");
    } else {
      lines.push("}");
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ==================== 主入口 ====================

/**
 * 将 JSON 字符串转换为 TypeScript 类型定义
 */
export function convertJsonToTs(
  jsonString: string,
  options: ConversionOptions,
): ConversionResult {
  const errors: string[] = [];

  // 解析 JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      output: "",
      types: [],
      errors: [`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const usedNames = new Set<string>();

  // 推断类型
  const rootNode = inferType(parsed, options.rootTypeName, options, usedNames);

  // 收集所有对象类型
  let objectTypes = collectObjectTypes(rootNode);

  // 如果根节点本身是对象且没有被收集到（不太可能但做保护）
  if (rootNode.kind === "object" && !objectTypes.includes(rootNode)) {
    objectTypes = [rootNode, ...objectTypes];
  }

  // 结构去重
  const { merged, aliasMap } = mergeIdenticalTypes(objectTypes);

  // 应用别名替换
  const aliasedTypes = merged.map((obj) =>
    applyAliases(obj, aliasMap) as ObjectType,
  );

  // 格式化
  const formatter = options.exportStyle === "interface" ? formatInterface : formatTypeAlias;
  const definitions = aliasedTypes.map((obj) => formatter(obj, options));

  const output = formatOutput(definitions, options);

  return { output, types: definitions, errors };
}
