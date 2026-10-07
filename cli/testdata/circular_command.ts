import { defineArguments, defineCommand, defineFlags } from "../command.ts";
import { runServe } from "./circular_handler.ts";

// The flags and arguments are defined separately, so the run function module
// can import their types. The command is defined with them, and with the run
// function, which makes the imports of the two modules circular: the handler
// is imported here as a value, and its types come from here.
export const serveFlags = defineFlags({
  name: { type: "string", default: "world" },
  verbose: { type: "boolean" },
});

export const serveArgs = defineArguments([{ name: "dir", required: true }]);

export const serve = defineCommand({
  name: "serve",
  flags: serveFlags,
  args: serveArgs,
  run: runServe,
});
