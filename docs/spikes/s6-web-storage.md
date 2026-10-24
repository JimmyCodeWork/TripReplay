# Spike S6 — Web Storage

English | [繁體中文](../zh-TW/spikes/s6-web-storage.md)

| | |
|---|---|
| Date | 2026-10-24 |
| Status | Complete for Chromium. Firefox and Safari remain to be measured (see [Open points](#open-points)). |
| Roadmap | [M1, S6](../roadmap.md#m1--technical-validation-phase-a) |

## Question

Can the Origin Private File System (OPFS) and IndexedDB hold 10 GB of media, with imports that leave no referenced partial file when the browser is terminated?

## Result

Yes, in Chromium. A 10 GiB library was written, survived a forced termination and verified intact. Forced termination at every step of an import never left a record pointing to an incomplete file, and recovery on the next start removed every leftover file.

The prototype was a throwaway page driven by Playwright. As planned for spikes, it is not merged; the protocol below is the input for the `storage` package.

## Import protocol

Media files go to OPFS; their records go to IndexedDB. A file is complete before anything refers to it:

1. Stream the file into `tmp/<id>` with `createWritable()`.
2. `close()` the stream. Chromium writes to a swap file (`<id>.crswap`) and replaces the target only on close, so the target is never half-written.
3. Check the size (and, in the product, the content hash).
4. Move the file to `assets/<id>` with `move()`.
5. Add the asset record to IndexedDB in a transaction with `durability: "strict"`.

On start-up, recovery:

- deletes everything in `tmp/`;
- deletes files in `assets/` that have no record;
- reports records whose file is missing or has the wrong size (none occurred).

In the product, recovery also deletes asset files that no saved project references, for example after an import was undone.

## Measurements

Chromium 141 (headless), Linux, Playwright 1.56, persistent profile; the browser was terminated with `SIGKILL`.

| Test | Result |
|---|---|
| Termination at each step (during writing, before close, after close, after move), 128 MB file, with an existing 64 MB asset | Every case recovered: temporary files or the unrecorded file removed, existing asset intact, a second recovery pass found nothing |
| 40 terminations at random times, 32 MB files | 0 broken records; 24 imports completed and read back correctly |
| 10 × 1 GiB import | 10 GiB stored (`fileSystem` usage 10,737,420,050 bytes, IndexedDB 5,674 bytes); 58 MB/s; all files intact after termination and restart; space released after deletion |
| Quota | 162 GB reported, 60 % of the disk; `persist()` returned `false` in the headless browser |

Throughput includes generating the test data and depends on the device; it is a lower bound for this environment, not a target.

## Decisions for `storage`

- Media in OPFS, one file per asset; metadata and projects in IndexedDB.
- The import protocol and start-up recovery above. Recovery runs before the trip list is shown.
- Request persistent storage with `navigator.storage.persist()` after the first import, and show usage and quota from `navigator.storage.estimate()`.
- Read media through `File` objects from OPFS, which allow random access for video seeking without loading the whole file.

## Open points

- **Firefox and Safari.** Only Chromium was available here. Both must be measured before the architecture gate: support for `createWritable()` and `move()` in OPFS, quota, behavior of `persist()`, and eviction of website data, including the difference between a website and a home-screen app on iOS. Where `createWritable()` is unavailable, the same protocol can use `createSyncAccessHandle()` in a dedicated worker.
- **Content hash.** Web Crypto cannot hash a stream incrementally, so the duplicate check needs an incremental SHA-256 implementation in a worker, which must pass the dependency license policy.
- **Power loss.** Process termination was tested; loss of power at the operating-system level was not.
- **Reference devices.** Throughput and the 10 GB library must be repeated on the reference devices with real camera files.
