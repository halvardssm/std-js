/**
 * A standard interface for SQL databases: clients, pools, connections,
 * transactions, prepared statements, events and a tagged-template query builder.
 * Drivers implement these interfaces.
 *
 * @module
 */

export * from "./asserts.ts";
export * from "./client.ts";
export * from "./core.ts";
export * from "./errors.ts";
export * from "./events.ts";
export * from "./template.ts";
export * from "./utils.ts";
