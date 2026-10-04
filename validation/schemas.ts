/**
 * Basic schemas built with {@linkcode createSchema}: {@linkcode string},
 * {@linkcode integer}, {@linkcode float}, {@linkcode number},
 * {@linkcode boolean}, {@linkcode symbol}, {@linkcode func}, {@linkcode null_},
 * {@linkcode literal}, {@linkcode enumerator}, {@linkcode instanceOf},
 * {@linkcode unknown} and {@linkcode never}, and the wrappers {@linkcode nullable}, {@linkcode optional} and
 * {@linkcode nullish}.
 *
 * Every schema function takes an options argument. All of them accept the
 * annotations of JSON Schema (`title`, `description`, ...), which end up in the
 * JSON Schema, and a `message` that replaces the message of the issues of the
 * schema itself. {@linkcode string}, {@linkcode integer}, {@linkcode float}
 * and {@linkcode number} also take the constraints JSON Schema has keywords
 * for, and {@linkcode optional} and {@linkcode nullish} a `default`.
 *
 * @example
 * ```ts
 * import { nullable, optional, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const name = optional(nullable(string()));
 * // Schema<string | null | undefined, string | null | undefined, "optional">
 *
 * assertEquals(validate(name, "Alice"), { value: "Alice" });
 * assertEquals(validate(name, null), { value: null });
 * assertEquals(validate(name, undefined), { value: undefined });
 * assertEquals(validate(name, 1).issues?.length, 1);
 * ```
 *
 * @module
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { JSONSchema } from "@stdx/json/json-schema/2020-12";
import {
  type CombinedSchemaV1,
  type CommonOptions,
  createSchema,
  failure,
  jsonSchemaOf,
  type Schema,
  typeIssue,
  typeOf,
} from "./core.ts";
import {
  checkNumberConstraints,
  compileStringConstraints,
  type NumberConstraints,
  numberIssues,
  patternSource,
  pick,
  stringIssues,
} from "./constraints.ts";
import type { StringFormat } from "./formats.ts";
import { stringify, validateAsync } from "./utils.ts";

/** The number keywords, in JSON Schema. */
const NUMBER_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
] as const;

/** A value in a message: strings are quoted, so `"1"` and `1` differ. */
function show(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : stringify(value);
}

/**
 * Options for {@linkcode string}. The constraints are the JSON Schema keywords
 * of the same name, and are all checked: a string that violates several gets
 * several issues.
 */
export interface StringOptions
  extends CommonOptions, Pick<JSONSchema, "minLength" | "maxLength"> {
  /**
   * A regular expression the string must match, anywhere in it: anchor it with
   * `^` and `$` to match the whole string. A `RegExp` cannot have flags, as a
   * JSON Schema pattern has none.
   */
  pattern?: string | RegExp;
  /** A format the string must be in, such as `"email"` or `"uuid"`. */
  format?: StringFormat;
}

export type { StringFormat };

/**
 * A string, optionally constrained by its length, a pattern and a format.
 *
 * `format` is checked, not only annotated, for `date-time`, `date`, `time`,
 * `duration`, `email`, `idn-email`, `hostname`, `idn-hostname`, `ipv4`,
 * `ipv6`, `uri`, `uri-reference`, `iri`, `iri-reference`, `uri-template`,
 * `uuid`, `json-pointer`, `relative-json-pointer` and `regex`.
 *
 * The JSON Schema is `{ type: "string", minLength, maxLength, pattern, format }`.
 *
 * @example
 * ```ts
 * import { string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = string({ minLength: 3, pattern: /^[a-z]+$/ });
 * // Schema<string, string, "string">
 *
 * assertEquals(validate(schema, "abc"), { value: "abc" });
 * assertEquals(validate(schema, 1).issues?.[0].message, "Expected a string, received number");
 * // every violated constraint is reported
 * assertEquals(validate(schema, "AB").issues?.length, 2);
 *
 * assertEquals(validate(string({ format: "email" }), "a@b.co"), { value: "a@b.co" });
 * assertEquals(validate(string({ message: "Invalid id" }), 1).issues?.[0].message, "Invalid id");
 * ```
 *
 * @param options The constraints, annotations and message
 * @returns A schema accepting strings
 * @throws TypeError if an option is not valid: a bad pattern, an unsupported
 * format, or a minimum greater than the maximum
 */
export function string(
  options: StringOptions = {},
): Schema<string, string, "string"> {
  const pattern = compileStringConstraints(options);

  return createSchema("string", {
    validate: (value) => {
      if (typeof value !== "string") {
        return typeIssue("a string", value, options.message);
      }
      const issues = stringIssues(value, options, pattern, options.message);
      return issues.length ? { issues } : { value };
    },
    jsonSchema: jsonSchemaOf(() => ({
      type: "string",
      ...pick(options, ["minLength", "maxLength", "format"]),
      ...(options.pattern === undefined
        ? {}
        : { pattern: patternSource(options.pattern) }),
    }), options),
  });
}

/**
 * Options for {@linkcode integer}. The constraints are the JSON Schema keywords
 * of the same name, and are all checked.
 */
export interface IntegerOptions extends CommonOptions, NumberConstraints {}

/**
 * An integer: a number without a fractional part (`1`, `1.0` and `1e20` are integers), optionally constrained by a range and a divisor.
 *
 * The JSON Schema is `{ type: "integer", minimum, maximum, exclusiveMinimum,
 * exclusiveMaximum, multipleOf }`.
 *
 * @example
 * ```ts
 * import { integer } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = integer({ minimum: 1, maximum: 10 });
 * // Schema<number, number, "integer">
 *
 * assertEquals(validate(schema, 5), { value: 5 });
 * assertEquals(validate(schema, 11).issues?.[0].message, "Expected a number of at most 10, received 11");
 * assertEquals(validate(schema, 0.5).issues?.[0].message, "Expected an integer, received number");
 * ```
 *
 * @param options The constraints, annotations and message
 * @returns A schema accepting integers
 * @throws TypeError if an option is not valid: a non-finite limit, a
 * `multipleOf` that is not greater than 0, or a minimum greater than the
 * maximum
 */
export function integer(
  options: IntegerOptions = {},
): Schema<number, number, "integer"> {
  checkNumberConstraints(options);

  return createSchema("integer", {
    validate: (value) => {
      if (!(typeof value === "number" && Number.isInteger(value))) {
        return typeIssue("an integer", value, options.message);
      }
      const issues = numberIssues(value as number, options, options.message);
      return issues.length ? { issues } : { value: value as number };
    },
    jsonSchema: jsonSchemaOf(() => ({
      type: "integer",
      ...pick(options, NUMBER_KEYWORDS),
    }), options),
  });
}

/**
 * Options for {@linkcode float}. The constraints are the JSON Schema keywords
 * of the same name, and are all checked.
 */
export interface FloatOptions extends CommonOptions, NumberConstraints {}

/**
 * A finite floating point number (integers are floats too; `NaN` and `Infinity` are not accepted), optionally constrained by a range and a divisor.
 *
 * The JSON Schema is `{ type: "number", minimum, maximum, exclusiveMinimum,
 * exclusiveMaximum, multipleOf }`.
 *
 * @example
 * ```ts
 * import { float } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = float({ minimum: 1, maximum: 10 });
 * // Schema<number, number, "float">
 *
 * assertEquals(validate(schema, 1.5), { value: 1.5 });
 * assertEquals(validate(schema, 11).issues?.[0].message, "Expected a number of at most 10, received 11");
 * assertEquals(validate(schema, NaN).issues?.[0].message, "Expected a finite number, received number");
 * ```
 *
 * @param options The constraints, annotations and message
 * @returns A schema accepting finite numbers
 * @throws TypeError if an option is not valid: a non-finite limit, a
 * `multipleOf` that is not greater than 0, or a minimum greater than the
 * maximum
 */
export function float(
  options: FloatOptions = {},
): Schema<number, number, "float"> {
  checkNumberConstraints(options);

  return createSchema("float", {
    validate: (value) => {
      if (!(typeof value === "number" && Number.isFinite(value))) {
        return typeIssue("a finite number", value, options.message);
      }
      const issues = numberIssues(value as number, options, options.message);
      return issues.length ? { issues } : { value: value as number };
    },
    jsonSchema: jsonSchemaOf(() => ({
      type: "number",
      ...pick(options, NUMBER_KEYWORDS),
    }), options),
  });
}

/**
 * Options for {@linkcode number}. The constraints are the JSON Schema keywords
 * of the same name, and are all checked.
 */
export interface NumberOptions extends CommonOptions, NumberConstraints {}

/**
 * Any JavaScript number, including `NaN` and `Infinity`. Use {@linkcode float} for finite numbers and {@linkcode integer} for integers. The JSON Schema cannot express `NaN` or `Infinity`, optionally constrained by a range and a divisor.
 *
 * The JSON Schema is `{ type: "number", minimum, maximum, exclusiveMinimum,
 * exclusiveMaximum, multipleOf }`.
 *
 * @example
 * ```ts
 * import { number } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = number({ minimum: 1, maximum: 10 });
 * // Schema<number, number, "number">
 *
 * assertEquals(validate(schema, 1.5), { value: 1.5 });
 * assertEquals(validate(schema, 11).issues?.[0].message, "Expected a number of at most 10, received 11");
 * assertEquals(validate(schema, "1").issues?.[0].message, "Expected a number, received string");
 * ```
 *
 * @param options The constraints, annotations and message
 * @returns A schema accepting numbers
 * @throws TypeError if an option is not valid: a non-finite limit, a
 * `multipleOf` that is not greater than 0, or a minimum greater than the
 * maximum
 */
export function number(
  options: NumberOptions = {},
): Schema<number, number, "number"> {
  checkNumberConstraints(options);

  return createSchema("number", {
    validate: (value) => {
      if (!(typeof value === "number")) {
        return typeIssue("a number", value, options.message);
      }
      const issues = numberIssues(value as number, options, options.message);
      return issues.length ? { issues } : { value: value as number };
    },
    jsonSchema: jsonSchemaOf(() => ({
      type: "number",
      ...pick(options, NUMBER_KEYWORDS),
    }), options),
  });
}

/**
 * Options for {@linkcode boolean}: the annotations, and the message of the issues of
 * the schema.
 */
export interface BooleanOptions extends CommonOptions {}

/**
 * A boolean.
 *
 * @example
 * ```ts
 * import { boolean } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = boolean();
 * // Schema<boolean, boolean, "boolean">
 *
 * assertEquals(validate(schema, false), { value: false });
 * assertEquals(validate(schema, 0).issues?.length, 1);
 * ```
 *
 * @param options The annotations and message
 * @returns A schema accepting booleans
 */
export function boolean(
  options?: BooleanOptions,
): Schema<boolean, boolean, "boolean"> {
  return createSchema("boolean", {
    validate: (value) =>
      typeof value === "boolean"
        ? { value }
        : typeIssue("a boolean", value, options?.message),
    jsonSchema: jsonSchemaOf(() => ({ type: "boolean" }), options),
  });
}

/** What the value of a `default` option is: the value, or a function making it. */
function resolveDefault(value: unknown): unknown {
  return typeof value === "function" ? value() : value;
}

/**
 * The schema behind {@linkcode nullable}, {@linkcode optional} and
 * {@linkcode nullish}: values for which `isExtra` is true are accepted as they
 * are, every other value is validated by `schema`.
 *
 * `undefined` is replaced by `options.default` when there is one, and then
 * validated by `schema` like any other value.
 *
 * With `addsNull` the JSON Schema is `{ anyOf: [<schema>, { type: "null" }] }`,
 * otherwise it is the one of `schema`: JSON has no `undefined`, so whether a
 * property may be absent is expressed by the object that holds it.
 */
function wrap<TSchema extends CombinedSchemaV1, TExtra, TKind extends string>(
  kind: TKind,
  schema: TSchema,
  isExtra: (value: unknown) => value is TExtra,
  addsNull: boolean,
  options: CommonOptions & { default?: unknown } = {},
): Schema<
  StandardSchemaV1.InferInput<TSchema> | TExtra,
  StandardSchemaV1.InferOutput<TSchema> | TExtra,
  TKind
> {
  const hasDefault = options.default !== undefined;

  // The nested schema is only known as `CombinedSchemaV1` inside, so the
  // result is restated in terms of its inferred input and output types.
  return createSchema(kind, {
    validate: (value, validateOptions) => {
      if (value === undefined && hasDefault) {
        return validateAsync(
          schema,
          resolveDefault(options.default),
          validateOptions,
        );
      }
      return isExtra(value)
        ? { value }
        : validateAsync(schema, value, validateOptions);
    },
    jsonSchema: jsonSchemaOf((convert) => ({
      ...(addsNull
        ? { anyOf: [convert(schema), { type: "null" }] }
        : convert(schema)),
      ...(hasDefault ? { default: resolveDefault(options.default) } : {}),
    }), options),
  }) as unknown as Schema<
    StandardSchemaV1.InferInput<TSchema> | TExtra,
    StandardSchemaV1.InferOutput<TSchema> | TExtra,
    TKind
  >;
}

/**
 * Options for {@linkcode nullable}: the annotations, and the message of the issues of
 * the schema.
 */
export interface NullableOptions extends CommonOptions {}

/**
 * Accepts `null` in addition to what `schema` accepts. Any other value is
 * validated by `schema`, which may be async.
 *
 * The JSON Schema is `{ anyOf: [<schema>, { type: "null" }] }`.
 *
 * @example
 * ```ts
 * import { nullable, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = nullable(string());
 * // Schema<string | null, string | null, "nullable">
 *
 * assertEquals(validate(schema, null), { value: null });
 * assertEquals(validate(schema, "a"), { value: "a" });
 * assertEquals(validate(schema, 1).issues?.length, 1);
 * assertEquals(
 *   schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
 *   { anyOf: [{ type: "string" }, { type: "null" }] },
 * );
 * ```
 *
 * @template TSchema The schema for the values that are not `null`
 * @param schema The schema for values that are not `null`
 * @param options The annotations and message
 * @returns A schema accepting `null` and what `schema` accepts
 */
export function nullable<TSchema extends CombinedSchemaV1>(
  schema: TSchema,
  options?: NullableOptions,
): Schema<
  StandardSchemaV1.InferInput<TSchema> | null,
  StandardSchemaV1.InferOutput<TSchema> | null,
  "nullable"
> {
  return wrap(
    "nullable",
    schema,
    (value): value is null => value === null,
    true,
    options,
  );
}

/**
 * Options for {@linkcode optional}: the annotations, and a `default`.
 *
 * @template TDefault The type of the default value: the input type of the schema
 */
export interface OptionalOptions<TDefault = unknown> extends CommonOptions {
  /**
   * A value used instead of `undefined`, or a function making it, for a fresh
   * value each time. It is validated by the schema like any other value, so it
   * has the schema's input type, and the output type no longer includes
   * `undefined`. It is the `default` of the JSON Schema.
   */
  default?: TDefault | (() => TDefault);
}

/**
 * Accepts `undefined` in addition to what `schema` accepts. Any other value is
 * validated by `schema`, which may be async.
 *
 * JSON has no `undefined`, so the JSON Schema is the one of `schema`:
 * whether a property may be absent is expressed by the object that holds it
 * (its `required` list).
 *
 * @example
 * ```ts
 * import { optional, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = optional(string());
 * // Schema<string | undefined, string | undefined, "optional">
 *
 * assertEquals(validate(schema, undefined), { value: undefined });
 * assertEquals(validate(schema, "a"), { value: "a" });
 * assertEquals(validate(schema, 1).issues?.length, 1);
 * assertEquals(
 *   schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
 *   { type: "string" },
 * );
 * ```
 *
 * @template TSchema The schema for the values that are not `undefined`
 * @param schema The schema for values that are not `undefined`
 * @param options The annotations and message
 * @returns A schema accepting `undefined` and what `schema` accepts
 */
export function optional<TSchema extends CombinedSchemaV1>(
  schema: TSchema,
  options: OptionalOptions<StandardSchemaV1.InferInput<TSchema>> & {
    default:
      | StandardSchemaV1.InferInput<TSchema>
      | (() => StandardSchemaV1.InferInput<TSchema>);
  },
): Schema<
  StandardSchemaV1.InferInput<TSchema> | undefined,
  StandardSchemaV1.InferOutput<TSchema>,
  "optional"
>;
/**
 * Without a `default`, the output type includes `undefined`.
 *
 * @template TSchema The schema for the other values
 * @param schema The schema for the other values
 * @param options The annotations and message
 * @returns A schema accepting `undefined` and what `schema` accepts
 */
export function optional<TSchema extends CombinedSchemaV1>(
  schema: TSchema,
  options?: OptionalOptions<never>,
): Schema<
  StandardSchemaV1.InferInput<TSchema> | undefined,
  StandardSchemaV1.InferOutput<TSchema> | undefined,
  "optional"
>;
export function optional(
  schema: CombinedSchemaV1,
  options: OptionalOptions = {},
): Schema<unknown, unknown, "optional"> {
  return wrap(
    "optional",
    schema,
    (value): value is undefined => value === undefined,
    false,
    options,
  );
}

/**
 * Options for {@linkcode null_}: the annotations, and the message of the issues of
 * the schema.
 */
export interface NullOptions extends CommonOptions {}

/**
 * The value `null`. Named `null_` because `null` is a reserved word. To accept
 * `null` in addition to something else, use {@linkcode nullable}.
 *
 * @example
 * ```ts
 * import { null_ } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = null_();
 * // Schema<null, null, "null">
 *
 * assertEquals(validate(schema, null), { value: null });
 * assertEquals(validate(schema, undefined).issues?.length, 1);
 * ```
 *
 * @param options The annotations and message
 * @returns A schema accepting only `null`
 */
export function null_(
  options?: NullOptions,
): Schema<null, null, "null"> {
  return createSchema("null", {
    validate: (value) =>
      value === null ? { value } : typeIssue("null", value, options?.message),
    jsonSchema: jsonSchemaOf(() => ({ type: "null" }), options),
  });
}

/**
 * Options for {@linkcode literal}: the annotations, and the message of the issues of
 * the schema.
 */
export interface LiteralOptions extends CommonOptions {}

/**
 * Exactly one value, compared with `===`. The type is the literal type of the
 * value, so `literal("admin")` is a schema of `"admin"`.
 *
 * The JSON Schema is `{ const: value }`.
 *
 * @example
 * ```ts
 * import { literal } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = literal("admin");
 * // Schema<"admin", "admin", "literal">
 *
 * assertEquals(validate(schema, "admin"), { value: "admin" });
 * assertEquals(validate(schema, "user").issues?.[0].message, 'Expected "admin", received "user"');
 * ```
 *
 * @template T The literal type of the value
 * @param literalValue The only accepted value
 * @param options The annotations and message
 * @returns A schema accepting only that value
 */
export function literal<const T extends string | number | boolean | null>(
  literalValue: T,
  options?: LiteralOptions,
): Schema<T, T, "literal"> {
  return createSchema("literal", {
    validate: (value) =>
      value === literalValue ? { value: literalValue } : failure(
        "literal",
        options?.message ??
          `Expected ${show(literalValue)}, received ${show(value)}`,
        { expected: literalValue, actual: value },
      ),
    jsonSchema: jsonSchemaOf(() => ({ const: literalValue }), options),
  }) as unknown as Schema<T, T, "literal">;
}

/**
 * Options for {@linkcode enumerator}: the annotations, and the message of the issues of
 * the schema.
 */
export interface EnumeratorOptions extends CommonOptions {}

/**
 * One of several values, compared with `===`. The type is the union of the
 * values, so `enumerator(["a", "b"])` is a schema of `"a" | "b"`.
 *
 * The JSON Schema is `{ enum: values }`.
 *
 * @example
 * ```ts
 * import { enumerator } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = enumerator(["on", "off"]);
 * // Schema<"on" | "off", "on" | "off", "enumerator">
 *
 * assertEquals(validate(schema, "on"), { value: "on" });
 * assertEquals(validate(schema, "dim").issues?.[0].message, 'Expected one of ["on","off"], received "dim"');
 * ```
 *
 * @template T The tuple of accepted values
 * @param values The accepted values
 * @param options The annotations and message
 * @returns A schema accepting only those values
 */
export function enumerator<
  const T extends readonly (string | number | boolean | null)[],
>(
  values: T,
  options?: EnumeratorOptions,
): Schema<T[number], T[number], "enumerator"> {
  return createSchema("enumerator", {
    validate: (value) =>
      values.some((accepted) => accepted === value)
        ? { value: value as T[number] }
        : failure(
          "enumerator",
          options?.message ??
            `Expected one of ${JSON.stringify(values)}, received ${
              show(value)
            }`,
          { expected: values, actual: value },
        ),
    jsonSchema: jsonSchemaOf(() => ({ enum: [...values] }), options),
  });
}

/**
 * Options for {@linkcode unknown}: the annotations, and the message of the issues of
 * the schema.
 */
export interface UnknownOptions extends CommonOptions {}

/**
 * Any value. The JSON Schema is `{}`, which accepts everything.
 *
 * @example
 * ```ts
 * import { unknown } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = unknown();
 * // Schema<unknown, unknown, "unknown">
 *
 * assertEquals(validate(schema, { any: "thing" }), { value: { any: "thing" } });
 * assertEquals(validate(schema, undefined), { value: undefined });
 * ```
 *
 * @param options The annotations and message
 * @returns A schema accepting every value
 */
export function unknown(
  options?: UnknownOptions,
): Schema<unknown, unknown, "unknown"> {
  return createSchema("unknown", {
    validate: (value) => ({ value }),
    jsonSchema: jsonSchemaOf(() => ({}), options),
  });
}

/**
 * Options for {@linkcode never}: the annotations, and the message of the issues of
 * the schema.
 */
export interface NeverOptions extends CommonOptions {}

/**
 * No value: every value is rejected. The JSON Schema is `{ not: {} }`, which
 * rejects everything.
 *
 * @example
 * ```ts
 * import { never } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = never();
 * // Schema<never, never, "never">
 *
 * assertEquals(validate(schema, 1).issues?.[0].message, "Expected no value, received number");
 * ```
 *
 * @param options The annotations and message
 * @returns A schema rejecting every value
 */
export function never(
  options?: NeverOptions,
): Schema<never, never, "never"> {
  return createSchema("never", {
    validate: (value) => typeIssue("no value", value, options?.message),
    jsonSchema: jsonSchemaOf(() => ({ not: {} }), options),
  });
}

/**
 * Options for {@linkcode nullish}: the annotations, and a `default`.
 *
 * @template TDefault The type of the default value: the input type of the schema
 */
export interface NullishOptions<TDefault = unknown> extends CommonOptions {
  /**
   * A value used instead of `undefined` (`null` stays `null`), or a function making it, for a fresh
   * value each time. It is validated by the schema like any other value, so it
   * has the schema's input type, and the output type no longer includes
   * `undefined`. It is the `default` of the JSON Schema.
   */
  default?: TDefault | (() => TDefault);
}

/**
 * Accepts `null` and `undefined` in addition to what `schema` accepts: the
 * same as `nullable(optional(schema))`.
 *
 * The JSON Schema is `{ anyOf: [<schema>, { type: "null" }] }`.
 *
 * @example
 * ```ts
 * import { nullish, string } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = nullish(string());
 * // Schema<string | null | undefined, string | null | undefined, "nullish">
 *
 * assertEquals(validate(schema, null), { value: null });
 * assertEquals(validate(schema, undefined), { value: undefined });
 * assertEquals(validate(schema, "a"), { value: "a" });
 * ```
 *
 * @template TSchema The schema for the values that are neither `null` nor `undefined`
 * @param schema The schema for values that are neither `null` nor `undefined`
 * @param options The annotations and message
 * @returns A schema accepting `null`, `undefined` and what `schema` accepts
 */
export function nullish<TSchema extends CombinedSchemaV1>(
  schema: TSchema,
  options: NullishOptions<StandardSchemaV1.InferInput<TSchema>> & {
    default:
      | StandardSchemaV1.InferInput<TSchema>
      | (() => StandardSchemaV1.InferInput<TSchema>);
  },
): Schema<
  StandardSchemaV1.InferInput<TSchema> | null | undefined,
  StandardSchemaV1.InferOutput<TSchema> | null,
  "nullish"
>;
/**
 * Without a `default`, the output type includes `null | undefined`.
 *
 * @template TSchema The schema for the other values
 * @param schema The schema for the other values
 * @param options The annotations and message
 * @returns A schema accepting `null | undefined` and what `schema` accepts
 */
export function nullish<TSchema extends CombinedSchemaV1>(
  schema: TSchema,
  options?: NullishOptions<never>,
): Schema<
  StandardSchemaV1.InferInput<TSchema> | null | undefined,
  StandardSchemaV1.InferOutput<TSchema> | null | undefined,
  "nullish"
>;
export function nullish(
  schema: CombinedSchemaV1,
  options: NullishOptions = {},
): Schema<unknown, unknown, "nullish"> {
  return wrap(
    "nullish",
    schema,
    (value): value is null | undefined => value === null || value === undefined,
    true,
    options,
  );
}

/**
 * Options for {@linkcode symbol}: the annotations, and the message of the issues of
 * the schema.
 */
export interface SymbolOptions extends CommonOptions {}

/**
 * A symbol, such as `Symbol("id")` or `Symbol.iterator`.
 *
 * Symbols do not exist in JSON, so the JSON Schema is `{}`, which accepts
 * everything.
 *
 * @example
 * ```ts
 * import { symbol } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = symbol();
 * // Schema<symbol, symbol, "symbol">
 *
 * assertEquals(validate(schema, Symbol.iterator), { value: Symbol.iterator });
 * assertEquals(validate(schema, "id").issues?.[0].message, "Expected a symbol, received string");
 * ```
 *
 * @param options The annotations and message
 * @returns A schema accepting symbols
 */
export function symbol(
  options?: SymbolOptions,
): Schema<symbol, symbol, "symbol"> {
  return createSchema("symbol", {
    validate: (value) =>
      typeof value === "symbol"
        ? { value }
        : typeIssue("a symbol", value, options?.message),
    jsonSchema: jsonSchemaOf(() => ({}), options),
  });
}

/**
 * Options for {@linkcode instanceOf}: the annotations, and the message of the issues of
 * the schema.
 */
export interface InstanceOfOptions extends CommonOptions {}

/** A class, including abstract classes and built-ins such as `Date`. */
// deno-lint-ignore no-explicit-any
export type Class = abstract new (...args: any[]) => any;

/** The name of the class of a value, or its type for non-objects. */
function receivedType(value: unknown): string {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.getPrototypeOf(value)?.constructor?.name || "object"
    : typeOf(value);
}

/**
 * An instance of a class, checked with `instanceof`: instances of subclasses
 * are accepted too. Works for your own classes and for built-ins such as
 * `Date`, `Map` or `Uint8Array`.
 *
 * Classes do not exist in JSON, so the JSON Schema is `{}`, which accepts
 * everything.
 *
 * @example
 * ```ts
 * import { instanceOf } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * class Point {
 *   constructor(readonly x: number, readonly y: number) {}
 * }
 *
 * const schema = instanceOf(Point);
 * // Schema<Point, Point, "instanceOf">
 *
 * const point = new Point(1, 2);
 * assertEquals(validate(schema, point), { value: point });
 * assertEquals(
 *   validate(schema, { x: 1, y: 2 }).issues?.[0].message,
 *   "Expected an instance of Point, received Object",
 * );
 * ```
 *
 * @template TClass The class
 * @param constructor The class
 * @param options The annotations and message
 * @returns A schema accepting instances of the class
 */
export function instanceOf<TClass extends Class>(
  constructor: TClass,
  options?: InstanceOfOptions,
): Schema<InstanceType<TClass>, InstanceType<TClass>, "instanceOf"> {
  return createSchema("instanceOf", {
    validate: (value) =>
      value instanceof constructor
        ? { value: value as InstanceType<TClass> }
        : failure(
          "instanceOf",
          options?.message ??
            `Expected an instance of ${
              constructor.name || "the class"
            }, received ${receivedType(value)}`,
          { expected: constructor, actual: value },
        ),
    jsonSchema: jsonSchemaOf(() => ({}), options),
  });
}

/**
 * Options for {@linkcode func}: the annotations, and the message of the issues of
 * the schema.
 */
export interface FuncOptions extends CommonOptions {}

/** Any function. */
// deno-lint-ignore no-explicit-any
export type AnyFunction = (...args: any[]) => any;

/**
 * A function: anything `typeof` reports as `"function"`, including classes and
 * async functions. Only that it is a function is checked, never its
 * parameters or its result. Named `func` because `function` is a reserved
 * word.
 *
 * The type parameter sets the type of the function, so a method of an
 * interface can be described precisely: `func<(index: number) => string>()`.
 *
 * Functions do not exist in JSON, so the JSON Schema is `{}`, which accepts
 * everything.
 *
 * @example
 * ```ts
 * import { func } from "./schemas.ts";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = func();
 * // Schema<AnyFunction, AnyFunction, "function">
 *
 * const fn = () => 1;
 * assertEquals(validate(schema, fn), { value: fn });
 * assertEquals(validate(schema, "fn").issues?.[0].message, "Expected a function, received string");
 *
 * const placeholder = func<(index: number) => string>();
 * // Schema<(index: number) => string, (index: number) => string, "function">
 * assertEquals(validate(placeholder, (index: number) => `$${index}`).issues, undefined);
 * ```
 *
 * @template TFunction The type of the function
 * @param options The annotations and message
 * @returns A schema accepting functions
 */
export function func<TFunction extends AnyFunction = AnyFunction>(
  options?: FuncOptions,
): Schema<TFunction, TFunction, "function"> {
  return createSchema("function", {
    validate: (value) =>
      typeof value === "function"
        ? { value: value as TFunction }
        : typeIssue("a function", value, options?.message),
    jsonSchema: jsonSchemaOf(() => ({}), options),
  });
}
