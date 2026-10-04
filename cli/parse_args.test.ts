import { assertEquals, assertThrows } from "@std/assert";
import { parseArgs as stdParseArgs } from "@std/cli/parse-args";
import { parseArgs } from "./parse_args.ts";

Deno.test("parseArgs matches @std/cli without required", async (t) => {
  const cases: [string, string[], Parameters<typeof stdParseArgs>[1]][] = [
    ["no options", ["a", "--b", "c", "-d"], undefined],
    ["boolean and string", ["--v", "--n", "x", "rest"], {
      boolean: ["v"],
      string: ["n"],
    }],
    ["alias and default", ["-n", "x"], {
      alias: { n: "name" },
      default: { port: 80 },
    }],
    ["collect and negatable", ["--t", "a", "--t", "b", "--no-c"], {
      collect: ["t"],
      negatable: ["c"],
      boolean: ["c"],
    }],
    ["double dash", ["a", "--", "b"], { "--": true }],
    ["stop early", ["a", "--b"], { stopEarly: true }],
    ["empty required", ["--a"], undefined],
  ];
  for (const [name, args, options] of cases) {
    await t.step(name, () => {
      assertEquals(parseArgs(args, options), stdParseArgs(args, options));
      assertEquals(
        parseArgs(args, { ...options, required: [] }),
        stdParseArgs(args, options),
      );
    });
  }
});

Deno.test("parseArgs required", async (t) => {
  await t.step("passes when present", () => {
    assertEquals(
      parseArgs(["--name", "foo", "x"], {
        string: ["name"],
        required: ["name"],
      }),
      { name: "foo", _: ["x"] },
    );
  });

  await t.step("throws when missing", () => {
    assertThrows(
      () => parseArgs(["x"], { required: ["name"] }),
      TypeError,
      "Missing required flag: --name",
    );
  });

  await t.step("lists all missing flags", () => {
    assertThrows(
      () => parseArgs(["--bb"], { required: ["aa", "bb", "cc", "dd"] }),
      TypeError,
      "Missing required flags: --aa, --cc, --dd",
    );
  });

  await t.step("short flags are shown with a single dash", () => {
    assertThrows(
      () => parseArgs([], { required: ["n"] }),
      TypeError,
      "Missing required flag: -n",
    );
  });

  await t.step("an alias satisfies the flag", () => {
    const options = { alias: { n: "name" }, string: ["name"] };
    assertEquals(
      parseArgs(["-n", "x"], { ...options, required: ["name"] }).name,
      "x",
    );
    assertEquals(
      parseArgs(["--name", "x"], { ...options, required: ["n"] }).n,
      "x",
    );
    assertThrows(
      () => parseArgs([], { ...options, required: ["n"] }),
      TypeError,
      "-n",
    );
  });

  await t.step("boolean flags", () => {
    const options = { required: ["verbose"] };
    assertEquals(parseArgs(["--verbose"], options).verbose, true);
    assertThrows(() => parseArgs([], options), TypeError, "--verbose");
    // Flags declared as boolean always have a value.
    assertEquals(
      parseArgs([], { boolean: ["verbose"], required: ["verbose"] }).verbose,
      false,
    );
  });

  await t.step("negated flags are present", () => {
    assertEquals(
      parseArgs(["--no-color"], {
        boolean: ["color"],
        negatable: ["color"],
        required: ["color"],
      }).color,
      false,
    );
  });

  await t.step("falsy values are present", () => {
    assertEquals(
      parseArgs(["--n=0", "--s="], { required: ["n", "s"] }).n,
      0,
    );
  });

  await t.step("defaults satisfy a required flag", () => {
    assertEquals(
      parseArgs([], { default: { port: 80 }, required: ["port"] }).port,
      80,
    );
  });

  await t.step("other defaults are kept", () => {
    assertEquals(
      parseArgs(["--a"], { default: { b: 2 }, required: ["a"] }),
      { a: true, b: 2, _: [] },
    );
  });

  await t.step("flags after the double dash do not count", () => {
    assertThrows(
      () => parseArgs(["--", "--name"], { "--": true, required: ["name"] }),
      TypeError,
    );
  });
});

Deno.test("parseArgs infers the result from the options like @std/cli", () => {
  const args = parseArgs(["--name", "foo"], {
    string: ["name", "other"],
    boolean: ["verbose"],
    alias: { name: "n" },
    default: { port: 80 },
  });

  const name: string | undefined = args.name;
  const alias: string | undefined = args.n;
  const verbose: boolean = args.verbose;
  const port: NonNullable<unknown> = args.port;
  const other: string | undefined = args.other;
  // @ts-expect-error `other` is not required and has no default
  const definitelyOther: string = args.other;
  // @ts-expect-error `verbose` is a boolean
  const verboseString: string = args.verbose;

  assertEquals(
    [name, alias, verbose, port, other, definitelyOther, verboseString],
    ["foo", "foo", false, 80, undefined, undefined, false],
  );
});

Deno.test("parseArgs types required and default flags as defined", () => {
  const args = parseArgs(["--name", "foo", "--other", "x", "--undeclared"], {
    string: ["name", "other", "optional", "withDefault"],
    boolean: ["verbose"],
    alias: { name: "n", other: ["o", "oo"] },
    default: { withDefault: "d", extra: 1 },
    required: ["name", "o", "undeclared"],
  });

  const name: string = args.name;
  const nameAlias: string = args.n;
  const other: string = args.other;
  const otherAlias: string = args.oo;
  const withDefault: string = args.withDefault;
  const extra: NonNullable<unknown> = args.extra;
  const undeclared: NonNullable<unknown> = args.undeclared;
  const underscore: Array<string | number> = args._;
  const optional: string | undefined = args.optional;
  // @ts-expect-error `optional` is not required, and can be undefined
  const optionalString: string = args.optional;

  assertEquals(
    [name, nameAlias, other, otherAlias, withDefault, extra, underscore],
    ["foo", "foo", "x", "x", "d", 1, []],
  );
  assertEquals([undeclared, optional, optionalString], [
    true,
    undefined,
    undefined,
  ]);
});
