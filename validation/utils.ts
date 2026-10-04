/**
 * Helpers for working with any
 * {@link https://standardschema.dev | Standard Schema}, not only the schemas
 * made with `createSchema`:
 *
 * - {@linkcode validate}, {@linkcode validateAsync}, {@linkcode parse} and
 *   {@linkcode parseAsync} run a schema and return the result or throw,
 * - {@linkcode isValid} and {@linkcode assertValid} check a value against a
 *   schema as a type guard and an assertion,
 * - {@linkcode toJSONSchema} gets the JSON Schema of a Standard JSON Schema,
 * - {@linkcode isStandardSchemaV1} and {@linkcode isStandardJSONSchemaV1} are
 *   type guards for the two standards,
 * - {@linkcode stringify} formats values for messages.
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { parse, validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const User = z.object({ name: z.string() });
 *
 * assertEquals(validate(User, { name: "Alice" }), {
 *   value: { name: "Alice" },
 * });
 * assertEquals(parse(User, { name: "Alice" }), { name: "Alice" });
 * ```
 *
 * @module
 */

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec";
import { SchemaError } from "@standard-schema/utils";

/**
 * Validates input against a StandardSchema
 *
 * Support both sync and async validate methods according to spec
 *
 * @template S - The schema type extending StandardSchemaV1
 * @param schema - The schema to validate against
 * @param input - The input data to validate
 * @param options - Optional validation options specific to the schema
 * @returns A validation result or a Promise of a validation result
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { validateAsync } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const mySchema = z.object({ name: z.string() });
 *
 * const result = await validateAsync(mySchema, { name: "Alice" });
 * assertEquals(result, { value: { name: "Alice" } });
 * ```
 */
export function validateAsync<S extends StandardSchemaV1>(
  schema: S | boolean,
  input: StandardSchemaV1.InferInput<S> | unknown,
  options?: Parameters<S["~standard"]["validate"]>[1],
):
  | StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>>
  | Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>>> {
  if (schema === true) return { value: input };
  if (schema === false) {
    return {
      issues: [{
        message:
          `Schema defines the property as false, this will always fail: ${
            stringify(input)
          }`,
      }],
    };
  }

  if (!isStandardSchemaV1(schema)) {
    return { issues: [{ message: "The input is not a valid StandardSchema" }] };
  }
  return schema["~standard"].validate(input, options);
}

/**
 * Validates input against a StandardSchema synchronously.
 *
 * @template S - The schema type extending StandardSchemaV1
 * @param schema - The schema to validate against
 * @param input - The input data to validate
 * @param options - Optional validation options specific to the schema
 * @returns A validation result
 * @throws TypeError if the schema validation is asynchronous
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { validate } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const mySchema = z.object({ name: z.string() });
 *
 * const result = validate(mySchema, { name: "Alice" });
 * assertEquals(result, { value: { name: "Alice" } });
 *
 * assertEquals(validate(mySchema, { name: 1 }).issues?.[0].path, ["name"]);
 * ```
 */
export function validate<S extends StandardSchemaV1>(
  schema: S | boolean,
  input: StandardSchemaV1.InferInput<S> | unknown,
  options?: Parameters<S["~standard"]["validate"]>[1],
): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>> {
  const result = validateAsync(schema, input, options);
  if (result instanceof Promise) {
    throw new TypeError("Schema validation must be synchronous");
  }
  return result;
}

/**
 * Validates and parses input against a StandardSchema asynchronously.
 *
 * @template S - The schema type extending StandardSchemaV1
 * @param schema - The schema to validate against
 * @param input - The input data to validate and parse
 * @param options - Optional validation options specific to the schema
 * @returns A Promise resolving to the parsed output value
 * @throws SchemaError if validation fails
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { parseAsync } from "./utils.ts";
 * import { SchemaError } from "@standard-schema/utils";
 * import { assertEquals, assertRejects } from "@std/assert";
 *
 * const mySchema = z.object({ name: z.string() });
 *
 * assertEquals(await parseAsync(mySchema, { name: "Alice" }), {
 *   name: "Alice",
 * });
 * await assertRejects(
 *   () => parseAsync(mySchema, { name: 1 }),
 *   SchemaError,
 * );
 * ```
 */
export async function parseAsync<S extends StandardSchemaV1>(
  schema: S | boolean,
  input: StandardSchemaV1.InferInput<S> | unknown,
  options?: Parameters<S["~standard"]["validate"]>[1],
): Promise<StandardSchemaV1.InferOutput<S>> {
  let result = validateAsync(schema, input, options);
  if (result instanceof Promise) result = await result;

  if (result.issues) {
    throw new SchemaError(result.issues);
  }

  return result.value;
}

/**
 * Validates and parses input against a StandardSchema synchronously.
 *
 * @template S - The schema type extending StandardSchemaV1
 * @param schema - The schema to validate against
 * @param input - The input data to validate and parse
 * @param options - Optional validation options specific to the schema
 * @returns The parsed output value
 * @throws SchemaError if validation fails
 * @throws TypeError if the schema validation is asynchronous
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { parse } from "./utils.ts";
 * import { SchemaError } from "@standard-schema/utils";
 * import { assertEquals, assertThrows } from "@std/assert";
 *
 * const mySchema = z.object({ name: z.string() });
 *
 * assertEquals(parse(mySchema, { name: "Alice" }), { name: "Alice" });
 * assertThrows(() => parse(mySchema, { name: 1 }), SchemaError);
 * ```
 */
export function parse<S extends StandardSchemaV1>(
  schema: S | boolean,
  input: StandardSchemaV1.InferInput<S> | unknown,
  options?: Parameters<S["~standard"]["validate"]>[1],
): StandardSchemaV1.InferOutput<S> {
  const result = validate(schema, input, options);

  if (result.issues) {
    throw new SchemaError(result.issues);
  }

  return result.value;
}

/**
 * Checks whether a value is valid for a schema, as a type guard: when it is,
 * TypeScript narrows the value to the schema's input type. The value itself is
 * not changed, whatever the schema outputs.
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { isValid } from "./utils.ts";
 * import { assert, assertFalse } from "@std/assert";
 *
 * const User = z.object({ name: z.string() });
 *
 * const value: unknown = { name: "Alice" };
 * if (isValid(User, value)) {
 *   // `value` is { name: string } here
 *   assert(value.name === "Alice");
 * }
 * assertFalse(isValid(User, { name: 1 }));
 * ```
 *
 * @template S - The schema type extending StandardSchemaV1
 * @param schema - The schema to validate against
 * @param value - The value to check
 * @param options - Optional validation options specific to the schema
 * @returns `true` if the value is valid
 * @throws TypeError if the schema validation is asynchronous
 */
export function isValid<S extends StandardSchemaV1>(
  schema: S | boolean,
  value: unknown,
  options?: Parameters<S["~standard"]["validate"]>[1],
): value is StandardSchemaV1.InferInput<S> {
  return !validate(schema, value, options).issues;
}

/**
 * Asserts that a value is valid for a schema: when it returns, TypeScript
 * narrows the value to the schema's input type. The value itself is not
 * changed, whatever the schema outputs.
 *
 * @example
 * ```ts
 * import { z } from "@zod/zod";
 * import { assertValid } from "./utils.ts";
 * import { SchemaError } from "@standard-schema/utils";
 * import { assert, assertThrows } from "@std/assert";
 *
 * const User = z.object({ name: z.string() });
 *
 * const value: unknown = { name: "Alice" };
 * assertValid(User, value);
 * // `value` is { name: string } from here on
 * assert(value.name === "Alice");
 *
 * assertThrows(() => assertValid(User, { name: 1 }), SchemaError);
 * ```
 *
 * @template S - The schema type extending StandardSchemaV1
 * @param schema - The schema to validate against
 * @param value - The value to check
 * @param options - Optional validation options specific to the schema
 * @throws SchemaError if the value is not valid
 * @throws TypeError if the schema validation is asynchronous
 */
export function assertValid<S extends StandardSchemaV1>(
  schema: S | boolean,
  value: unknown,
  options?: Parameters<S["~standard"]["validate"]>[1],
): asserts value is StandardSchemaV1.InferInput<S> {
  const result = validate(schema, value, options);
  if (result.issues) throw new SchemaError(result.issues);
}

/**
 * Options for {@linkcode toJSONSchema}.
 */
export interface ToJSONSchemaOptions
  extends Partial<StandardJSONSchemaV1.Options> {
  /**
   * Which JSON Schema to get: `"input"` describes what the schema accepts,
   * `"output"` what it produces. They only differ for schemas that transform
   * their input. Defaults to `"output"`.
   */
  io?: "input" | "output";
  /**
   * Return `undefined` instead of throwing when the schema does not implement
   * Standard JSON Schema. Errors thrown by the schema's own converter (for
   * instance for an unsupported `target`) are never silenced. Defaults to
   * `false`.
   */
  silent?: boolean;
}

/**
 * Gets the JSON Schema of any schema that implements
 * {@link https://standardschema.dev/#json-schema | Standard JSON Schema}.
 *
 * Without options this is the draft 2020-12 JSON Schema of the schema's
 * output. Use `io: "input"` for what the schema accepts.
 *
 * @example
 * ```ts
 * import { createSchema } from "@stdx/validation";
 * import { toJSONSchema } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * // accepts a string, produces its length
 * const length = createSchema("length", {
 *   validate: (value) =>
 *     typeof value === "string"
 *       ? { value: value.length }
 *       : { issues: [{ message: "Expected a string" }] },
 *   jsonSchema: {
 *     input: () => ({ type: "string" }),
 *     output: () => ({ type: "integer" }),
 *   },
 * });
 *
 * assertEquals(toJSONSchema(length), { type: "integer" });
 * assertEquals(toJSONSchema(length, { io: "input" }), { type: "string" });
 * ```
 *
 * @param schema - The schema to convert
 * @param options - Which JSON Schema to get, and for which version
 * @returns The JSON Schema
 * @throws TypeError if the schema does not implement Standard JSON Schema
 * (use `silent: true` to get `undefined` instead)
 */
export function toJSONSchema(
  schema: StandardJSONSchemaV1,
  options?: ToJSONSchemaOptions & { silent?: false },
): ReturnType<StandardJSONSchemaV1.Converter["output"]>;
/**
 * Like the other overload, but with `silent: true` any value is accepted and
 * `undefined` is returned for schemas without Standard JSON Schema support.
 *
 * @example
 * ```ts
 * import { toJSONSchema } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const plain = {
 *   "~standard": { version: 1, vendor: "test", validate: () => ({ value: 1 }) },
 * };
 * assertEquals(toJSONSchema(plain, { silent: true }), undefined);
 * ```
 *
 * @param schema - The schema to convert, which may lack JSON Schema support
 * @param options - Which JSON Schema to get, and for which version
 * @returns The JSON Schema, or `undefined` if the schema has no JSON Schema
 */
export function toJSONSchema(
  schema: unknown,
  options: ToJSONSchemaOptions & { silent: true },
): ReturnType<StandardJSONSchemaV1.Converter["output"]> | undefined;
export function toJSONSchema(
  schema: unknown,
  options: ToJSONSchemaOptions = {},
): ReturnType<StandardJSONSchemaV1.Converter["output"]> | undefined {
  if (!isStandardJSONSchemaV1(schema)) {
    if (options.silent) return undefined;
    throw new TypeError("Schema does not implement Standard JSON Schema");
  }

  const { io = "output", target = "draft-2020-12", libraryOptions } = options;
  return schema["~standard"].jsonSchema[io]({ target, libraryOptions });
}

/**
 * Converts a value to a string representation, for use in messages.
 * Primitives are converted directly, objects with `JSON.stringify`. It never
 * throws: values that cannot be serialized (circular structures, `BigInt`
 * members) fall back to their `Object.prototype.toString` tag.
 *
 * @param value - The value to stringify
 * @returns A string representation of the value
 *
 * @example
 * ```typescript
 * import { stringify } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(stringify("hello"), "hello");
 * assertEquals(stringify(42), "42");
 * assertEquals(stringify(true), "true");
 * assertEquals(stringify(undefined), "undefined");
 * assertEquals(stringify(null), "null");
 * assertEquals(stringify({ key: "value" }), '{"key":"value"}');
 * assertEquals(stringify(() => {}), "[Function ]");
 *
 * const circular: Record<string, unknown> = {};
 * circular.self = circular;
 * assertEquals(stringify(circular), "[object Object]");
 * ```
 *
 * @ignore
 */
export function stringify(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "bigint":
    case "boolean":
    case "symbol":
    case "undefined":
      return String(value);
    case "function":
      // deno-lint-ignore ban-types
      return `[Function ${(value as Function).name}]`;
    default:
      try {
        // `undefined` for values without a JSON form, e.g. `toJSON()` results
        return JSON.stringify(value) ?? String(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
  }
}

/**
 * Checks if a value is a Standard Schema v1: it has a `~standard` property
 * with `version` 1 and a `validate` function.
 *
 * @param value - The value to check
 * @returns `true` if the value is a Standard Schema v1, `false` otherwise
 *
 * @example
 * ```ts
 * import { isStandardSchemaV1 } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = {
 *   "~standard": { version: 1, vendor: "test", validate: () => ({ value: 1 }) },
 * };
 * assertEquals(isStandardSchemaV1(schema), true);
 * assertEquals(isStandardSchemaV1({}), false);
 * assertEquals(isStandardSchemaV1({ "~standard": { version: 2 } }), false);
 * ```
 */
export function isStandardSchemaV1(
  value: unknown,
): value is StandardSchemaV1 {
  const standard = (value as StandardSchemaV1 | undefined)?.["~standard"];
  return standard?.version === 1 && typeof standard.validate === "function";
}

/**
 * Checks if a value is a Standard JSON Schema v1: it has a `~standard`
 * property with `version` 1 and both `jsonSchema.input` and
 * `jsonSchema.output` converters.
 *
 * @param value - The value to check
 * @returns `true` if the value is a Standard JSON Schema v1, `false` otherwise
 *
 * @example
 * ```ts
 * import { isStandardJSONSchemaV1 } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const schema = {
 *   "~standard": {
 *     version: 1,
 *     vendor: "test",
 *     jsonSchema: {
 *       input: () => ({ type: "string" }),
 *       output: () => ({ type: "string" }),
 *     },
 *   },
 * };
 * assertEquals(isStandardJSONSchemaV1(schema), true);
 * assertEquals(isStandardJSONSchemaV1({}), false);
 * ```
 */
export function isStandardJSONSchemaV1(
  value: unknown,
): value is StandardJSONSchemaV1 {
  const standard = (value as StandardJSONSchemaV1 | undefined)?.["~standard"];
  return standard?.version === 1 &&
    typeof standard.jsonSchema?.input === "function" &&
    typeof standard.jsonSchema?.output === "function";
}
