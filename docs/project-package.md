# Project Package Format

English | [繁體中文](zh-TW/project-package.md)

| | |
|---|---|
| Version | 1 |
| Date | 2026-10-24 |
| Status | Implemented in [`packages/storage`](../packages/storage/src/project-package.ts) |

A project package is one file that holds a trip and all of its media, for backing up a trip and restoring it in another browser or on another device.

## 1. File

- Extension `.tripreplay`; media type `application/zip`.
- A ZIP archive whose entries are **stored without compression**, because photos and videos are already compressed. Compressed or encrypted entries are rejected.
- Entry names are UTF-8. Sizes are known before writing; CRC-32 values follow each entry in a data descriptor, so the file is written as a stream without holding media in memory.
- ZIP64 records are used where a size or offset reaches 4 GiB, so libraries larger than 4 GiB are supported. The result opens with common ZIP tools.

## 2. Contents

| Entry | Content |
|---|---|
| `manifest.json` | Package metadata (below); always the first entry |
| `project.json` | The project as stored by the application: trip, stops, clips, assets and music |
| `media/<asset id>` | The original file of each asset, byte for byte |

No other entries are allowed.

```json
{
  "format": "tripreplay-project",
  "version": 1,
  "schemaVersion": 1,
  "createdAt": "2026-10-24T08:00:00.000Z",
  "assets": [{ "id": "6f1c…", "path": "media/6f1c…", "byteSize": 2481152 }]
}
```

`version` is the package format version; `schemaVersion` is the version of the project data inside it.

## 3. Reading and validation

A package is fully checked before anything is restored. It is rejected when:

- it is not a ZIP archive, is truncated, or has more than 100,000 entries or a central directory larger than 32 MiB;
- an entry is compressed or encrypted, appears twice, or lies outside the data area;
- an entry name is anything other than those in §2. This rules out absolute paths and `..` segments, and asset ids are limited to letters, digits, `_` and `-`;
- `manifest.json` is larger than 4 MiB or `project.json` larger than 64 MiB, or either is not valid UTF-8 JSON;
- the format is not `tripreplay-project`, or `version` or `schemaVersion` is newer than the application supports;
- the project does not pass validation;
- the media entries do not match the project's assets exactly, including their sizes;
- the CRC-32 of a media file does not match while it is restored.

## 4. Restoring

1. Read and validate the package (§3).
2. If a trip with the same id is already stored, stop; the user decides how to proceed.
3. Store each media file with the crash-safe import protocol ([spike S6](spikes/s6-web-storage.md)). A file already stored with the same asset id and size is reused, as when a backup is restored in the browser it came from.
4. Save the project last, as a new revision history starting at revision 1.

Because the project is saved last, an interrupted restore leaves only media that no project refers to, and start-up recovery removes it.

## 5. Compatibility

- A newer application reads packages of every earlier `version` and `schemaVersion`, migrating the project when the schema changes.
- An older application refuses packages it does not understand rather than restoring them partially.
