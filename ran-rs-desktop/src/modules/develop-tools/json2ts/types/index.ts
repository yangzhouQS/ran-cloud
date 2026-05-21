/** 基本类型种类 */
export type PrimitiveKind = "string" | "number" | "boolean" | "null" | "undefined";

/** 基本类型节点 */
export interface PrimitiveType {
  kind: PrimitiveKind;
}

/** 字段定义 */
export interface FieldDef {
  typeNode: TypeNode;
  optional: boolean;
  nullable: boolean;
}

/** 对象类型节点 */
export interface ObjectType {
  kind: "object";
  name: string;
  fields: Record<string, FieldDef>;
}

/** 数组类型节点 */
export interface ArrayType {
  kind: "array";
  elementType: TypeNode;
}

/** 联合类型节点 */
export interface UnionType {
  kind: "union";
  members: TypeNode[];
}

/** 类型节点联合 */
export type TypeNode = PrimitiveType | ObjectType | ArrayType | UnionType;

/** 命名类型定义 */
export interface NamedTypeDef {
  name: string;
  body: string;
}

/** 转换结果 */
export interface ConversionResult {
  output: string;
  types: NamedTypeDef[];
  errors: string[];
}

/** 转换选项 */
export interface ConversionOptions {
  rootTypeName: string;
  exportStyle: "interface" | "type";
  treatNullAsOptional: boolean;
  indentSize: number;
}

/** 转换选项默认值 */
export const defaultConversionOptions: ConversionOptions = {
  rootTypeName: "RootObject",
  exportStyle: "interface",
  treatNullAsOptional: true,
  indentSize: 2,
};
