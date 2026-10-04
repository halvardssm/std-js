import type { StandardSchemaV1 } from "@standard-schema/spec";
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  acceptsUndefined,
  annotationsOf,
  chain,
  collect,
  createSchema,
  isRecord,
  jsonSchemaOf,
  prefixIssues,
  type Schema,
  setOwn,
  typeIssue,
  typeOf,
} from "./core.ts";
import {
  assertType,
  asyncString,
  type Equals,
  type Input,
  type Output,
} from "./_testing.ts";

const jsonSchema = {
  input: () => ({ type: "string" }),
  output: () => ({ type: "string" }),
};

const expectedString = { issues: [{ message: "Expected a string" }] };

/** A sync schema accepting strings. */
const string = createSchema("string", {
  validate: (value) => typeof value === "string" ? { value } : expectedString,
  jsonSchema,
});

/** An array schema validating every item with `item`, sync or async. */
function list<TItem extends StandardSchemaV1>(item: TItem) {
  type Item = Output<TItem>;
  type ItemResult = StandardSchemaV1.Result<Item>;

  const finish = (results: ItemResult[]) => {
    const issues = results.flatMap((result, index) =>
      result.issues?.map((issue) => ({
        ...issue,
        path: [index, ...(issue.path ?? [])],
      })) ?? []
    );
    return issues.length
      ? { issues }
      : { value: results.map((r) => (r as { value: Item }).value) };
  };

  return createSchema("list", {
    validate: (value) => {
      if (!Array.isArray(value)) {
        return { issues: [{ message: "Expected an array" }] };
      }
      const results = value.map((v) => item["~standard"].validate(v));
      return results.some((r) => r instanceof Promise)
        ? Promise.all(results).then((r) => finish(r as ItemResult[]))
        : finish(results as ItemResult[]);
    },
    jsonSchema,
  });
}

Deno.test("createSchema", async (t) => {
  await t.step("builds a Standard Schema and a Standard JSON Schema", () => {
    assertEquals(string.kind, "string");
    assertEquals(string["~standard"].version, 1);
    assertEquals(string["~standard"].vendor, "@stdx/validation");
    assertEquals(string["~standard"].validate("a"), { value: "a" });
    assertEquals(string["~standard"].validate(1), expectedString);
    assertEquals(
      string["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
      { type: "string" },
    );
    assertEquals(
      string["~standard"].jsonSchema.output({ target: "draft-2020-12" }),
      { type: "string" },
    );

    const standard: StandardSchemaV1<string, string> = string;
    assertEquals(standard["~standard"].validate("a"), { value: "a" });
  });

  await t.step("returns an immutable schema", () => {
    assert(Object.isFrozen(string));
    assertThrows(() => {
      (string as { kind: string }).kind = "other";
    }, TypeError);
  });

  await t.step("infers output, input and kind", () => {
    assertType<Equals<typeof string, Schema<string, string, "string">>>();
    assertType<Equals<Input<typeof string>, string>>();
    assertType<Equals<Output<typeof string>, string>>();
  });

  await t.step("infers a narrowed output", () => {
    const port = createSchema("port", {
      validate: (value) =>
        Number.isInteger(value)
          ? { value: value as number }
          : { issues: [{ message: "Expected an integer" }] },
      jsonSchema,
    });
    assertType<Equals<typeof port, Schema<number, number, "port">>>();
  });

  await t.step("keeps literal types", () => {
    const mode = createSchema("mode", {
      validate: (value) =>
        value === "on" || value === "off"
          ? { value }
          : { issues: [{ message: "Expected on or off" }] },
      jsonSchema,
    });
    assertType<Equals<Output<typeof mode>, "on" | "off">>();
    assertType<Equals<typeof mode.kind, "mode">>();
  });

  await t.step("keeps undefined when the value may be undefined", () => {
    const maybe = createSchema("maybe", {
      validate: (value) => ({ value: value as string | undefined }),
      jsonSchema,
    });
    assertType<Equals<Output<typeof maybe>, string | undefined>>();
  });

  await t.step("infers from an explicitly typed result", () => {
    const count = createSchema("count", {
      validate: (value): StandardSchemaV1.Result<number> =>
        typeof value === "number"
          ? { value }
          : { issues: [{ message: "Expected a number" }] },
      jsonSchema,
    });
    assertType<Equals<typeof count, Schema<number, number, "count">>>();
  });

  await t.step("infers never when validate always fails", () => {
    const nothing = createSchema("nothing", {
      validate: () => ({ issues: [{ message: "Never valid" }] }),
      jsonSchema,
    });
    assertType<Equals<Output<typeof nothing>, never>>();
  });

  await t.step("takes an input type from `types`", () => {
    const length = createSchema("length", {
      validate: (value) =>
        typeof value === "string" ? { value: value.length } : expectedString,
      jsonSchema,
      types: undefined as unknown as StandardSchemaV1.Types<string, number>,
    });
    assertType<Equals<typeof length, Schema<string, number, "length">>>();
    assertType<Equals<Input<typeof length>, string>>();
    assertType<Equals<Output<typeof length>, number>>();
    assertEquals(length["~standard"].validate("abc"), { value: 3 });
  });

  await t.step("infers through async validation", async () => {
    assertType<
      Equals<typeof asyncString, Schema<string, string, "asyncString">>
    >();
    assertEquals(await asyncString["~standard"].validate("a"), { value: "a" });
    assertEquals(await asyncString["~standard"].validate(1), expectedString);
  });
});

Deno.test("createSchema - nesting", async (t) => {
  await t.step("reuses the validate function of another schema", () => {
    const alias = createSchema("alias", {
      validate: string["~standard"].validate,
      jsonSchema,
    });
    assertType<Equals<typeof alias, Schema<string, string, "alias">>>();
    assertEquals(alias["~standard"].validate("a"), { value: "a" });
    assertEquals(alias["~standard"].validate(1), expectedString);
  });

  await t.step("calls another schema from inside validate", () => {
    const trimmed = createSchema("trimmed", {
      validate: (value) => {
        const result = string["~standard"].validate(value);
        if (result instanceof Promise) throw new TypeError("Sync only");
        return result.issues ? result : { value: result.value.trim() };
      },
      jsonSchema,
    });
    assertType<Equals<typeof trimmed, Schema<string, string, "trimmed">>>();
    assertEquals(trimmed["~standard"].validate("  a "), { value: "a" });
    assertEquals(trimmed["~standard"].validate(1), expectedString);
  });

  await t.step("validates items and prefixes the issue paths", () => {
    const strings = list(string);
    assertType<Equals<Output<typeof strings>, string[]>>();
    assertEquals(strings["~standard"].validate(["a", "b"]), {
      value: ["a", "b"],
    });
    assertEquals(strings["~standard"].validate(["a", 1, 2]), {
      issues: [
        { message: "Expected a string", path: [1] },
        { message: "Expected a string", path: [2] },
      ],
    });
    assertEquals(strings["~standard"].validate("a"), {
      issues: [{ message: "Expected an array" }],
    });
  });

  await t.step(
    "stays synchronous unless a nested schema is async",
    async () => {
      const sync = list(string)["~standard"].validate(["a"]);
      assert(!(sync instanceof Promise));

      const pending = list(asyncString)["~standard"].validate(["a"]);
      assert(pending instanceof Promise);
      assertEquals(await pending, { value: ["a"] });
    },
  );

  await t.step(
    "nests lists in lists, with an async schema inside",
    async () => {
      const nested = list(list(asyncString));
      assertType<Equals<Output<typeof nested>, string[][]>>();
      assertEquals(await nested["~standard"].validate([["a"], ["b", "c"]]), {
        value: [["a"], ["b", "c"]],
      });
      assertEquals(await nested["~standard"].validate([["a"], ["b", 2]]), {
        issues: [{ message: "Expected a string", path: [1, 1] }],
      });
    },
  );
});

Deno.test("collect", async (t) => {
  await t.step("returns the values as they are when none is a promise", () => {
    const items = [1, 2, 3];
    assert(collect(items) === items);
  });

  await t.step("waits for all of them when one is a promise", async () => {
    const result = collect([1, Promise.resolve(2), 3]);
    assert(result instanceof Promise);
    assertEquals(await result, [1, 2, 3]);
  });

  await t.step("handles an empty list", () => {
    assertEquals(collect([]), []);
  });
});

Deno.test("chain", async (t) => {
  await t.step("applies the function directly to a value", () => {
    assertEquals(chain(1, (n) => n + 1), 2);
  });

  await t.step("waits for a promise first", async () => {
    const result = chain(Promise.resolve(1), (n) => n + 1);
    assert(result instanceof Promise);
    assertEquals(await result, 2);
  });

  await t.step("flattens a promise returned by the function", async () => {
    assertEquals(await chain(1, (n) => Promise.resolve(n + 1)), 2);
    assertEquals(
      await chain(Promise.resolve(1), (n) => Promise.resolve(n + 1)),
      2,
    );
  });
});

Deno.test("prefixIssues", async (t) => {
  await t.step("prefixes the path of every issue", () => {
    assertEquals(
      prefixIssues("user", [
        { message: "a", path: ["name"] },
        { message: "b" },
      ]),
      [
        { message: "a", path: ["user", "name"] },
        { message: "b", path: ["user"] },
      ],
    );
  });

  await t.step("accepts indexes and path segments", () => {
    assertEquals(prefixIssues(0, [{ message: "a" }]), [
      { message: "a", path: [0] },
    ]);
    assertEquals(
      prefixIssues({ key: "k" }, [{ message: "a", path: [1] }]),
      [{ message: "a", path: [{ key: "k" }, 1] }],
    );
  });

  await t.step("keeps the other fields and does not mutate", () => {
    const issue = { message: "a", kind: "type", path: ["x"] };
    const [prefixed] = prefixIssues("y", [issue]);
    const expected = { message: "a", kind: "type", path: ["y", "x"] };
    assertEquals(prefixed, expected);
    assertEquals(issue.path, ["x"]);
  });
});

Deno.test("typeOf and typeIssue", async (t) => {
  await t.step("tells null and arrays apart", () => {
    assertEquals(typeOf(null), "null");
    assertEquals(typeOf([]), "array");
    assertEquals(typeOf({}), "object");
    assertEquals(typeOf("a"), "string");
    assertEquals(typeOf(undefined), "undefined");
    assertEquals(typeOf(1n), "bigint");
  });

  await t.step("builds a failure result", () => {
    assertEquals(typeIssue("a string", 1), {
      issues: [{
        kind: "type",
        message: "Expected a string, received number",
        expected: "a string",
        actual: 1,
      }],
    });
  });
});

Deno.test("isRecord", () => {
  assert(isRecord({}));
  assert(isRecord({ a: 1 }));
  assert(isRecord(Object.create(null)));
  assert(isRecord(new (class Point {})()));
  for (
    const value of [[], null, undefined, 1, "a", new Date(), new Map(), /a/]
  ) {
    assert(!isRecord(value), String(value));
  }
});

Deno.test("setOwn", () => {
  const target: Record<PropertyKey, unknown> = {};
  setOwn(target, "a", 1);
  assertEquals(target, { a: 1 });
  assertEquals(Object.keys(target), ["a"]);

  // symbol and numeric keys
  const symbol = Symbol("key");
  setOwn(target, symbol, 2);
  setOwn(target, 3, 3);
  assertEquals(target[symbol], 2);
  assertEquals(target[3], 3);
  assert(Object.getOwnPropertySymbols(target).includes(symbol));
  assert(Object.getOwnPropertyDescriptor(target, symbol)?.enumerable);
  delete target[symbol];
  delete target[3];

  // a `__proto__` key becomes an own property instead of the prototype
  setOwn(target, "__proto__", { polluted: true });
  assertEquals(Object.keys(target), ["a", "__proto__"]);
  assertEquals(Object.getPrototypeOf(target), Object.prototype);
  assertEquals(({} as Record<string, unknown>).polluted, undefined);
});

Deno.test("acceptsUndefined", async (t) => {
  const accepting = createSchema("accepting", {
    validate: () => ({ value: undefined }),
    jsonSchema,
  });

  await t.step("is true for schemas that accept undefined", () => {
    assert(acceptsUndefined(accepting));
  });

  await t.step("is false for schemas that reject it", () => {
    assert(!acceptsUndefined(string));
  });

  await t.step("is false for async schemas and schemas that throw", () => {
    assert(!acceptsUndefined(asyncString));
    const throwing = createSchema("throwing", {
      validate: () => {
        throw new Error("boom");
      },
      jsonSchema,
    });
    assert(!acceptsUndefined(throwing));
  });
});

Deno.test("annotationsOf", () => {
  assertEquals(annotationsOf(), {});
  assertEquals(annotationsOf({}), {});
  assertEquals(
    annotationsOf({
      title: "Name",
      description: "The name",
      examples: ["a"],
      deprecated: false,
      readOnly: true,
      writeOnly: false,
      $comment: "c",
    }),
    {
      title: "Name",
      description: "The name",
      examples: ["a"],
      deprecated: false,
      readOnly: true,
      writeOnly: false,
      $comment: "c",
    },
  );
  // what is not set is left out, and so is everything that is not an annotation
  assertEquals(annotationsOf({ title: "T", description: undefined }), {
    title: "T",
  });
  const options = { title: "T", message: "m", minLength: 1 };
  assertEquals(annotationsOf(options), { title: "T" });
});

Deno.test("typeIssue with a message", () => {
  assertEquals(typeIssue("a string", 1, "Custom"), {
    issues: [{
      kind: "type",
      message: "Custom",
      expected: "a string",
      actual: 1,
    }],
  });
});

Deno.test("jsonSchemaOf", async (t) => {
  const options = { target: "draft-2020-12" } as const;

  await t.step("gives the same JSON Schema for input and output", () => {
    const { input, output } = jsonSchemaOf(() => ({ type: "integer" }));
    assertEquals(input(options), { type: "integer" });
    assertEquals(output(options), { type: "integer" });
  });

  await t.step("tells what direction and options it is converting for", () => {
    const seen: unknown[] = [];
    const { input, output } = jsonSchemaOf((_convert, context) => {
      seen.push(context);
      return {};
    });
    input(options);
    output({ ...options, libraryOptions: { a: 1 } });
    assertEquals(seen, [
      { io: "input", options },
      { io: "output", options: { ...options, libraryOptions: { a: 1 } } },
    ]);
  });

  await t.step("converts nested schemas in the direction asked for", () => {
    const nested = createSchema("nested", {
      validate: (value) => ({ value }),
      jsonSchema: {
        input: () => ({ type: "string" }),
        output: () => ({ type: "integer" }),
      },
    });
    const { input, output } = jsonSchemaOf((convert) => ({
      items: convert(nested),
    }));
    assertEquals(input(options), { items: { type: "string" } });
    assertEquals(output(options), { items: { type: "integer" } });
  });

  await t.step("adds the annotations", () => {
    const { input, output } = jsonSchemaOf(
      () => ({ type: "string" }),
      { title: "T", description: undefined },
    );
    assertEquals(input(options), { type: "string", title: "T" });
    assertEquals(output(options), { type: "string", title: "T" });
  });
});
