/**
 * The `@stdx/validation` package: schemas that implement both
 * {@link https://standardschema.dev | Standard Schema} and
 * {@link https://standardschema.dev/#json-schema | Standard JSON Schema}.
 *
 * - {@linkcode createSchema} builds a schema from a `validate` function and
 *   its JSON Schema. The input type, output type and kind are inferred.
 * - A schema works with any consumer of either standard (validators, form
 *   libraries, OpenAPI generators) and can be nested in other schemas.
 * - `validate` may be async: a schema whose `validate` returns a promise is
 *   async.
 * - Ready-made schemas cover the basics: `string`, `integer`, `float`,
 *   `number`, `boolean`, `symbol`, `func`, `null_`, `literal`, `enumerator`,
 *   `instanceOf`, `unknown`, `never`, `nullable`, `optional` and `nullish`, and
 *   the ones made of other schemas: `object`, `shape`, `array`, `record`,
 *   `tuple`, `anyOf`, `oneOf`, `allOf`, `not` and `lazy`.
 * - Schemas take options named after JSON Schema keywords (`minLength`,
 *   `pattern`, `format`, `minimum`, `minItems`, `additionalProperties`, ...),
 *   annotations such as `title` and `description`, and a `message` for the
 *   issues. They are checked, and exported to the JSON Schema.
 * - Helper functions work with any Standard Schema, also from other libraries:
 *   `validate`, `validateAsync`, `parse`, `parseAsync`, `isValid`,
 *   `assertValid` and `toJSONSchema`.
 *
 * @example
 * ```ts
 * import {
 *   array,
 *   createSchema,
 *   object,
 *   string,
 *   toJSONSchema,
 *   validate,
 * } from "@stdx/validation";
 * import { assertEquals } from "@std/assert";
 *
 * // a schema of your own
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
 * // ready-made schemas nest other schemas
 * const server = object({ host: string(), ports: array(port) });
 *
 * assertEquals(validate(server, { host: "localhost", ports: [80] }), {
 *   value: { host: "localhost", ports: [80] },
 * });
 * assertEquals(
 *   validate(server, { host: "localhost", ports: [0] }).issues?.[0].path,
 *   ["ports", 0],
 * );
 * assertEquals(toJSONSchema(server).type, "object");
 * ```
 *
 * @module
 */

export * from "./core.ts";
export * from "./schemas.ts";
export * from "./composites.ts";
export * from "./utils.ts";
export type {
  NumberConstraints,
  PropertyCountConstraints,
} from "./constraints.ts";
