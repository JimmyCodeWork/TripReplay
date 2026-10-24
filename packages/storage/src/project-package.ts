import type { AssetStore, ProjectRepository } from "@tripreplay/app";
import { type AssetId, type Project, SCHEMA_VERSION } from "@tripreplay/domain";
import { isSafeAssetId } from "./asset-store.ts";
import { StorageError } from "./errors.ts";
import { checkStoredProject } from "./project-repository.ts";
import { type ByteSource, readEntry, readZip, type ZipEntry, ZipError } from "./zip/zip-read.ts";
import { writeZip } from "./zip/zip-write.ts";

export const PACKAGE_FORMAT = "tripreplay-project";
export const PACKAGE_VERSION = 1;
export const PACKAGE_EXTENSION = ".tripreplay";

const MANIFEST = "manifest.json";
const PROJECT = "project.json";
const MEDIA = "media/";
const LIMITS = { maxEntries: 100_000, maxDirectoryBytes: 32 * 1024 * 1024 };
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;

export interface PackageManifest {
  readonly format: typeof PACKAGE_FORMAT;
  readonly version: number;
  readonly schemaVersion: number;
  /** ISO 8601 time of the backup. */
  readonly createdAt: string;
  readonly assets: readonly { readonly id: AssetId; readonly path: string; readonly byteSize: number }[];
}

/** A media file to include in a package. */
export interface PackageMedia {
  readonly size: number;
  stream(): AsyncIterable<Uint8Array>;
}

/**
 * Writes a project and all of its media as one ZIP file (see docs/project-package.md). `media`
 * returns the stored file of an asset, or undefined when it is missing, which fails the backup.
 */
export async function* writeProjectPackage(
  project: Project,
  media: (id: AssetId) => Promise<PackageMedia | undefined>,
  createdAt: Date,
): AsyncIterable<Uint8Array> {
  const files = new Map<AssetId, PackageMedia>();
  for (const asset of project.assets) {
    const file = await media(asset.id);
    if (!file) throw new StorageError("missingAsset", `The file of asset "${asset.id}" is missing`);
    if (file.size !== asset.byteSize) {
      throw new StorageError("sizeMismatch", `The file of asset "${asset.id}" has an unexpected size`);
    }
    files.set(asset.id, file);
  }
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    assets: project.assets.map((a) => ({ id: a.id, path: `${MEDIA}${a.id}`, byteSize: a.byteSize })),
  };
  const encoder = new TextEncoder();
  const json = (value: unknown) => {
    const bytes = encoder.encode(JSON.stringify(value, null, 2));
    return {
      size: bytes.length,
      data: async function* () {
        yield bytes;
      },
    };
  };
  yield* writeZip(
    [
      { name: MANIFEST, ...json(manifest) },
      { name: PROJECT, ...json(project) },
      ...manifest.assets.map((a) => {
        const file = files.get(a.id) as PackageMedia;
        return { name: a.path, size: file.size, data: () => file.stream() };
      }),
    ],
    createdAt,
  );
}

function invalid(message: string): StorageError {
  return new StorageError("invalidPackage", message);
}

async function readJson(source: ByteSource, entry: ZipEntry | undefined, maxBytes: number): Promise<unknown> {
  if (!entry) throw invalid("The package is missing a required file");
  if (entry.size > maxBytes) throw invalid(`"${entry.name}" is too large`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of readEntry(source, entry)) chunks.push(chunk);
  const bytes = new Uint8Array(entry.size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid(`"${entry.name}" is not valid JSON`);
  }
}

function checkManifest(value: unknown): PackageManifest {
  const manifest = value as Partial<PackageManifest> | null;
  if (manifest?.format !== PACKAGE_FORMAT) throw invalid("Not a TripReplay project package");
  if (typeof manifest.version !== "number" || manifest.version > PACKAGE_VERSION) {
    throw new StorageError("unsupportedVersion", `Package version ${String(manifest.version)} is not supported`);
  }
  if (!Array.isArray(manifest.assets)) throw invalid("The manifest has no asset list");
  return manifest as PackageManifest;
}

export interface OpenedPackage {
  readonly manifest: PackageManifest;
  readonly project: Project;
  /** Streams the media file of an asset, failing at the end if it is damaged. */
  media(id: AssetId): AsyncIterable<Uint8Array>;
}

/**
 * Opens a package and checks it before anything is restored: only known file names (which rules
 * out path traversal), sizes that match the project, a supported version, and a valid project.
 */
export async function readProjectPackage(source: ByteSource): Promise<OpenedPackage> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(source, LIMITS);
  } catch (error) {
    throw error instanceof ZipError ? invalid(error.message) : error;
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  for (const name of byName.keys()) {
    const known =
      name === MANIFEST || name === PROJECT || (name.startsWith(MEDIA) && isSafeAssetId(name.slice(MEDIA.length)));
    if (!known) throw invalid(`Unexpected file "${name}" in the package`);
  }
  const wrap = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      throw error instanceof ZipError ? invalid(error.message) : error;
    }
  };
  const manifest = checkManifest(await wrap(() => readJson(source, byName.get(MANIFEST), MAX_MANIFEST_BYTES)));
  const project = checkStoredProject(
    (await wrap(() => readJson(source, byName.get(PROJECT), MAX_PROJECT_BYTES))) as Project,
  );
  const mediaEntries = entries.filter((e) => e.name.startsWith(MEDIA));
  if (mediaEntries.length !== project.assets.length) throw invalid("The media files do not match the project");
  for (const asset of project.assets) {
    const entry = byName.get(`${MEDIA}${asset.id}`);
    if (!isSafeAssetId(asset.id) || entry?.size !== asset.byteSize) {
      throw invalid(`The media file of asset "${asset.id}" is missing or has the wrong size`);
    }
  }
  return {
    manifest,
    project,
    async *media(id) {
      const entry = byName.get(`${MEDIA}${id}`);
      if (!entry) throw new StorageError("missingAsset", `Asset "${id}" is not in the package`);
      try {
        yield* readEntry(source, entry);
      } catch (error) {
        throw error instanceof ZipError ? invalid(error.message) : error;
      }
    },
  };
}

/**
 * Restores a package: stores its media first and saves the project last, so an interrupted restore
 * leaves only unreferenced files, which start-up recovery removes. Fails with `exists` when the
 * trip is already stored. Media already stored with the same id and size is reused, as when a
 * backup is restored in the browser it came from.
 */
export async function restoreProjectPackage<File extends { readonly size: number }>(
  source: ByteSource,
  target: { readonly assets: AssetStore<File>; readonly repository: ProjectRepository },
): Promise<Project> {
  const opened = await readProjectPackage(source);
  const { project } = opened;
  if (await target.repository.load(project.trip.id)) {
    throw new StorageError("exists", `Trip "${project.trip.id}" already exists`);
  }
  for (const asset of project.assets) {
    const existing = await target.assets.open(asset.id);
    if (existing?.size === asset.byteSize) continue;
    if (existing) throw new StorageError("exists", `A different file is already stored for asset "${asset.id}"`);
    await target.assets.put(asset.id, opened.media(asset.id), asset.byteSize);
  }
  const fresh: Project = { ...project, trip: { ...project.trip, revision: 0 } };
  const result = await target.repository.save(fresh);
  if (result.kind === "conflict") throw new StorageError("exists", `Trip "${project.trip.id}" already exists`);
  return { ...fresh, trip: { ...fresh.trip, revision: result.revision } };
}
