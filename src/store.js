import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class ActionStore {
  constructor(databasePath) {
    const resolved = resolve(databasePath);
    mkdirSync(dirname(resolved), { recursive: true });
    this.database = new DatabaseSync(resolved);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS actions (
        action_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reference_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_retry_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_actions_status_retry
        ON actions(status, next_retry_at);
    `);
  }

  key(sessionId, actionType, referenceAt) {
    return `${sessionId}:${actionType}:${referenceAt}`;
  }

  isSuccessful(sessionId, actionType, referenceAt) {
    const row = this.database
      .prepare('SELECT status FROM actions WHERE action_key = ?')
      .get(this.key(sessionId, actionType, referenceAt));
    return row?.status === 'success';
  }

  claim(sessionId, actionType, referenceAt, maximumAttempts) {
    const actionKey = this.key(sessionId, actionType, referenceAt);
    const now = new Date();
    const nowIso = now.toISOString();
    const staleIso = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    const inserted = this.database
      .prepare(`
        INSERT OR IGNORE INTO actions (
          action_key, session_id, action_type, reference_at, status,
          attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', 1, ?, ?)
      `)
      .run(actionKey, sessionId, actionType, referenceAt, nowIso, nowIso);
    if (inserted.changes === 1) return true;

    const reclaimed = this.database
      .prepare(`
        UPDATE actions
           SET status = 'pending', attempts = attempts + 1,
               last_error = NULL, next_retry_at = NULL, updated_at = ?
         WHERE action_key = ?
           AND attempts < ?
           AND (
             (status = 'failed' AND (next_retry_at IS NULL OR next_retry_at <= ?))
             OR (status = 'pending' AND updated_at <= ?)
           )
      `)
      .run(nowIso, actionKey, maximumAttempts, nowIso, staleIso);
    return reclaimed.changes === 1;
  }

  succeed(sessionId, actionType, referenceAt) {
    this.database
      .prepare(`
        UPDATE actions
           SET status = 'success', last_error = NULL,
               next_retry_at = NULL, updated_at = ?
         WHERE action_key = ?
      `)
      .run(new Date().toISOString(), this.key(sessionId, actionType, referenceAt));
  }

  fail(sessionId, actionType, referenceAt, error, retryDelayMinutes) {
    const now = new Date();
    const nextRetry = new Date(now.getTime() + retryDelayMinutes * 60 * 1000);
    this.database
      .prepare(`
        UPDATE actions
           SET status = 'failed', last_error = ?,
               next_retry_at = ?, updated_at = ?
         WHERE action_key = ?
      `)
      .run(
        String(error?.message ?? error).slice(0, 4000),
        nextRetry.toISOString(),
        now.toISOString(),
        this.key(sessionId, actionType, referenceAt),
      );
  }

  counts() {
    return this.database
      .prepare('SELECT status, COUNT(*) AS total FROM actions GROUP BY status')
      .all()
      .reduce((result, row) => ({ ...result, [row.status]: Number(row.total) }), {});
  }

  close() {
    this.database.close();
  }
}

