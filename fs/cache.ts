/**
 * Download remote files into a local cache, and locate Deno's cache directory.
 *
 * @module
 */

import { ensureDir, exists } from "@std/fs";
import { dirname, join, resolve } from "@std/path";

/**
 * Options for denoCacheDir function
 */
export type DenoCacheDirOptions = {
  /** Will create the directory if the cache directory doesn't exists */
  ensure?: boolean;
  /** Will throw an error if the cache directory doesn't exist */
  throws?: boolean;
};

/**
 * Cache control options for cacheFile function
 *
 * - `"default"`: Normal operation, will cache file if it does not exist locally
 * - `"cachedOnly"`: Will throw if not cached
 * - `"reload"`: Will remove existing if exists and fetch from remote
 */
export type CacheControl = "default" | "cachedOnly" | "reload";

/**
 * Options for cacheFile function
 */
export type CacheFileOptions = {
  /** Cache control behavior for the file */
  cacheControl?: CacheControl;
};

/**
 * Downloads a file from a URL and caches it locally
 *
 * With the default cache control, the file is only downloaded when it does
 * not exist locally yet.
 *
 * @param url the URL to download the file from
 * @param path the local path to cache the file
 * @param options {@link CacheFileOptions} cache file options
 * @returns the absolute path to the cached file
 *
 * @example
 * ```ts ignore
 * import { cacheFile } from "@stdx/fs/cache";
 *
 * // Downloads the file on the first call, and reuses it afterwards.
 * const readme = await cacheFile(
 *   "https://example.com/README.md",
 *   "./cache/README.md",
 * );
 * ```
 */
export async function cacheFile(
  url: string | URL,
  path: string,
  options?: CacheFileOptions,
): Promise<string> {
  const localPath = resolve(path);

  await ensureDir(dirname(localPath));

  let fileExists = await exists(localPath);

  if (options?.cacheControl === "cachedOnly" && !fileExists) {
    throw new Error(
      `No cached file found, change the cacheControl option and try again`,
    );
  }

  if (fileExists && options?.cacheControl === "reload") {
    await Deno.remove(localPath);

    fileExists = false;
  }

  if (!fileExists) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Error fetching remote file: (${response.status}) ${response.statusText}`,
      );
    }

    await Deno.writeFile(
      localPath,
      new Uint8Array(await response.arrayBuffer()),
    );
  }

  return localPath;
}

/**
 * Gets the Deno cache directory path
 *
 * The directory is resolved in this order:
 *
 * - the `DENO_DIR` environment variable, when set
 * - `$HOME/Library/Caches/deno` on macOS
 * - `$USERPROFILE/deno` on Windows
 * - `$HOME/.cache/deno` on other systems, or `$XDG_CACHE_HOME/deno` when
 *   `HOME` is not set
 *
 * @param options {@link DenoCacheDirOptions} deno cache directory options
 * @returns the path to the deno cache directory
 */
export async function denoCacheDir(
  options?: DenoCacheDirOptions,
): Promise<string> {
  let cacheDir = Deno.env.get("DENO_DIR");

  if (cacheDir) return cacheDir;

  const homeDirPath = homeDir();

  switch (Deno.build.os) {
    case "darwin":
      cacheDir = join(homeDirPath, "Library/Caches/deno");
      break;
    case "windows":
      cacheDir = join(homeDirPath, "deno");
      break;
    default: {
      const path = Deno.env.get("HOME") ? ".cache/deno" : "deno";
      cacheDir = join(homeDirPath, path);
      break;
    }
  }

  if (options?.ensure) {
    await ensureDir(cacheDir);
  }

  if (options?.throws && !(await exists(cacheDir))) {
    throw new TypeError(
      `Cache dir not found at ${cacheDir}, add the ensure option or create the directory`,
    );
  }

  return cacheDir;
}

/**
 * Gets the user's home directory path
 *
 * The home directory is the `USERPROFILE` environment variable on Windows,
 * and otherwise the `HOME` environment variable, falling back to
 * `XDG_CACHE_HOME` when `HOME` is not set, so that the cache directory can
 * still be resolved.
 *
 * @returns the path to the user's home directory
 * @throws {TypeError} when home directory cannot be determined
 */
export function homeDir(): string {
  let homeEnvVar: string | undefined;
  let homeDir: string | undefined;
  switch (Deno.build.os) {
    case "windows":
      homeEnvVar = "USERPROFILE";
      homeDir = Deno.env.get(homeEnvVar);
      break;
    default:
      homeEnvVar = "HOME";
      homeDir = Deno.env.get(homeEnvVar);
      if (homeDir) break;
      homeEnvVar = "XDG_CACHE_HOME";
      homeDir = Deno.env.get(homeEnvVar);
  }

  if (!homeDir) {
    throw new TypeError(
      `Home dir can not be determined, using env var '${homeEnvVar}' for os ${Deno.build.os}`,
    );
  }

  return resolve(homeDir);
}
