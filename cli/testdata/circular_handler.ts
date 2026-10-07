import type { Context } from "../command.ts";
import type { serveArgs, serveFlags } from "./circular_command.ts";

// The context of the serve command, inferred from its flags and arguments,
// through the circular type-only import. Referencing `typeof serve` itself
// would be a circular type (`serve` is inferred using this function), but
// the flags and arguments do not depend on it.
type ServeContext = Context<typeof serveFlags, typeof serveArgs>;

export function runServe({ flags, args, stdout }: ServeContext): void {
  // These annotations only type check when the flags and arguments are
  // inferred precisely, through the circular import.
  const name: string = flags.name;
  const verbose: boolean = flags.verbose;
  const dir: string = args.dir;

  stdout(`${name} ${verbose} ${dir}`);
}
