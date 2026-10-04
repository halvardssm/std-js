/**
 * The core of `@stdx/validation`: {@linkcode createSchema}, the factory that
 * builds a schema which is both a
 * {@link https://standardschema.dev | Standard Schema} and a
 * {@link https://standardschema.dev/#json-schema | Standard JSON Schema},
 * and the types around it.
 *
 * A schema is a frozen object with a `kind` and a `~standard` property that
 * holds `validate` and the JSON Schema converters. Because it implements the
 * standards, it works with any consumer of them, and schemas can be nested by
 * calling one schema's `validate` from another's.
 *
 * @example
 * ```ts
 * import { createSchema } from "@stdx/validation";
 * import { assertEquals } from "@std/assert";
 *
 * const port = createSchema("port", {
 *   validate: (value) =>
 *     Number.isInteger(value) && (value as number) > 0
 *       ? { value: value as number }
 *       : { issues: [{ message: "Expected a positive integer" }] },
 *   jsonSchema: {
 *     input: () => ({ type: "integer", minimum: 1 }),
 *     output: () => ({ type: "integer", minimum: 1 }),
 *   },
 * });
 * // Schema<number, number, "port">
 *
 * assertEquals(port["~standard"].validate(8080), { value: 8080 });
 * assertEquals(
 *   port["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
 *   { type: "integer", minimum: 1 },
 * );
 * ```
 *
 * @module
 */

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec";
import type { JSONSchema } from "@stdx/json/json-schema/2020-12";
import { validateAsync } from "./utils.ts";

/**
 * Creates a schema: the factory schema constructors (`string()`, `object()`,
 * ...) are built on.
 *
 * Nothing is validated here; `options.validate` does the work and
 * `options.jsonSchema` describes the schema for JSON Schema consumers. To nest
 * schemas, call another schema's `validate` from yours, taking care of results
 * that may be promises.
 *
 * The types are inferred from the options:
 *
 * - the output type from the `{ value }` results `validate` returns (also
 *   when it is async, and keeping literal types),
 * - the input type from `types`, and otherwise the same as the output type
 *   (the common symmetric case),
 * - the kind as a literal type.
 *
 * Only `{ value }` results contribute to the output type, so a validator can
 * return `{ issues }` freely. Read the inferred types of a schema with
 * `StandardSchemaV1.InferInput` and `StandardSchemaV1.InferOutput`.
 *
 * @example
 * ```ts
 * import { createSchema } from "@stdx/validation";
 * import { assertEquals } from "@std/assert";
 *
 * const string = createSchema("string", {
 *   validate: (value) =>
 *     typeof value === "string"
 *       ? { value }
 *       : { issues: [{ message: "Expected a string" }] },
 *   jsonSchema: {
 *     input: () => ({ type: "string" }),
 *     output: () => ({ type: "string" }),
 *   },
 * });
 * // Schema<string, string, "string">
 *
 * assertEquals(string.kind, "string");
 * assertEquals(string["~standard"].validate("a"), { value: "a" });
 * ```
 *
 * @template TResult What `validate` returns, inferred from the options
 * @template TInput The input type, inferred from `options.types`
 * @template TKind The literal type of `kind`
 * @param kind The runtime node type, e.g. `"string"`.
 * @param options How the schema validates and exports to JSON Schema.
 * @returns A new immutable schema.
 */
export function createSchema<
  const TResult extends ValidateResult,
  TInput = InferValidateOutput<TResult>,
  const TKind extends string = string,
>(
  kind: TKind,
  options: CreateSchemaOptions<TInput, TResult>,
): Schema<TInput, InferValidateOutput<TResult>, TKind> {
  // The output type is derived from what `validate` returns, so the cast only
  // restates the type in terms the standard understands.
  const schema = {
    kind,
    "~standard": {
      version: 1,
      vendor: "@stdx/validation",
      ...options,
    },
  } as Schema<TInput, InferValidateOutput<TResult>, TKind>;

  return Object.freeze(schema);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Combined properties of {@linkcode StandardSchemaV1} and
 * {@linkcode StandardJSONSchemaV1}.
 *
 * @template Input - The input type of the schema
 * @template Output - The output type of the schema
 */
export interface CombinedPropsV1<Input = unknown, Output = Input>
  extends
    StandardSchemaV1.Props<Input, Output>,
    StandardJSONSchemaV1.Props<Input, Output> {}

/**
 * A schema that implements both {@linkcode StandardSchemaV1} and
 * {@linkcode StandardJSONSchemaV1}.
 *
 * @template Input - The input type of the schema
 * @template Output - The output type of the schema
 */
export interface CombinedSchemaV1<Input = unknown, Output = Input>
  extends StandardSchemaV1<Input, Output>, StandardJSONSchemaV1<Input, Output> {
  /** The properties of both standards. */
  readonly "~standard": CombinedPropsV1<Input, Output>;
}

/**
 * A Standard Schema issue plus additive structured metadata for form
 * libraries and i18n. A plain Standard Schema issue is still valid wherever
 * issues are expected.
 */
export interface Issue extends StandardSchemaV1.Issue {
  /** Machine-readable kind: `"type"`, `"minLength"`, `"custom"`, ... */
  kind: string;
  /** What was expected, for form libraries and i18n. */
  expected?: unknown;
  /** What was received, for form libraries and i18n. */
  actual?: unknown;
}

/**
 * The result of validating a value: the standard shape, either
 * `{ value }` or `{ issues }`.
 */
export type Result<T> = StandardSchemaV1.Result<T>;

/**
 * A schema, as returned by {@linkcode createSchema}. It is both a Standard
 * Schema (so `validate`, `parse` and any other consumer works unchanged) and a
 * Standard JSON Schema (its `~standard.jsonSchema` converters give the JSON
 * Schema). Schemas are immutable.
 *
 * @template Input - The input type of the schema
 * @template Output - The output type of the schema
 * @template Kind - The literal type of `kind`
 */
export interface Schema<
  Input = unknown,
  Output = Input,
  Kind extends string = string,
> extends CombinedSchemaV1<Input, Output> {
  /** The runtime node type, e.g. `"string"` or `"port"`. */
  readonly kind: Kind;
}

/**
 * What a `validate` function returns: a result, or a promise of one. A schema
 * whose `validate` returns a promise is async.
 */
export type ValidateResult =
  | StandardSchemaV1.Result<unknown>
  | Promise<StandardSchemaV1.Result<unknown>>;

/**
 * The output type of a schema whose `validate` returns `TResult`: the `value`
 * of its success results (promises are awaited).
 *
 * Inferring from the whole result (instead of `Result<Output>`) matters: when
 * a validator returns `{ value }` or `{ issues }`, TypeScript gives the failing
 * branch an implicit `value?: undefined`, which would add `undefined` to a
 * type inferred directly.
 */
export type InferValidateOutput<TResult> = Extract<
  Awaited<TResult>,
  { readonly value: unknown }
> extends infer TSuccess
  ? TSuccess extends { readonly value: infer TValue } ? TValue : never
  : never;

/**
 * Options for {@linkcode createSchema}: the `~standard` props of the schema
 * (`validate`, `jsonSchema` and optionally `types`), except that `validate` is
 * typed by what it returns.
 *
 * `validate` returns `Result` instead of `Result<Output>` on purpose: the
 * output type is then inferred from it, see {@linkcode InferValidateOutput}.
 * Writing `Result<InferValidateOutput<Result>>` here would hide `Result` from
 * inference, because it only appears inside a conditional type.
 *
 * @template Input - The input type of the schema
 * @template Result - What `validate` returns
 */
export interface CreateSchemaOptions<
  Input = unknown,
  Result extends ValidateResult = ValidateResult,
> extends
  Pick<
    CombinedPropsV1<Input, InferValidateOutput<Result>>,
    "jsonSchema" | "types"
  > {
  /**
   * Validates a value, sync or async. The output type is inferred from the
   * `{ value }` results it returns.
   */
  validate: (
    value: unknown,
    options?: StandardSchemaV1.Options | undefined,
  ) => Result;
}

// ---------------------------------------------------------------------------
// Options shared by every schema
// ---------------------------------------------------------------------------

/**
 * The JSON Schema annotations (`title`, `description`, `examples`,
 * `deprecated`, `readOnly`, `writeOnly` and `$comment`). They describe a schema
 * in its JSON Schema and have no effect on validation.
 */
export type SchemaAnnotations = Pick<
  JSONSchema,
  | "title"
  | "description"
  | "examples"
  | "deprecated"
  | "readOnly"
  | "writeOnly"
  | "$comment"
>;

/**
 * Options every schema function accepts: the annotations, and a message for
 * the issues of the schema itself.
 */
export interface CommonOptions extends SchemaAnnotations {
  /**
   * Replaces the message of the issues the schema itself reports (a wrong
   * type, a violated constraint). The issues of nested schemas keep their own
   * messages.
   */
  message?: string;
}

const ANNOTATIONS = [
  "title",
  "description",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$comment",
] as const;

/**
 * The annotations of some options as JSON Schema keywords. Annotations that
 * are not set are left out.
 *
 * @example
 * ```ts
 * import { annotationsOf } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(annotationsOf({ title: "Name", description: undefined }), {
 *   title: "Name",
 * });
 * ```
 *
 * @param options Options that may contain annotations
 * @returns The annotations that are set
 */
export function annotationsOf(
  options?: SchemaAnnotations,
): Record<string, unknown> {
  const annotations: Record<string, unknown> = {};
  for (const key of ANNOTATIONS) {
    if (options?.[key] !== undefined) annotations[key] = options[key];
  }
  return annotations;
}

// ---------------------------------------------------------------------------
// Helpers for schemas that nest other schemas
// ---------------------------------------------------------------------------

/**
 * Waits for a list of values, but only if one of them is a promise, so that
 * schemas which nest other schemas stay synchronous when all of them are.
 *
 * @example
 * ```ts
 * import { collect } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(collect([1, 2]), [1, 2]);
 * assertEquals(await collect([1, Promise.resolve(2)]), [1, 2]);
 * ```
 *
 * @template T The type of the items
 * @param items Values or promises
 * @returns The values, or a promise of them
 */
export function collect<T>(
  items: readonly (T | Promise<T>)[],
): T[] | Promise<T[]> {
  return items.some((item) => item instanceof Promise)
    ? Promise.all(items)
    : items as T[];
}

/**
 * Applies `fn` to a value, waiting for it first if it is a promise.
 *
 * @example
 * ```ts
 * import { chain } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(chain(1, (n) => n + 1), 2);
 * assertEquals(await chain(Promise.resolve(1), (n) => n + 1), 2);
 * ```
 *
 * @template T The type of the value
 * @template R The type of the result
 * @param value A value or a promise
 * @param fn The continuation
 * @returns The result of `fn`, or a promise of it
 */
export function chain<T, R>(
  value: T | Promise<T>,
  fn: (value: T) => R | Promise<R>,
): R | Promise<R> {
  return value instanceof Promise ? value.then(fn) : fn(value);
}

/**
 * Prefixes the path of every issue with a segment, for a schema that
 * validates a part of its value (a property, an item, ...).
 *
 * @example
 * ```ts
 * import { prefixIssues } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(
 *   prefixIssues("user", [{ message: "Invalid", path: ["name"] }]),
 *   [{ message: "Invalid", path: ["user", "name"] }],
 * );
 * ```
 *
 * @param segment The key or index of the part
 * @param issues The issues of the part
 * @returns New issues with the longer path
 */
export function prefixIssues(
  segment: PropertyKey | StandardSchemaV1.PathSegment,
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): StandardSchemaV1.Issue[] {
  return issues.map((issue) => ({
    ...issue,
    path: [segment, ...(issue.path ?? [])],
  }));
}

/**
 * The JavaScript type of a value, with `null` and arrays told apart.
 *
 * @param value Any value
 * @returns `"null"`, `"array"`, or the result of `typeof`
 */
export function typeOf(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "array" : typeof value;
}

/**
 * The failure result for a value that is not of the expected type.
 *
 * @example
 * ```ts
 * import { typeIssue } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(typeIssue("a string", 1).issues[0].message, "Expected a string, received number");
 * ```
 *
 * @param expected What was expected, e.g. `"a string"`
 * @param actual The value that was received
 * @param message A message that replaces the default one
 * @returns A failure result with one issue of kind `"type"`
 */
export function typeIssue(
  expected: string,
  actual: unknown,
  message?: string,
): { issues: Issue[] } {
  return failure(
    "type",
    message ?? `Expected ${expected}, received ${typeOf(actual)}`,
    { expected, actual },
  );
}

/**
 * A failure result with one issue. Only the fields given in `extra` are set.
 *
 * @example
 * ```ts
 * import { failure } from "./core.ts";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(failure("length", "Too short", { expected: 3, actual: 1 }), {
 *   issues: [{ kind: "length", message: "Too short", expected: 3, actual: 1 }],
 * });
 * ```
 *
 * @param kind The machine-readable kind of the issue
 * @param message The message of the issue
 * @param extra The `expected` and `actual` values, when meaningful
 * @returns A failure result with one issue
 */
export function failure(
  kind: string,
  message: string,
  extra: { expected?: unknown; actual?: unknown } = {},
): { issues: Issue[] } {
  return { issues: [{ kind, message, ...extra }] };
}

/**
 * Whether a value is a plain object (not an array, `null`, `Date`, `Map`, ...).
 *
 * @param value Any value
 * @returns `true` for plain objects and objects created by classes
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * Sets an own enumerable property (string, number or symbol key) without
 * triggering setters such as `__proto__`, so untrusted keys cannot pollute the
 * prototype.
 *
 * @param target The object to write to
 * @param key The property key
 * @param value The value
 */
export function setOwn(
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Whether a schema accepts `undefined`, i.e. whether an object property using
 * it may be absent. This is found by validating `undefined`, so an async
 * schema counts as not accepting it.
 *
 * @param schema Any Standard Schema
 * @returns `true` if `undefined` is valid
 */
export function acceptsUndefined(schema: StandardSchemaV1): boolean {
  try {
    const result = validateAsync(schema, undefined);
    return !(result instanceof Promise) && !result.issues;
  } catch {
    return false;
  }
}

/**
 * Builds the `jsonSchema` converters of a schema that is made of other
 * schemas, or whose JSON Schema is the same for `input` and `output`.
 *
 * `build` runs for both. It receives `convert`, which gives the JSON Schema of
 * a nested schema for the same direction and options, and the `io` and
 * `options` of the conversion for the rare schema that needs them.
 *
 * @example
 * ```ts
 * import { createSchema, jsonSchemaOf } from "./core.ts";
 * import { toJSONSchema } from "./utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const port = createSchema("port", {
 *   validate: (value) => ({ value: value as number }),
 *   // the same for input and output
 *   jsonSchema: jsonSchemaOf(() => ({ type: "integer", minimum: 1 })),
 * });
 * assertEquals(toJSONSchema(port), { type: "integer", minimum: 1 });
 *
 * const ports = createSchema("ports", {
 *   validate: (value) => ({ value: value as number[] }),
 *   // converts the nested schema in the direction asked for
 *   jsonSchema: jsonSchemaOf((convert) => ({
 *     type: "array",
 *     items: convert(port),
 *   })),
 * });
 * assertEquals(toJSONSchema(ports), {
 *   type: "array",
 *   items: { type: "integer", minimum: 1 },
 * });
 * ```
 *
 * @param build Builds the JSON Schema, converting nested schemas with `convert`
 * @param annotations Annotations to add to the JSON Schema
 * @returns The `input` and `output` converters
 */
export function jsonSchemaOf(
  build: (
    convert: (schema: StandardJSONSchemaV1) => Record<string, unknown>,
    context: { io: "input" | "output"; options: StandardJSONSchemaV1.Options },
  ) => Record<string, unknown>,
  annotations?: SchemaAnnotations,
): CreateSchemaOptions["jsonSchema"] {
  const extra = annotationsOf(annotations);
  const converter =
    (io: "input" | "output") => (options: StandardJSONSchemaV1.Options) => ({
      ...build((schema) => schema["~standard"].jsonSchema[io](options), {
        io,
        options,
      }),
      ...extra,
    });
  return { input: converter("input"), output: converter("output") };
}
