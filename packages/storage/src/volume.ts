/**
 * The file operations the asset store needs, so that its logic can be tested without a browser.
 * `opfs.ts` implements them on the Origin Private File System.
 */

export interface FileInfo {
  readonly size: number;
  /** Milliseconds since the Unix epoch. */
  readonly lastModified: number;
}

export interface Writer {
  write(chunk: Uint8Array): Promise<void>;
  /** Completes the file. Until then, the file under the name keeps its previous contents. */
  close(): Promise<void>;
  /** Discards everything written. */
  abort(): Promise<void>;
}

export interface Directory<File> {
  /** Names of all entries, including temporary files the platform creates while writing. */
  names(): Promise<string[]>;
  create(name: string): Promise<Writer>;
  /** Undefined when the entry does not exist or cannot be read, for example while another tab writes it. */
  info(name: string): Promise<FileInfo | undefined>;
  open(name: string): Promise<File | undefined>;
  /** Moves an entry into `target`, which must come from the same volume. */
  moveTo(name: string, target: Directory<File>, newName: string): Promise<void>;
  /** Removes an entry; succeeds when it does not exist. */
  remove(name: string): Promise<void>;
}

export interface Volume<File> {
  /** Files being imported. Anything here after a restart is left over from an interrupted import. */
  readonly tmp: Directory<File>;
  /** Complete media files, one per asset id. */
  readonly assets: Directory<File>;
}
