/**
 * Load dynamic libraries over FFI, including libraries downloaded from remote
 * URLs and cached locally.
 *
 * @module
 */

import { ensureDir, exists } from "@std/fs";
import { cacheFile, type CacheFileOptions, denoCacheDir } from "@stdx/fs";
import { dirname, join, resolve } from "@std/path";
import { unzipDir } from "@stdx/zip/unzip";

/**
 * Options for dlopen function
 */
export type DlopenOptions = {
  /** File options for different OS/architecture combinations */
  filename: FilenameOptions;
  /** Cache options for remote files */
  cacheOptions?: CacheOptions;
};

/**
 * File options for different operating systems and architectures
 */
export type FilenameOptions = {
  [os in typeof Deno.build.os]?: {
    [arch in typeof Deno.build.arch]?: FileOptions;
  };
};

/**
 * Options for a specific file
 */
export type FileOptions = {
  /** Local path or remote URL to download the file from */
  url: string | URL;
  /** Type of file */
  type?: FileType;
  /** Path within archive (required for archive files such as zip) */
  archivePath?: string;
};

/**
 * Type of file for caching
 * - `"lib"`: Library file
 * - `"zip"`: Zip archive
 */
export type FileType = "lib" | "zip";

/**
 * Cache options extending CacheFileOptions
 */
export type CacheOptions = CacheFileOptions & {
  /** Custom cache path */
  path?: string;
};

/**
 * Dynamically loads a library depending on OS and cache remote files
 *
 * Deno only: `Deno.dlopen` is not provided by `@deno/shim-deno`, so using
 * this in Node.js needs a custom `Deno.dlopen` shim, for example one backed
 * by koffi, in addition to exposing the `Deno` export of `@deno/shim-deno`
 * as a global.
 *
 * @param symbols the foreign library interface symbols
 * @param options {@link DlopenOptions} dlopen options
 * @returns a promise that resolves to a {@link DynamicLibrary} object
 *
 * @example
 * ```ts ignore
 * import { dlopen } from "@stdx/ffi/dlopen";
 *
 * const dylib = await dlopen(
 *   {
 *     "add": { parameters: ["isize", "isize"], result: "isize" },
 *   },
 *   {
 *     filename: {
 *       darwin: {
 *         aarch64: { url: "https://example.com/darwin-aarch64.dylib" },
 *       },
 *       linux: {
 *         x86_64: {
 *           url: "./local_lib.so",
 *         },
 *         aarch64: {
 *           url: "https://example.com/some_archive.zip",
 *           type: "zip",
 *           archivePath: "path/to/lib/in/zip",
 *         },
 *       },
 *     },
 *     cacheOptions: {
 *       cacheControl: "reload",
 *       path: "./custom/cache/path",
 *     },
 *   },
 * );
 * ```
 */
export async function dlopen<const S extends Deno.ForeignLibraryInterface>(
  symbols: S,
  options: DlopenOptions,
): Promise<Deno.DynamicLibrary<S>> {
  const fileOptions = getFileOptions(options.filename);

  let libFile = fileOptions.url.toString();

  if (/https?:\/\//.test(libFile)) {
    libFile = await cacheRemoteFile(fileOptions, options.cacheOptions);
  }

  return Deno.dlopen<S>(libFile, symbols);
}

/**
 * Gets the appropriate file options for the current OS and architecture
 *
 * Requires the Deno namespace: in Node.js, install `@deno/shim-deno` and
 * expose its `Deno` export as a global before importing this module.
 *
 * @param options {@link FilenameOptions} filename options for different platforms
 * @returns the file options for the current platform
 * @throws {TypeError} when file options for current OS/architecture are not provided
 */
export function getFileOptions(options: FilenameOptions): FileOptions {
  const fileOptions: FileOptions | undefined = options[Deno.build.os]
    ?.[Deno.build.arch];

  if (!fileOptions) {
    throw new TypeError(
      `File options for current os/arch '${Deno.build.os}/${Deno.build.arch}' not provided`,
    );
  }
  return fileOptions;
}

/**
 * Caches a remote file locally
 *
 * Archives (`type: "zip"`) are extracted, and the file at
 * {@linkcode FileOptions.archivePath} within the extraction is returned. The
 * archive is extracted once and reused, and extracted again on `"reload"`.
 *
 * Requires the Deno namespace: in Node.js, install `@deno/shim-deno` and
 * expose its `Deno` export as a global before importing this module.
 *
 * @param fileOptions {@linkcode FileOptions} file options
 * @param cacheOptions {@linkcode CacheOptions} cache options
 * @returns the absolute path to the cached file
 * @throws {TypeError} when `archivePath` is not provided for an archive, or
 * the file is not found within the extracted archive
 */
export async function cacheRemoteFile(
  fileOptions: FileOptions,
  cacheOptions?: CacheOptions,
): Promise<string> {
  const cachePath = await getCachePath(cacheOptions?.path);

  const fileUrl = new URL(fileOptions.url);

  const filePathSegments = urlToPathSegments(fileUrl);

  let absoluteFilePath = join(cachePath, filePathSegments);

  // Validate the archive path before downloading anything.
  if (fileOptions.type === "zip" && !fileOptions.archivePath) {
    throw new TypeError(
      `When using file type zip, path needs to be provided`,
    );
  }

  await ensureDir(dirname(absoluteFilePath));

  await cacheFile(fileUrl, absoluteFilePath, cacheOptions);

  if (fileOptions.type === "zip") {
    const unarchivedPath = withoutExt(absoluteFilePath);
    // A reload refetches the archive, so a previous extraction is stale and
    // is removed; otherwise the archive is only extracted when it has not
    // been extracted yet.
    const extractAgain = cacheOptions?.cacheControl === "reload";
    if (extractAgain || !(await exists(unarchivedPath))) {
      if (extractAgain) {
        await Deno.remove(unarchivedPath, { recursive: true })
          .catch((e: Error) =>
            e.name !== "NotFound" && console.warn(e.message)
          );
      }
      await unzipDir(absoluteFilePath, unarchivedPath);
    }
    absoluteFilePath = join(unarchivedPath, fileOptions.archivePath!);
    const fileExistsInArchive = await exists(absoluteFilePath);
    if (!fileExistsInArchive) {
      throw new TypeError(
        `Library not found in archive at ${absoluteFilePath}`,
      );
    }
  }

  return absoluteFilePath;
}

/**
 * Gets the cache path for dlopen files
 *
 * Requires the Deno namespace when no custom `path` is given: in Node.js,
 * install `@deno/shim-deno` and expose its `Deno` export as a global
 * before importing this module.
 *
 * @param path optional custom cache path
 * @returns the cache path
 */
export async function getCachePath(path?: string): Promise<string> {
  if (path) {
    return resolve(path);
  }

  const denoCacheDirPath = await denoCacheDir();

  return join(denoCacheDirPath, "stdx_dlopen_cache");
}

/**
 * Converts a URL to path segments
 *
 * The scheme, hostname and path of the URL become directories of the cache
 * path. The port, query and fragment are not part of it, so URLs that differ
 * only in those share the same cache entry.
 *
 * @param url the URL to convert
 * @returns path segments as a string
 */
export function urlToPathSegments(url: URL): string {
  return join(url.protocol.slice(0, -1), url.hostname, url.pathname);
}

/**
 * Removes the file extension from a path
 *
 * @param path the path or URL to remove extension from
 * @returns the path without extension
 */
export function withoutExt(path: string | URL): string {
  return path.toString().replace(/\.+\w+$/, "");
}
