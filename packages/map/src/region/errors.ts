export type RegionErrorCode =
  /** The source answered with an unexpected HTTP status or without the requested range. */
  | "http"
  /** The remote archive changed since the download was planned, for example a new release. */
  | "changed"
  /** The remote or stored archive is not a valid PMTiles v3 file. */
  | "invalidArchive"
  /** A stored part of a downloaded region is missing or has the wrong size, for example after eviction. */
  | "missingPart"
  /** An opened file is not a PMTiles archive of an Overture Maps theme. */
  | "unsupported"
  /** The opened files lack a theme the map needs. */
  | "incomplete";

export class RegionError extends Error {
  override name = "RegionError";
  readonly code: RegionErrorCode;
  /** HTTP status for `http` errors. */
  readonly status: number | undefined;

  constructor(code: RegionErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
