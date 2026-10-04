# @stdx/database

The database package contains a standard interface for SQL databases, and
drivers implementing it for SQLite and Postgres. It draws inspiration from
[go std/database](https://pkg.go.dev/database).

Applications use one of the [drivers](#drivers), which all share the same
interface:

```ts
import { SqliteClient } from "@stdx/database/drivers/sqlite";

await using client = new SqliteClient(":memory:");
await client.execute("CREATE TABLE users (id INTEGER, name TEXT)");
await client.execute("INSERT INTO users VALUES (?, ?)", [1, "Alice"]);
console.log(await client.query("SELECT * FROM users").toRecords());
// [{ id: 1, name: "Alice" }]
```

## Entrypoints

### Sql

The SQL entrypoint contains the standard interface for SQL databases, as
specified in [RFC_SQL.md](./RFC_SQL.md): the types, the standard client level
implementation (`SqlClient`), helper utilities for driver authors, and a
conformance test suite. It is meant for driver authors and alternative client
implementations; applications use a driver. See [database/sql](./sql/README.md)
for more details.

### Drivers

Drivers implementing the [database/sql](./sql/README.md) specification, which
has two levels: a minimal **driver level**, implemented by the drivers, and a
user facing **client level**, implemented once by the standard `SqlClient` on
top of any driver. Each driver exports its `Driver` and a preconfigured client
bound to it, such as `SqliteClient`, which behaves the same for every database.

A driver implements a `Dialect`, and connects and runs statements on a single
connection: `DriverConnection`, with its `DriverRows`, `DriverStatement` and
`DriverTransaction`. The client level adds pooling, nested transactions, SQL
templates, lazy results, prepared statement caching, events and options. Driver
authors verify their implementation with the conformance suites of
[`@stdx/database/sql/testing`](./sql/README.md#testing); no base classes are
required.

#### SQLite

`@stdx/database/drivers/sqlite`, backed by the built-in `node:sqlite` module.
The connection URL is a file path, a `file:` URL, or `:memory:`. Parameters use
`?` placeholders, or `:name`, `@name` and `$name` placeholders with a record.

- SQLite has no connection pool, so `SqliteClient` emulates it with a single
  connection: `maxSize` is always `1`, and acquiring waits for the connection.
  This keeps transactions isolated, and makes `:memory:` behave as one database.
- Connections wait up to 5 seconds for locks held by other connections to the
  same file (`connectionOptions.timeout`).
- Integers are returned as `number` (or `bigint` with
  `connectionOptions.readBigInts`), `BLOB`s as `Uint8Array`. Booleans are bound
  as `1`/`0`, and, as an extension, `Date`s as ISO 8601 strings. `execute`
  reports the `rowid` of inserted rows as `lastInsertId`.

```ts
import { SqliteClient } from "@stdx/database/drivers/sqlite";

await using client = new SqliteClient(":memory:");
await client.execute("CREATE TABLE users (id INTEGER, name TEXT)");
await client.execute("INSERT INTO users VALUES (?, ?)", [1, "Alice"]);
console.log(await client.query("SELECT * FROM users").toRecords());
```

#### Postgres

`@stdx/database/drivers/postgres`, implemented in TypeScript on top of the
Postgres frontend/backend protocol, and requires the `net` permission. It
supports SCRAM-SHA-256, MD5 and cleartext password authentication, TLS,
streaming results, prepared statements, and cancelling queries with an
`AbortSignal`. Parameters use `$1`, `$2`, ... placeholders.

- The connection URL follows the libpq connection URI format
  (`postgres://user:password@host:port/database`), and supports the `sslmode`
  and `application_name` parameters. The connection options take precedence.
- TLS always verifies the server certificate, also for `sslmode=prefer` and
  `sslmode=require`, as Deno can not encrypt without verifying. Self-signed
  certificates can be trusted with `connectionOptions.tls.caCerts`.
- SQL templates are rendered with `$1`, `$2`, ... placeholders, and scripts run
  with the simple query protocol. Postgres has no insert ids: use `RETURNING`.
- A query result holds its connection until it is fully read or disposed. Other
  commands on the same connection are rejected meanwhile, rather than buffering
  the rest of the result in memory.
- Values are parsed by type: `int8` as `bigint`, `timestamptz` and `timestamp`
  (as UTC) as `Date`, `numeric` and `date` as strings, `json`/`jsonb` parsed,
  and arrays of these. Override the parsers with `connectionOptions.parsers`.

```ts ignore
import { PostgresClient } from "@stdx/database/drivers/postgres";

await using client = new PostgresClient("postgres://user@localhost:5432/db", {
  connectionOptions: { password: "secret" },
  poolOptions: { maxSize: 4 },
});
await client.connect();
await client.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
});
console.log(
  await client.query("SELECT * FROM users WHERE id = $1", [1]).toRecords(),
);
```

The Postgres tests run against a live server when `STDX_POSTGRES_URL` is set:

```sh
docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:17
STDX_POSTGRES_URL=postgres://postgres:postgres@localhost:54329/postgres deno task test
```
