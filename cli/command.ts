import { parseArgs } from "@std/cli/parse-args";
import { closestString } from "@std/text/closest-string";
import { levenshteinDistance } from "@std/text/levenshtein-distance";
import { toKebabCase } from "@std/text/to-kebab-case";

/** Shared properties of all options */
type OptionBase = {
  /** Description shown in the help */
  description?: string;
  /** Single character alias, used as `-p` */
  alias?: string;
  /**
   * Name of an environment variable to read the value from when the flag is not
   * passed. An empty variable counts as not set.
   */
  env?: string;
};

/** An option that takes a value */
export type StringOption = OptionBase & {
  type: "string";
  /** Value used when the flag, and the environment variable, is not set */
  default?: string;
  /** Fail when the flag, the environment variable and default are all unset */
  required?: boolean;
};

/**
 * An option that is a switch, which is `false` unless it is passed, or set by
 * the environment variable. The variable accepts `1`, `true`, `yes` and `on`,
 * and `0`, `false`, `no` and `off`.
 */
export type BooleanOption = OptionBase & {
  type: "boolean";
  /** Value used when the flag, and the environment variable, is not set */
  default?: boolean;
};

/** An option, which is passed as `--name`. A camelCase name is `--camel-case`. */
export type Option = StringOption | BooleanOption;

/** The options of a command, by name */
export type Options = Record<string, Option>;

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
};

type FlagValue<TOption> = TOption extends { type: "boolean" } ? boolean
  : TOption extends { default: string } | { required: true } ? string
  : string | undefined;

/** The type of the parsed flags of a command */
export type Flags<TOptions extends Options> = {
  [TName in keyof TOptions]: FlagValue<TOptions[TName]>;
};

type ArgumentValue<TArgument> = TArgument extends { variadic: true } ? string[]
  : TArgument extends { required: true } ? string
  : string | undefined;

/** The type of the parsed positional arguments of a command */
export type Arguments<TArguments extends ReadonlyArray<Argument>> = {
  [TArg in TArguments[number] as TArg["name"]]: ArgumentValue<TArg>;
};

/** What a command is run with */
export type Context<
  TOptions extends Options = Options,
  TArguments extends ReadonlyArray<Argument> = ReadonlyArray<Argument>,
> = {
  /** The parsed flags */
  flags: Flags<TOptions>;
  /** The parsed positional arguments, by name */
  args: Arguments<TArguments>;
  /** The arguments after `--`, which are not parsed */
  rest: string[];
  /** Writes a line to the output, instead of the console, so it can be tested */
  stdout: (text: string) => void;
  /** Writes a line to the error output */
  stderr: (text: string) => void;
};

/** The definition of a command, see {@linkcode defineCommand} */
export type CommandDefinition<
  TOptions extends Options,
  TArguments extends ReadonlyArray<Argument>,
> = {
  /** Name of the command, which is how it is called */
  name: string;
  /** Description shown in the help */
  description?: string;
  /**
   * Version, which enables `--version` for the command and its subcommands.
   * It prints the versions of the parent commands too, when they have one.
   */
  version?: string;
  /** The options of the command */
  options?: TOptions;
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
    context: Context<TOptions, TArguments>,
  ) => void | number | Promise<void | number>;
};

/** A command, made with {@linkcode defineCommand} */
export type Command<
  TOptions extends Options = Options,
  TArguments extends ReadonlyArray<Argument> = ReadonlyArray<Argument>,
> = Readonly<CommandDefinition<TOptions, TArguments>>;

/** A command with any options and arguments, e.g. to list subcommands */
// deno-lint-ignore no-explicit-any
export type AnyCommand = Command<any, any>;

/**
 * Defines a command, and checks the definition.
 *
 * The flags and arguments in the context of `run` are typed from the options
 * and arguments: a string flag is a `string` when it is `required` or has a
 * `default`, and `string | undefined` otherwise.
 *
 * @param definition the {@linkcode CommandDefinition} of the command
 * @returns the command, to run with `runCommand`
 * @throws {TypeError} when the definition is invalid, e.g. when an alias is
 * used twice, or an optional argument is followed by a required one
 *
 * @example
 * ```ts
 * import { defineCommand } from "@stdext/cli/command";
 * import { assertEquals } from "@std/assert";
 *
 * const serve = defineCommand({
 *   name: "serve",
 *   options: {
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
  const TOptions extends Options = Record<never, never>,
  const TArguments extends ReadonlyArray<Argument> = readonly [],
>(
  definition: CommandDefinition<TOptions, TArguments>,
): Command<TOptions, TArguments> {
  const { name, args = [], commands = [] } = definition;

  if (!name || /\s/.test(name) || name.startsWith("-")) {
    throw new TypeError(`Invalid command name '${name}'`);
  }

  const taken = new Set([HELP.long, HELP.short, VERSION.long, VERSION.short]);
  const claim = (flag: string, option: string) => {
    if (taken.has(flag)) {
      throw new TypeError(
        `Command '${name}' uses '${flag}' for '${option}' more than once, or it is reserved`,
      );
    }
    taken.add(flag);
  };
  for (const [option, { alias }] of optionsOf(definition)) {
    claim(toKebabCase(option), option);
    if (alias !== undefined) {
      if (alias.length !== 1) {
        throw new TypeError(
          `Alias '${alias}' of '${option}' is not one character`,
        );
      }
      claim(alias, option);
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

  return definition;
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
 * import { defineCommand, renderHelp } from "@stdext/cli/command";
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
    "[options]",
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
      `Arguments:\n${table(args.map((a) => [a.name, a.description ?? ""]))}`,
    );
  }

  const rows = optionsOf(command).map(([name, option]): [string, string] => {
    const flag = `${option.alias ? `-${option.alias}, ` : "    "}--${
      toKebabCase(name)
    }${option.type === "string" ? " <value>" : ""}`;
    const notes = [
      option.description,
      option.type === "string" && option.required ? "(required)" : undefined,
      option.default !== undefined ? `(default: ${option.default})` : undefined,
      option.env ? `[env: ${option.env}]` : undefined,
    ].filter(Boolean).join(" ");
    return [flag, notes];
  });
  rows.push([`-${HELP.short}, --${HELP.long}`, "Show this help"]);
  if (versions(path).length > 0) {
    rows.push([`-${VERSION.short}, --${VERSION.long}`, "Show the version"]);
  }
  sections.push(`Options:\n${table(rows)}`);

  return sections.join("\n\n");
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
   * Suggests the closest command or option when one is not known, e.g.
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

/**
 * Runs a command with the given arguments
 *
 * The first arguments choose the subcommand, so the options of a command come
 * after its name. A flag takes its value from, in order, the arguments, its
 * environment variable and its default. `--help` and `-h` show the help of the
 * command, and `--version` and `-V` its version, and the versions of its parents.
 *
 * An unknown command or option is reported with the closest known one, when it
 * is near enough, see the `suggest` option.
 *
 * Usage errors, like an unknown flag, are written to stderr with the exit code
 * `2`, or the `usageExitCode` option. Other errors thrown by the command are not
 * caught.
 *
 * @param command the root command
 * @param args the arguments, usually `Deno.args`
 * @param options the {@linkcode RunOptions}
 * @returns the exit code, which is `0` unless the command returns another
 *
 * @example
 * ```ts
 * import { defineCommand, runCommand } from "@stdext/cli/command";
 * import { assertEquals } from "@std/assert";
 *
 * const cli = defineCommand({
 *   name: "greet",
 *   options: { name: { type: "string", env: "NAME", default: "world" } },
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
    const tokens = resolveCommand(path, args, suggest);
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

    const { flags, positionals, rest } = parse(current, tokens, env, suggest);
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

// Follows the leading arguments down the subcommands, adding them to the path
// of commands from the root, and returns the arguments that are left. The path
// is given, so that it is complete for the error when a command is not known.
function resolveCommand(
  path: AnyCommand[],
  args: readonly string[],
  suggest: (input: string, candidates: string[]) => string | undefined,
): string[] {
  let tokens = [...args];
  for (;;) {
    const current = path[path.length - 1]!;
    const name = tokens[0];
    if (!current.commands?.length || name === undefined) break;
    if (name.startsWith("-")) break;
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
  return tokens;
}

function hasFlag(
  tokens: string[],
  { long, short }: { long: string; short: string },
): boolean {
  return tokens.some((token) => token === `--${long}` || token === `-${short}`);
}

function optionsOf(command: AnyCommand): Array<[string, Option]> {
  return Object.entries((command.options ?? {}) as Options);
}

function argsOf(command: AnyCommand): ReadonlyArray<Argument> {
  return (command.args ?? []) as ReadonlyArray<Argument>;
}

function parse(
  command: AnyCommand,
  tokens: string[],
  env: (name: string) => string | undefined,
  suggest: (input: string, candidates: string[]) => string | undefined,
) {
  const options = optionsOf(command);
  const byType = (type: Option["type"]) =>
    options.filter(([, o]) => o.type === type).map(([name]) =>
      toKebabCase(name)
    );

  const positionals: string[] = [];
  const unknownFlags: string[] = [];
  const parsed = parseArgs(tokens, {
    string: byType("string"),
    boolean: byType("boolean"),
    alias: Object.fromEntries(
      options.filter(([, o]) => o.alias).map((
        [name, o],
      ) => [toKebabCase(name), o.alias!]),
    ),
    // Marks the flags that are not passed, so they can fall back to the env.
    default: Object.fromEntries(
      options.map(([name]) => [toKebabCase(name), NOT_PASSED]),
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
      ...options.map(([name]) => toKebabCase(name)),
      HELP.long,
    ];
    const described = unknownFlags.map((flag) => {
      const match = flag.startsWith("--")
        ? suggest(flag.slice(2), names)
        : undefined;
      return match ? `${flag} (did you mean --${match}?)` : flag;
    });
    throw new UsageError(
      `Unknown option${unknownFlags.length > 1 ? "s" : ""}: ${
        described.join(", ")
      }`,
    );
  }

  const flags: Record<string, unknown> = {};
  for (const [name, option] of options) {
    const flag = toKebabCase(name);
    let value = (parsed as Record<string, unknown>)[flag];
    if (value === NOT_PASSED) {
      const fromEnv = option.env ? env(option.env) : undefined;
      if (fromEnv) {
        value = option.type === "boolean"
          ? parseBoolean(fromEnv, option.env!)
          : fromEnv;
      } else {
        value = option.default ??
          (option.type === "boolean" ? false : undefined);
      }
    }
    if (value === undefined && option.type === "string" && option.required) {
      throw new UsageError(
        `Missing required option --${flag}${
          option.env ? ` (or environment variable ${option.env})` : ""
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
