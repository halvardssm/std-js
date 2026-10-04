/**
 * The `@stdx/lexer` package.
 *
 * Lexing utilities: a general purpose {@linkcode StringTokenizer}.
 *
 * @example
 * ```ts
 * import { StringTokenizer } from "@stdx/lexer";
 * import { assertEquals } from "@std/assert";
 *
 * const t = new StringTokenizer({
 *   data: "ab",
 *   matchers: [{ key: /a/, handler: (v, i) => ({ index: i, type: "a", value: v }) }],
 *   defaultHandler: (v, i) => ({ index: i, type: "other", value: v }),
 * });
 *
 * assertEquals(t.tokenize(), [
 *   { index: 0, type: "a", value: "a" },
 *   { index: 1, type: "other", value: "b" },
 * ]);
 * ```
 *
 * @module
 */

export * from "./string_tokenizer.ts";
