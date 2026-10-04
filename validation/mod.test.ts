import { assert, assertEquals } from "@std/assert";
import * as validation from "./mod.ts";
import {
  allOf,
  anyOf,
  array,
  boolean,
  enumerator,
  float,
  func,
  instanceOf,
  integer,
  isStandardJSONSchemaV1,
  isStandardSchemaV1,
  lazy,
  literal,
  never,
  not,
  null_,
  nullable,
  nullish,
  number,
  object,
  oneOf,
  optional,
  record,
  shape,
  string,
  symbol,
  tuple,
  unknown,
  validate,
} from "./mod.ts";
import type { CommonOptions, Schema } from "./core.ts";

Deno.test("the package exports the whole public API", () => {
  const functions = [
    // core
    "createSchema",
    "collect",
    "chain",
    "prefixIssues",
    "typeOf",
    "typeIssue",
    "failure",
    "isRecord",
    "setOwn",
    "acceptsUndefined",
    "annotationsOf",
    "jsonSchemaOf",
    // schemas
    "string",
    "integer",
    "float",
    "number",
    "boolean",
    "symbol",
    "func",
    "null_",
    "literal",
    "enumerator",
    "instanceOf",
    "unknown",
    "never",
    "nullable",
    "optional",
    "nullish",
    // composites
    "object",
    "array",
    "record",
    "shape",
    "tuple",
    "anyOf",
    "oneOf",
    "allOf",
    "not",
    "lazy",
    // utils
    "validate",
    "validateAsync",
    "parse",
    "parseAsync",
    "isValid",
    "assertValid",
    "toJSONSchema",
    "stringify",
    "isStandardSchemaV1",
    "isStandardJSONSchemaV1",
  ];

  assertEquals(Object.keys(validation).sort(), [...functions].sort());
  for (const name of functions) {
    assertEquals(
      typeof validation[name as keyof typeof validation],
      "function",
      name,
    );
  }
});

/** Every ready-made schema, with the kind it must report. */
const schemas: Record<string, Schema> = {
  string: string(),
  integer: integer(),
  float: float(),
  number: number(),
  boolean: boolean(),
  symbol: symbol(),
  "function": func(),
  "null": null_(),
  literal: literal("a"),
  enumerator: enumerator(["a", "b"]),
  instanceOf: instanceOf(Date),
  unknown: unknown(),
  never: never(),
  nullable: nullable(string()),
  optional: optional(string()),
  nullish: nullish(string()),
  object: object({ a: string() }),
  shape: shape({ a: string() }),
  array: array(string()),
  record: record(string()),
  tuple: tuple([string()]),
  anyOf: anyOf([string()]),
  oneOf: oneOf([string()]),
  allOf: allOf([string()]),
  not: not(string()),
  lazy: lazy(() => string()),
};

Deno.test("every ready-made schema is a Standard Schema and a Standard JSON Schema", async (t) => {
  for (const [kind, schema] of Object.entries(schemas)) {
    await t.step(kind, () => {
      assertEquals(schema.kind, kind);
      assert(Object.isFrozen(schema));
      assert(isStandardSchemaV1(schema));
      assert(isStandardJSONSchemaV1(schema));
      assertEquals(schema["~standard"].version, 1);
      assertEquals(schema["~standard"].vendor, "@stdx/validation");

      // both directions give a JSON Schema object, without throwing
      for (const io of ["input", "output"] as const) {
        const json = schema["~standard"].jsonSchema[io]({
          target: "draft-2020-12",
        });
        assertEquals(typeof json, "object");
        assert(json !== null);
      }
    });
  }
});

Deno.test("every ready-made schema validates without throwing", async (t) => {
  const inputs = [
    undefined,
    null,
    true,
    0,
    "a",
    Symbol("s"),
    [],
    {},
    new Date(),
    () => {},
  ];

  for (const [kind, schema] of Object.entries(schemas)) {
    await t.step(kind, () => {
      for (const input of inputs) {
        // a result either way: values and issues, never an exception
        const result = validate(schema, input);
        assert("value" in result || "issues" in result);
      }
    });
  }
});

/** How to build every schema with options, and what makes it fail by itself. */
const withOptions: Record<
  string,
  { make: (options: CommonOptions) => Schema; bad?: unknown; own?: boolean }
> = {
  string: { make: (o) => string(o), bad: 1 },
  integer: { make: (o) => integer(o), bad: "a" },
  float: { make: (o) => float(o), bad: "a" },
  number: { make: (o) => number(o), bad: "a" },
  boolean: { make: (o) => boolean(o), bad: 1 },
  symbol: { make: (o) => symbol(o), bad: 1 },
  func: { make: (o) => func(o), bad: 1 },
  null_: { make: (o) => null_(o), bad: 1 },
  literal: { make: (o) => literal("a", o), bad: "b" },
  enumerator: { make: (o) => enumerator(["a"], o), bad: "b" },
  instanceOf: { make: (o) => instanceOf(Date, o), bad: 1 },
  unknown: { make: (o) => unknown(o) },
  never: { make: (o) => never(o), bad: 1 },
  nullable: { make: (o) => nullable(string(), o) },
  optional: { make: (o) => optional(string(), o) },
  nullish: { make: (o) => nullish(string(), o) },
  object: { make: (o) => object({}, o), bad: 1 },
  shape: { make: (o) => shape({}, o), bad: 1 },
  array: { make: (o) => array(string(), o), bad: 1 },
  record: { make: (o) => record(string(), o), bad: 1 },
  tuple: { make: (o) => tuple([string()], o), bad: 1 },
  anyOf: { make: (o) => anyOf([], o), bad: 1 },
  oneOf: { make: (o) => oneOf([], o), bad: 1 },
  allOf: { make: (o) => allOf([string()], o) },
  not: { make: (o) => not(unknown(), o), bad: 1 },
  lazy: { make: (o) => lazy(() => string(), o) },
};

const annotations = {
  title: "A title",
  description: "A description",
  examples: ["example"],
  deprecated: true,
  readOnly: true,
  writeOnly: false,
  $comment: "A comment",
};

Deno.test("every schema takes the annotations and the message options", async (t) => {
  for (const [name, { make, bad }] of Object.entries(withOptions)) {
    await t.step(`${name}: annotations end up in the JSON Schema`, () => {
      const schema = make({ ...annotations, message: "A message" });
      for (const io of ["input", "output"] as const) {
        const json = schema["~standard"].jsonSchema[io]({
          target: "draft-2020-12",
        });
        for (const [key, value] of Object.entries(annotations)) {
          assertEquals(json[key], value, `${name} ${io} ${key}`);
        }
        // the message is not a JSON Schema keyword
        assertEquals("message" in json, false);
      }
      // and the schema without them has none
      const plain = make({}) as Schema;
      const json = plain["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      });
      for (const key of Object.keys(annotations)) {
        assertEquals(key in json, false, `${name} ${key}`);
      }
    });

    if (bad !== undefined) {
      await t.step(`${name}: message replaces its own issues`, () => {
        const result = validate(make({ message: "A message" }), bad);
        assert(result.issues?.length, `${name} should fail`);
        assertEquals(
          result.issues?.map((issue) => issue.message),
          result.issues?.map(() => "A message"),
        );
        // without it the default message is used
        assert(
          validate(make({}), bad).issues?.[0].message !== "A message",
          name,
        );
      });
    }
  }

  await t.step(
    "the message does not replace the issues of nested schemas",
    () => {
      const schema = object({ name: string() }, { message: "A message" });
      assertEquals(
        validate(schema, { name: 1 }).issues?.[0].message,
        "Expected a string, received number",
      );
      assertEquals(validate(schema, 1).issues?.[0].message, "A message");
      assertEquals(
        validate(array(string(), { message: "A message" }), [1]).issues?.[0]
          .message,
        "Expected a string, received number",
      );
      assertEquals(
        validate(nullable(string(), { message: "A message" }), 1).issues?.[0]
          .message,
        "Expected a string, received number",
      );
    },
  );
});
