/**
 * Web fallback for the local database layer.
 *
 * The native app uses expo-sqlite, but the browser build should not import it:
 * SDK 54's web SQLite backend pulls a WASM asset that is unnecessary for this
 * app's web preview. These no-op helpers keep auth/navigation screens usable.
 */

let hasWarnedWebFallback = false;

function warnWebFallback(): void {
  if (hasWarnedWebFallback) return;
  hasWarnedWebFallback = true;
  console.warn('[GymBit] SQLite local storage is disabled on web.');
}

export async function getDatabase(): Promise<null> {
  warnWebFallback();
  return null;
}

export async function closeDatabase(): Promise<void> {
  // No-op on web.
}

export async function dbQuery<T>(): Promise<T[]> {
  warnWebFallback();
  return [];
}

export async function dbRun(): Promise<{ changes: number; lastInsertRowId: number }> {
  warnWebFallback();
  return { changes: 0, lastInsertRowId: 0 };
}

export async function dbTransaction(): Promise<void> {
  warnWebFallback();
}
