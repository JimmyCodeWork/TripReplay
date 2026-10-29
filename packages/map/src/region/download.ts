import type { AssetStore } from "@tripreplay/app";
import { Compression } from "../pmtiles/archive.ts";
import { RegionError } from "./errors.ts";
import type { PartPlan, RegionPlan, ThemePlan } from "./plan.ts";
import { type RegionRecord, verifyRegion } from "./region.ts";

export interface DownloadProgress {
  readonly completedBytes: number;
  readonly totalBytes: number;
}

export interface DownloadOptions {
  /** Store for map files; it must not be one that removes files no project refers to, such as the media store. */
  readonly store: AssetStore<Blob>;
  /** Prefix of the stored file names; letters, digits, `_` and `-` only. */
  readonly regionId: string;
  readonly name: string;
  /** Pauses the download; calling `downloadRegion` again resumes it. */
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: DownloadProgress) => void;
  /** Parts downloaded at the same time. */
  readonly concurrency?: number;
  /** Attempts per part before the download fails. */
  readonly attempts?: number;
  /** Delay before the first retry, doubled for each further one. */
  readonly retryDelayMs?: number;
}

const GZIP_MAGIC = [0x1f, 0x8b] as const;

/** Part file names include the remote version, so parts of an older release are never reused. */
function version(etag: string | undefined): string {
  return (etag ?? "none").replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "none";
}

export function partIds(regionId: string, theme: ThemePlan): string[] {
  const prefix = `${regionId}-${theme.theme}-${version(theme.etag)}`;
  return [`${prefix}-head`, ...theme.parts.map((_, i) => `${prefix}-${i}`)];
}

async function* partData(theme: ThemePlan, part: PartPlan, signal: AbortSignal): AsyncIterable<Uint8Array> {
  for (const range of part.ranges) {
    const data = await theme.source.read(range.offset, range.length, signal);
    if (data.length !== range.length) throw new RegionError("http", "The remote archive ended early");
    // Every stored tile is a gzip stream; a range that is not would mean misplaced data.
    if (theme.tileCompression === Compression.gzip && (data[0] !== GZIP_MAGIC[0] || data[1] !== GZIP_MAGIC[1])) {
      throw new RegionError("invalidArchive", "The remote archive returned data that is not a tile");
    }
    yield data;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Downloads a planned region into the store, part by part. Each part is stored only once it is
 * complete, so an interrupted download keeps the parts it finished and a later call downloads only
 * the rest. Once all parts are stored, the region is verified and its record returned; the record is
 * what the application keeps to open the region later.
 */
export async function downloadRegion(plan: RegionPlan, options: DownloadOptions): Promise<RegionRecord> {
  const { store } = options;
  // Stops the other parts when one fails, as well as when the caller pauses.
  const controller = new AbortController();
  const signal = controller.signal;
  const pause = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) pause();
  options.signal?.addEventListener("abort", pause, { once: true });
  const attempts = options.attempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const jobs = plan.themes.flatMap((theme) => {
    const ids = partIds(options.regionId, theme);
    const head = {
      size: theme.head.length,
      data: async function* () {
        yield theme.head;
      },
    };
    const parts = theme.parts.map((part) => ({ size: part.size, data: () => partData(theme, part, signal) }));
    return [head, ...parts].map((job, i) => ({ id: ids[i] as string, ...job }));
  });

  let completedBytes = 0;
  const report = (bytes: number) => {
    completedBytes += bytes;
    options.onProgress?.({ completedBytes, totalBytes: plan.size });
  };

  const run = async (job: (typeof jobs)[number]) => {
    const stored = await store.open(job.id);
    if (stored?.size === job.size) return report(job.size);
    if (stored) await store.remove(job.id);
    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted();
      try {
        await store.put(job.id, job.data(), job.size);
        return report(job.size);
      } catch (error) {
        const retryable = !signal.aborted && !(error instanceof RegionError && error.code !== "http");
        if (!retryable || attempt >= attempts) throw error;
        await sleep(retryDelayMs * 2 ** (attempt - 1), signal);
      }
    }
  };

  let next = 0;
  const worker = async () => {
    try {
      while (next < jobs.length) await run(jobs[next++] as (typeof jobs)[number]);
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, jobs.length) }, worker));
  } finally {
    options.signal?.removeEventListener("abort", pause);
  }

  const record = regionRecord(plan, options.regionId, options.name);
  await verifyRegion(record, store);
  return record;
}

/**
 * The record of a planned region. The application saves it before the download starts and marks it
 * ready once `downloadRegion` resolves, so that the parts of a paused download are kept.
 */
export function regionRecord(plan: RegionPlan, regionId: string, name: string): RegionRecord {
  return {
    id: regionId,
    name,
    bounds: plan.bounds,
    size: plan.size,
    themes: plan.themes.map((theme) => {
      const ids = partIds(regionId, theme);
      const sizes = [theme.head.length, ...theme.parts.map((part) => part.size)];
      return { theme: theme.theme, etag: theme.etag, parts: ids.map((id, i) => ({ id, size: sizes[i] as number })) };
    }),
  };
}
