import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seededLibrary } from '../seed';
import {
  attachments,
  type Library,
  type Operation,
  type SyncReply
} from '../model';

export class Repository {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS library (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, hash TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, mime TEXT NOT NULL, hash TEXT NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_meta (id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL);
      INSERT OR IGNORE INTO sync_meta VALUES (1,0);
      PRAGMA user_version=1;`);
    this.db
      .prepare('INSERT OR IGNORE INTO library VALUES (1,?)')
      .run(JSON.stringify(seededLibrary()));
  }
  read(): Library {
    return JSON.parse(
      (
        this.db.prepare('SELECT json FROM library WHERE id=1').get() as {
          json: string;
        }
      ).json
    );
  }
  photo(id: string) {
    return this.db
      .prepare('SELECT mime,bytes FROM attachments WHERE id=?')
      .get(id) as { mime: string; bytes: Uint8Array } | undefined;
  }
  putPhoto(id: string, mime: string, bytes: Uint8Array) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const existing = this.db
      .prepare('SELECT hash,mime FROM attachments WHERE id=?')
      .get(id) as { hash: string; mime: string } | undefined;
    if (existing && (existing.hash !== hash || existing.mime !== mime))
      throw new Error('Photo identity already has different content');
    this.db
      .prepare('INSERT OR IGNORE INTO attachments VALUES (?,?,?,?)')
      .run(id, mime, hash, bytes);
  }
  sync(operations: Operation[]): SyncReply {
    // ponytail: full snapshots suit a personal library; introduce a paged change feed if transfer size becomes material.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const library = this.read();
      let sequence = (
        this.db.prepare('SELECT sequence FROM sync_meta WHERE id=1').get() as {
          sequence: number;
        }
      ).sequence;
      let changed = false;
      const results: SyncReply['results'] = [];
      for (const op of operations) {
        const hash = createHash('sha256')
          .update(JSON.stringify(op))
          .digest('hex');
        const previous = this.db
          .prepare('SELECT hash,json FROM receipts WHERE id=?')
          .get(op.id) as { hash: string; json: string } | undefined;
        if (previous) {
          results.push(
            previous.hash === hash
              ? JSON.parse(previous.json)
              : {
                  id: op.id,
                  status: 'blocked',
                  message:
                    'An operation identity was reused for different data.'
                }
          );
          continue;
        }
        const block = (message: string) =>
          results.push({ id: op.id, status: 'blocked', message });
        if (attachments(op).some((id) => !this.photo(id))) {
          block('Upload the source photos before this operation.');
          continue;
        }
        let result: SyncReply['results'][number] = {
          id: op.id,
          status: 'accepted'
        };
        if (op.kind === 'publish') {
          const v = op.version;
          if (v.parent !== op.base) {
            block('Version parent does not match its base.');
            continue;
          }
          if (
            v.parent &&
            (!library.versions[v.parent] ||
              library.versions[v.parent].recipeId !== v.recipeId)
          ) {
            block('The parent version has not synchronized yet.');
            continue;
          }
          if (library.versions[v.id]) {
            block('This version identity already exists.');
            continue;
          }
          const recipe = library.recipes[v.recipeId];
          if (!recipe && op.base !== null) {
            block('Recipe is missing.');
            continue;
          }
          library.versions[v.id] = v;
          if ((recipe?.current ?? null) === op.base)
            library.recipes[v.recipeId] = {
              ...recipe,
              id: v.recipeId,
              current: v.id
            };
          else
            result = {
              id: op.id,
              status: 'conflict',
              recipeId: v.recipeId,
              versionId: v.id,
              message: 'Both versions are saved. Choose which recipe to use.'
            };
        } else if (op.kind === 'attempt') {
          const a = op.attempt;
          if (
            !library.versions[a.versionId] ||
            library.versions[a.versionId].recipeId !== a.recipeId
          ) {
            block(
              'The version used for this attempt has not synchronized yet.'
            );
            continue;
          }
          if (library.attempts[a.id]) {
            block('This cooking attempt identity already exists.');
            continue;
          }
          library.attempts[a.id] = a;
        } else {
          if (library.imports[op.source.id]) {
            block('This import identity already exists.');
            continue;
          }
          library.imports[op.source.id] = op.source;
        }
        this.db
          .prepare('INSERT INTO receipts VALUES (?,?,?)')
          .run(op.id, hash, JSON.stringify(result));
        changed = true;
        results.push(result);
      }
      this.db
        .prepare('UPDATE library SET json=? WHERE id=1')
        .run(JSON.stringify(library));
      if (changed)
        this.db
          .prepare('UPDATE sync_meta SET sequence=? WHERE id=1')
          .run(++sequence);
      this.db.exec('COMMIT');
      return { sequence, library, results };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
