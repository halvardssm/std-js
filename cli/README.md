# @stdx/cli

[![JSR](https://jsr.io/badges/@stdx/cli)](https://jsr.io/@stdx/cli)
[![JSR Score](https://jsr.io/badges/@stdx/cli/score)](https://jsr.io/@stdx/cli)
[![Weekly downloads](https://jsr.io/badges/@stdx/cli/weekly-downloads)](https://jsr.io/@stdx/cli)
[![Total downloads](https://jsr.io/badges/@stdx/cli/total-downloads)](https://jsr.io/@stdx/cli)

Extends [@std/cli](https://jsr.io/@std/cli)

The cli package contains helpers for building command line applications.

## Commands

`defineCommand` and `runCommand` build a CLI from plain objects. The flags and
arguments given to `run` are typed from the definition.

```ts ignore
import { defineCommand, runCommand } from "@stdx/cli";

const serve = defineCommand({
  name: "serve",
  version: "2.1.0",
  description: "Start the server",
  flags: {
    port: { type: "string", alias: "p", default: "8000", env: "MYTOOL_PORT" },
    config: { type: "string", required: true, env: "MYTOOL_CONFIG" },
    dryRun: { type: "boolean" },
  },
  args: [{ name: "dir", required: true }],
  run({ flags, args, rest, stdout }) {
    // flags.port: string, flags.config: string, flags.dryRun: boolean
    stdout(`Serving ${args.dir} on ${flags.port}`);
  },
});

const cli = defineCommand({
  name: "mytool",
  version: "1.0.0",
  description: "An example tool",
  commands: [serve],
});

Deno.exit(await runCommand(cli, Deno.args));
```

```
$ mytool serve ./public --config app.toml -p 3000
$ MYTOOL_PORT=3000 mytool serve ./public --config app.toml
$ mytool serve --help
$ mytool serve --version
mytool 1.0.0
mytool serve 2.1.0
```

- **Flags** are `string` or `boolean`, and are passed as `--name`, where a
  camelCase name is written `--camel-case`. An `alias` is a single character
  passed as `-p`.
- **Value order:** a flag takes its value from the arguments, then its `env`
  variable, then its `default`. An empty variable counts as not set. Boolean
  variables accept `1`, `true`, `yes` and `on`, and `0`, `false`, `no` and
  `off`.
- **Required** string flags fail when none of the three provides a value.
- **Arguments** are positional, and can be `required`, or `variadic` for the
  last one. Everything after `--` is passed as `rest`, unparsed.
- **Subcommands** are chosen by the first arguments, so the flags of a command
  come after its name.
- **Global flags:** a flag with `global: true` is accepted by the subcommands of
  the command as well, before and after their names, and is shown in their help
  with a `(global)` note. It is parsed by the subcommand that runs, whose own
  flag of the same name wins.
- **Help and version:** `--help` / `-h` show generated help for the command.
  `--version` / `-V` print the version of the command, and of its parent
  commands, one per line, e.g. `mytool 1.0.0` and `mytool serve 2.1.0`. Any
  command can have a `version`, and commands without one are left out. Replace
  the help with the `help` option of `runCommand`.
- **Help when empty:** set `helpOnEmpty: true` on a command to show its help,
  and succeed, when it is called without any arguments or flags. This takes the
  place of running the command, or failing on a missing required argument, or on
  `Missing command` for a command with subcommands.
- **Suggestions:** an unknown command or `--flag` is reported with the closest
  known one, e.g. `Unknown command 'serv'. Did you mean 'serve'?`, when it is
  within two edits. Configure it with the `suggest` option of `runCommand`:
  `false` turns it off, and `{ maxDistance: 3 }` changes the distance.
- **Errors:** a usage error, such as an unknown flag or a missing required flag,
  is written to stderr and exits with code `2`, or the `usageExitCode` option of
  `runCommand`. A command can throw `UsageError` as well. Other errors are not
  caught.
- **Examples:** flags and arguments take an `examples` array of strings, shown
  with their description in the help, and a command's `examples` are shown at
  the bottom of the help. The command's examples can also be a function, which
  receives the flags' examples under `flags`, by name, and the arguments' under
  `args`, like the context of `run`, so shared definitions can be composed and
  filtered. The final examples are trimmed and deduplicated.
- **Testing:** `runCommand` returns the exit code, and takes `stdout`, `stderr`
  and `env` options, so commands can be tested without subprocesses.

## Sharing types with the run function

For a simple CLI, everything can be written inline in `defineCommand`, and `run`
is typed from the definition. When the run function lives in another module, or
flags are shared between commands, the types have to be taken out of the
definition, in three tiers:

- In a module that is not part of the definition of the command, e.g. a test,
  the context is inferred from the command with `CommandContext`:

  ```ts
  import { type CommandContext } from "@stdx/cli/command";

  type ServeContext = CommandContext<typeof serve>;
  ```

- `defineFlags` and `defineArguments` define the flags and arguments separately,
  so they can be shared between commands, and so their types can be imported by
  the module of the run function:

  ```ts
  import {
    type Context,
    defineArguments,
    defineFlags,
  } from "@stdx/cli/command";

  export const serveFlags = defineFlags({
    port: { type: "string", default: "8000" },
    verbose: { type: "boolean" },
  });
  export const serveArgs = defineArguments([{ name: "dir", required: true }]);

  type ServeContext = Context<typeof serveFlags, typeof serveArgs>;
  const runServe = (context: ServeContext) => context.flags.port;
  ```

- The module of the command imports the run function, and the module of the run
  function imports the types back. That circular import is fine, as long as it
  is type-only, and as long as the run function is typed from the flags and
  arguments: referencing `typeof serve` there would be a circular type, because
  the command is inferred using the run function.

  ```ts
  // serve.ts
  import type { Context } from "@stdx/cli/command";
  import type { serveArgs, serveFlags } from "./cli.ts";

  type ServeContext = Context<typeof serveFlags, typeof serveArgs>;

  export const runServe = ({ flags, stdout }: ServeContext) =>
    stdout(`Serving on ${flags.port}`);
  ```

  ```ts
  // cli.ts
  import { defineCommand } from "@stdx/cli/command";
  import { runServe } from "./serve.ts";

  export const serve = defineCommand({
    name: "serve",
    flags: serveFlags,
    args: serveArgs,
    run: runServe,
  });
  ```

## parseArgs

`parseArgs` is a drop in replacement for the one in `@std/cli`, with a
`required` option: a list of flags that throws when they are not present. The
flags in `required`, and in `default`, are not `undefined` in the type of the
result.

```ts
import { parseArgs } from "@stdx/cli/parse-args";

const args = parseArgs(["--name", "foo"], {
  string: ["name"],
  required: ["name"],
});
const name: string = args.name;
```

## Node.js compatibility

`parseArgs`, `defineCommand`, `defineFlags`, `defineArguments` and `renderHelp`
are pure and run in any runtime. `runCommand` reads environment variables for
flags with an `env` name, and `runCommandExit` exits the process, through the
Deno namespace. In Node.js, either pass an `env` option to `runCommand`, or
install [`@deno/shim-deno`](https://github.com/denoland/node_shims) from npm and
expose it as a global before the module is imported:

```ts
// entry file, before importing @stdx/cli
import { Deno } from "@deno/shim-deno";

globalThis.Deno = Deno;
```
