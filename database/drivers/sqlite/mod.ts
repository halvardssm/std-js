/**
 * A SQLite driver implementing the
 * {@link https://jsr.io/@stdx/database/doc/sql | @stdx/database/sql}
 * specification, backed by the built-in `node:sqlite` module.
 *
 * The {@linkcode SqliteDriver} implements the driver level: a `Dialect` and
 * statements run on a single connection. The {@linkcode SqliteClient} is the
 * standard client level bound to the driver: pooling, nested transactions,
 * SQL templates, lazy results and events, behaving the same for every
 * database.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * console.log(await client.query("SELECT 1 + 1 AS solution").toRecords());
 * ```
 *
 * @module
 */
export * from "./client.ts";
export * from "./driver.ts";
