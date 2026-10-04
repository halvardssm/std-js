/**
 * A configurable tokenizer that splits strings into tokens using key matchers
 * and handlers.
 *
 * @module
 */

import { isNumeric } from "@stdx/assert";

/**
 * A token produced by {@linkcode StringTokenizer.tokenize}.
 */
export type StringTokenizerToken<Type = string, Value = string> = {
  /**
   * The token type, decided by the handler that produced it.
   */
  type: Type;
  /**
   * The token value, decided by the handler that produced it.
   */
  value: Value;
  /**
   * The index in the data string where the token starts.
   */
  index: number;
};

/**
 * A matcher key: matched against the current character. A `string` is
 * compared for equality, a `RegExp` is tested against it, and a function
 * receives the current character, index and full data string.
 */
export type StringTokenizerKeyMatcher =
  | string
  | RegExp
  | ((value: string, index: number, data: string) => boolean);

/**
 * What a {@linkcode StringTokenizerHandler} can return.
 *
 * - a token — the index advances by one character
 * - a number — no token, the index advances by that many characters
 * - a tuple of `[token | undefined, increment | undefined]` — an optional
 *   token and an optional index increment (defaulting to `1` when omitted)
 *
 * @example token, index advances by 1
 * ```ts
 * const token = { type: "someType", value: "a", index: 5 };
 * ```
 *
 * @example token with an explicit increment of 3
 * ```ts
 * const [token, increment] = [
 *   { type: "someType", value: "abc", index: 5 },
 *   3,
 * ];
 * ```
 */
export type StringTokenizerHandlerReturnType<Type = string, Value = string> =
  | StringTokenizerToken<Type, Value>
  | number
  | [StringTokenizerToken<Type, Value> | undefined, number | undefined];

/**
 * A handler invoked with the match, producing the token (and the index
 * increment).
 *
 * @param value The character at the current index.
 * @param index The current index.
 * @param data A clone of the full data string.
 */
export type StringTokenizerHandler<Type = string, Value = string> = (
  value: string,
  index: number,
  data: string,
) => StringTokenizerHandlerReturnType<Type, Value>;

/**
 * A matcher: when the `key` matches the current character, its `handler`
 * is invoked to produce the token.
 */
export type StringTokenizerMatcher<Type = string, Value = string> = {
  key: StringTokenizerKeyMatcher;
  handler: StringTokenizerHandler<Type, Value>;
};

/**
 * Options for constructing a {@linkcode StringTokenizer}.
 */
export type StringTokenizerOptions<Type = string, Value = string> = {
  /**
   * The data to tokenize.
   */
  data: string;
  /**
   * The matchers, checked in order — the first match wins.
   */
  matchers: StringTokenizerMatcher<Type, Value>[];
  /**
   * A handler invoked when no matcher matches. Without it, an
   * unmatched character throws.
   */
  defaultHandler?: StringTokenizerHandler<Type, Value>;
};

/**
 * A general purpose string tokenizer.
 *
 * The data string is walked character by character. On every index, the
 * matchers are tried in order; the first one whose `key` matches the
 * current character has its `handler` invoked, whose return value decides
 * the emitted token and the index increment (see
 * {@linkcode StringTokenizerHandlerReturnType}). Characters nothing
 * matches fall through to the `defaultHandler`, or throw when there is
 * none.
 *
 * @example
 * ```ts
 * import { StringTokenizer } from "@stdx/lexer/string_tokenizer";
 * import { assertEquals } from "@std/assert";
 *
 * const t = new StringTokenizer({
 *   data: "a1b2",
 *   matchers: [
 *     {
 *       key: /[a-z]/,
 *       handler: (v, i) => ({ index: i, type: "letter", value: v }),
 *     },
 *     {
 *       key: (v, i) => /[0-9]/.test(v) && i > 1,
 *       handler: (v, i) => ({ index: i, type: "late digit", value: v }),
 *     },
 *     {
 *       // Consume a digit without emitting a token.
 *       key: /[0-9]/,
 *       handler: () => 1,
 *     },
 *   ],
 * });
 *
 * assertEquals(t.tokenize(), [
 *   { index: 0, type: "letter", value: "a" },
 *   { index: 2, type: "letter", value: "b" },
 *   { index: 3, type: "late digit", value: "2" },
 * ]);
 * ```
 *
 * @example With a default handler
 * ```ts
 * import { StringTokenizer } from "@stdx/lexer/string_tokenizer";
 * import { assertEquals } from "@std/assert";
 *
 * const t = new StringTokenizer({
 *   data: "ab",
 *   matchers: [],
 *   defaultHandler: (v, i) => ({ index: i, type: "default", value: v }),
 * });
 *
 * assertEquals(t.tokenize(), [
 *   { index: 0, type: "default", value: "a" },
 *   { index: 1, type: "default", value: "b" },
 * ]);
 * ```
 *
 * @typeParam Type The token type. Defaults to `string`.
 * @typeParam Value The token value. Defaults to `string`.
 */
export class StringTokenizer<Type = string, Value = string> {
  readonly #data: string;
  readonly #matchers: StringTokenizerMatcher<Type, Value>[];
  readonly #defaultHandler?: StringTokenizerHandler<Type, Value>;

  #index = 0;

  get #currentChar(): string {
    return this.#data[this.#index];
  }

  constructor(options: StringTokenizerOptions<Type, Value>) {
    this.#data = options.data;
    this.#matchers = options.matchers;
    this.#defaultHandler = options.defaultHandler;
  }

  #incrementIndex(value = 1): void {
    this.#index += value;
  }

  /**
   * Tokenizes the data, restarting from the beginning. The tokenizer can
   * be reused: calling `tokenize` again re-runs the whole string.
   *
   * @returns The tokens, in order.
   * @throws {Error} If a character matches no matcher and no
   * `defaultHandler` is set.
   */
  tokenize(): StringTokenizerToken<Type, Value>[] {
    this.#index = 0;
    const tokens: StringTokenizerToken<Type, Value>[] = [];

    while (this.#index < this.#data.length) {
      const token = this.#match();
      let increment = 1;

      if (Array.isArray(token)) {
        if (token[0] !== undefined) {
          tokens.push(token[0]);
        }

        if (token[1] !== undefined) {
          increment = token[1];
        }
      } else {
        if (isNumeric(token)) {
          increment = token;
        } else {
          tokens.push(token);
        }
      }

      this.#incrementIndex(increment);
    }

    return tokens;
  }

  #match(): StringTokenizerHandlerReturnType<Type, Value> {
    for (const matcher of this.#matchers) {
      if (
        typeof matcher.key === "string" &&
          matcher.key === this.#currentChar ||
        matcher.key instanceof RegExp &&
          matcher.key.test(this.#currentChar) ||
        typeof matcher.key === "function" &&
          matcher.key(this.#currentChar, this.#index, this.#data)
      ) {
        return matcher.handler(
          this.#currentChar,
          this.#index,
          this.#data,
        ) as StringTokenizerHandlerReturnType<Type, Value>;
      }
    }

    if (this.#defaultHandler) {
      return this.#defaultHandler(
        this.#currentChar,
        this.#index,
        this.#data,
      ) as StringTokenizerHandlerReturnType<Type, Value>;
    }

    throw new Error(
      `No matchers matched the value '${this.#currentChar}', and a default handler was not set.`,
    );
  }
}
