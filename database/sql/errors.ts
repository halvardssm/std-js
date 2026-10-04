/**
 * DatabaseError
 *
 * The base error class for all database errors thrown by a compliant driver.
 *
 * @example
 * ```ts
 * import { DatabaseError } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * try {
 *   await new SqliteClient(":memory:").execute("THIS IS NOT VALID SQL");
 * } catch (error) {
 *   // Every error of a compliant implementation extends DatabaseError.
 *   console.log(error instanceof DatabaseError); // true
 * }
 * ```
 */
export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * ConnectionError
 *
 * Thrown when a connection to the database could not be established, was
 * closed, or is not alive.
 *
 * @example
 * ```ts
 * import { ConnectionError } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * await client.close();
 * try {
 *   await client.execute("SELECT 1");
 * } catch (error) {
 *   console.log(error instanceof ConnectionError); // true
 * }
 * ```
 */
export class ConnectionError extends DatabaseError {}

/**
 * QueryError
 *
 * Thrown when a query or statement could not be executed, for example due to
 * a syntax error, or when using a deallocated prepared statement.
 *
 * @example
 * ```ts
 * import { QueryError } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * try {
 *   await client.execute("THIS IS NOT VALID SQL");
 * } catch (error) {
 *   console.log(error instanceof QueryError); // true
 * }
 * ```
 */
export class QueryError extends DatabaseError {}

/**
 * TransactionError
 *
 * Thrown when a transaction operation fails, or when a committed, rolled back
 * or otherwise inactive transaction is used.
 *
 * @example
 * ```ts
 * import { TransactionError } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * const tx = await client.beginTransaction();
 * await tx.commit();
 * try {
 *   await tx.execute("SELECT 1");
 * } catch (error) {
 *   console.log(error instanceof TransactionError); // true
 * }
 * ```
 */
export class TransactionError extends DatabaseError {}
