/** Small promise wrappers around IndexedDB requests and transactions. */

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs `work` in a transaction and resolves with its result once the transaction has committed. */
export function transaction<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode, { durability: "strict" });
    let result: { value: T } | undefined;
    work(tx.objectStore(store)).then(
      (value) => {
        result = { value };
      },
      (error) => {
        try {
          tx.abort();
        } catch {
          // The transaction has already finished.
        }
        reject(error);
      },
    );
    tx.oncomplete = () => (result ? resolve(result.value) : reject(new Error("Transaction ended without a result")));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

export function openDatabase(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const req = indexedDB.open(name, version);
  req.onupgradeneeded = () => upgrade(req.result);
  return request(req);
}
