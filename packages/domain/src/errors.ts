export type DomainErrorCode = "notFound" | "invalidArgument" | "kindMismatch";

/** Raised when an operation is called with arguments that cannot be applied to the project. */
export class DomainError extends Error {
  override name = "DomainError";
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function notFound(kind: string, id: string): DomainError {
  return new DomainError("notFound", `${kind} "${id}" does not exist`);
}

export function invalid(message: string): DomainError {
  return new DomainError("invalidArgument", message);
}
