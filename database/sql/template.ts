import type { ParameterType, QueryParameters, SqlTemplate } from "./core.ts";
import { QueryError } from "./errors.ts";

/**
 * Create a {@linkcode SqlTemplate} from a tagged template. The interpolated
 * values are bound as parameters by the driver, in the placeholder style of
 * the database, and are never inserted into the SQL text.
 *
 * Statements created with this tag are accepted by the `execute` and `query`
 * methods in place of SQL text.
 *
 * @example
 * ```ts
 * import { sql } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * await client.execute(sql`CREATE TABLE users (id INTEGER, name TEXT)`);
 * const name = "Alice";
 * await client.execute(sql`INSERT INTO users VALUES (${1}, ${name})`);
 * const users = await client.query(sql`SELECT * FROM users WHERE name = ${name}`)
 *   .toRecords();
 * ```
 */
export function sql(
  strings: TemplateStringsArray,
  ...values: ParameterType[]
): SqlTemplate {
  return Object.freeze({
    strings: Object.freeze([...strings]),
    values: Object.freeze([...values]),
  });
}

/**
 * Whether the value is a {@linkcode SqlTemplate}.
 *
 * @example
 * ```ts
 * import { isSqlTemplate, sql } from "@stdx/database/sql";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isSqlTemplate(sql`SELECT 1`));
 * assertFalse(isSqlTemplate("SELECT 1"));
 * ```
 */
export function isSqlTemplate(value: unknown): value is SqlTemplate {
  if (typeof value !== "object" || value === null) return false;
  const { strings, values } = value as Partial<SqlTemplate>;
  return Array.isArray(strings) && Array.isArray(values) &&
    strings.length === values.length + 1 &&
    strings.every((string) => typeof string === "string");
}

/**
 * Render a statement to SQL text and parameters, for driver authors. A
 * {@linkcode SqlTemplate} is rendered with the placeholders of the database;
 * SQL text is returned as is, with the given parameters.
 *
 * @param statement the statement
 * @param params the parameters given with the statement
 * @param placeholder renders the placeholder of the parameter at the
 * zero-based index, such as `() => "?"` or `(i) => "$" + (i + 1)`
 * @returns the SQL text and the parameters
 * @throws {QueryError} if parameters are given with a template
 *
 * @example
 * ```ts
 * import { renderStatement, sql } from "@stdx/database/sql";
 * import { assertEquals } from "@std/assert";
 *
 * const id = 1;
 * assertEquals(
 *   renderStatement(sql`SELECT * FROM users WHERE id = ${id}`, undefined, (i) => `$${i + 1}`),
 *   { sql: "SELECT * FROM users WHERE id = $1", params: [1] },
 * );
 * ```
 */
export function renderStatement(
  statement: string | SqlTemplate,
  params: QueryParameters | undefined,
  placeholder: (index: number) => string,
): { sql: string; params: QueryParameters | undefined } {
  if (typeof statement === "string") return { sql: statement, params };
  if (params !== undefined) {
    throw new QueryError(
      "Parameters can not be given with a SQL template, interpolate them in the template instead",
    );
  }
  let text = statement.strings[0];
  for (let i = 0; i < statement.values.length; i++) {
    text += placeholder(i) + statement.strings[i + 1];
  }
  return { sql: text, params: [...statement.values] };
}
