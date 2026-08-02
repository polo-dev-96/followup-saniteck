import { timingSafeEqual } from 'node:crypto';
import { FollowupEngine } from './engine.js';
import { selectDepartment } from './routing.js';
import { testPage } from './panel-page.js';

const OPEN_STATUSES = new Set(['STARTED', 'PENDING', 'IN_PROGRESS']);
const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '');
const recipientsFor = (session) => [
  session.contactDetails?.phonenumber,
  session.contactDetails?.['display-phonenumber'],
  session.contactDetails?.instagram,
  session.number,
].filter(Boolean).map(normalizePhone);

const matchesPhone = (session, phone) => recipientsFor(session).some(
  (candidate) => candidate === phone || candidate.endsWith(phone) || phone.endsWith(candidate),
);

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error('Corpo muito grande'), { status: 413 });
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
};

export class TestPanel {
  constructor({ config, client, store }) {
    this.config = config;
    this.client = client;
    this.store = store;
    this.executing = false;
  }

  authorized(request) {
    const supplied = String(request.headers['x-admin-token'] ?? '');
    const expected = this.config.testAdminToken;
    if (!supplied || supplied.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  }

  async findOpen(phoneInput) {
    const phone = normalizePhone(phoneInput);
    if (phone.length < 10 || phone.length > 15) {
      throw Object.assign(new Error('Informe um telefone válido com DDD'), { status: 400 });
    }
    const after = new Date(Date.now() - 1500 * 60 * 1000).toISOString();
    const sessions = [];
    for await (const session of this.client.listSessions({ after })) {
      const open = OPEN_STATUSES.has(session.status) && session.endAt == null;
      if (open && matchesPhone(session, phone)) sessions.push(session);
    }
    return { sessions };
  }

  describe(session) {
    const lastIn = Date.parse(session.lastMessageIn ?? '');
    const lastOut = Date.parse(session.lastMessageOut ?? '');
    const referenceAt = Number.isFinite(lastIn) ? new Date(lastIn).toISOString() : null;
    const routing = selectDepartment(session.contactDetails?.tagsName, this.config.commercialDepartmentId);
    return {
      sessionId: session.id,
      status: session.status,
      departmentId: session.departmentId,
      inSourceDepartment: session.departmentId === this.config.sourceDepartmentId,
      minutesSinceClientMessage: Number.isFinite(lastIn)
        ? Number(((Date.now() - lastIn) / 60000).toFixed(1)) : null,
      companyAnsweredAfterClient: Number.isFinite(lastIn) && Number.isFinite(lastOut) && lastOut > lastIn,
      recipientAvailable: recipientsFor(session).length > 0,
      routing,
      simulatedFlow: ['message_30m', 'chatbot_30m', 'transfer_30m'],
      recordedActions: referenceAt ? this.store.actionsFor(session.id, referenceAt) : [],
    };
  }

  async lookup(body) {
    const found = await this.findOpen(body.phone);
    return {
      liveTestEnabled: this.config.allowLiveTest,
      sessionsFound: found.sessions.length,
      sessions: found.sessions.map((session) => this.describe(session)),
    };
  }

  async execute(body) {
    if (!this.config.allowLiveTest) {
      throw Object.assign(new Error('Teste real desabilitado por ALLOW_LIVE_TEST'), { status: 403 });
    }
    if (body.confirmation !== 'ENVIAR FOLLOWUP') {
      throw Object.assign(new Error('Confirmação inválida'), { status: 400 });
    }
    if (this.executing) throw Object.assign(new Error('Outro teste está em execução'), { status: 409 });
    this.executing = true;
    try {
      const found = await this.findOpen(body.phone);
      const matches = found.sessions.filter((session) => session.id === body.sessionId);
      if (matches.length !== 1 || found.sessions.length !== 1) {
        throw Object.assign(new Error(`Esperada exatamente uma sessão aberta; encontradas ${found.sessions.length}`), { status: 409 });
      }
      const session = matches[0];
      if (session.departmentId !== this.config.sourceDepartmentId) {
        throw Object.assign(new Error('A sessão não está no departamento de origem'), { status: 409 });
      }
      const lastIn = Date.parse(session.lastMessageIn ?? '');
      const lastOut = Date.parse(session.lastMessageOut ?? '');
      if (!Number.isFinite(lastIn) || !Number.isFinite(lastOut) || lastOut <= lastIn) {
        throw Object.assign(new Error('A empresa ainda não respondeu depois do cliente'), { status: 409 });
      }
      if (recipientsFor(session).length === 0) {
        throw Object.assign(new Error('Destinatário não encontrado'), { status: 409 });
      }
      const referenceAt = new Date(lastIn).toISOString();
      const engine = new FollowupEngine({
        config: { ...this.config, dryRun: false },
        client: this.client,
        store: this.store,
      });
      await engine.reactivate(session, { window: '30m', referenceAt, closingAlreadySent: false });
      return {
        executed: true,
        session: this.describe(session),
        actions: this.store.actionsFor(session.id, referenceAt),
      };
    } finally {
      this.executing = false;
    }
  }

  async handleApi(request, response, url) {
    if (request.method !== 'POST' || !['/api/test/lookup', '/api/test/execute'].includes(url.pathname)) {
      return false;
    }
    if (!this.authorized(request)) {
      sendJson(response, 401, { error: 'unauthorized' });
      return true;
    }
    try {
      const body = await readBody(request);
      const result = url.pathname.endsWith('/lookup') ? await this.lookup(body) : await this.execute(body);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, error.status ?? 500, { error: 'test_panel_error', message: error.message });
    }
    return true;
  }

  async handle(request, response) {
    if (!this.config.testPanelEnabled) return false;
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/test') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
      });
      response.end(testPage);
      return true;
    }
    return this.handleApi(request, response, url);
  }
}
