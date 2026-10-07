/**
 * Declarative command definitions with typed flags, arguments and context.
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { closestString } from "@std/text/closest-string";
import { levenshteinDistance } from "@std/text/levenshtein-distance";
import { toKebabCase } from "@std/text/to-kebab-case";

/** Shared properties of all flags */
export type FlagBase = {
  /** Description shown in the help */
  description?: string;
  /** Single character alias, used as `-p` */
  alias?: string;
  /**
   * Name of an environment variable to read the value from when the flag is not
   * passed. An empty variable counts as not set.
   */
  env?: string;
  /** Examples of the flag's value, shown with the description in the help */
  examples?: readonly string[];
  /**
   * Accepts the flag on all subcommands of the command, before and after
   * their names, and shows it in their help with a `(global)` note
   */
  global?: boolean;
};

/** A flag that takes a value */
export type StringFlag = FlagBase & {
  type: "string";
  /** Value used when the flag, and the environment variable, is not set */
  default?: string;
  /** Fail when the flag, the environment variable and default are all unset */
  required?: boolean;
};

/**
 * A flag that is a switch, which is `false` unless it is passed, or set by
 * the environment variable. The variable accepts `1`, `true`, `yes` and `on`,
 * and `0`, `false`, `no` and `off`.
 */
export type BooleanFlag = FlagBase & {
  type: "boolean";
  /** Value used when the flag, and the environment variable, is not set */
  default?: boolean;
};

/** A flag, which is passed as `--name`. A camelCase name is `--camel-case`. */
export type Flag = StringFlag | BooleanFlag;

/** The flags of a command, by name */
export type Flags = Record<string, Flag>;

/** A positional argument */
export type Argument = {
  /** Name of the argument, which is also its key in the context */
  name: string;
  /** Description shown in the help */
  description?: string;
  /** Fail when the argument is missing */
  required?: boolean;
  /** Collect all remaining arguments, which is only possible for the last one */
  variadic?: boolean;
  /** Examples of the argument's value, shown with the description in the help */
  examples?: readonly string[];
};

/**
 * The value a flag is parsed to: a `boolean` for a switch, a `string` when
 * it is `required` or has a `default`, and `string | undefined` otherwise.
 */
export type FlagValue<TFlag> = TFlag extends { type: "boolean" } ? boolean
  : TFlag extends { default: string } | { required: true } ? string
  : string | undefined;

/** The type of the parsed flags of a command */
export type FlagValues<TFlags extends Flags> = {
  [TName in keyof TFlags]: FlagValue<TFlags[TName]>;
};

/**
 * The value an argument is parsed to: a `string` array when it is
 * `variadic`, a `string` when it is `required`, and `string | undefined`
 * otherwise.
 */
export type ArgumentValue<TArgument> = TArgument extends { variadic: true }
  ? string[]
  : TArgument extends { required: true } ? string
  : string | undefined;

/** The type of the parsed positional arguments of a command */
export type Arguments<TArguments extends ReadonlyArray<Argument>> = {
  [TArg in TArguments[number] as TArg["name"]]: ArgumentValue<TArg>;
};

/**
 * What a command is run with
 *
 * The types of the run function can be used anywhere else with
 * {@linkcode defineFlags} and {@linkcode defineArguments}, and in the module
 * of the run function itself, which is imported by the module of the command.
 *
 * @example
 * ```ts
 * import {
 *   defineArguments,
 *   defineCommand,
 *   defineFlags,
 *   type Context,
 * } from "@stdx/cli/command";
 *
 * export const serveFlags = defineFlags({
 *   port: { type: "string", default: "8000" },
 *   verbose: { type: "boolean" },
 * });
 * export const serveArgs = defineArguments([{ name: "dir", required: true }]);
 *
 * // The context of the run function, typed from the flags and arguments, for
 * // use in the module of the run function
 * type ServeContext = Context<typeof serveFlags, typeof serveArgs>;
 *
 * export const serve = defineCommand({
 *   name: "serve",
 *   flags: serveFlags,
 *   args: serveArgs,
 *   run: (context: ServeContext) => context.flags.port === "8000" ? 0 : 1,
 * });
 * ```
 */
export type Context<
  TFlags extends Flags = Flags,
  TArguments extends ReadonlyArray<Argument> = ReadonlyArray<Argument>,
> = {
  /** The parsed flags */
  flags: FlagValues<TFlags>;
  /** The parsed positional arguments, by name */
  args: Arguments<TArguments>;
  /** The arguments after `--`, which are not parsed */
  rest: string[];
  /** Writes a line to the output, instead of the console, so it can be tested */
  stdout: (text: string) => void;
  /** Writes a line to the error output */
  stderr: (text: string) => void;
};

/**
 * The examples of the flags and arguments of a command, which the examples
 * function of a command receives. It mirrors the context of `run`: the
 * `flags` hold the examples of each flag, by name, and the `args` are an
 * array of objects with their name and examples.
 */
export type ExampleSource<TFlags extends Flags = Flags> = {
  /** The examples of each flag, by name */
  flags: { [TName in keyof TFlags]: readonly string[] };
  /** The examples of each argument, in order */
  args: ReadonlyArray<{ name: string; examples: readonly string[] }>;
};

/**
 * The examples of a command, shown at the bottom of the help. An array is
 * shown as is, and a function derives the examples from those of the
 * command's flags and arguments, so shared definitions can be composed
 * and filtered. The examples are trimmed, and duplicates are removed.
 */
export type CommandExamples<TFlags extends Flags = Flags> =
  | readonly string[]
  | ((
    examples: ExampleSource<TFlags>,
  ) => readonly string[]);

/** The definition of a command, see {@linkcode defineCommand} */
export type CommandDefinition<
  TFlags extends Flags,
  TArguments extends ReadonlyArray<Argument>,
> = {
  /** Name of the command, which is how it is called */
  name: string;
  /** Description shown in the help */
  description?: string;
  /**
   * Examples shown at the bottom of the help. A function receives the
   * examples of each flag, by name, and of the arguments, like the
   * context of `run`, so shared definitions can be composed and filtered.
   */
  examples?: CommandExamples<TFlags>;
  /**
   * Version, which enables `--version` for the command and its subcommands.
   * It prints the versions of the parent commands too, when they have one.
   */
  version?: string;
  /** The flags of the command */
  flags?: TFlags;
  /** The positional arguments of the command */
  args?: TArguments;
  /**
   * Shows the help, and succeeds, when the command is called without any
   * arguments or flags, instead of running it or failing on what is missing.
   * A command with subcommands fails with `Missing command` otherwise.
   */
  helpOnEmpty?: boolean;
  /** The subcommands, which are chosen by the first argument */
  commands?: ReadonlyArray<AnyCommand>;
  /**
   * Runs the command. It can return an exit code, which is `0` by default.
   * A command with subcommands does not need one.
   */
  run?: (
    context: Context<TFlags, TArguments>,
  ) => void | number | Promise<void | number>;
};

/**
 * A command, made with {@linkcode defineCommand}
 *
 * The `flags` and `args` are typed as present on the command when they are
 * given in the definition, and as optional otherwise.
 */
export type Command<
  TFlags extends Flags = Flags,
  TArguments extends ReadonlyArray<Argument> = ReadonlyArray<Argument>,
> = Readonly<
  & CommandDefinition<TFlags, TArguments>
  & ((keyof TFlags) extends never ? unknown : { flags: TFlags })
  & (TArguments extends readonly [] ? unknown : { args: TArguments })
>;

/** A command with any flags and arguments, e.g. to list subcommands */
// deno-lint-ignore no-explicit-any
export type AnyCommand = Readonly<CommandDefinition<any, any>>;

/**
 * The context of the run function of a command, inferred from the command
 *
 * The type cannot be used in the module of the command, or in the module of
 * its run function: the command is inferred using the run function, which
 * makes the reference circular. Define the flags with
 * {@linkcode defineFlags} and the arguments with
 * {@linkcode defineArguments} there, and use this type anywhere else, e.g. in
 * a test.
 *
 * @example
 * ```ts
 * import { defineCommand, type CommandContext } from "@stdx/cli/command";
 *
 * const cli = defineCommand({
 *   name: "greet",
 *   flags: { name: { type: "string", default: "world" } },
 *   run: (context) => context.flags.name.length,
 * });
 *
 * // The context of the run function, typed like in the run function
 * type GreetContext = CommandContext<typeof cli>;
 * const greet = (context: GreetContext) => context.flags.name;
 * ```
 */
export type CommandContext<TCommand extends AnyCommand> =
  NonNullable<TCommand["run"]> extends (
    context: infer TContext,
  ) => unknown ? TContext
    : never;

/**
 * Defines a command, and checks the definition.
 *
 * The flags and arguments in the context of `run` are typed from the
 * definition: a string flag is a `string` when it is `required` or has a
 * `default`, and `string | undefined` otherwise.
 *
 * @param definition the {@linkcode CommandDefinition} of the command
 * @returns the command, to run with `runCommand`
 * @throws {TypeError} when the definition is invalid, e.g. when an alias is
 * used twice, or an optional argument is followed by a required one
 *
 * @example
 * ```ts
 * import { defineCommand } from "@stdx/cli/command";
 * import { assertEquals } from "@std/assert";
 *
 * const serve = defineCommand({
 *   name: "serve",
 *   flags: {
 *     port: { type: "string", alias: "p", default: "8000", env: "PORT" },
 *     verbose: { type: "boolean" },
 *   },
 *   args: [{ name: "dir", required: true }],
 *   run({ flags, args }) {
 *     const port: string = flags.port;
 *     const verbose: boolean = flags.verbose;
 *     const dir: string = args.dir;
 *     console.log(port, verbose, dir);
 *   },
 * });
 *
 * assertEquals(serve.name, "serve");
 * ```
 */
export function defineCommand<
  const TFlags extends Flags = Record<never, never>,
  const TArguments extends ReadonlyArray<Argument> = readonly [],
>(
  definition: CommandDefinition<TFlags, TArguments>,
): Command<TFlags, TArguments> {
  const { name, args = [], commands = [] } = definition;

  if (!name || /\s/.test(name) || name.startsWith("-")) {
    throw new TypeError(`Invalid command name '${name}'`);
  }

  const taken = new Set([HELP.long, HELP.short, VERSION.long, VERSION.short]);
  const claim = (flag: string, flagName: string) => {
    if (taken.has(flag)) {
      throw new TypeError(
        `Command '${name}' uses '${flag}' for '${flagName}' more than once, or it is reserved`,
      );
    }
    taken.add(flag);
  };
  for (const [flagName, { alias }] of flagsOf(definition)) {
    claim(toKebabCase(flagName), flagName);
    if (alias !== undefined) {
      if (alias.length !== 1) {
        throw new TypeError(
          `Alias '${alias}' of '${flagName}' is not one character`,
        );
      }
      claim(alias, flagName);
    }
  }

  if (commands.length > 0 && args.length > 0) {
    throw new TypeError(`Command '${name}' has both subcommands and arguments`);
  }
  const names = new Set<string>();
  for (const command of commands) {
    if (names.has(command.name)) {
      throw new TypeError(`Command '${name}' has '${command.name}' twice`);
    }
    names.add(command.name);
  }

  args.forEach((argument, index) => {
    if (argument.variadic && index !== args.length - 1) {
      throw new TypeError(`Variadic argument '${argument.name}' is not last`);
    }
    if (argument.required && args.slice(0, index).some((a) => !a.required)) {
      throw new TypeError(
        `Required argument '${argument.name}' follows an optional argument`,
      );
    }
  });

  // The `flags` and `args` of the definition are the ones `TFlags` and
  // `TArguments` are inferred from, so the presence-preserving conditional
  // parts of `Command` hold, but the deferred conditionals cannot be proven
  // inside this function body.
  return definition as Command<TFlags, TArguments>;
}

/**
 * Defines the flags of a command, for when they are defined separately, so
 * that their types can be imported by the module of the run function, or
 * shared between commands.
 *
 * @param flags the flags of a command
 * @returns the flags, unchanged
 *
 * @example
 * ```ts
 * import { defineFlags } from "@stdx/cli/command";
 * import { assertEquals } from "@std/assert";
 *
 * export const serveFlags = defineFlags({
 *   port: { type: "string", default: "8000" },
 *   verbose: { type: "boolean" },
 * });
 *
 * assertEquals(serveFlags.port.default, "8000");
 * ```
 */
export function defineFlags<const TFlags extends Flags>(flags: TFlags): TFlags {
  return flags;
}

/**
 * Defines the arguments of a command, for when they are defined separately,
 * so that their types can be imported by the module of the run function, or
 * shared between commands.
 *
 * @param args the arguments of a command
 * @returns the arguments, unchanged
 *
 * @example
 * ```ts
 * import { defineArguments } from "@stdx/cli/command";
 * import { assertEquals } from "@std/assert";
 *
 * export const serveArgs = defineArguments([
 *   { name: "dir", required: true },
 *   { name: "extra" },
 * ]);
 *
 * assertEquals(serveArgs[0]!.name, "dir");
 * ```
 */
export function defineArguments<
  const TArguments extends ReadonlyArray<Argument>,
>(args: TArguments): TArguments {
  return args;
}

// Lists the versions of the commands from the root to a command, as lines like
// `tool serve 1.0.0`. Commands without a version are left out.
function versions(path: ReadonlyArray<AnyCommand>): string[] {
  return path.flatMap((command, index) =>
    command.version
      ? [
        `${
          path.slice(0, index + 1).map((c) => c.name).join(" ")
        } ${command.version}`,
      ]
      : []
  );
}

/**
 * Renders the help of a command as plain text
 *
 * @param path the commands from the root to the command to show help for
 * @returns the help text
 *
 * @example
 * ```ts
 * import { defineCommand, renderHelp } from "@stdx/cli/command";
 * import { assert } from "@std/assert";
 *
 * const cli = defineCommand({ name: "tool", description: "Does things" });
 *
 * assert(renderHelp([cli]).includes("Usage: tool"));
 * ```
 */
export function renderHelp(path: ReadonlyArray<AnyCommand>): string {
  const command = path[path.length - 1]!;
  const names = path.map((c) => c.name).join(" ");
  const sections: string[] = [];

  const title = [
    command.version ? `${names} ${command.version}` : "",
    command.description ?? "",
  ].filter(Boolean).join(" - ");
  if (title) sections.push(title);

  const args = argsOf(command);
  const commands = command.commands ?? [];
  const usage = [
    names,
    commands.length > 0 ? "<command>" : "",
    "[flags]",
    ...args.map(({ name, required, variadic }) => {
      const label = variadic ? `${name}...` : name;
      return required ? `<${label}>` : `[${label}]`;
    }),
  ].filter(Boolean).join(" ");
  sections.push(`Usage: ${usage}`);

  if (commands.length > 0) {
    sections.push(
      `Commands:\n${table(commands.map((c) => [c.name, c.description ?? ""]))}`,
    );
  }

  if (args.length > 0) {
    sections.push(
      `Arguments:\n${
        table(args.map((a): [string, string] => [
          a.name,
          [
            a.description,
            a.examples?.length ? `e.g. ${a.examples.join(", ")}` : undefined,
          ]
            .filter(Boolean)
            .join(" "),
        ]))
      }`,
    );
  }

  const rows = flagsOf(command).map((entry): [string, string] =>
    flagRow(entry)
  );
  for (const entry of inheritedGlobals(path)) {
    rows.push(flagRow(entry, "(global)"));
  }
  rows.push([`-${HELP.short}, --${HELP.long}`, "Show this help"]);
  if (versions(path).length > 0) {
    rows.push([`-${VERSION.short}, --${VERSION.long}`, "Show the version"]);
  }
  sections.push(`Flags:\n${table(rows)}`);

  const examples = examplesOf(command);
  if (examples.length > 0) {
    sections.push(`Examples:\n${examples.map((e) => `  ${e}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

// Collects the examples of a command, from its own examples or its examples
// function, which receives the examples of each flag, by name, and of the
// arguments, like the context of `run`. The examples are trimmed, and empty
// and duplicate ones are removed.
function examplesOf(command: AnyCommand): readonly string[] {
  const source = {
    flags: Object.fromEntries(
      flagsOf(command).map(([name, { examples }]) => [name, examples ?? []]),
    ),
    args: argsOf(command).map(({ name, examples }) => ({
      name,
      examples: examples ?? [],
    })),
  };

  const own = typeof command.examples === "function"
    ? command.examples(source)
    : command.examples;

  return [...new Set((own ?? []).map((e) => e.trim()).filter((e) => e !== ""))];
}

// A row of the Flags table of the help: the flag with its alias, and its
// description, examples, default and environment variable as the notes
function flagRow(
  [name, flag]: [string, Flag],
  note?: string,
): [string, string] {
  const label = `${flag.alias ? `-${flag.alias}, ` : "    "}--${
    toKebabCase(name)
  }${flag.type === "string" ? " <value>" : ""}`;
  const notes = [
    flag.description,
    flag.examples?.length ? `e.g. ${flag.examples.join(", ")}` : undefined,
    flag.type === "string" && flag.required ? "(required)" : undefined,
    flag.default !== undefined ? `(default: ${flag.default})` : undefined,
    flag.env ? `[env: ${flag.env}]` : undefined,
    note,
  ].filter(Boolean).join(" ");
  return [label, notes];
}

// The global flags a command inherits from the commands above it, which are
// accepted when it is run, and shown in its help with a `(global)` note. A
// flag of the command is not shown again.
function inheritedGlobals(
  path: ReadonlyArray<AnyCommand>,
): Array<[string, Flag]> {
  const globals = new Map<string, Flag>();
  for (const command of path.slice(0, -1)) {
    for (const [name, flag] of flagsOf(command)) {
      if (flag.global) globals.set(name, flag);
    }
  }
  const own = new Set(flagsOf(path[path.length - 1]!).map(([name]) => name));
  return [...globals].filter(([name]) => !own.has(name));
}

/**
 * An error caused by how the command was called, e.g. an unknown flag. It is
 * reported without a stack trace, and exits with code `2` by default.
 */
export class UsageError extends Error {
  /** Creates the error with a message for the user of the command */
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Options for {@linkcode runCommand}, which default to the console and env */
export type RunOptions = {
  /** Writes a line to the output */
  stdout?: (text: string) => void;
  /** Writes a line to the error output */
  stderr?: (text: string) => void;
  /** Reads an environment variable. A variable that is not readable is unset. */
  env?: (name: string) => string | undefined;
  /**
   * Suggests the closest command or flag when one is not known, e.g.
   * `Did you mean 'serve'?`. `false` turns it off, and `maxDistance` is the
   * most edits (insertions, deletions and substitutions) that a suggestion can
   * be away from what was typed, which is `2` by default.
   */
  suggest?: boolean | { maxDistance?: number };
  /** The exit code for a usage error, which is `2` by default */
  usageExitCode?: number;
  /** Renders the help of a command, given the commands from the root to it */
  help?: (path: ReadonlyArray<AnyCommand>) => string;
};

const HELP = { long: "help", short: "h" };
const VERSION = { long: "version", short: "V" };
const DEFAULT_MAX_DISTANCE = 2;
const NOT_PASSED = Symbol("not passed");
const TRUE = ["1", "true", "yes", "on"];
const FALSE = ["0", "false", "no", "off"];

// Follows the leading arguments down the subcommands, adding them to the
// path of commands, and returns the arguments that are left, and the tokens
// of the global flags that were skipped on the way, which the command is
// parsed with. The path is given, so that it is complete for the error when
// a command is not known.
function resolveCommand(
  path: AnyCommand[],
  args: readonly string[],
  suggest: (input: string, candidates: string[]) => string | undefined,
): { tokens: string[]; skipped: string[] } {
  let tokens = [...args];
  const skipped: string[] = [];
  for (;;) {
    const current = path[path.length - 1]!;
    if (!current.commands?.length || tokens[0] === undefined) break;

    const skip = skipGlobal(path, tokens);
    if (skip > 0) {
      skipped.push(...tokens.slice(0, skip));
      tokens = tokens.slice(skip);
      continue;
    }

    const name = tokens[0]!;
    if (name === "--" || name.startsWith("-")) break;
    const next = current.commands.find((c) => c.name === name);
    if (!next) {
      const match = suggest(name, current.commands.map((c) => c.name));
      throw new UsageError(
        `Unknown command '${name}'${match ? `. Did you mean '${match}'?` : ""}`,
      );
    }
    path.push(next);
    tokens = tokens.slice(1);
  }
  return { tokens, skipped };
}

// The global flags of the commands on a path, by long name and by alias
function globalFlagsOf(path: ReadonlyArray<AnyCommand>): Map<string, Flag> {
  const globals = new Map<string, Flag>();
  for (const command of path) {
    for (const [name, flag] of flagsOf(command)) {
      if (flag.global) {
        globals.set(toKebabCase(name), flag);
        if (flag.alias) globals.set(flag.alias, flag);
      }
    }
  }
  return globals;
}

// The number of tokens the global flag at the start of the tokens takes: the
// next one too, when it is a string flag that takes its value there, and
// `0` when the first token is not a global flag. Bundles of aliases are only
// skipped when every one is a global boolean flag, so that no value is
// swallowed.
function skipGlobal(
  path: ReadonlyArray<AnyCommand>,
  tokens: readonly string[],
): number {
  const token = tokens[0];
  if (token === undefined || token === "--" || !token.startsWith("-")) {
    return 0;
  }
  const globals = globalFlagsOf(path);

  if (token.startsWith("--")) {
    const flag = globals.get(token.slice(2).split("=")[0]!);
    if (!flag) return 0;
    return token.includes("=") || flag.type === "boolean" ? 1 : 2;
  }

  const aliases = token.slice(1).split("");
  if (aliases.length === 0) return 0;
  const first = globals.get(aliases[0]!);
  if (!first) return 0;
  if (aliases.length === 1) return first.type === "string" ? 2 : 1;
  return aliases.every((alias) => globals.get(alias)?.type === "boolean")
    ? 1
    : 0;
}

function hasFlag(
  tokens: string[],
  { long, short }: { long: string; short: string },
): boolean {
  return tokens.some((token) => token === `--${long}` || token === `-${short}`);
}

function flagsOf(command: { flags?: Flags }): Array<[string, Flag]> {
  return Object.entries((command.flags ?? {}) as Flags);
}

function argsOf(
  command: { args?: ReadonlyArray<Argument> },
): ReadonlyArray<Argument> {
  return (command.args ?? []) as ReadonlyArray<Argument>;
}

// The flags a command is run with: its own, and the global flags it
// inherits from the commands above it. A flag of the command wins on a
// name conflict.
function mergedFlagsOf(path: ReadonlyArray<AnyCommand>): Flags {
  const merged: Flags = {};
  for (const command of path) {
    for (const [name, flag] of flagsOf(command)) {
      if (flag.global || command === path[path.length - 1]) {
        merged[name] = flag;
      }
    }
  }
  return merged;
}

function parse(
  path: ReadonlyArray<AnyCommand>,
  tokens: string[],
  env: (name: string) => string | undefined,
  suggest: (input: string, candidates: string[]) => string | undefined,
) {
  const definitions = Object.entries(mergedFlagsOf(path));
  const byType = (type: Flag["type"]) =>
    definitions.filter(([, f]) => f.type === type).map(([name]) =>
      toKebabCase(name)
    );

  const positionals: string[] = [];
  const unknownFlags: string[] = [];
  const parsed = parseArgs(tokens, {
    string: byType("string"),
    boolean: byType("boolean"),
    alias: Object.fromEntries(
      definitions.filter(([, f]) => f.alias).map((
        [name, f],
      ) => [toKebabCase(name), f.alias!]),
    ),
    // Marks the flags that are not passed, so they can fall back to the env.
    default: Object.fromEntries(
      definitions.map(([name]) => [toKebabCase(name), NOT_PASSED]),
    ),
    "--": true,
    unknown: (arg, key) => {
      if (key === undefined) positionals.push(arg);
      else unknownFlags.push(arg.split("=")[0]!);
      return false;
    },
  });
  if (unknownFlags.length > 0) {
    const names = [
      ...definitions.map(([name]) => toKebabCase(name)),
      HELP.long,
    ];
    const described = unknownFlags.map((flag) => {
      const match = flag.startsWith("--")
        ? suggest(flag.slice(2), names)
        : undefined;
      return match ? `${flag} (did you mean --${match}?)` : flag;
    });
    throw new UsageError(
      `Unknown flag${unknownFlags.length > 1 ? "s" : ""}: ${
        described.join(", ")
      }`,
    );
  }

  const flags: Record<string, unknown> = {};
  for (const [name, flag] of definitions) {
    const kebab = toKebabCase(name);
    let value = (parsed as Record<string, unknown>)[kebab];
    if (value === NOT_PASSED) {
      const fromEnv = flag.env ? env(flag.env) : undefined;
      if (fromEnv) {
        value = flag.type === "boolean"
          ? parseBoolean(fromEnv, flag.env!)
          : fromEnv;
      } else {
        value = flag.default ??
          (flag.type === "boolean" ? false : undefined);
      }
    }
    if (value === undefined && flag.type === "string" && flag.required) {
      throw new UsageError(
        `Missing required flag --${kebab}${
          flag.env ? ` (or environment variable ${flag.env})` : ""
        }`,
      );
    }
    flags[name] = value;
  }

  return { flags, positionals, rest: (parsed["--"] ?? []) as string[] };
}

function assign(
  command: AnyCommand,
  positionals: string[],
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const definitions = argsOf(command);

  definitions.forEach(({ name, required, variadic }, index) => {
    const missing = variadic
      ? positionals.length <= index
      : positionals[index] === undefined;
    if (required && missing) {
      throw new UsageError(`Missing required argument <${name}>`);
    }
    args[name] = variadic ? positionals.slice(index) : positionals[index];
  });

  const accepted = definitions.some((a) => a.variadic)
    ? Infinity
    : definitions.length;
  if (positionals.length > accepted) {
    throw new UsageError(`Unexpected argument '${positionals[accepted]}'`);
  }
  return args;
}

function closest(
  input: string,
  candidates: string[],
  maxDistance: number,
): string | undefined {
  if (candidates.length === 0) return undefined;
  const match = closestString(input, candidates);
  const distance = levenshteinDistance(
    input.toLowerCase(),
    match.toLowerCase(),
  );
  return distance <= maxDistance ? match : undefined;
}

function parseBoolean(value: string, name: string): boolean {
  const normalized = value.toLowerCase();
  if (TRUE.includes(normalized)) return true;
  if (FALSE.includes(normalized)) return false;
  throw new UsageError(
    `Environment variable ${name} is '${value}', expected one of ${
      [...TRUE, ...FALSE].join(", ")
    }`,
  );
}

function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined;
    throw error;
  }
}

function table(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) =>
    `  ${left.padEnd(width)}${right ? `  ${right}` : ""}`.trimEnd()
  ).join("\n");
}

/**
 * Runs a command with the given arguments
 *
 * The first arguments choose the subcommand, so the flags of a command come
 * after its name. A flag with `global: true` is accepted by the subcommands
 * of the command as well, before and after their names. A flag takes its
 * value from, in order, the arguments, its environment variable and its
 * default. `--help` and `-h` show the help of the command, and `--version`
 * and `-V` its version, and the versions of its parents.
 *
 * An unknown command or flag is reported with the closest known one, when it
 * is near enough, see the `suggest` option.
 *
 * Usage errors, like an unknown flag, are written to stderr with the exit code
 * `2`, or the `usageExitCode` option. Other errors thrown by the command are not
 * caught.
 *
 * The environment variable fallback of flags with an `env` name requires
 * the Deno namespace: in Node.js, pass an `env` option, or install
 * `@deno/shim-deno` and expose its `Deno` export as a global before
 * importing this module.
 *
 * @param command the root command
 * @param args the arguments, usually `Deno.args`
 * @param options the {@linkcode RunOptions}
 * @returns the exit code, which is `0` unless the command returns another
 *
 * @example
 * ```ts
 * import { defineCommand, runCommand } from "@stdx/cli/command";
 * import { assertEquals } from "@std/assert";
 *
 * const cli = defineCommand({
 *   name: "greet",
 *   flags: { name: { type: "string", env: "NAME", default: "world" } },
 *   run({ flags, stdout }) {
 *     stdout(`Hello, ${flags.name}!`);
 *   },
 * });
 *
 * const lines: string[] = [];
 * const code = await runCommand(cli, ["--name", "Deno"], {
 *   stdout: (line) => lines.push(line),
 * });
 *
 * assertEquals([code, lines], [0, ["Hello, Deno!"]]);
 * ```
 */
export async function runCommand(
  command: AnyCommand,
  args: readonly string[],
  options: RunOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const env = options.env ?? readEnv;
  const help = options.help ?? renderHelp;
  const usageExitCode = options.usageExitCode ?? 2;
  const maxDistance = options.suggest === false
    ? undefined
    : typeof options.suggest === "object"
    ? options.suggest.maxDistance ?? DEFAULT_MAX_DISTANCE
    : DEFAULT_MAX_DISTANCE;
  const suggest = (input: string, candidates: string[]) =>
    maxDistance === undefined
      ? undefined
      : closest(input, candidates, maxDistance);

  const path: AnyCommand[] = [command];
  try {
    const { tokens: resolved, skipped } = resolveCommand(path, args, suggest);
    // The global flags before the subcommand names are parsed by the
    // command that is run, together with its own
    const tokens = [...skipped, ...resolved];
    const current = path[path.length - 1]!;

    const end = tokens.indexOf("--");
    const flagTokens = end < 0 ? tokens : tokens.slice(0, end);
    if (hasFlag(flagTokens, HELP)) {
      stdout(help(path));
      return 0;
    }
    if (current.helpOnEmpty && tokens.length === 0) {
      stdout(help(path));
      return 0;
    }
    const versionLines = versions(path);
    if (versionLines.length > 0 && hasFlag(flagTokens, VERSION)) {
      for (const line of versionLines) stdout(line);
      return 0;
    }

    if (!current.run) {
      throw new UsageError(
        current.commands?.length
          ? "Missing command"
          : `Command '${current.name}' cannot be run`,
      );
    }

    const { flags, positionals, rest } = parse(path, tokens, env, suggest);
    const exitCode = await current.run({
      flags: flags as never,
      args: assign(current, positionals) as never,
      rest,
      stdout,
      stderr,
    });
    return exitCode ?? 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr(`Error: ${error.message}`);
    stderr(`Run '${path.map((c) => c.name).join(" ")} --help' for usage.`);
    return usageExitCode;
  }
}

/**
 * Runs a command and exits the process with its exit code
 *
 * Intended as the entry point of a command line application, called with
 * `Deno.args` and the root command. The process exits with `0` when the
 * command succeeds, with the exit code returned by its `run` function, and
 * with the `usageExitCode` option, `2` by default, on a usage error.
 *
 * As the exit happens immediately, in-flight asynchronous work, such as
 * writes to a piped `stdout`, is not awaited. The exit code is truncated to
 * the range 0 to 255 by the operating system, so an exit code outside it
 * wraps around.
 *
 * Requires the Deno namespace: in Node.js, install `@deno/shim-deno` and
 * expose its `Deno` export as a global before importing this module.
 *
 * @param command the root command
 * @param args the arguments, usually `Deno.args`
 * @param options the {@linkcode RunOptions}
 *
 * @example
 * ```ts ignore
 * import { defineCommand, runCommandExit } from "@stdx/cli/command";
 *
 * const cli = defineCommand({
 *   name: "greet",
 *   flags: { name: { type: "string", default: "world" } },
 *   run({ flags, stdout }) {
 *     stdout(`Hello, ${flags.name}!`);
 *   },
 * });
 *
 * // Runs the command and exits the process with its exit code
 * await runCommandExit(cli, ["--name", "Deno"]);
 * ```
 */
export async function runCommandExit(
  command: AnyCommand,
  args: readonly string[],
  options: RunOptions = {},
): Promise<never> {
  Deno.exit(await runCommand(command, args, options));
}
