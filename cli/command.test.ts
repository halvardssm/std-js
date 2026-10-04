import { assertEquals, assertThrows } from "@std/assert";
import {
  defineCommand,
  runCommand,
  type RunOptions,
  UsageError,
} from "./command.ts";

Deno.test("defineCommand returns the definition", () => {
  const definition = { name: "tool", description: "d" };
  assertEquals(defineCommand(definition), definition);
});

Deno.test("defineCommand infers flags and arguments", () => {
  defineCommand({
    name: "tool",
    options: {
      plain: { type: "string" },
      required: { type: "string", required: true },
      optional: { type: "string", required: false },
      withDefault: { type: "string", default: "x" },
      withEnv: { type: "string", env: "X" },
      switch: { type: "boolean" },
    },
    args: [
      { name: "first", required: true },
      { name: "second" },
      { name: "others", variadic: true },
    ],
    run({ flags, args }) {
      const plain: string | undefined = flags.plain;
      const required: string = flags.required;
      const optional: string | undefined = flags.optional;
      const withDefault: string = flags.withDefault;
      const withEnv: string | undefined = flags.withEnv;
      const toggle: boolean = flags.switch;
      const first: string = args.first;
      const second: string | undefined = args.second;
      const others: string[] = args.others;
      // @ts-expect-error `plain` can be undefined
      const definitelyPlain: string = flags.plain;
      // @ts-expect-error `second` is optional
      const definitelySecond: string = args.second;
      // @ts-expect-error the flag does not exist
      flags.nothing;
      // @ts-expect-error the argument does not exist
      args.nothing;
      return [
        plain,
        required,
        optional,
        withDefault,
        withEnv,
        toggle,
        first,
        second,
        others,
        definitelyPlain,
        definitelySecond,
      ].length;
    },
  });
});

Deno.test("defineCommand validates the definition", async (t) => {
  const invalid: Array<[string, () => unknown, string]> = [
    ["empty name", () => defineCommand({ name: "" }), "Invalid command name"],
    [
      "name with space",
      () => defineCommand({ name: "a b" }),
      "Invalid command name",
    ],
    [
      "name like a flag",
      () => defineCommand({ name: "--a" }),
      "Invalid command name",
    ],
    [
      "reserved option",
      () =>
        defineCommand({ name: "a", options: { help: { type: "boolean" } } }),
      "reserved",
    ],
    [
      "reserved alias",
      () =>
        defineCommand({
          name: "a",
          options: { x: { type: "boolean", alias: "h" } },
        }),
      "reserved",
    ],
    [
      "reserved version",
      () =>
        defineCommand({
          name: "a",
          options: { x: { type: "boolean", alias: "V" } },
        }),
      "reserved",
    ],
    [
      "duplicate alias",
      () =>
        defineCommand({
          name: "a",
          options: {
            x: { type: "boolean", alias: "a" },
            y: { type: "boolean", alias: "a" },
          },
        }),
      "more than once",
    ],
    [
      "duplicate flag",
      () =>
        defineCommand({
          name: "a",
          options: {
            dryRun: { type: "boolean" },
            "dry-run": { type: "boolean" },
          },
        }),
      "more than once",
    ],
    [
      "long alias",
      () =>
        defineCommand({
          name: "a",
          options: { x: { type: "boolean", alias: "ab" } },
        }),
      "not one character",
    ],
    [
      "subcommands and arguments",
      () =>
        defineCommand({
          name: "a",
          args: [{ name: "x" }],
          commands: [defineCommand({ name: "b" })],
        }),
      "both subcommands and arguments",
    ],
    [
      "duplicate subcommand",
      () =>
        defineCommand({
          name: "a",
          commands: [
            defineCommand({ name: "b" }),
            defineCommand({ name: "b" }),
          ],
        }),
      "twice",
    ],
    [
      "variadic not last",
      () =>
        defineCommand({
          name: "a",
          args: [{ name: "x", variadic: true }, { name: "y" }],
        }),
      "not last",
    ],
    [
      "required after optional",
      () =>
        defineCommand({
          name: "a",
          args: [{ name: "x" }, { name: "y", required: true }],
        }),
      "follows an optional",
    ],
  ];
  for (const [name, fn, message] of invalid) {
    await t.step(name, () => {
      assertThrows(fn, TypeError, message);
    });
  }
});

type Result = { code: number; out: string[]; err: string[] };

async function run(
  command: Parameters<typeof runCommand>[0],
  args: string[],
  env: Record<string, string> = {},
  options: RunOptions = {},
): Promise<Result> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCommand(command, args, {
    stdout: (line) => void out.push(line),
    stderr: (line) => void err.push(line),
    env: (name) => env[name],
    ...options,
  });
  return { code, out, err };
}

const serve = defineCommand({
  name: "serve",
  version: "2.0.0",
  description: "Start the server",
  options: {
    port: { type: "string", alias: "p", default: "8000", env: "PORT" },
    config: { type: "string", required: true, env: "CONFIG" },
    dryRun: { type: "boolean", alias: "d", env: "DRY_RUN" },
    name: { type: "string" },
  },
  args: [{ name: "dir", required: true }, { name: "more", variadic: true }],
  run({ flags, args, rest, stdout }) {
    stdout(JSON.stringify({ flags, args, rest }));
  },
});

const cli = defineCommand({
  name: "tool",
  version: "1.2.3",
  description: "A tool",
  commands: [
    serve,
    defineCommand({
      name: "group",
      commands: [defineCommand({
        name: "leaf",
        run: ({ stdout }) => stdout("leaf"),
      })],
    }),
    defineCommand({ name: "code", run: () => 7 }),
    defineCommand({ name: "async", run: async () => {}, options: {} }),
    defineCommand({ name: "empty" }),
  ],
});

const parsed = (result: Result) => JSON.parse(result.out[0]!);

Deno.test("runCommand runs commands and subcommands", async (t) => {
  await t.step("runs the root command", async () => {
    const result = await run(
      defineCommand({ name: "x", run: ({ stdout }) => stdout("hi") }),
      [],
    );
    assertEquals(result, { code: 0, out: ["hi"], err: [] });
  });

  await t.step("runs a subcommand", async () => {
    assertEquals((await run(cli, ["group", "leaf"])).out, ["leaf"]);
  });

  await t.step("uses the returned exit code", async () => {
    assertEquals((await run(cli, ["code"])).code, 7);
    assertEquals((await run(cli, ["async"])).code, 0);
  });

  await t.step("passes the context", async () => {
    const result = await run(cli, [
      "serve",
      "dir",
      "--config=c",
      "-d",
      "a",
      "b",
      "--",
      "--x",
      "y",
    ]);
    assertEquals(result.code, 0);
    assertEquals(parsed(result), {
      flags: { port: "8000", config: "c", dryRun: true },
      args: { dir: "dir", more: ["a", "b"] },
      rest: ["--x", "y"],
    });
  });

  await t.step("uses console by default", async () => {
    const original = console.log;
    const lines: unknown[] = [];
    console.log = (line: unknown) => lines.push(line);
    try {
      assertEquals(await runCommand(cli, ["--version"]), 0);
    } finally {
      console.log = original;
    }
    assertEquals(lines, ["tool 1.2.3"]);
  });
});

Deno.test("runCommand flags", async (t) => {
  const base = ["serve", "d", "--config", "c"];

  await t.step("passed, then env, then default", async () => {
    const env = { PORT: "1", CONFIG: "e" };
    assertEquals(
      parsed(await run(cli, [...base, "--port", "2"], env)).flags.port,
      "2",
    );
    assertEquals(parsed(await run(cli, base, env)).flags.port, "1");
    assertEquals(parsed(await run(cli, base)).flags.port, "8000");
  });

  await t.step("aliases and kebab case", async () => {
    assertEquals(parsed(await run(cli, [...base, "-p", "3"])).flags.port, "3");
    assertEquals(
      parsed(await run(cli, [...base, "--dry-run"])).flags.dryRun,
      true,
    );
  });

  await t.step("optional string is undefined", async () => {
    assertEquals("name" in parsed(await run(cli, base)).flags, false);
    assertEquals(
      parsed(await run(cli, [...base, "--name", "n"])).flags.name,
      "n",
    );
  });

  await t.step(
    "a passed value wins over the env, even when empty",
    async () => {
      const result = await run(cli, [...base, "--port="], { PORT: "1" });
      assertEquals(parsed(result).flags.port, "");
    },
  );

  await t.step("an empty variable is not set", async () => {
    assertEquals(parsed(await run(cli, base, { PORT: "" })).flags.port, "8000");
    assertEquals(
      (await run(cli, ["serve", "d"], { CONFIG: "" })).code,
      2,
    );
  });

  await t.step("required is satisfied by the env", async () => {
    const result = await run(cli, ["serve", "d"], { CONFIG: "fromEnv" });
    assertEquals(parsed(result).flags.config, "fromEnv");
  });

  await t.step("boolean env values", async () => {
    for (const value of ["1", "true", "YES", "on"]) {
      assertEquals(
        parsed(await run(cli, base, { DRY_RUN: value })).flags.dryRun,
        true,
      );
    }
    for (const value of ["0", "False", "no", "off"]) {
      assertEquals(
        parsed(await run(cli, base, { DRY_RUN: value })).flags.dryRun,
        false,
      );
    }
  });

  await t.step("a passed boolean wins over the env", async () => {
    const result = await run(cli, [...base, "--dry-run=false"], {
      DRY_RUN: "1",
    });
    assertEquals(parsed(result).flags.dryRun, false);
  });

  await t.step("a boolean defaults to false, or its default", async () => {
    assertEquals(parsed(await run(cli, base)).flags.dryRun, false);
    const withDefault = defineCommand({
      name: "x",
      options: { on: { type: "boolean", default: true } },
      run: ({ flags, stdout }) => stdout(String(flags.on)),
    });
    assertEquals((await run(withDefault, [])).out, ["true"]);
    assertEquals((await run(withDefault, ["--on=false"])).out, ["false"]);
  });
});

Deno.test("runCommand usage errors", async (t) => {
  const expectUsage = async (
    args: string[],
    message: string,
    env: Record<string, string> = {},
    hint = "Run 'tool serve --help' for usage.",
  ) => {
    const result = await run(cli, args, env);
    assertEquals(result.code, 2);
    assertEquals(result.out, []);
    assertEquals(result.err, [`Error: ${message}`, hint]);
  };

  await t.step(
    "unknown command",
    () =>
      expectUsage(
        ["unrelated"],
        "Unknown command 'unrelated'",
        {},
        "Run 'tool --help' for usage.",
      ),
  );
  await t.step(
    "unknown nested command",
    () =>
      expectUsage(
        ["group", "unrelated"],
        "Unknown command 'unrelated'",
        {},
        "Run 'tool group --help' for usage.",
      ),
  );
  await t.step(
    "missing command",
    () =>
      expectUsage(
        ["group"],
        "Missing command",
        {},
        "Run 'tool group --help' for usage.",
      ),
  );
  await t.step(
    "command without run",
    () =>
      expectUsage(
        ["empty"],
        "Command 'empty' cannot be run",
        {},
        "Run 'tool empty --help' for usage.",
      ),
  );
  await t.step(
    "missing required option",
    () =>
      expectUsage(
        ["serve", "d"],
        "Missing required option --config (or environment variable CONFIG)",
      ),
  );
  await t.step("missing required option without env", async () => {
    const command = defineCommand({
      name: "x",
      options: { token: { type: "string", required: true } },
      run: () => {},
    });
    const result = await run(command, []);
    assertEquals(result.err[0], "Error: Missing required option --token");
  });
  await t.step(
    "missing argument",
    () =>
      expectUsage(
        ["serve", "--config", "c"],
        "Missing required argument <dir>",
      ),
  );
  await t.step("missing variadic argument", async () => {
    const command = defineCommand({
      name: "x",
      args: [{ name: "files", required: true, variadic: true }],
      run: () => {},
    });
    assertEquals(
      (await run(command, [])).err[0],
      "Error: Missing required argument <files>",
    );
    assertEquals((await run(command, ["a"])).code, 0);
  });
  await t.step(
    "unknown option",
    () =>
      expectUsage(
        ["serve", "d", "--config", "c", "--zzzzzz=1", "-z"],
        "Unknown options: --zzzzzz, -z",
      ),
  );
  await t.step(
    "one unknown option",
    () =>
      expectUsage(
        ["serve", "d", "--config", "c", "--zzzzzz"],
        "Unknown option: --zzzzzz",
      ),
  );
  await t.step("unexpected argument", async () => {
    const command = defineCommand({
      name: "x",
      args: [{ name: "one" }],
      run: () => {},
    });
    const result = await run(command, ["a", "b"]);
    assertEquals(result.err[0], "Error: Unexpected argument 'b'");
    assertEquals(
      (await run(defineCommand({ name: "x", run: () => {} }), ["a"])).code,
      2,
    );
  });
  await t.step("invalid boolean env", () =>
    expectUsage(
      ["serve", "d", "--config", "c"],
      "Environment variable DRY_RUN is 'maybe', expected one of 1, true, yes, on, 0, false, no, off",
      { DRY_RUN: "maybe" },
    ));
  await t.step("the exit code can be changed", async () => {
    const result = await run(cli, ["unrelated"], {}, { usageExitCode: 1 });
    assertEquals(result.code, 1);
    assertEquals(result.err[0], "Error: Unknown command 'unrelated'");
    assertEquals((await run(cli, ["unrelated"])).code, 2);
  });
  await t.step("a usage error thrown by the command", async () => {
    const command = defineCommand({
      name: "x",
      run: () => {
        throw new UsageError("bad input");
      },
    });
    const result = await run(command, []);
    assertEquals(result.code, 2);
    assertEquals(result.err[0], "Error: bad input");
  });
  await t.step("other errors are not caught", async () => {
    const command = defineCommand({
      name: "x",
      run: () => {
        throw new Error("boom");
      },
    });
    let message = "";
    await run(command, []).catch((e) => message = e.message);
    assertEquals(message, "boom");
  });
});

Deno.test("runCommand suggestions", async (t) => {
  await t.step("a command", async () => {
    const result = await run(cli, ["serv"]);
    assertEquals(
      result.err[0],
      "Error: Unknown command 'serv'. Did you mean 'serve'?",
    );
    assertEquals(result.code, 2);
  });

  await t.step("is not case sensitive", async () => {
    assertEquals(
      (await run(cli, ["SERVE2"])).err[0],
      "Error: Unknown command 'SERVE2'. Did you mean 'serve'?",
    );
  });

  await t.step("no suggestion when nothing is near", async () => {
    assertEquals(
      (await run(cli, ["unrelated"])).err[0],
      "Error: Unknown command 'unrelated'",
    );
  });

  await t.step("an option", async () => {
    const result = await run(cli, [
      "serve",
      "d",
      "--config",
      "c",
      "--prot",
      "1",
    ]);
    assertEquals(
      result.err[0],
      "Error: Unknown option: --prot (did you mean --port?)",
    );
  });

  await t.step("a kebab case option, and several unknown", async () => {
    const result = await run(cli, [
      "serve",
      "d",
      "--config",
      "c",
      "--dryrun",
      "--zzzzzz",
      "-x",
    ]);
    assertEquals(
      result.err[0],
      "Error: Unknown options: --dryrun (did you mean --dry-run?), --zzzzzz, -x",
    );
  });

  await t.step("--help is suggested too", async () => {
    const result = await run(cli, ["serve", "--hepl"]);
    assertEquals(
      result.err[0],
      "Error: Unknown option: --hepl (did you mean --help?)",
    );
  });

  await t.step("a command without options", async () => {
    const result = await run(defineCommand({ name: "x", run: () => {} }), [
      "--nope",
    ]);
    assertEquals(result.err[0], "Error: Unknown option: --nope");
  });

  await t.step("can be turned off", async () => {
    assertEquals(
      (await run(cli, ["serv"], {}, { suggest: false })).err[0],
      "Error: Unknown command 'serv'",
    );
    const result = await run(
      cli,
      ["serve", "d", "--config", "c", "--prot"],
      {},
      { suggest: false },
    );
    assertEquals(result.err[0], "Error: Unknown option: --prot");
  });

  await t.step("the distance can be changed", async () => {
    // `serv` is one edit from `serve`.
    assertEquals(
      (await run(cli, ["serv"], {}, { suggest: { maxDistance: 0 } })).err[0],
      "Error: Unknown command 'serv'",
    );
    // `srv` is two edits from `serve`.
    assertEquals(
      (await run(cli, ["srv"], {}, { suggest: { maxDistance: 1 } })).err[0],
      "Error: Unknown command 'srv'",
    );
    assertEquals(
      (await run(cli, ["srv"], {}, { suggest: { maxDistance: 2 } })).err[0],
      "Error: Unknown command 'srv'. Did you mean 'serve'?",
    );
    assertEquals(
      (await run(cli, ["sr"], {}, { suggest: { maxDistance: 3 } })).err[0],
      "Error: Unknown command 'sr'. Did you mean 'serve'?",
    );
    assertEquals(
      (await run(cli, ["serv"], {}, { suggest: true })).err[0],
      "Error: Unknown command 'serv'. Did you mean 'serve'?",
    );
  });
});

Deno.test("runCommand help and version", async (t) => {
  await t.step("--help and -h", async () => {
    for (
      const args of [["--help"], ["-h"], ["serve", "--help"], ["group", "-h"]]
    ) {
      const result = await run(cli, args);
      assertEquals(result.code, 0);
      assertEquals(result.err, []);
      assertEquals(result.out.length, 1);
    }
  });

  await t.step("help is for the resolved command", async () => {
    const result = await run(cli, ["serve", "--help"]);
    assertEquals(result.out[0]!.includes("Usage: tool serve"), true);
    // Required flags and arguments do not need to be given.
    assertEquals(result.code, 0);
  });

  await t.step("a flag after -- is not help", async () => {
    const command = defineCommand({
      name: "x",
      run: ({ rest, stdout }) => stdout(rest.join(",")),
    });
    assertEquals((await run(command, ["--", "--help"])).out, ["--help"]);
  });

  await t.step("a custom help renderer", async () => {
    const result = await run(cli, ["serve", "-h"], {}, {
      help: (path) => path.map((c) => c.name).join("/"),
    });
    assertEquals(result.out, ["tool/serve"]);
  });

  await t.step("--version and -V", async () => {
    assertEquals((await run(cli, ["--version"])).out, ["tool 1.2.3"]);
    assertEquals((await run(cli, ["-V"])).out, ["tool 1.2.3"]);
    const noVersion = defineCommand({ name: "x", run: () => {} });
    assertEquals((await run(noVersion, ["--version"])).code, 2);
  });

  await t.step("a subcommand version includes its parents", async () => {
    const result = await run(cli, ["serve", "--version"]);
    assertEquals(result.code, 0);
    assertEquals(result.out, ["tool 1.2.3", "tool serve 2.0.0"]);
    assertEquals((await run(cli, ["serve", "-V"])).out, result.out);
  });

  await t.step("the output is written with only the line", async () => {
    const calls: unknown[][] = [];
    await runCommand(cli, ["serve", "-V"], {
      stdout: (...args: unknown[]) => void calls.push(args),
    });
    assertEquals(calls, [["tool 1.2.3"], ["tool serve 2.0.0"]]);
  });

  await t.step("a subcommand without a version shows its parents", async () => {
    assertEquals((await run(cli, ["group", "leaf", "-V"])).out, ["tool 1.2.3"]);
  });

  await t.step("only the versions that are set are shown", async () => {
    const leaf = defineCommand({
      name: "leaf",
      version: "0.1.0",
      run: () => {},
    });
    const middle = defineCommand({ name: "mid", commands: [leaf] });
    const root = defineCommand({ name: "root", commands: [middle] });
    assertEquals((await run(root, ["mid", "leaf", "--version"])).out, [
      "root mid leaf 0.1.0",
    ]);
    // No command in the path has a version.
    assertEquals((await run(root, ["mid", "--version"])).code, 2);
  });

  await t.step("help shows the version of the command", async () => {
    assertEquals(
      (await run(cli, ["--help"])).out[0]!.startsWith("tool 1.2.3 - A tool"),
      true,
    );
    const sub = (await run(cli, ["serve", "--help"])).out[0]!;
    assertEquals(sub.startsWith("tool serve 2.0.0 - Start the server"), true);
    assertEquals(sub.includes("--version"), true);
    // A command without a version in its path has no version flag.
    const noVersion = defineCommand({ name: "x", run: () => {} });
    assertEquals(
      (await run(noVersion, ["--help"])).out[0]!.includes("--version"),
      false,
    );
  });
});

Deno.test("runCommand helpOnEmpty", async (t) => {
  const ran: string[] = [];
  const tool = defineCommand({
    name: "tool",
    helpOnEmpty: true,
    options: { name: { type: "string", required: true } },
    args: [{ name: "file", required: true }],
    run: ({ stdout }) => {
      ran.push("tool");
      stdout("ran");
    },
  });

  await t.step("shows the help without arguments", async () => {
    const result = await run(tool, []);
    assertEquals(result.code, 0);
    assertEquals(result.err, []);
    assertEquals(result.out.length, 1);
    assertEquals(result.out[0]!.startsWith("Usage: tool"), true);
    assertEquals(ran, []);
  });

  await t.step("uses the help renderer", async () => {
    const result = await run(tool, [], {}, { help: () => "custom" });
    assertEquals(result.out, ["custom"]);
  });

  await t.step("runs, and checks, when something is provided", async () => {
    assertEquals((await run(tool, ["--name", "n", "f"])).out, ["ran"]);
    assertEquals((await run(tool, ["f"])).code, 2);
    assertEquals((await run(tool, ["--name", "n"])).code, 2);
    assertEquals((await run(tool, ["--"])).code, 2);
  });

  await t.step("applies to the command that is called", async () => {
    const group = defineCommand({
      name: "group",
      helpOnEmpty: true,
      commands: [
        defineCommand({
          name: "leaf",
          args: [{ name: "file", required: true }],
          run: () => {},
        }),
        tool,
      ],
    });
    const root = defineCommand({ name: "root", commands: [group] });

    const help = await run(root, ["group"]);
    assertEquals([help.code, help.out[0]!.startsWith("Usage: root group")], [
      0,
      true,
    ]);
    // Without the option, a command fails on what is missing.
    assertEquals((await run(root, [])).err[0], "Error: Missing command");
    assertEquals(
      (await run(root, ["group", "leaf"])).err[0],
      "Error: Missing required argument <file>",
    );
    // `tool` has the option, and shows its own help.
    assertEquals(
      (await run(root, ["group", "tool"])).out[0]!.startsWith(
        "Usage: root group tool",
      ),
      true,
    );
  });

  await t.step("is off by default", async () => {
    const plain = defineCommand({
      name: "plain",
      args: [{ name: "file", required: true }],
      run: () => {},
    });
    assertEquals((await run(plain, [])).code, 2);
    const noArguments = defineCommand({
      name: "x",
      run: ({ stdout }) => stdout("ran"),
    });
    assertEquals((await run(noArguments, [])).out, ["ran"]);
  });
});

Deno.test("runCommand reads the environment", async (t) => {
  const command = defineCommand({
    name: "x",
    options: { v: { type: "string", env: "STDX_CLI_TEST_VAR" } },
    run: ({ flags, stdout }) => stdout(String(flags.v)),
  });

  await t.step("from the process", async () => {
    const out: string[] = [];
    Deno.env.set("STDX_CLI_TEST_VAR", "from-process");
    try {
      await runCommand(command, [], { stdout: (line) => out.push(line) });
    } finally {
      Deno.env.delete("STDX_CLI_TEST_VAR");
    }
    assertEquals(out, ["from-process"]);
  });

  await t.step("a variable that is not readable is not set", async () => {
    const script = `
      import { defineCommand, runCommand } from "${
      import.meta.resolve("./command.ts")
    }";
      const command = defineCommand({
        name: "x",
        options: { v: { type: "string", env: "STDX_CLI_TEST_VAR" } },
        run: ({ flags, stdout }) => stdout(String(flags.v)),
      });
      Deno.exit(await runCommand(command, []));
    `;
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["eval", "--no-prompt", "--deny-env", script],
      cwd: new URL("../", import.meta.url),
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(new TextDecoder().decode(output.stderr), "");
    assertEquals(new TextDecoder().decode(output.stdout), "undefined\n");
  });
});
