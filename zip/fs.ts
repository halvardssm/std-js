import { ensureDir, walk } from "@std/fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  SEPARATOR,
} from "@std/path";
import { unzip, type UnzipEntry } from "./unzip.ts";
import { zip, type ZipEntry } from "./zip.ts";

const FILE_TYPE_MASK = 0o170000;
const FILE_TYPE_SYMLINK = 0o120000;
const PERMISSION_MASK = 0o777;

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
 * import { zipDir } from "@stdext/zip/fs";
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
 * import { unzipDir } from "@stdext/zip/fs";
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
