import { ensureDir } from "@std/fs";
import { dirname, isAbsolute, join, resolve, SEPARATOR } from "@std/path";
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
 * An entry read from an archive with {@linkcode unzip}
 */
export type UnzipEntry = {
  /** Path of the entry within the archive, using `/` as separator */
  path: string;
  /** Uncompressed content of the entry, empty for directories */
  data: Uint8Array;
  /** Whether the entry is a directory */
  isDirectory: boolean;
  /** Unix permission and file type bits, if the archive was made on Unix */
  mode?: number;
  /** Last modified time */
  lastModified: Date;
};

const MAX_COMMENT_SIZE = 0xffff;
const FLAG_ENCRYPTED = 1 << 0;
const HOST_UNIX = 3;
const FILE_TYPE_MASK = 0o170000;
const FILE_TYPE_SYMLINK = 0o120000;
const PERMISSION_MASK = 0o777;

const decoder = new TextDecoder();

function fromDosDateTime(date: number, time: number): Date {
  return new Date(
    ((date >> 9) & 0x7f) + 1980,
    Math.max(((date >> 5) & 0xf) - 1, 0),
    Math.max(date & 0x1f, 1),
    (time >> 11) & 0x1f,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2,
  );
}

/**
 * Reads a zip archive
 *
 * Entry contents are verified against the CRC-32 stored in the archive. The
 * archive is read in memory, and entry paths are returned as stored: callers
 * extracting to disk need to validate them.
 *
 * @param archive the zip archive
 * @returns the entries of the archive, in archive order
 * @throws {TypeError} when the archive is invalid, encrypted, uses ZIP64 or a
 * compression method other than stored and deflate, or an entry is corrupt
 *
 * @example
 * ```ts
 * import { unzip } from "@stdext/zip/unzip";
 * import { zip } from "@stdext/zip/zip";
 * import { assertEquals } from "@std/assert";
 *
 * const archive = await zip([{ path: "hello.txt", data: "Hello, world!" }]);
 * const [entry] = await unzip(archive);
 *
 * assertEquals(entry!.path, "hello.txt");
 * assertEquals(new TextDecoder().decode(entry!.data), "Hello, world!");
 * ```
 */
export async function unzip(archive: Uint8Array): Promise<UnzipEntry[]> {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );

  let end = -1;
  const lowest = Math.max(archive.length - END_SIZE - MAX_COMMENT_SIZE, 0);
  for (let i = archive.length - END_SIZE; i >= lowest; i--) {
    if (view.getUint32(i, true) === END_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new TypeError("Not a zip archive");

  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  if (count === MAX_U16 || position === MAX_U32) {
    throw new TypeError("ZIP64 archives are not supported");
  }

  const entries: UnzipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (
      position + CENTRAL_HEADER_SIZE > archive.length ||
      view.getUint32(position, true) !== CENTRAL_SIGNATURE
    ) {
      throw new TypeError("Invalid zip central directory");
    }

    const madeByHost = view.getUint8(position + 5);
    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const time = view.getUint16(position + 12, true);
    const date = view.getUint16(position + 14, true);
    const crc = view.getUint32(position + 16, true);
    const compressedSize = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const externalAttributes = view.getUint32(position + 38, true);
    const localOffset = view.getUint32(position + 42, true);
    const nameStart = position + CENTRAL_HEADER_SIZE;
    const path = decoder.decode(
      archive.subarray(nameStart, nameStart + nameLength),
    );
    position = nameStart + nameLength + extraLength + commentLength;

    if (flags & FLAG_ENCRYPTED) {
      throw new TypeError(
        `Entry '${path}' is encrypted, which is not supported`,
      );
    }
    if (compressedSize === MAX_U32 || size === MAX_U32) {
      throw new TypeError("ZIP64 archives are not supported");
    }
    if (
      localOffset + LOCAL_HEADER_SIZE > archive.length ||
      view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
    ) {
      throw new TypeError(`Invalid local header for entry '${path}'`);
    }

    const dataStart = localOffset + LOCAL_HEADER_SIZE +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > archive.length) {
      throw new TypeError(`Entry '${path}' is truncated`);
    }
    const body = archive.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === METHOD_STORED) {
      data = body.slice();
    } else if (method === METHOD_DEFLATE) {
      try {
        data = await transform(body, new DecompressionStream("deflate-raw"));
      } catch {
        throw new TypeError(`Entry '${path}' is corrupt`);
      }
    } else {
      throw new TypeError(
        `Entry '${path}' uses unsupported compression method ${method}`,
      );
    }
    if (data.length !== size || crc32(data) !== crc) {
      throw new TypeError(`Entry '${path}' is corrupt`);
    }

    const isDirectory = path.endsWith("/");
    entries.push({
      path,
      data,
      isDirectory,
      mode: madeByHost === HOST_UNIX ? externalAttributes >>> 16 : undefined,
      lastModified: fromDosDateTime(date, time),
    });
  }

  return entries;
}

/**
 * Extracts an archive file into a directory
 *
 * The directory is created if needed, and existing files are overwritten.
 * Entries that would be written outside of the directory, including through
 * symbolic links, are rejected. Unix permissions and symbolic links are
 * restored, except on Windows where symbolic links are written as files.
 *
 * @param source the path of the archive file
 * @param destination the directory to extract into
 * @throws {TypeError} when the archive is invalid, or an entry is outside of
 * the destination
 *
 * @example
 * ```ts ignore
 * import { unzipDir } from "@stdext/zip/unzip";
 *
 * await unzipDir("./dist.zip", "./dist");
 * ```
 */
export async function unzipDir(
  source: string,
  destination: string,
): Promise<void> {
  const entries = await unzip(await Deno.readFile(source));

  await ensureDir(destination);
  const root = await Deno.realPath(destination);

  // Symlinks are created last, so that no entry is ever written through one.
  const symlinks: UnzipEntry[] = [];

  for (const entry of entries) {
    const target = resolve(root, entry.path);
    assertInside(root, target, entry.path);

    if (entry.isDirectory) {
      await ensureDir(target);
      assertInside(root, await Deno.realPath(target), entry.path);
      continue;
    }

    if (isSymlink(entry) && Deno.build.os !== "windows") {
      symlinks.push(entry);
      continue;
    }

    // The parent is resolved on disk, so symlinks that already exist in the
    // destination cannot be used to escape it.
    await ensureDir(dirname(target));
    assertInside(root, await Deno.realPath(dirname(target)), entry.path);

    // Replace an existing symlink instead of writing through it.
    if ((await Deno.lstat(target).catch(() => undefined))?.isSymlink) {
      await Deno.remove(target);
    }
    await Deno.writeFile(target, entry.data);
    if (entry.mode !== undefined && Deno.build.os !== "windows") {
      await Deno.chmod(target, entry.mode & PERMISSION_MASK);
    }
  }

  for (const entry of symlinks) {
    const target = resolve(root, entry.path);
    const linkTarget = new TextDecoder().decode(entry.data);
    if (isAbsolute(linkTarget)) {
      throw new TypeError(
        `Symlink '${entry.path}' points outside of destination`,
      );
    }
    assertInside(root, resolve(dirname(target), linkTarget), entry.path);

    const parent = await Deno.realPath(dirname(target)).catch(() => {
      throw new TypeError(`Symlink '${entry.path}' has no parent directory`);
    });
    assertInside(root, parent, entry.path);

    await Deno.remove(target).catch(() => {});
    await Deno.symlink(linkTarget, target);
  }
}

function isSymlink(entry: UnzipEntry): boolean {
  return ((entry.mode ?? 0) & FILE_TYPE_MASK) === FILE_TYPE_SYMLINK;
}

function assertInside(root: string, path: string, entryPath: string): void {
  if (path !== root && !path.startsWith(join(root, SEPARATOR))) {
    throw new TypeError(`Entry '${entryPath}' is outside of destination`);
  }
}
