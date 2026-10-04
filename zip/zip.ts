/**
 * Create zip archives, in memory or from a directory.
 *
 * @module
 */

import { concat } from "@std/bytes";
import { walk } from "@std/fs";
import { relative, resolve, SEPARATOR } from "@std/path";
import {
  CENTRAL_HEADER_SIZE,
  CENTRAL_SIGNATURE,
  crc32,
  END_SIGNATURE,
  END_SIZE,
  LOCAL_HEADER_SIZE,
  LOCAL_SIGNATURE,
  MAX_U16,
  MAX_U32,
  METHOD_DEFLATE,
  METHOD_STORED,
  transform,
} from "./_utils.ts";

/**
 * An entry to add to an archive with {@linkcode zip}
 */
export type ZipEntry = {
  /**
   * Path of the entry within the archive, using `/` as separator. A path
   * ending in `/` is a directory.
   */
  path: string;
  /** Content of the entry. Strings are encoded as UTF-8. Ignored for directories. */
  data?: Uint8Array | string;
  /**
   * Unix permission bits, e.g. `0o755`. Include the file type bits to store
   * other types, e.g. `0o120777` for a symbolic link with the target as data.
   */
  mode?: number;
  /** Last modified time, defaults to now. Has a 2 second resolution from 1980. */
  lastModified?: Date;
};

const FLAG_UTF8 = 1 << 11;
// Version needed to extract (2.0, deflate and directories) and the Unix host
// (3), which makes extractors honor the mode in the external attributes.
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
const DOS_DIRECTORY = 0x10;
const PERMISSION_MASK = 0o777;

const encoder = new TextEncoder();

function toDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Creates a zip archive
 *
 * Entries are deflated, or stored when deflating does not make them smaller.
 * The archive is built in memory.
 *
 * @param entries the entries to add to the archive
 * @returns the zip archive
 * @throws {RangeError} when the archive would need ZIP64
 *
 * @example
 * ```ts
 * import { zip } from "@stdx/zip/zip";
 * import { assertEquals } from "@std/assert";
 *
 * const archive = await zip([
 *   { path: "docs/", mode: 0o755 },
 *   { path: "docs/hello.txt", data: "Hello, world!" },
 * ]);
 *
 * assertEquals(archive[0], 0x50); // "PK"
 * ```
 */
export async function zip(entries: Iterable<ZipEntry>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const isDirectory = entry.path.endsWith("/");
    const name = encoder.encode(entry.path);
    const raw = isDirectory || entry.data === undefined
      ? new Uint8Array()
      : typeof entry.data === "string"
      ? encoder.encode(entry.data)
      : entry.data;

    let method = METHOD_STORED;
    let body = raw;
    if (raw.length > 0) {
      const deflated = await transform(
        raw,
        new CompressionStream("deflate-raw"),
      );
      if (deflated.length < raw.length) {
        method = METHOD_DEFLATE;
        body = deflated;
      }
    }

    if (name.length > MAX_U16 || body.length > MAX_U32 || offset > MAX_U32) {
      throw new RangeError(`Entry '${entry.path}' requires ZIP64`);
    }

    const { time, date } = toDosDateTime(entry.lastModified ?? new Date());
    const crc = crc32(raw);
    const mode = entry.mode ?? (isDirectory ? 0o755 : 0o644);
    // File type bits are kept when given, e.g. for symbolic links.
    const fileType = mode & 0o170000 || (isDirectory ? 0o040000 : 0o100000);
    const externalAttributes = ((((mode & 0o7777) | fileType) << 16) |
      (isDirectory ? DOS_DIRECTORY : 0)) >>>
      0;

    const local = new Uint8Array(LOCAL_HEADER_SIZE + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_SIGNATURE, true);
    localView.setUint16(4, VERSION_NEEDED, true);
    localView.setUint16(6, FLAG_UTF8, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, LOCAL_HEADER_SIZE);

    const header = new Uint8Array(CENTRAL_HEADER_SIZE + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, CENTRAL_SIGNATURE, true);
    view.setUint16(4, VERSION_MADE_BY, true);
    view.setUint16(6, VERSION_NEEDED, true);
    view.setUint16(8, FLAG_UTF8, true);
    view.setUint16(10, method, true);
    view.setUint16(12, time, true);
    view.setUint16(14, date, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, body.length, true);
    view.setUint32(24, raw.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(38, externalAttributes, true);
    view.setUint32(42, offset, true);
    header.set(name, CENTRAL_HEADER_SIZE);

    parts.push(local, body);
    central.push(header);
    offset += local.length + body.length;
  }

  if (central.length > MAX_U16) {
    throw new RangeError("Archive has too many entries, requires ZIP64");
  }

  const centralDirectory = concat(central);
  if (offset + centralDirectory.length > MAX_U32) {
    throw new RangeError("Archive is too large, requires ZIP64");
  }

  const end = new Uint8Array(END_SIZE);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_SIGNATURE, true);
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);

  return concat([...parts, centralDirectory, end]);
}

/**
 * Zips a directory into an archive file
 *
 * The contents of the directory are added with paths relative to it, including
 * empty directories and, on Unix, permissions. Symbolic links are skipped.
 *
 * @param source the directory to zip
 * @param destination the path of the archive file to write
 *
 * @example
 * ```ts ignore
 * import { zipDir } from "@stdx/zip/zip";
 *
 * await zipDir("./dist", "./dist.zip");
 * ```
 */
export async function zipDir(
  source: string,
  destination: string,
): Promise<void> {
  const entries: ZipEntry[] = [];
  const root = resolve(source);

  for await (const walked of walk(root, { includeSymlinks: false })) {
    if (walked.path === root) continue;
    const path = relative(root, walked.path).split(SEPARATOR).join("/");
    const info = await Deno.stat(walked.path);
    const mode = info.mode === null ? undefined : info.mode & PERMISSION_MASK;
    const lastModified = info.mtime ?? undefined;

    if (walked.isDirectory) {
      entries.push({ path: `${path}/`, mode, lastModified });
    } else {
      entries.push({
        path,
        data: await Deno.readFile(walked.path),
        mode,
        lastModified,
      });
    }
  }

  await Deno.writeFile(destination, await zip(entries));
}
