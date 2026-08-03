import { messages } from './config.js';
import { log } from './logger.js';
import { selectDepartment } from './routing.js';

const OPEN_STATUSES = new Set(['STARTED', 'PENDING', 'IN_PROGRESS']);
const CLOSING_PREFIX = 'Olá! 😊 Como não tive retorno, este atendimento será encerrado.';

export const decideWindow = (minutes, closingAlreadySent = false) => {
  if (minutes >= 15 && minutes < 25) return '15m';
  if (minutes >= 30 && minutes < 40) return '30m';
  if (minutes >= 120 && minutes < 130) return '2h';
  if ((minutes >= 1380 && minutes < 1440) || (closingAlreadySent && minutes < 1500)) {
    return 'closing';
  }
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
  const closingAlreadySent = String(session.lastMessageText ?? '').startsWith(CLOSING_PREFIX);
  const window = decideWindow(minutes, closingAlreadySent);
  if (!window) return null;

  return {
    window,
    minutes,
    referenceAt: new Date(lastMessageIn).toISOString(),
    closingAlreadySent,
  };
};

const recipientFor = (session) =>
  session.contactDetails?.phonenumber ||
  session.contactDetails?.instagram ||
  session.number ||
  null;

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

  async reactivate(session, context) {
    const suffix = context.window;
    const textByWindow = {
      '15m': messages.followup15,
      '30m': messages.followup30,
      '2h': messages.followup2h,
    };
    const text = textByWindow[context.window];
    const messageOk = await this.step(
      session,
      `message_${suffix}`,
      context.referenceAt,
      () => this.client.sendMessage(session.id, text),
    );
    if (!messageOk) return;

    const chatbotOk = await this.step(
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
    if (!chatbotOk) return;

    if (context.window === '15m') return;

    const routing = selectDepartment(
      session.contactDetails?.tagsName,
      this.config.commercialDepartmentId,
    );
    await this.step(
      session,
      `transfer_${suffix}`,
      context.referenceAt,
      () => this.client.transferToDepartment(session.id, routing.departmentId),
      routing,
    );
  }

  async close(session, context) {
    let messageOk = true;
    if (!context.closingAlreadySent) {
      messageOk = await this.step(
        session,
        'closing_message',
        context.referenceAt,
        () => this.client.sendMessage(session.id, messages.closing),
      );
    }
    if (!messageOk) return;
    await this.step(
      session,
      'complete_session',
      context.referenceAt,
      () => this.client.completeSession(session.id),
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
      byWindow: { '15m': 0, '30m': 0, '2h': 0, closing: 0 },
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
        if (context.window === 'closing') await this.close(session, context);
        else await this.reactivate(session, context);
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
