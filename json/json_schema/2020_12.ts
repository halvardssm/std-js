/**
 * JSON Schema draft 2020-12 types, split into the specification's
 * vocabularies (core, applicator, validation, ...). The `JSONSchema`
 * interface combines them all; `JSONSchemaInternal` adds the boolean
 * schemas the specification allows.
 *
 * @example
 * ```ts
 * import type { JSONSchema } from "@stdx/json/json-schema/2020-12";
 *
 * const schema: JSONSchema = {
 *   $schema: "https://json-schema.org/draft/2020-12/schema",
 *   type: "object",
 *   properties: { name: { type: "string" } },
 *   required: ["name"],
 * };
 * ```
 *
 * @module
 */

/**
 * JSON Schema Draft 2020-12
 *
 * As specified in {@link https://json-schema.org/draft/2020-12}
 */
export interface JSONSchema
  extends
    CoreVocabulary,
    ApplicatorVocabulary,
    ValidationVocabulary,
    UnevaluatedVocabulary,
    FormatVocabulary,
    ContentVocabulary,
    MetaDataVocabulary {
}

/**
 * Internal schema type, allows boolean as defined in the specs
 *
 * @see {@link https://json-schema.org/understanding-json-schema/basics}
 */
export type JSONSchemaInternal = JSONSchema | boolean;

/**
 * All schema data types
 */
export type SchemaTypes =
  | ArraySchema
  | BooleanSchema
  | IntegerSchema
  | NullSchema
  | NumberSchema
  | ObjectSchema
  | StringSchema;

/**
 * Schema for the `array` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/array | Understanding JSON Schema}
 */
export interface ArraySchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "array";
}
/**
 * Schema for the `boolean` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/boolean | Understanding JSON Schema}
 */
export interface BooleanSchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "boolean";
}
/**
 * Schema for the `integer` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/numeric | Understanding JSON Schema}
 */
export interface IntegerSchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "integer";
}
/**
 * Schema for the `null` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/null | Understanding JSON Schema}
 */
export interface NullSchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "null";
}
/**
 * Schema for the `number` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/numeric | Understanding JSON Schema}
 */
export interface NumberSchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "number";
}
/**
 * Schema for the `object` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/object | Understanding JSON Schema}
 */
export interface ObjectSchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "object";
}
/**
 * Schema for the `string` data type.
 *
 * @see {@link https://json-schema.org/understanding-json-schema/reference/string | Understanding JSON Schema}
 */
export interface StringSchema extends JSONSchema {
  /**
   * The `type` keyword: the JSON data type this schema validates.
   */
  type: "string";
}

/**
 * CoreVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/core}
 */
export interface CoreVocabulary {
  $id?: string;
  $schema?: "https://json-schema.org/draft/2020-12/schema";
  $ref?: string;
  $anchor?: string;
  $dynamicRef?: string;
  $dynamicAnchor?: string;
  $vocabulary?: Record<string, boolean>;
  $comment?: string;
  $defs?: Record<string, JSONSchema>;
}

/**
 * ApplicatorVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/applicator}
 */
export interface ApplicatorVocabulary {
  prefixItems?: JSONSchemaInternal[];
  items?: JSONSchemaInternal;
  contains?: JSONSchemaInternal;
  additionalProperties?: JSONSchemaInternal;
  properties?: Record<string, JSONSchemaInternal>;
  patternProperties?: Record<string, JSONSchemaInternal>;
  dependentSchemas?: Record<string, JSONSchemaInternal>;
  propertyNames?: JSONSchemaInternal;
  if?: JSONSchemaInternal;
  then?: JSONSchemaInternal;
  else?: JSONSchemaInternal;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchemaInternal;
}

/**
 * The values of the `type` keyword. The `{} & string` member allows
 * arbitrary type names in addition to the seven defined by the
 * specification.
 */
export type SchemaType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string"
  // deno-lint-ignore ban-types
  | ({} & string);

/**
 * ValidationVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/validation}
 */
export interface ValidationVocabulary {
  /**
   * The `type` keyword: the data type the schema validates.
   */
  type?: SchemaType;
  /** The `const` keyword: the value must equal this. */
  const?: unknown;
  /** The `enum` keyword: the value must be one of these. */
  enum?: unknown[];
  /** The `multipleOf` keyword: numbers must be a multiple of this. */
  multipleOf?: number;
  /** The `maximum` keyword: numbers must be at most this (inclusive). */
  maximum?: number;
  /** The `exclusiveMaximum` keyword: numbers must be below this. */
  exclusiveMaximum?: number;
  /** The `minimum` keyword: numbers must be at least this (inclusive). */
  minimum?: number;
  /** The `exclusiveMinimum` keyword: numbers must be above this. */
  exclusiveMinimum?: number;
  /** The `maxLength` keyword: strings must be at most this many characters. */
  maxLength?: number;
  /** The `minLength` keyword: strings must be at least this many characters. */
  minLength?: number;
  /** The `pattern` keyword: strings must match this regular expression. */
  pattern?: string;
  /** The `maxItems` keyword: arrays must have at most this many items. */
  maxItems?: number;
  /** The `minItems` keyword: arrays must have at least this many items. */
  minItems?: number;
  /** The `uniqueItems` keyword: array items must be unique. */
  uniqueItems?: boolean;
  /** The `maxContains` keyword: the most items `contains` may match. */
  maxContains?: number;
  /** The `minContains` keyword: the fewest items `contains` must match. */
  minContains?: number;
  /** The `maxProperties` keyword: objects must have at most this many properties. */
  maxProperties?: number;
  /** The `minProperties` keyword: objects must have at least this many properties. */
  minProperties?: number;
  /** The `required` keyword: properties objects must have. */
  required?: string[];
  /** The `dependentRequired` keyword: conditional property requirements. */
  dependentRequired?: Record<string, string[]>;
}

/**
 * UnevaluatedVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/unevaluated}
 */
export interface UnevaluatedVocabulary {
  unevaluatedItems?: JSONSchemaInternal;
  unevaluatedProperties?: JSONSchemaInternal;
}

/**
 * The formats defined by the specification. The `{} & string` member
 * allows custom format names.
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation#name-defined-formats}
 */
export type FormatType =
  | "date-time"
  | "date"
  | "time"
  | "duration"
  | "email"
  | "idn-email"
  | "hostname"
  | "idn-hostname"
  | "ipv4"
  | "ipv6"
  | "uri"
  | "uri-reference"
  | "iri"
  | "iri-reference"
  | "uuid"
  | "json-pointer"
  | "relative-json-pointer"
  // deno-lint-ignore ban-types
  | ({} & string);

/**
 * FormatVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/format-annotation}
 * @see {@link https://json-schema.org/draft/2020-12/meta/format-assertion}
 */
export interface FormatVocabulary {
  format?: FormatType;
}

/**
 * ContentVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/content}
 */
export interface ContentVocabulary {
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: JSONSchema;
}
/**
 * MetaDataVocabulary
 *
 * @see {@link https://json-schema.org/draft/2020-12/meta/meta-data}
 */
export interface MetaDataVocabulary {
  title?: string;
  description?: string;
  default?: unknown;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  examples?: unknown[];
}
