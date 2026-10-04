/**
 * Query JSON values with JSONPath expressions.
 *
 * @module
 */

import type { JsonValue } from "@std/json";
import {
  JSONPath as WasmJSONPath,
  type JSONPathResult as WasmJSONPathResult,
} from "./_wasm/json_jsonpath.mjs";

/**
 * The result of a located JSONPath query: the location of the match
 * (RFC 9535 normalized path) and the matched node.
 */
export type JSONPathResult<Value = JsonValue> = WasmJSONPathResult<Value>;

/**
 * Queries JSON documents with JSONPath, as defined in RFC 9535.
 *
 * A `JSONPath` instance wraps one JSON document; its `query` and
 * `queryWithLocation` methods evaluate RFC 9535 path expressions against
 * that document.
 *
 * @example
 * ```ts
 * import { JSONPath } from "@stdx/json/jsonpath";
 * import { assertEquals } from "@std/assert";
 *
 * const jp = new JSONPath({ a: "b", c: [1, 2, 3] });
 *
 * assertEquals(jp.query("$.a"), ["b"]);
 * assertEquals(jp.query("$.c[*]"), [1, 2, 3]);
 *
 * // With locations:
 * assertEquals(jp.queryWithLocation("$.c[0]"), [
 *   { path: "$['c'][0]", result: 1 },
 * ]);
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc9535 | RFC 9535: JSONPath}
 */
export class JSONPath {
  #wasmJsonPath: WasmJSONPath;

  /**
   * Creates a `JSONPath` for querying the given document.
   *
   * @param data The JSON document to query.
   */
  constructor(data: JsonValue) {
    this.#wasmJsonPath = new WasmJSONPath(data);
  }

  /**
   * Evaluates a JSONPath expression, returning each match with its
   * location.
   *
   * @param expression The RFC 9535 JSONPath expression to evaluate.
   * @returns One result per match, each with the match's normalized path
   * and the matched node.
   *
   * @example
   * ```ts
   * import { JSONPath } from "@stdx/json/jsonpath";
   * import { assertEquals } from "@std/assert";
   *
   * const jp = new JSONPath({ a: "b" });
   * assertEquals(jp.queryWithLocation("$.a"), [
   *   { path: "$['a']", result: "b" },
   * ]);
   * ```
   */
  queryWithLocation<Value = JsonValue>(
    expression: string,
  ): JSONPathResult<Value>[] {
    return this.#wasmJsonPath.query(expression) as JSONPathResult<Value>[];
  }

  /**
   * Evaluates a JSONPath expression, returning the matched nodes without
   * their locations.
   *
   * @param expression The RFC 9535 JSONPath expression to evaluate.
   * @returns The matched nodes, in document order.
   *
   * @example
   * ```ts
   * import { JSONPath } from "@stdx/json/jsonpath";
   * import { assertEquals } from "@std/assert";
   *
   * const jp = new JSONPath({ a: "b", c: [1, 2, 3] });
   * assertEquals(jp.query("$.c[?@ > 1]"), [2, 3]);
   * ```
   */
  query<Value = JsonValue>(expression: string): Value[] {
    const res = this.queryWithLocation<Value>(expression);
    return res.map((r) => r.result);
  }
}
