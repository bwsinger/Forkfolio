import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { writable, get } from 'svelte/store';
import {
  overlay,
  emptyLibrary,
  operationSchema,
  replySchema,
  type Library,
  type Operation,
  type Pending,
  type Conflict,
  type Progress
} from './model';
import { seededLibrary } from './seed';

interface LocalDB extends DBSchema {
  meta: { key: string; value: unknown };
  outbox: { key: number; value: Pending };
  blobs: { key: string; value: Blob };
}
export type View = {
  ready: boolean;
  library: Library;
  server: Library;
  pending: number;
  conflicts: Conflict[];
  progress: Record<string, Progress>;
  status: string;
  error: string;
  offlineReady: boolean;
  persistence: string;
};
export const state = writable<View>({
  ready: false,
  library: emptyLibrary(),
  server: emptyLibrary(),
  pending: 0,
  conflicts: [],
  progress: {},
  status: 'Opening your recipe book…',
  error: '',
  offlineReady: false,
  persistence: ''
});
let database: Promise<IDBPDatabase<LocalDB>>;
let activeSync: Promise<void> | undefined;
let retryTimer: ReturnType<typeof setTimeout>;
let failures = 0;
export function db() {
  return (database ??= openDB<LocalDB>('forkfolio', 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('outbox', { autoIncrement: true });
      db.createObjectStore('blobs');
    },
    blocked() {
      state.update((s) => ({
        ...s,
        error: 'Close other Forkfolio tabs to finish the storage upgrade.'
      }));
    }
  }));
}
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
export function problem(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to save';
  state.update((s) => ({
    ...s,
    error:
      message.includes('quota') ||
      (error instanceof DOMException && error.name === 'QuotaExceededError')
        ? 'Storage full. Your last change was not saved. Keep this screen open and copy the unsaved change before leaving.'
        : message
  }));
}
async function refresh() {
  const d = await db();
  const tx = d.transaction(['meta', 'outbox'], 'readonly');
  const [base, conflicts, progress, pending] = await Promise.all([
    tx.objectStore('meta').get('base'),
    tx.objectStore('meta').get('conflicts'),
    tx.objectStore('meta').get('progress'),
    tx.objectStore('outbox').getAll()
  ]);
  await tx.done;
  const server = (base as Library) ?? emptyLibrary();
  state.update((s) => ({
    ...s,
    ready: true,
    library: overlay(server, pending, (conflicts as Conflict[]) ?? []),
    server,
    pending: pending.length,
    conflicts: (conflicts as Conflict[]) ?? [],
    progress: (progress as Record<string, Progress>) ?? {}
  }));
}
export async function initialize() {
  const d = await db();
  const tx = d.transaction('meta', 'readwrite');
  if (!(await tx.store.get('base')))
    await tx.store.put(seededLibrary(), 'base');
  await tx.done;
  await refresh();
  const persisted = await navigator.storage?.persisted?.();
  state.update((s) => ({
    ...s,
    persistence: persisted
      ? 'Persistent storage granted'
      : 'Browser-managed storage. Export unsynced work for a backup.'
  }));
  const checkWorker = async () => {
    if ('serviceWorker' in navigator) {
      const r = await navigator.serviceWorker.getRegistration();
      state.update((s) => ({ ...s, offlineReady: !!r?.active }));
    }
  };
  void checkWorker();
  if ('serviceWorker' in navigator)
    void navigator.serviceWorker.ready.then(checkWorker);
  void sync();
}
export async function requestPersistence() {
  const granted = await navigator.storage?.persist?.();
  state.update((s) => ({
    ...s,
    persistence: granted
      ? 'Persistent storage granted'
      : 'The browser did not grant persistent storage. Keep an export of unsynced work.'
  }));
}
export async function getLocal<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}
export async function saveLocal(key: string, value: unknown) {
  await (await db()).put('meta', plain(value), key);
}
export async function saveProgress(recipeId: string, progress: Progress) {
  const d = await db();
  const tx = d.transaction('meta', 'readwrite');
  const all =
    ((await tx.store.get('progress')) as Record<string, Progress>) ?? {};
  all[recipeId] = plain(progress);
  await tx.store.put(all, 'progress');
  await tx.done;
  await refresh();
}
export async function enqueue(
  op: Operation,
  cleanup: { draft?: string; progress?: string; conflict?: string } = {}
) {
  const validated = operationSchema.parse(plain(op));
  const d = await db();
  const tx = d.transaction(['meta', 'outbox'], 'readwrite');
  await tx.objectStore('outbox').add({ op: validated });
  if (cleanup.draft) await tx.objectStore('meta').delete(cleanup.draft);
  if (cleanup.progress) {
    const progress =
      ((await tx.objectStore('meta').get('progress')) as Record<
        string,
        Progress
      >) ?? {};
    delete progress[cleanup.progress];
    await tx.objectStore('meta').put(progress, 'progress');
  }
  if (cleanup.conflict) {
    const conflicts =
      ((await tx.objectStore('meta').get('conflicts')) as Conflict[]) ?? [];
    await tx.objectStore('meta').put(
      conflicts.filter((c) => c.recipeId !== cleanup.conflict),
      'conflicts'
    );
  }
  await tx.done;
  await refresh();
  state.update((s) => ({ ...s, error: '', status: 'Saved on this device' }));
  void sync();
}
export async function savePhoto(file: Blob): Promise<string> {
  if (file.size > 15 * 1024 * 1024)
    throw new Error('This photo exceeds 15 MB. Choose a smaller image.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP photo.');
  const id = crypto.randomUUID();
  await (await db()).put('blobs', file, id);
  return id;
}
export async function photoURL(id: string) {
  const blob = await (await db()).get('blobs', id);
  return blob ? URL.createObjectURL(blob) : '';
}
async function responseOK(r: Response) {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(
      new Error(
        body.message ??
          (r.status === 401
            ? 'Sign in to sync. Local recipes remain available.'
            : `Server error ${r.status}`)
      ),
      { status: r.status }
    );
  }
}
export async function signIn(secret: string) {
  const r = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret }),
    signal: AbortSignal.timeout(15000)
  });
  await responseOK(r);
  state.update((s) => ({ ...s, error: '' }));
  if (activeSync) await activeSync;
  await sync();
}
export function sync(): Promise<void> {
  return (activeSync ??= runSync().finally(() => {
    activeSync = undefined;
  }));
}
async function runSync() {
  if (!get(state).ready) return;
  clearTimeout(retryTimer);
  state.update((s) => ({ ...s, status: 'Syncing…' }));
  try {
    const d = await db();
    const read = d.transaction('outbox', 'readonly');
    const [pending, keys] = await Promise.all([
      read.store.getAll(),
      read.store.getAllKeys()
    ]);
    await read.done;
    const batch: Pending[] = [];
    let bytes = 0;
    for (const entry of pending) {
      const size = new TextEncoder().encode(JSON.stringify(entry.op)).length;
      if (batch.length >= 100 || bytes + size > 1500 * 1024) break;
      batch.push(entry);
      bytes += size;
    }
    if (pending.length && !batch.length)
      throw new Error(
        'A queued change exceeds the transfer limit. Export your data before correcting it.'
      );
    // Upload dependencies first. Failed uploads leave both source bytes and operations intact.
    for (const { op } of batch) {
      const ids =
        op.kind === 'attempt'
          ? op.attempt.photos
          : op.kind === 'import'
            ? op.source.photos
            : [];
      for (const id of ids) {
        const blob = await d.get('blobs', id);
        if (!blob)
          throw new Error(
            'A pending photo is missing. Export your data before attempting recovery.'
          );
        const r = await fetch(`/api/attachments/${id}`, {
          method: 'PUT',
          body: blob,
          signal: AbortSignal.timeout(30000)
        });
        await responseOK(r);
      }
    }
    const r = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: batch.map((p) => p.op) }),
      signal: AbortSignal.timeout(30000)
    });
    await responseOK(r);
    const reply = replySchema.parse(await r.json());
    // Fetch every retained attachment, not just recently opened photos, before declaring a complete sync.
    const ids = new Set([
      ...Object.values(reply.library.attempts).flatMap((a) => a.photos),
      ...Object.values(reply.library.imports).flatMap((i) => i.photos)
    ]);
    for (const id of ids)
      if (!(await d.get('blobs', id))) {
        const r = await fetch(`/api/attachments/${id}`, {
          signal: AbortSignal.timeout(30000)
        });
        await responseOK(r);
        await d.put('blobs', await r.blob(), id);
      }
    const tx = d.transaction(['meta', 'outbox'], 'readwrite');
    let conflicts =
      ((await tx.objectStore('meta').get('conflicts')) as Conflict[]) ?? [];
    for (const result of reply.results) {
      const index = batch.findIndex((p) => p.op.id === result.id);
      if (index < 0 || result.status === 'blocked') continue;
      const queued = await tx.objectStore('outbox').get(keys[index]);
      if (!queued || queued.op.id !== result.id) continue;
      await tx.objectStore('outbox').delete(keys[index]);
      if (result.status === 'conflict' && result.recipeId && result.versionId) {
        conflicts = conflicts.filter((c) => c.recipeId !== result.recipeId);
        conflicts.push({
          recipeId: result.recipeId,
          versionId: result.versionId
        });
      }
    }
    const sequence =
      ((await tx.objectStore('meta').get('sequence')) as number) ?? 0;
    if (reply.sequence >= sequence) {
      await tx.objectStore('meta').put(reply.library, 'base');
      await tx.objectStore('meta').put(reply.sequence, 'sequence');
    }
    await tx.objectStore('meta').put(conflicts, 'conflicts');
    await tx.done;
    await refresh();
    failures = 0;
    const blocked = reply.results.find((r) => r.status === 'blocked');
    state.update((s) => ({
      ...s,
      status: blocked
        ? 'Sync needs attention'
        : s.conflicts.length
          ? 'Conflicting versions saved'
          : s.pending
            ? 'Waiting to sync'
            : 'Synced',
      error: blocked?.message ?? s.error
    }));
    if (!blocked && get(state).pending)
      retryTimer = setTimeout(() => void sync(), 1000);
  } catch (error) {
    failures++;
    const message =
      error instanceof Error ? error.message : 'Server unavailable';
    state.update((s) => ({
      ...s,
      status: message.includes('Sign in')
        ? 'Sign in to sync'
        : message.includes('not configured')
          ? 'Server setup needed'
          : 'Server unavailable',
      error:
        s.error ||
        (/fetch|network|timeout|sign in|not configured/i.test(message)
          ? ''
          : message)
    }));
    const status =
      error instanceof Error && 'status' in error ? Number(error.status) : 0;
    const retryable = status
      ? status >= 500 && !message.includes('not configured')
      : /fetch|network|timeout/i.test(message);
    if (retryable && document.visibilityState === 'visible' && failures <= 5)
      retryTimer = setTimeout(
        () => void sync(),
        Math.min(60000, 2000 * 2 ** failures)
      );
  }
}
export async function resolveConflict(recipeId: string) {
  const d = await db();
  const tx = d.transaction('meta', 'readwrite');
  const conflicts = ((await tx.store.get('conflicts')) as Conflict[]) ?? [];
  await tx.store.put(
    conflicts.filter((c) => c.recipeId !== recipeId),
    'conflicts'
  );
  await tx.done;
  await refresh();
}
export async function exportBackup() {
  const d = await db();
  const tx = d.transaction(['meta', 'outbox', 'blobs'], 'readonly');
  const [keys, photos, metaKeys, meta, pending] = await Promise.all([
    tx.objectStore('blobs').getAllKeys(),
    tx.objectStore('blobs').getAll(),
    tx.objectStore('meta').getAllKeys(),
    tx.objectStore('meta').getAll(),
    tx.objectStore('outbox').getAll()
  ]);
  await tx.done;
  // ponytail: JSON/base64 exports are memory-bound; use a streamed archive when photo collections become large.
  const blobs: Record<string, { type: string; data: string }> = {};
  for (let i = 0; i < keys.length; i++) {
    const b = photos[i];
    const bytes = new Uint8Array(await b.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    blobs[keys[i]] = { type: b.type, data: btoa(binary) };
  }
  return {
    format: 'forkfolio-backup',
    version: 1,
    created: new Date().toISOString(),
    metadata: Object.fromEntries(metaKeys.map((k, i) => [k, meta[i]])),
    pending,
    blobs
  };
}
export function stopSync() {
  clearTimeout(retryTimer);
}
