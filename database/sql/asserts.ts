import { AssertionError } from "@std/assert";
import {
  anyOf,
  boolean,
  func,
  instanceOf,
  isValid,
  number,
  optional,
  shape,
  string,
} from "@stdx/validation";
import type { Eventable } from "./events.ts";
import type {
  Client,
  Connectable,
  Connection,
  Dialect,
  Dialectable,
  Driver,
  DriverConnection,
  Pingable,
  Poolable,
  Preparable,
  PreparedStatement,
  Queryable,
  Transaction,
  Transactionable,
} from "./core.ts";

// The shape of each interface. Only the shape is checked, so any non-null
// object matches, however it was made (classes, plain objects, ...). The
// schemas are built once and shared.

const asyncDisposable = { [Symbol.asyncDispose]: func() };
const pingable = { ping: func() };
const queryable = { execute: func(), query: func(), executeScript: func() };
const preparable = { prepare: func() };
const transactionable = { beginTransaction: func(), transaction: func() };
const poolable = { acquire: func() };
const eventable = { eventTarget: instanceOf(EventTarget) };

const dialect = shape({
  name: string(),
  placeholder: func(),
  quoteIdentifier: func(),
});
const dialectable = { dialect };

const connectable = {
  ...asyncDisposable,
  connect: func(),
  close: func(),
  connected: boolean(),
  connectionUrl: anyOf([string(), instanceOf(URL)]),
};

const schemas = {
  dialect,
  driver: shape({
    dialect,
    connect: func(),
    maxConnections: optional(number()),
  }),
  driverConnection: shape({
    ...asyncDisposable,
    ...queryable,
    ...pingable,
    closed: boolean(),
    close: func(),
    begin: func(),
    prepare: optional(func()),
  }),
  connectable: shape(connectable),
  pingable: shape(pingable),
  queryable: shape(queryable),
  preparable: shape(preparable),
  transactionable: shape(transactionable),
  dialectable: shape(dialectable),
  eventable: shape(eventable),
  poolable: shape(poolable),
  transaction: shape({
    ...asyncDisposable,
    ...queryable,
    ...preparable,
    ...transactionable,
    inTransaction: boolean(),
    commit: func(),
    rollback: func(),
    createSavepoint: func(),
    releaseSavepoint: func(),
  }),
  preparedStatement: shape({
    ...asyncDisposable,
    execute: func(),
    query: func(),
    deallocate: func(),
    sql: string(),
    deallocated: boolean(),
  }),
  connection: shape({
    ...asyncDisposable,
    ...pingable,
    ...queryable,
    ...preparable,
    ...transactionable,
    ...dialectable,
    release: func(),
    remove: func(),
    released: boolean(),
    connected: boolean(),
  }),
  client: shape({
    ...connectable,
    ...pingable,
    ...queryable,
    ...preparable,
    ...transactionable,
    ...poolable,
    ...dialectable,
    ...eventable,
    options: shape({}),
  }),
};

function assert(
  condition: boolean,
  value: unknown,
  type: string,
): asserts condition {
  if (!condition) {
    throw new AssertionError(`Value is not a ${type}: ${typeof value}`);
  }
}

// Driver level

/**
 * Check if a value is a {@linkcode Dialect}.
 *
 * @example
 * ```ts
 * import { isDialect } from "@stdx/database/sql";
 * import { assert } from "@std/assert";
 *
 * assert(isDialect({
 *   name: "sqlite",
 *   placeholder: () => "?",
 *   quoteIdentifier: (name: string) => `"${name}"`,
 * }));
 * ```
 */
export function isDialect(value: unknown): value is Dialect {
  return isValid(schemas.dialect, value);
}

/**
 * Assert that a value is a {@linkcode Dialect}.
 *
 * @example
 * ```ts
 * import { assertIsDialect } from "@stdx/database/sql";
 * import { assertThrows } from "@std/assert";
 * import { AssertionError } from "@std/assert";
 *
 * assertIsDialect({
 *   name: "sqlite",
 *   placeholder: () => "?",
 *   quoteIdentifier: (name: string) => `"${name}"`,
 * });
 * assertThrows(() => assertIsDialect({}), AssertionError);
 * ```
 */
export function assertIsDialect(value: unknown): asserts value is Dialect {
  assert(isDialect(value), value, "Dialect");
}

/**
 * Check if a value is a {@linkcode Driver}.
 *
 * @example
 * ```ts
 * import { SqliteDriver } from "@stdx/database/drivers/sqlite";
 * import { isDriver } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isDriver(new SqliteDriver()));
 * assertFalse(isDriver({}));
 * ```
 */
export function isDriver(value: unknown): value is Driver {
  return isValid(schemas.driver, value);
}

/**
 * Assert that a value is a {@linkcode Driver}.
 *
 * @example
 * ```ts
 * import { SqliteDriver } from "@stdx/database/drivers/sqlite";
 * import { assertIsDriver } from "@stdx/database/sql";
 * import { assertThrows } from "@std/assert";
 * import { AssertionError } from "@std/assert";
 *
 * assertIsDriver(new SqliteDriver());
 * assertThrows(() => assertIsDriver({}), AssertionError);
 * ```
 */
export function assertIsDriver(value: unknown): asserts value is Driver {
  assert(isDriver(value), value, "Driver");
}

/**
 * Check if a value is a {@linkcode DriverConnection}.
 *
 * @example
 * ```ts
 * import { SqliteDriver } from "@stdx/database/drivers/sqlite";
 * import { isDriverConnection } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * const driver = new SqliteDriver();
 * await using connection = await driver.connect(":memory:");
 * assert(isDriverConnection(connection));
 * // The driver itself is not a connection.
 * assertFalse(isDriverConnection(driver));
 * ```
 */
export function isDriverConnection(value: unknown): value is DriverConnection {
  return isValid(schemas.driverConnection, value);
}

/**
 * Assert that a value is a {@linkcode DriverConnection}.
 *
 * @example
 * ```ts
 * import { SqliteDriver } from "@stdx/database/drivers/sqlite";
 * import { assertIsDriverConnection } from "@stdx/database/sql";
 * import { assertThrows } from "@std/assert";
 * import { AssertionError } from "@std/assert";
 *
 * const driver = new SqliteDriver();
 * await using connection = await driver.connect(":memory:");
 * assertIsDriverConnection(connection);
 * assertThrows(() => assertIsDriverConnection({}), AssertionError);
 * ```
 */
export function assertIsDriverConnection(
  value: unknown,
): asserts value is DriverConnection {
  assert(isDriverConnection(value), value, "DriverConnection");
}

// Client level

/**
 * Check if a value is {@linkcode Connectable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isConnectable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isConnectable(new SqliteClient(":memory:")));
 * assertFalse(isConnectable({}));
 * ```
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isConnectable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isConnectable(client));
 * assertFalse(isConnectable({}));
 * ```
 */
export function isConnectable(value: unknown): value is Connectable {
  return isValid(schemas.connectable, value);
}

/**
 * Assert that a value is {@linkcode Connectable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsConnectable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsConnectable(client);
 * assertThrows(() => assertIsConnectable({}), AssertionError);
 * ```
 */
export function assertIsConnectable(
  value: unknown,
): asserts value is Connectable {
  assert(isConnectable(value), value, "Connectable");
}

/**
 * Check if a value is {@linkcode Pingable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isPingable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isPingable(client));
 * assertFalse(isPingable({}));
 * ```
 */
export function isPingable(value: unknown): value is Pingable {
  return isValid(schemas.pingable, value);
}

/**
 * Assert that a value is {@linkcode Pingable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsPingable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsPingable(client);
 * assertThrows(() => assertIsPingable({}), AssertionError);
 * ```
 */
export function assertIsPingable(value: unknown): asserts value is Pingable {
  assert(isPingable(value), value, "Pingable");
}

/**
 * Check if a value is {@linkcode Queryable}.
 *
 * @example
 * ```ts
 * import { isQueryable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isQueryable({ execute() {}, query() {}, executeScript() {} }));
 * assertFalse(isQueryable({ execute() {} }));
 * ```
 */
export function isQueryable(value: unknown): value is Queryable {
  return isValid(schemas.queryable, value);
}

/**
 * Assert that a value is {@linkcode Queryable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsQueryable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsQueryable(client);
 * assertThrows(() => assertIsQueryable({}), AssertionError);
 * ```
 */
export function assertIsQueryable(value: unknown): asserts value is Queryable {
  assert(isQueryable(value), value, "Queryable");
}

/**
 * Check if a value is {@linkcode Preparable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isPreparable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isPreparable(client));
 * assertFalse(isPreparable({}));
 * ```
 */
export function isPreparable(value: unknown): value is Preparable {
  return isValid(schemas.preparable, value);
}

/**
 * Assert that a value is {@linkcode Preparable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsPreparable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsPreparable(client);
 * assertThrows(() => assertIsPreparable({}), AssertionError);
 * ```
 */
export function assertIsPreparable(
  value: unknown,
): asserts value is Preparable {
  assert(isPreparable(value), value, "Preparable");
}

/**
 * Check if a value is {@linkcode Transactionable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isTransactionable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isTransactionable(client));
 * assertFalse(isTransactionable({}));
 * ```
 */
export function isTransactionable(value: unknown): value is Transactionable {
  return isValid(schemas.transactionable, value);
}

/**
 * Assert that a value is {@linkcode Transactionable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsTransactionable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsTransactionable(client);
 * assertThrows(() => assertIsTransactionable({}), AssertionError);
 * ```
 */
export function assertIsTransactionable(
  value: unknown,
): asserts value is Transactionable {
  assert(isTransactionable(value), value, "Transactionable");
}

/**
 * Check if a value is {@linkcode Dialectable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isDialectable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isDialectable(client));
 * assertFalse(isDialectable({}));
 * ```
 */
export function isDialectable(value: unknown): value is Dialectable {
  return isValid(schemas.dialectable, value);
}

/**
 * Assert that a value is {@linkcode Dialectable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsDialectable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsDialectable(client);
 * assertThrows(() => assertIsDialectable({}), AssertionError);
 * ```
 */
export function assertIsDialectable(
  value: unknown,
): asserts value is Dialectable {
  assert(isDialectable(value), value, "Dialectable");
}

/**
 * Check if a value is {@linkcode Eventable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isEventable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isEventable(client));
 * assertFalse(isEventable({}));
 * ```
 */
export function isEventable(value: unknown): value is Eventable {
  return isValid(schemas.eventable, value);
}

/**
 * Assert that a value is {@linkcode Eventable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsEventable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsEventable(client);
 * assertThrows(() => assertIsEventable({}), AssertionError);
 * ```
 */
export function assertIsEventable(value: unknown): asserts value is Eventable {
  assert(isEventable(value), value, "Eventable");
}

/**
 * Check if a value is {@linkcode Poolable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isPoolable } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isPoolable(client));
 * assertFalse(isPoolable({}));
 * ```
 */
export function isPoolable(value: unknown): value is Poolable {
  return isValid(schemas.poolable, value);
}

/**
 * Assert that a value is {@linkcode Poolable}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsPoolable } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsPoolable(client);
 * assertThrows(() => assertIsPoolable({}), AssertionError);
 * ```
 */
export function assertIsPoolable(value: unknown): asserts value is Poolable {
  assert(isPoolable(value), value, "Poolable");
}

/**
 * Check if a value is a {@linkcode Transaction}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isTransaction } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * const transaction = await client.beginTransaction();
 * assert(isTransaction(transaction));
 * assertFalse(isTransaction({}));
 * ```
 */
export function isTransaction(value: unknown): value is Transaction {
  return isValid(schemas.transaction, value);
}

/**
 * Assert that a value is a {@linkcode Transaction}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsTransaction } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * const transaction = await client.beginTransaction();
 * assertIsTransaction(transaction);
 * assertThrows(() => assertIsTransaction({}), AssertionError);
 * ```
 */
export function assertIsTransaction(
  value: unknown,
): asserts value is Transaction {
  assert(isTransaction(value), value, "Transaction");
}

/**
 * Check if a value is a {@linkcode PreparedStatement}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isPreparedStatement } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * await using statement = await client.prepare("SELECT 1 AS n");
 * assert(isPreparedStatement(statement));
 * assertFalse(isPreparedStatement({}));
 * ```
 */
export function isPreparedStatement(
  value: unknown,
): value is PreparedStatement {
  return isValid(schemas.preparedStatement, value);
}

/**
 * Assert that a value is a {@linkcode PreparedStatement}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsPreparedStatement } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * await using statement = await client.prepare("SELECT 1 AS n");
 * assertIsPreparedStatement(statement);
 * assertThrows(() => assertIsPreparedStatement({}), AssertionError);
 * ```
 */
export function assertIsPreparedStatement(
  value: unknown,
): asserts value is PreparedStatement {
  assert(isPreparedStatement(value), value, "PreparedStatement");
}

/**
 * Check if a value is a {@linkcode Connection}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isConnection } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * await using connection = await client.acquire();
 * assert(isConnection(connection));
 * assertFalse(isConnection({}));
 * ```
 */
export function isConnection(value: unknown): value is Connection {
  return isValid(schemas.connection, value);
}

/**
 * Assert that a value is a {@linkcode Connection}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsConnection } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * await using connection = await client.acquire();
 * assertIsConnection(connection);
 * assertThrows(() => assertIsConnection({}), AssertionError);
 * ```
 */
export function assertIsConnection(
  value: unknown,
): asserts value is Connection {
  assert(isConnection(value), value, "Connection");
}

/**
 * Check if a value is a {@linkcode Client}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { isClient } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assert(isClient(client));
 * assertFalse(isClient({}));
 * ```
 */
export function isClient(value: unknown): value is Client {
  return isValid(schemas.client, value);
}

/**
 * Assert that a value is a {@linkcode Client}.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { assertIsClient } from "@stdx/database/sql";
 * import { AssertionError, assertThrows } from "@std/assert";
 *
 * await using client = new SqliteClient(":memory:");
 * assertIsClient(client);
 * assertThrows(() => assertIsClient({}), AssertionError);
 * ```
 */
export function assertIsClient(value: unknown): asserts value is Client {
  assert(isClient(value), value, "Client");
}
