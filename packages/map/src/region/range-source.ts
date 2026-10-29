import { RegionError } from "./errors.ts";

/** Random read access to a remote archive. */
export interface RangeSource {
  /** Reads `length` bytes, or fewer when the file ends earlier. */
  read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;
  /** Identifies the version of the file; set once the first read has completed. */
  readonly etag: string | undefined;
}

/**
 * Reads a file by HTTP range requests. The ETag of the first response is kept, and later responses
 * with a different ETag fail with `changed`, so that one archive is never mixed from two versions.
 */
export function httpRangeSource(url: string, fetchFn: typeof fetch = fetch): RangeSource {
  let etag: string | undefined;
  return {
    get etag() {
      return etag;
    },
    async read(offset, length, signal) {
      const response = await fetchFn(url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
        ...(signal ? { signal } : {}),
      });
      if (response.status !== 206) {
        throw new RegionError("http", `${url}: HTTP ${response.status} for a range request`, response.status);
      }
      const start = /^bytes (\d+)-/.exec(response.headers.get("Content-Range") ?? "")?.[1];
      if (Number(start) !== offset) throw new RegionError("http", `${url}: the response is not the requested range`);
      const tag = response.headers.get("ETag") ?? undefined;
      if (etag === undefined) etag = tag;
      else if (tag !== etag) throw new RegionError("changed", `${url} changed during the download`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length > length) throw new RegionError("http", `${url}: the response is longer than requested`);
      return data;
    },
  };
}
