export type RegionErrorCode =
  /** The source answered with an unexpected HTTP status or without the requested range. */
  | "http"
  /** The remote archive changed since the download was planned, for example a new release. */
  | "changed"
  /** The remote or stored archive is not a valid PMTiles v3 file. */
  | "invalidArchive"
  /** A stored part of a downloaded region is missing or has the wrong size, for example after eviction. */
  | "missingPart";

export class RegionError extends Error {
  override name = "RegionError";
  readonly code: RegionErrorCode;

  constructor(code: RegionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
