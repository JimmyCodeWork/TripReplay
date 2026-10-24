export type StorageErrorCode = "invalidId" | "exists" | "sizeMismatch" | "unsupportedVersion" | "invalidProject";

export class StorageError extends Error {
  override name = "StorageError";
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
