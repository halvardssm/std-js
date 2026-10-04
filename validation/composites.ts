/**
 * Schemas that are made of other schemas: the containers {@linkcode object},
 * {@linkcode array}, {@linkcode record} and {@linkcode tuple}, the duck-typing
 * {@linkcode shape}, the
 * combinators {@linkcode anyOf}, {@linkcode oneOf}, {@linkcode allOf} and
 * {@linkcode not}, and {@linkcode lazy} for recursion.
 *
 * Every schema function takes an options argument with the JSON Schema
 * annotations (`title`, `description`, ...) and a `message` that replaces the
 * default issue message, plus the keywords of the schema: `additionalProperties`
 * and `minProperties`/`maxProperties` for objects, `minItems`, `maxItems`,
 * `uniqueItems` and `contains` for arrays, `keys` for records, `rest` for
 * tuples and `discriminator` for unions.
 *
 * The schemas they nest may be sync or async. A composite stays synchronous
 * unless one of the nested schemas returns a promise.
 *
 * @example
 * ```ts
 * import { array, object } from "./composites.ts";
 * import { integer, optional, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const user = object({
 *   name: string(),
 *   age: optional(integer()),
 *   tags: array(string()),
 * });
 * // Schema<{ name: string; age?: number; tags: string[] }, ..., "object">
 *
 * assertEquals(validate(user, { name: "Alice", tags: ["a"] }), {
 *   value: { name: "Alice", tags: ["a"] },
 * });
 * assertEquals(validate(user, { name: "Alice", tags: [1] }).issues?.[0].path, [
 *   "tags",
 *   0,
 * ]);
 * ```
 *
 * @module
 */

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec";
import type { JSONSchema } from "@stdx/json/json-schema/2020-12";
import {
  acceptsUndefined,
  chain,
  collect,
  type CombinedSchemaV1,
  type CommonOptions,
  createSchema,
  failure,
  isRecord,
  type Issue,
  jsonSchemaOf,
  prefixIssues,
  type Schema,
  setOwn,
  typeIssue,
} from "./core.ts";
import {
  arrayIssues,
  checkCounts,
  containsIssues,
  pick,
  type PropertyCountConstraints,
  propertyCountIssues,
} from "./constraints.ts";
import { validateAsync } from "./utils.ts";

type Result = StandardSchemaV1.Result<unknown>;
type JSONOptions = StandardJSONSchemaV1.Options;

/** The result of a list of items: the values, or the issues prefixed by index. */
function itemsResult(results: Result[]): Result {
  const issues = results.flatMap((result, index) =>
    result.issues ? prefixIssues(index, result.issues) : []
  );
  return issues.length
    ? { issues }
    : { value: results.map((result) => (result as { value: unknown }).value) };
}

/** The enumerable own keys of an object: its string keys, then its symbols. */
function ownKeys(object: object): (string | symbol)[] {
  return [
    ...Object.keys(object),
    ...Object.getOwnPropertySymbols(object).filter((symbol) =>
      Object.prototype.propertyIsEnumerable.call(object, symbol)
    ),
  ];
}

/**
 * The result of the values of an object: a new object with the values, or the
 * issues prefixed by key. A key is left out when `include` says so.
 */
function keyedResult(
  keys: PropertyKey[],
  results: Result[],
  include: (key: PropertyKey, result: { value: unknown }) => boolean = () =>
    true,
): Result {
  const issues: StandardSchemaV1.Issue[] = [];
  const output: Record<PropertyKey, unknown> = {};
  keys.forEach((key, index) => {
    const result = results[index];
    if (result.issues) {
      issues.push(...prefixIssues(key, result.issues));
    } else if (include(key, result)) {
      setOwn(output, key, result.value);
    }
  });
  return issues.length ? { issues } : { value: output };
}

/**
 * Makes the properties that may be `undefined` optional (`name?: string`),
 * as in the types of {@linkcode object}.
 */
export type OptionalizeUndefined<T> =
  & {
    [K in keyof T as undefined extends T[K] ? never : K]: T[K];
  }
  & {
    [K in keyof T as undefined extends T[K] ? K : never]?: T[K];
  } extends infer R ? { [K in keyof R]: R[K] } : never;

/**
 * Turns a union into an intersection, as in the type of {@linkcode allOf}.
 */
export type UnionToIntersection<U> =
  (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void
    ? I
    : never;

// ---------------------------------------------------------------------------
// object
// ---------------------------------------------------------------------------

/**
 * The JSON Schema of an object with these properties: `properties` and
 * `required`, the latter listing the properties that do not accept
 * `undefined`. Symbol keys cannot exist in JSON, so they are left out.
 */
function objectJsonSchema(
  keys: (string | symbol)[],
  schemas: Record<PropertyKey, CombinedSchemaV1>,
  convert: (schema: CombinedSchemaV1) => Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const key of keys) {
    if (typeof key === "symbol") continue;
    properties[key] = convert(schemas[key]);
    if (!acceptsUndefined(schemas[key])) required.push(key);
  }
  return {
    type: "object",
    ...(Object.keys(properties).length ? { properties } : {}),
    ...(required.length ? { required } : {}),
  };
}

/** What `additionalProperties` can be: reject, keep, or validate unknown keys. */
export type AdditionalProperties = boolean | CombinedSchemaV1 | undefined;

/** The extra keys an object may have, in its types. */
export type WithAdditional<TAdditional extends AdditionalProperties> =
  TAdditional extends false | undefined ? unknown : Record<string, unknown>;

/**
 * Options for {@linkcode object}: the annotations, the message of the issues of
 * the object itself, the number of properties, and what to do with unknown
 * keys.
 *
 * @template TAdditional The type of `additionalProperties`
 */
export interface ObjectOptions<
  TAdditional extends AdditionalProperties = undefined,
> extends CommonOptions, PropertyCountConstraints {
  /**
   * What to do with the keys that are not properties: `false` rejects them,
   * `true` keeps them, a schema validates and keeps them. Without it unknown
   * keys are removed from the output.
   */
  additionalProperties?: TAdditional;
}

/** The input type of an object schema with these properties. */
export type ObjectInput<
  TProperties extends Record<PropertyKey, CombinedSchemaV1>,
> = OptionalizeUndefined<
  { [K in keyof TProperties]: StandardSchemaV1.InferInput<TProperties[K]> }
>;

/** The output type of an object schema with these properties. */
export type ObjectOutput<
  TProperties extends Record<PropertyKey, CombinedSchemaV1>,
> = OptionalizeUndefined<
  { [K in keyof TProperties]: StandardSchemaV1.InferOutput<TProperties[K]> }
>;

/**
 * The schema {@linkcode object} returns: a schema that also exposes the
 * `properties` it was made from.
 *
 * @template TProperties The schema of every property, by key
 * @template TAdditional The type of `additionalProperties`
 */
export type ObjectSchema<
  TProperties extends Record<PropertyKey, CombinedSchemaV1>,
  TAdditional extends AdditionalProperties = undefined,
> =
  & Schema<
    ObjectInput<TProperties> & WithAdditional<TAdditional>,
    ObjectOutput<TProperties> & WithAdditional<TAdditional>,
    "object"
  >
  & { readonly properties: TProperties };

/**
 * An object with the given property schemas. Properties whose schema accepts
 * `undefined` (such as {@linkcode optional}) may be absent, and become optional
 * keys in the inferred type. Unknown keys are removed from the output.
 *
 * Only plain objects are accepted, not arrays, `null`, `Date` or `Map`. The
 * issue of a failing property has the property key in its `path`.
 *
 * Properties can have symbol keys: they are validated, kept in the output and
 * typed like any other. Only enumerable own keys of `properties` count.
 *
 * The JSON Schema is `{ type: "object", properties, required }`, where
 * `required` lists the properties that do not accept `undefined`. Symbol keys
 * cannot exist in JSON, so they are left out of both.
 *
 * @example
 * ```ts
 * import { object } from "./composites.ts";
 * import { optional, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = object({ name: string(), nickname: optional(string()) });
 * // Schema<{ name: string; nickname?: string | undefined }, ..., "object">
 *
 * assertEquals(validate(schema, { name: "Alice", extra: 1 }), {
 *   value: { name: "Alice" },
 * });
 * assertEquals(validate(schema, { name: 1 }).issues?.[0].path, ["name"]);
 *
 * // symbol keys work too
 * const id = Symbol("id");
 * const entity = object({ [id]: string() });
 * assertEquals(validate(entity, { [id]: "x" }), { value: { [id]: "x" } });
 * assertEquals(validate(entity, { [id]: 1 }).issues?.[0].path, [id]);
 * ```
 *
 * @template TProperties The schema of every property, by key
 * @param properties The schema of every property
 * @param options The JSON Schema annotations, `message`, `minProperties`/`maxProperties` and `additionalProperties` (`false` rejects unknown keys, `true` keeps them, a schema validates and keeps them; by default they are removed)
 * @returns A schema accepting objects with those properties
 */
export function object<
  TProperties extends Record<PropertyKey, CombinedSchemaV1>,
  const TAdditional extends AdditionalProperties = undefined,
>(
  properties: TProperties,
  options: ObjectOptions<TAdditional> = {},
): ObjectSchema<TProperties, TAdditional> {
  checkCounts(
    "minProperties",
    options.minProperties,
    "maxProperties",
    options.maxProperties,
  );
  const schemas: Record<PropertyKey, CombinedSchemaV1> = properties;
  const keys = ownKeys(properties);
  const declared = new Set<PropertyKey>(keys);
  const additional: AdditionalProperties = options.additionalProperties;
  const additionalSchema = typeof additional === "object"
    ? additional
    : undefined;

  const schema = createSchema("object", {
    validate: (value, validateOptions) => {
      if (!isRecord(value)) {
        return typeIssue("an object", value, options.message);
      }
      const source: Record<PropertyKey, unknown> = value;
      const sourceKeys = Object.keys(source);
      const extraKeys = additional === undefined
        ? []
        : sourceKeys.filter((key) => !declared.has(key));

      return chain(
        collect([
          ...keys.map((key) =>
            validateAsync(schemas[key], source[key], validateOptions)
          ),
          ...(additionalSchema
            ? extraKeys.map((key) =>
              validateAsync(additionalSchema, source[key], validateOptions)
            )
            : []),
        ]),
        (results): Result => {
          const extraResults = results.slice(keys.length);
          const base = keyedResult(
            keys,
            results.slice(0, keys.length),
            (key, result) =>
              Object.hasOwn(source, key) || result.value !== undefined,
          );
          const issues: StandardSchemaV1.Issue[] = [
            ...propertyCountIssues(sourceKeys.length, options, options.message),
            ...(base.issues ?? []),
          ];
          const output = base.issues
            ? undefined
            : base.value as Record<PropertyKey, unknown>;

          if (additional === false) {
            for (const key of extraKeys) {
              issues.push({
                kind: "additionalProperties",
                message: options.message ??
                  `Unexpected key ${JSON.stringify(key)}`,
                path: [key],
                expected: false,
                actual: source[key],
              } as Issue);
            }
          } else if (additionalSchema) {
            extraKeys.forEach((key, index) => {
              const result = extraResults[index];
              if (result.issues) {
                issues.push(...prefixIssues(key, result.issues));
              } else if (output) {
                setOwn(output, key, result.value);
              }
            });
          } else if (additional === true && output) {
            for (const key of extraKeys) setOwn(output, key, source[key]);
          }

          return issues.length ? { issues } : { value: output };
        },
      );
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      ...objectJsonSchema(keys, schemas, convert),
      ...(additional === undefined ? {} : {
        additionalProperties: additionalSchema
          ? convert(additionalSchema)
          : additional,
      }),
      ...pick(options, ["minProperties", "maxProperties"]),
    }), options),
  });

  return Object.freeze({ ...schema, properties }) as unknown as ObjectSchema<
    TProperties,
    TAdditional
  >;
}

// ---------------------------------------------------------------------------
// shape
// ---------------------------------------------------------------------------

/**
 * Options for {@linkcode shape}: the annotations, the message of the issues of
 * the shape itself, and the number of properties.
 */
export interface ShapeOptions extends CommonOptions, PropertyCountConstraints {}

/**
 * The schema {@linkcode shape} returns: a schema that also exposes the
 * `properties` it was made from.
 *
 * @template TProperties The schema of every property, by key
 */
export type ShapeSchema<
  TProperties extends Record<PropertyKey, CombinedSchemaV1>,
> =
  & Schema<ObjectInput<TProperties>, ObjectInput<TProperties>, "shape">
  & { readonly properties: TProperties };

/**
 * Duck typing: any non-null object (arrays, `Map`s and objects with a custom
 * `Symbol.toStringTag` included, functions not) that has the given
 * properties, however it was made. Unlike {@linkcode object}, the value is
 * returned as it is, not as a copy with the declared keys only, so its
 * identity, prototype and other properties are kept.
 *
 * The property schemas only check: what they output is not used, so a
 * transforming schema has no effect here. The input type is the output type.
 * Inherited properties, such as methods and getters of a class, are read like
 * any other.
 *
 * The JSON Schema is the one of {@linkcode object}.
 *
 * @example
 * ```ts
 * import { shape } from "./composites.ts";
 * import { boolean, func, optional } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const closable = shape({ closed: boolean(), close: func(), reset: optional(func()) });
 *
 * class Connection {
 *   get closed() {
 *     return false;
 *   }
 *   close() {}
 * }
 *
 * const connection = new Connection();
 * // the very same object comes back
 * const result = validate(closable, connection);
 * assertEquals(result, { value: connection });
 * assertEquals(validate(closable, {}).issues?.length, 2);
 * ```
 *
 * @template TProperties The schema of every property, by key
 * @param properties The schema of every property
 * @param options The JSON Schema annotations, `message` and `minProperties`/`maxProperties`
 * @returns A schema accepting objects that have those properties
 */
export function shape<
  TProperties extends Record<PropertyKey, CombinedSchemaV1>,
>(
  properties: TProperties,
  options: ShapeOptions = {},
): ShapeSchema<TProperties> {
  checkCounts(
    "minProperties",
    options.minProperties,
    "maxProperties",
    options.maxProperties,
  );
  const schemas: Record<PropertyKey, CombinedSchemaV1> = properties;
  const keys = ownKeys(properties);

  const schema = createSchema("shape", {
    validate: (value, validateOptions) => {
      if (typeof value !== "object" || value === null) {
        return typeIssue("an object", value, options.message);
      }
      const source = value as Record<PropertyKey, unknown>;

      return chain(
        collect(
          keys.map((key) =>
            validateAsync(schemas[key], source[key], validateOptions)
          ),
        ),
        (results): Result => {
          const issues = [
            ...propertyCountIssues(
              Object.keys(source).length,
              options,
              options.message,
            ),
            ...results.flatMap((result, index) =>
              result.issues ? prefixIssues(keys[index], result.issues) : []
            ),
          ];
          return issues.length ? { issues } : { value };
        },
      );
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      ...objectJsonSchema(keys, schemas, convert),
      ...pick(options, ["minProperties", "maxProperties"]),
    }), options),
  });

  return Object.freeze({ ...schema, properties }) as unknown as ShapeSchema<
    TProperties
  >;
}

// ---------------------------------------------------------------------------
// array
// ---------------------------------------------------------------------------

/**
 * Options for {@linkcode array}: the annotations, the message of the issues of
 * the array itself, and the JSON Schema constraints on the items.
 */
export interface ArrayOptions extends
  CommonOptions,
  Pick<
    JSONSchema,
    "minItems" | "maxItems" | "uniqueItems" | "minContains" | "maxContains"
  > {
  /**
   * A schema at least `minContains` (default 1) items must match, and at most
   * `maxContains`.
   */
  contains?: CombinedSchemaV1;
}

/**
 * An array whose items all match `item`. The issue of a failing item has its
 * index in the `path`.
 *
 * The JSON Schema is `{ type: "array", items }`.
 *
 * @example
 * ```ts
 * import { array } from "./composites.ts";
 * import { string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = array(string());
 * // Schema<string[], string[], "array">
 *
 * assertEquals(validate(schema, ["a", "b"]), { value: ["a", "b"] });
 * assertEquals(validate(schema, ["a", 1]).issues?.[0].path, [1]);
 * ```
 *
 * @template TItem The schema of the items
 * @param item The schema of every item
 * @param options The JSON Schema annotations, `message`, `minItems`, `maxItems`, `uniqueItems`, and `contains` with `minContains`/`maxContains`
 * @returns A schema accepting arrays of items
 */
export function array<TItem extends CombinedSchemaV1>(
  item: TItem,
  options: ArrayOptions = {},
): Schema<
  StandardSchemaV1.InferInput<TItem>[],
  StandardSchemaV1.InferOutput<TItem>[],
  "array"
> {
  checkCounts("minItems", options.minItems, "maxItems", options.maxItems);
  checkCounts(
    "minContains",
    options.minContains,
    "maxContains",
    options.maxContains,
  );
  const { contains } = options;

  return createSchema("array", {
    validate: (value, validateOptions) => {
      if (!Array.isArray(value)) {
        return typeIssue("an array", value, options.message);
      }

      return chain(
        collect([
          ...Array.from(
            value,
            (entry) => validateAsync(item, entry, validateOptions),
          ),
          ...(contains
            ? Array.from(
              value,
              (entry) => validateAsync(contains, entry, validateOptions),
            )
            : []),
        ]),
        (results): Result => {
          const base = itemsResult(results.slice(0, value.length));
          const issues: StandardSchemaV1.Issue[] = [
            ...arrayIssues(value, options, options.message),
            ...(base.issues ?? []),
            ...(contains
              ? containsIssues(
                results.slice(value.length).filter((result) => !result.issues)
                  .length,
                options.minContains,
                options.maxContains,
                options.message,
              )
              : []),
          ];
          return issues.length ? { issues } : base;
        },
      );
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      type: "array",
      items: convert(item),
      ...pick(options, ["minItems", "maxItems", "uniqueItems"]),
      ...(contains
        ? {
          contains: convert(contains),
          ...pick(options, ["minContains", "maxContains"]),
        }
        : {}),
    }), options),
  }) as unknown as Schema<
    StandardSchemaV1.InferInput<TItem>[],
    StandardSchemaV1.InferOutput<TItem>[],
    "array"
  >;
}

// ---------------------------------------------------------------------------
// record
// ---------------------------------------------------------------------------

/**
 * Options for {@linkcode record}: the annotations, the message of the issues of
 * the record itself, the number of properties, and a schema for the keys.
 */
export interface RecordOptions extends CommonOptions, PropertyCountConstraints {
  /**
   * A schema every key must match. It only checks: the keys of the output are
   * the keys of the input. It is the `propertyNames` of the JSON Schema.
   */
  keys?: CombinedSchemaV1;
}

/**
 * An object with any string keys, whose values all match `value`. The issue of
 * a failing value has its key in the `path`.
 *
 * The JSON Schema is `{ type: "object", additionalProperties }`.
 *
 * @example
 * ```ts
 * import { record } from "./composites.ts";
 * import { integer } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = record(integer());
 * // Schema<Record<string, number>, Record<string, number>, "record">
 *
 * assertEquals(validate(schema, { a: 1, b: 2 }), { value: { a: 1, b: 2 } });
 * assertEquals(validate(schema, { a: 1, b: "2" }).issues?.[0].path, ["b"]);
 * ```
 *
 * @template TValue The schema of the values
 * @param value The schema of every value
 * @param options The JSON Schema annotations, `message`, `minProperties`/`maxProperties` and `keys`, a schema every key has to match
 * @returns A schema accepting objects with values of that schema
 */
export function record<TValue extends CombinedSchemaV1>(
  value: TValue,
  options: RecordOptions = {},
): Schema<
  Record<string, StandardSchemaV1.InferInput<TValue>>,
  Record<string, StandardSchemaV1.InferOutput<TValue>>,
  "record"
> {
  checkCounts(
    "minProperties",
    options.minProperties,
    "maxProperties",
    options.maxProperties,
  );
  const { keys: keySchema } = options;

  return createSchema("record", {
    validate: (input, validateOptions) => {
      if (!isRecord(input)) {
        return typeIssue("an object", input, options.message);
      }

      const keys = Object.keys(input);
      return chain(
        collect([
          ...keys.map((key) =>
            validateAsync(value, input[key], validateOptions)
          ),
          ...(keySchema
            ? keys.map((key) => validateAsync(keySchema, key, validateOptions))
            : []),
        ]),
        (results): Result => {
          const base = keyedResult(keys, results.slice(0, keys.length));
          const issues: StandardSchemaV1.Issue[] = [
            ...propertyCountIssues(keys.length, options, options.message),
            ...(base.issues ?? []),
            ...results.slice(keys.length).flatMap((result, index) =>
              result.issues ? prefixIssues(keys[index], result.issues) : []
            ),
          ];
          return issues.length ? { issues } : base;
        },
      );
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      type: "object",
      additionalProperties: convert(value),
      ...(keySchema ? { propertyNames: convert(keySchema) } : {}),
      ...pick(options, ["minProperties", "maxProperties"]),
    }), options),
  }) as unknown as Schema<
    Record<string, StandardSchemaV1.InferInput<TValue>>,
    Record<string, StandardSchemaV1.InferOutput<TValue>>,
    "record"
  >;
}

// ---------------------------------------------------------------------------
// tuple
// ---------------------------------------------------------------------------

/**
 * Options for {@linkcode tuple}: the annotations, the message of the issues of
 * the tuple itself, the number of items, and a schema for the extra items.
 *
 * @template TRest The type of `rest`
 */
export interface TupleOptions<
  TRest extends CombinedSchemaV1 | undefined = undefined,
> extends CommonOptions, Pick<JSONSchema, "minItems" | "maxItems"> {
  /**
   * A schema for the items after the ones of the tuple. Without it the array
   * must have exactly one item per schema. It is the `items` of the JSON
   * Schema.
   */
  rest?: TRest;
}

/**
 * The input type of a tuple schema with these items, and optionally a schema
 * for the extra items.
 */
export type TupleInput<
  TItems extends readonly CombinedSchemaV1[],
  TRest extends CombinedSchemaV1 | undefined = undefined,
> = TRest extends CombinedSchemaV1 ? [
    ...{
      -readonly [K in keyof TItems]: StandardSchemaV1.InferInput<TItems[K]>;
    },
    ...StandardSchemaV1.InferInput<TRest>[],
  ]
  : { -readonly [K in keyof TItems]: StandardSchemaV1.InferInput<TItems[K]> };

/**
 * The output type of a tuple schema with these items, and optionally a schema
 * for the extra items.
 */
export type TupleOutput<
  TItems extends readonly CombinedSchemaV1[],
  TRest extends CombinedSchemaV1 | undefined = undefined,
> = TRest extends CombinedSchemaV1 ? [
    ...{
      -readonly [K in keyof TItems]: StandardSchemaV1.InferOutput<TItems[K]>;
    },
    ...StandardSchemaV1.InferOutput<TRest>[],
  ]
  : { -readonly [K in keyof TItems]: StandardSchemaV1.InferOutput<TItems[K]> };

/**
 * An array with exactly one item per schema, each matching the schema at its
 * position.
 *
 * The JSON Schema is `{ type: "array", prefixItems, minItems, maxItems }`.
 *
 * @example
 * ```ts
 * import { tuple } from "./composites.ts";
 * import { float, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = tuple([string(), float()]);
 * // Schema<[string, number], [string, number], "tuple">
 *
 * assertEquals(validate(schema, ["a", 1.5]), { value: ["a", 1.5] });
 * assertEquals(validate(schema, ["a"]).issues?.length, 1);
 * assertEquals(validate(schema, [1, 1.5]).issues?.[0].path, [0]);
 * ```
 *
 * @template TItems The schemas of the positions, as a tuple
 * @param items The schema of every position
 * @param options The JSON Schema annotations, `message`, `minItems`/`maxItems` and `rest`, a schema for the items after the listed ones
 * @returns A schema accepting arrays of that shape
 */
export function tuple<
  const TItems extends readonly CombinedSchemaV1[],
  const TRest extends CombinedSchemaV1 | undefined = undefined,
>(
  items: TItems,
  options: TupleOptions<TRest> = {},
): Schema<TupleInput<TItems, TRest>, TupleOutput<TItems, TRest>, "tuple"> {
  checkCounts("minItems", options.minItems, "maxItems", options.maxItems);
  const rest: CombinedSchemaV1 | undefined = options.rest;

  return createSchema("tuple", {
    validate: (value, validateOptions) => {
      if (!Array.isArray(value)) {
        return typeIssue("an array", value, options.message);
      }
      if (rest ? value.length < items.length : value.length !== items.length) {
        return failure(
          "length",
          options.message ??
            `Expected an array of ${
              rest ? "at least " : ""
            }${items.length} items, received ${value.length}`,
          { expected: items.length, actual: value.length },
        );
      }

      return chain(
        collect(
          value.map((entry, index) =>
            validateAsync(
              index < items.length ? items[index] : rest!,
              entry,
              validateOptions,
            )
          ),
        ),
        (results): Result => {
          const base = itemsResult(results);
          const issues: StandardSchemaV1.Issue[] = [
            ...arrayIssues(value, options, options.message),
            ...(base.issues ?? []),
          ];
          return issues.length ? { issues } : base;
        },
      );
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      type: "array",
      prefixItems: items.map((item) => convert(item)),
      ...(rest ? { items: convert(rest) } : {}),
      minItems: Math.max(items.length, options.minItems ?? 0),
      ...(rest
        ? pick(options, ["maxItems"])
        : { maxItems: Math.min(items.length, options.maxItems ?? Infinity) }),
    }), options),
  }) as unknown as Schema<
    TupleInput<TItems, TRest>,
    TupleOutput<TItems, TRest>,
    "tuple"
  >;
}

// ---------------------------------------------------------------------------
// anyOf, oneOf, allOf, not
// ---------------------------------------------------------------------------

/** The input type of the schemas, as a union. */
export type InputOf<TSchemas extends readonly CombinedSchemaV1[]> =
  StandardSchemaV1.InferInput<
    TSchemas[number]
  >;
/** The output type of the schemas, as a union. */
export type OutputOf<TSchemas extends readonly CombinedSchemaV1[]> =
  StandardSchemaV1.InferOutput<
    TSchemas[number]
  >;

/** The properties an object schema exposes, if it does. */
function propertiesOf(
  schema: CombinedSchemaV1,
): Record<PropertyKey, CombinedSchemaV1> | undefined {
  return (schema as { properties?: Record<PropertyKey, CombinedSchemaV1> })
    .properties;
}

/**
 * The schemas to try for a value. Without a discriminator, or when the value
 * has none, they are all of them. Otherwise they are the object schemas whose
 * property of that name accepts the value's one; when there are none, the
 * failure is a single issue about the discriminator.
 */
function select(
  schemas: readonly CombinedSchemaV1[],
  discriminator: string | undefined,
  value: unknown,
  validateOptions: StandardSchemaV1.Options | undefined,
  message: string | undefined,
):
  | readonly CombinedSchemaV1[]
  | { issues: Issue[] }
  | Promise<readonly CombinedSchemaV1[] | { issues: Issue[] }> {
  if (
    discriminator === undefined || typeof value !== "object" ||
    value === null || !(discriminator in value)
  ) {
    return schemas;
  }
  const actual = (value as Record<string, unknown>)[discriminator];
  const candidates = schemas.filter((schema) =>
    propertiesOf(schema)?.[discriminator]
  );
  if (candidates.length === 0) return schemas;

  return chain(
    collect(
      candidates.map((schema) =>
        validateAsync(
          propertiesOf(schema)![discriminator],
          actual,
          validateOptions,
        )
      ),
    ),
    (results) => {
      const matching = candidates.filter((_, index) => !results[index].issues);
      return matching.length ? matching : {
        issues: [{
          kind: "discriminator",
          message: message ??
            `Invalid value for the discriminator ${
              JSON.stringify(discriminator)
            }`,
          path: [discriminator],
          expected: discriminator,
          actual,
        } as Issue],
      };
    },
  );
}

/**
 * Options for {@linkcode anyOf}: the annotations, the message of the issues of
 * the union itself, and a discriminator.
 */
export interface AnyOfOptions extends CommonOptions {
  /**
   * The name of a property that tells the object schemas apart, such as
   * `"type"`. A value that has it is only validated by the schemas whose
   * property of that name accepts the value's, which is faster, and when none
   * does the only issue is about the discriminator. It has no effect on the
   * JSON Schema.
   */
  discriminator?: string;
}

/**
 * Tries the schemas in order; the first that accepts the value wins. When none
 * does, the issues of all of them are merged.
 *
 * The JSON Schema is `{ anyOf: [...] }`.
 *
 * @example
 * ```ts
 * import { anyOf } from "./composites.ts";
 * import { integer, literal, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = anyOf([integer(), literal("none")]);
 * // Schema<number | "none", number | "none", "anyOf">
 *
 * assertEquals(validate(schema, 1), { value: 1 });
 * assertEquals(validate(schema, "none"), { value: "none" });
 * assertEquals(validate(schema, "other").issues?.length, 2);
 * ```
 *
 * @template TSchemas The alternatives, as a tuple
 * @param schemas The alternatives
 * @param options The JSON Schema annotations, `message` and `discriminator`, the key of the property that selects the schema to validate with
 * @returns A schema accepting what any of the schemas accepts
 */
export function anyOf<const TSchemas extends readonly CombinedSchemaV1[]>(
  schemas: TSchemas,
  options: AnyOfOptions = {},
): Schema<InputOf<TSchemas>, OutputOf<TSchemas>, "anyOf"> {
  return createSchema("anyOf", {
    validate: (value, validateOptions) => {
      const tryFrom = (
        selected: readonly CombinedSchemaV1[],
      ): Result | Promise<Result> => {
        const failures: StandardSchemaV1.Issue[] = [];

        const next = (start: number): Result | Promise<Result> => {
          for (let index = start; index < selected.length; index++) {
            const result = validateAsync(
              selected[index],
              value,
              validateOptions,
            );
            if (result instanceof Promise) {
              return result.then((settled) => {
                if (!settled.issues) return settled;
                failures.push(...settled.issues);
                return next(index + 1);
              });
            }
            if (!result.issues) return result;
            failures.push(...result.issues);
          }
          return failures.length ? { issues: failures } : failure(
            "anyOf",
            options.message ??
              "Expected input to match one of the schemas, but there are none",
          );
        };
        return next(0);
      };

      return chain(
        select(
          schemas,
          options.discriminator,
          value,
          validateOptions,
          options.message,
        ),
        (selected) => Array.isArray(selected) ? tryFrom(selected) : selected,
      ) as Result | Promise<Result>;
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      anyOf: schemas.map((schema) => convert(schema)),
    }), options),
  }) as unknown as Schema<InputOf<TSchemas>, OutputOf<TSchemas>, "anyOf">;
}

/**
 * Options for {@linkcode oneOf}: the annotations, the message of the issues of
 * the union itself, and a discriminator.
 */
export interface OneOfOptions extends CommonOptions {
  /**
   * The name of a property that tells the object schemas apart, see the
   * `discriminator` of {@linkcode AnyOfOptions}. It has no effect on the JSON
   * Schema.
   */
  discriminator?: string;
}

/**
 * Exactly one of the schemas must accept the value. When none does, the issues
 * of all of them are merged; when several do, one issue reports how many.
 *
 * The JSON Schema is `{ oneOf: [...] }`.
 *
 * @example
 * ```ts
 * import { oneOf } from "./composites.ts";
 * import { float, integer } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * // a number that is not an integer
 * const schema = oneOf([float(), integer()]);
 *
 * assertEquals(validate(schema, 1.5), { value: 1.5 });
 * assertEquals(validate(schema, 1).issues?.[0].message, "Expected input to match exactly one schema, matched 2");
 * ```
 *
 * @template TSchemas The alternatives, as a tuple
 * @param schemas The alternatives
 * @param options The JSON Schema annotations, `message` and `discriminator`, the key of the property that selects the schemas to validate with
 * @returns A schema accepting what exactly one of the schemas accepts
 */
export function oneOf<const TSchemas extends readonly CombinedSchemaV1[]>(
  schemas: TSchemas,
  options: OneOfOptions = {},
): Schema<InputOf<TSchemas>, OutputOf<TSchemas>, "oneOf"> {
  return createSchema("oneOf", {
    validate: (value, validateOptions) =>
      chain(
        select(
          schemas,
          options.discriminator,
          value,
          validateOptions,
          options.message,
        ),
        (selected) => {
          if (!Array.isArray(selected)) return selected as Result;
          return chain(
            collect(
              selected.map((schema) =>
                validateAsync(schema, value, validateOptions)
              ),
            ),
            (results): Result => {
              const matches = results.filter((result) => !result.issues);
              if (matches.length === 1) return matches[0];
              if (matches.length === 0) {
                // every result failed
                const issues = (results as StandardSchemaV1.FailureResult[])
                  .flatMap((result) => result.issues);
                return issues.length ? { issues } : failure(
                  "oneOf",
                  options.message ??
                    "Expected input to match exactly one schema, matched 0",
                );
              }
              return failure(
                "oneOf",
                options.message ??
                  `Expected input to match exactly one schema, matched ${matches.length}`,
                { expected: 1, actual: matches.length },
              );
            },
          );
        },
      ) as Result | Promise<Result>,
    jsonSchema: jsonSchemaOf((convert) => ({
      oneOf: schemas.map((schema) => convert(schema)),
    }), options),
  }) as unknown as Schema<InputOf<TSchemas>, OutputOf<TSchemas>, "oneOf">;
}

/**
 * Options for {@linkcode allOf}: the annotations. `allOf` and `lazy` report the
 * issues of the schemas they nest, so there are no issues of their own to give
 * a `message` to.
 */
export interface AllOfOptions extends CommonOptions {}

/**
 * Every schema must accept the value; each one validates the original value.
 * When all of them output objects, the outputs are merged; otherwise the
 * output of the last schema is used. The issues of all failing schemas are
 * merged.
 *
 * The JSON Schema is `{ allOf: [...] }`.
 *
 * @example
 * ```ts
 * import { allOf, object } from "./composites.ts";
 * import { integer, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = allOf([object({ name: string() }), object({ age: integer() })]);
 * // Schema<{ name: string } & { age: number }, ..., "allOf">
 *
 * assertEquals(validate(schema, { name: "Alice", age: 30 }), {
 *   value: { name: "Alice", age: 30 },
 * });
 * assertEquals(validate(schema, { name: "Alice" }).issues?.[0].path, ["age"]);
 * ```
 *
 * @template TSchemas The schemas that must all match, as a tuple
 * @param schemas The schemas that must all match
 * @param options The JSON Schema annotations and `message`
 * @returns A schema accepting what all of the schemas accept
 */
export function allOf<const TSchemas extends readonly CombinedSchemaV1[]>(
  schemas: TSchemas,
  options?: AllOfOptions,
): Schema<
  UnionToIntersection<InputOf<TSchemas>>,
  UnionToIntersection<OutputOf<TSchemas>>,
  "allOf"
> {
  return createSchema("allOf", {
    validate: (value, validateOptions) =>
      chain(
        collect(
          schemas.map((schema) =>
            validateAsync(schema, value, validateOptions)
          ),
        ),
        (results): Result => {
          const issues = results.flatMap((result) => result.issues ?? []);
          if (issues.length) return { issues };

          const values = results.map((result) =>
            (result as { value: unknown }).value
          );
          if (values.length === 0) return { value };
          return {
            value: values.every(isRecord)
              ? values.reduce<Record<string, unknown>>(
                (merged, part) => ({ ...merged, ...part }),
                {},
              )
              : values[values.length - 1],
          };
        },
      ),
    jsonSchema: jsonSchemaOf((convert) => ({
      allOf: schemas.map((schema) => convert(schema)),
    }), options),
  }) as unknown as Schema<
    UnionToIntersection<InputOf<TSchemas>>,
    UnionToIntersection<OutputOf<TSchemas>>,
    "allOf"
  >;
}

/**
 * Options for {@linkcode not}: the annotations, and the message of its issue.
 */
export interface NotOptions extends CommonOptions {}

/**
 * Accepts a value only if `schema` rejects it. The value is passed through
 * unchanged.
 *
 * The JSON Schema is `{ not: <schema> }`.
 *
 * @example
 * ```ts
 * import { not } from "./composites.ts";
 * import { string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = not(string());
 * // Schema<unknown, unknown, "not">
 *
 * assertEquals(validate(schema, 1), { value: 1 });
 * assertEquals(validate(schema, "a").issues?.[0].message, "Expected input not to match the schema");
 * ```
 *
 * @param schema The schema the value must not match
 * @param options The JSON Schema annotations and `message`
 * @returns A schema accepting what `schema` rejects
 */
export function not(
  schema: CombinedSchemaV1,
  options?: NotOptions,
): Schema<unknown, unknown, "not"> {
  return createSchema("not", {
    validate: (value, validateOptions) =>
      chain(
        validateAsync(schema, value, validateOptions),
        (result): Result =>
          result.issues ? { value } : failure(
            "not",
            options?.message ?? "Expected input not to match the schema",
            { actual: value },
          ),
      ),
    jsonSchema: jsonSchemaOf((convert) => ({
      not: convert(schema),
    }), options),
  });
}

// ---------------------------------------------------------------------------
// lazy
// ---------------------------------------------------------------------------

/**
 * Options for {@linkcode lazy}: the annotations. `allOf` and `lazy` report the
 * issues of the schemas they nest, so there are no issues of their own to give
 * a `message` to.
 */
export interface LazyOptions extends CommonOptions {}

let lazyCount = 0;

/** The lazy schemas being converted, per conversion (per options object). */
const converting = new WeakMap<
  JSONOptions,
  Map<string, { referenced: boolean }>
>();

/**
 * Resolves a schema on first use, so that a schema can refer to itself or to a
 * schema defined later. TypeScript cannot infer a type that refers to itself,
 * so annotate the recursive schema.
 *
 * In JSON Schema, the point where a schema refers to itself becomes a `$ref`
 * to the `$anchor` of the lazy schema.
 *
 * @example
 * ```ts
 * import { array, lazy, object } from "./composites.ts";
 * import { string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import type { Schema } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * interface Category {
 *   name: string;
 *   children: Category[];
 * }
 *
 * const category: Schema<Category> = object({
 *   name: string(),
 *   children: array(lazy(() => category)),
 * });
 *
 * const tree = { name: "a", children: [{ name: "b", children: [] }] };
 * assertEquals(validate(category, tree), { value: tree });
 * assertEquals(
 *   validate(category, { name: "a", children: [{ name: 1, children: [] }] })
 *     .issues?.[0].path,
 *   ["children", 0, "name"],
 * );
 * ```
 *
 * @template TSchema The schema that is resolved
 * @param getter Returns the schema; called once, on first use
 * @param options The JSON Schema annotations and `message`
 * @returns A schema delegating to the resolved one
 */
export function lazy<TSchema extends CombinedSchemaV1>(
  getter: () => TSchema,
  options?: LazyOptions,
): Schema<
  StandardSchemaV1.InferInput<TSchema>,
  StandardSchemaV1.InferOutput<TSchema>,
  "lazy"
> {
  let resolved: TSchema | undefined;
  const resolve = () => resolved ??= getter();
  const anchor = `lazy${++lazyCount}`;

  return createSchema("lazy", {
    validate: (value, validateOptions) =>
      validateAsync(resolve(), value, validateOptions),
    jsonSchema: jsonSchemaOf((convert, { options: jsonOptions }) => {
      let active = converting.get(jsonOptions);
      if (!active) converting.set(jsonOptions, active = new Map());

      // met again while converting itself: refer to it instead of recursing
      const state = active.get(anchor);
      if (state) {
        state.referenced = true;
        return { $ref: `#${anchor}` };
      }

      const entry = { referenced: false };
      active.set(anchor, entry);
      try {
        const node = convert(resolve());
        return entry.referenced ? { ...node, $anchor: anchor } : node;
      } finally {
        active.delete(anchor);
      }
    }, options),
  }) as unknown as Schema<
    StandardSchemaV1.InferInput<TSchema>,
    StandardSchemaV1.InferOutput<TSchema>,
    "lazy"
  >;
}
