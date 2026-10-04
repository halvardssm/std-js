/**
 * The `@stdx/json` package.
 *
 * Extends `@std/json` with a JSONPath implementation (RFC 9535) and JSON
 * Schema types for draft 2020-12.
 *
 * @example
 * ```ts
 * import { JSONPath } from "@stdx/json";
 * import { assertEquals } from "@std/assert";
 *
 * const jp = new JSONPath({ a: "b" });
 * assertEquals(jp.query("$.a"), ["b"]);
 * ```
 *
 * @module
 */

export * from "./jsonpath.ts";
export * from "./json_schema.ts";
