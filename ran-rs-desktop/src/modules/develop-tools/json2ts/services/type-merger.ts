import type { FieldDef, ObjectType, TypeNode } from "../types";

/**
 * 计算对象类型的结构哈希（按 key 排序后拼接）
 */
export function computeStructuralHash(obj: ObjectType): string {
  const keys = Object.keys(obj.fields).sort();
  return keys
    .map((key) => {
      const field = obj.fields[key];
      return `${key}:${serializeTypeKind(field.typeNode)}`;
    })
    .join(";");
}

/**
 * 将 TypeNode 序列化为用于哈希的简短字符串
 */
function serializeTypeKind(node: TypeNode): string {
  switch (node.kind) {
    case "object":
      return `{${computeStructuralHash(node)}}`;
    case "array": {
      const inner = serializeTypeKind(node.elementType);
      return `Array<${inner}>`;
    }
    case "union":
      return node.members.map(serializeTypeKind).sort().join("|");
    default:
      return node.kind;
  }
}

/**
 * 合并相同结构的类型定义
 * 返回去重后的类型列表和名称别名映射
 */
export function mergeIdenticalTypes(
  objectTypes: ObjectType[],
): {
  merged: ObjectType[];
  aliasMap: Map<string, string>;
} {
  const aliasMap = new Map<string, string>();
  const hashToName = new Map<string, string>();
  const merged: ObjectType[] = [];

  for (const obj of objectTypes) {
    const hash = computeStructuralHash(obj);
    const existing = hashToName.get(hash);

    if (existing) {
      // 相同结构，记录别名
      aliasMap.set(obj.name, existing);
    } else {
      hashToName.set(hash, obj.name);
      merged.push(obj);
    }
  }

  return { merged, aliasMap };
}

/**
 * 遍历 TypeNode 树，将引用的名称替换为别名
 */
export function applyAliases(
  node: TypeNode,
  aliasMap: Map<string, string>,
): TypeNode {
  switch (node.kind) {
    case "object": {
      const newFields: Record<string, FieldDef> = {};
      for (const [key, field] of Object.entries(node.fields)) {
        newFields[key] = {
          ...field,
          typeNode: applyAliases(field.typeNode, aliasMap),
        };
      }
      const newName = aliasMap.get(node.name) ?? node.name;
      return { ...node, name: newName, fields: newFields } as ObjectType;
    }
    case "array":
      return {
        ...node,
        elementType: applyAliases(node.elementType, aliasMap),
      };
    case "union":
      return {
        ...node,
        members: node.members.map(m => applyAliases(m, aliasMap)),
      };
    default:
      return node;
  }
}
