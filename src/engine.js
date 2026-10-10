import { log } from './logger.js';
import { selectDepartment } from './routing.js';

const OPEN_STATUSES = new Set(['STARTED', 'PENDING', 'IN_PROGRESS']);

const recipientFor = (session) =>
  session.contactDetails?.phonenumber ||
  session.contactDetails?.instagram ||
  session.number ||
  null;

export const decideWindow = (minutes) => {
  if (minutes >= 15 && minutes < 30) return '15m';
  if (minutes >= 120 && minutes < 130) return '2h';
  return null;
};

export const evaluateSession = (session, sourceDepartmentId, now = Date.now()) => {
  if (session.departmentId !== sourceDepartmentId) return null;
  if (!OPEN_STATUSES.has(session.status) || session.endAt != null) return null;

  const lastMessageIn = Date.parse(session.lastMessageIn ?? '');
  const lastMessageOut = Date.parse(session.lastMessageOut ?? '');
  if (!Number.isFinite(lastMessageIn) || !Number.isFinite(lastMessageOut)) return null;
  if (lastMessageOut <= lastMessageIn) return null;

  const minutes = (now - lastMessageIn) / 60000;
  if (minutes < 0 || minutes >= 1500) return null;
  const window = decideWindow(minutes);
  if (!window) return null;

  return {
    window,
    minutes,
    referenceAt: new Date(lastMessageIn).toISOString(),
  };
};

export class FollowupEngine {
  constructor({ config, client, store }) {
    this.config = config;
    this.client = client;
    this.store = store;
    this.running = false;
    this.lastRun = null;
    this.lastError = null;
    this.lastSummary = null;
  }

  async step(session, actionType, referenceAt, operation, metadata = {}) {
    if (this.config.dryRun) {
      log('info', 'action.would_run', { sessionId: session.id, actionType, ...metadata });
      return true;
    }
    if (this.store.isSuccessful(session.id, actionType, referenceAt)) return true;
    if (!this.store.claim(session.id, actionType, referenceAt, this.config.actionRetries)) return false;

    try {
      await operation();
      this.store.succeed(session.id, actionType, referenceAt);
      log('info', 'action.success', { sessionId: session.id, actionType, ...metadata });
      return true;
    } catch (error) {
      this.store.fail(
        session.id,
        actionType,
        referenceAt,
        error,
        this.config.retryDelayMinutes,
      );
      log('error', 'action.failed', { sessionId: session.id, actionType, error, ...metadata });
      return false;
    }
  }

  async transferAndStartChatbot(session, context) {
    const suffix = context.window;
    const routing = selectDepartment(
      session.contactDetails?.tagsName,
      this.config.commercialDepartmentId,
    );
    const transferOk = await this.step(
      session,
      `transfer_${suffix}`,
      context.referenceAt,
      () => this.client.transferToDepartment(session.id, routing.departmentId),
      routing,
    );
    if (!transferOk) return;

    await this.step(
      session,
      `chatbot_${suffix}`,
      context.referenceAt,
      () =>
        this.client.startChatbot({
          botKey: this.config.botKey,
          from: this.config.from,
          to: recipientFor(session),
          sessionId: session.id,
        }),
    );
  }

  async runOnce() {
    if (this.running) {
      log('warn', 'run.skipped_overlap');
      return;
    }
    this.running = true;
    const summary = {
      scanned: 0,
      eligible: 0,
      byWindow: { '15m': 0, '2h': 0 },
    };
    log('info', 'run.started', { dryRun: this.config.dryRun });

    try {
      const after = new Date(Date.now() - 1500 * 60 * 1000).toISOString();
      for await (const session of this.client.listSessions({ after })) {
        summary.scanned += 1;
        const context = evaluateSession(session, this.config.sourceDepartmentId);
        if (!context) continue;
        summary.eligible += 1;
        summary.byWindow[context.window] += 1;
        await this.transferAndStartChatbot(session, context);
      }
      this.lastError = null;
      this.lastRun = new Date().toISOString();
      this.lastSummary = summary;
      log('info', 'run.completed', { ...summary, actions: this.store.counts() });
    } catch (error) {
      this.lastError = error.message;
      log('error', 'run.failed', { error });
      throw error;
    } finally {
      this.running = false;
    }
  }

  health() {
    return {
      ok: true,
      running: this.running,
      dryRun: this.config.dryRun,
      lastRun: this.lastRun,
      lastError: this.lastError,
      lastSummary: this.lastSummary,
      actions: this.store.counts(),
    };
  }
}
