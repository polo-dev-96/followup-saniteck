import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.API_TOKEN = 'test-token';
const { decideWindow, evaluateSession, FollowupEngine } = await import('../src/engine.js');
const { ActionStore } = await import('../src/store.js');
const { SELLER_DEPARTMENTS } = await import('../src/routing.js');

const SOURCE_TEAM = '6e9426e0-1166-46a7-9c4b-129e46af49bc';
const baseSession = (minutes, overrides = {}) => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  const lastMessageIn = new Date(now - minutes * 60000).toISOString();
  return {
    id: 'fdb0f13d-a3ae-436f-b3c4-b6d5fbe23274',
    departmentId: SOURCE_TEAM,
    status: 'PENDING',
    endAt: null,
    lastMessageIn,
    lastMessageOut: new Date(Date.parse(lastMessageIn) + 60000).toISOString(),
    lastMessageText: 'Resposta da empresa',
    contactDetails: { phonenumber: '5592999999999', tagsName: ['Gabriela'] },
    ...overrides,
  };
};

test('classifica somente as janelas do workflow', () => {
  assert.equal(decideWindow(14.99), null);
  assert.equal(decideWindow(15), '15m');
  assert.equal(decideWindow(24.99), '15m');
  assert.equal(decideWindow(29.99), '15m');
  assert.equal(decideWindow(30), null);
  assert.equal(decideWindow(40), null);
  assert.equal(decideWindow(120), '2h');
  assert.equal(decideWindow(129.99), '2h');
  assert.equal(decideWindow(1380), null);
  assert.equal(decideWindow(1440), null);
});

test('considera a nova janela a partir de 15 minutos', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  assert.equal(evaluateSession(baseSession(15), SOURCE_TEAM, now)?.window, '15m');
});

test('ignora conversa de outra equipe ou sem resposta posterior', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  assert.equal(evaluateSession(baseSession(30, { departmentId: 'outra' }), SOURCE_TEAM, now), null);
  const session = baseSession(30);
  session.lastMessageOut = session.lastMessageIn;
  assert.equal(evaluateSession(session, SOURCE_TEAM, now), null);
});

test('executa transferência antes do chatbot e sem duplicar', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'followup-test-'));
  const store = new ActionStore(join(directory, 'test.sqlite'));
  const calls = [];
  const client = {
    transferToDepartment: async (_sessionId, departmentId) => calls.push(`transfer:${departmentId}`),
    startChatbot: async () => calls.push('chatbot'),
  };
  const config = {
    dryRun: false,
    actionRetries: 3,
    retryDelayMinutes: 1,
    commercialDepartmentId: 'commercial',
    botKey: 'bot',
    from: 'from',
  };
  const engine = new FollowupEngine({ config, client, store });
  const session = baseSession(20);
  const context = {
    window: '15m',
    referenceAt: session.lastMessageIn,
  };

  await engine.transferAndStartChatbot(session, context);
  await engine.transferAndStartChatbot(session, context);
  assert.deepEqual(calls, [`transfer:${SELLER_DEPARTMENTS.GABRIELA}`, 'chatbot']);

  store.close();
  rmSync(directory, { recursive: true, force: true });
});

test('não inicia chatbot quando a transferência falha', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'followup-transfer-failure-test-'));
  const store = new ActionStore(join(directory, 'test.sqlite'));
  const calls = [];
  const client = {
    transferToDepartment: async () => {
      calls.push('transfer');
      throw new Error('falha na transferência');
    },
    startChatbot: async () => calls.push('chatbot'),
  };
  const config = {
    dryRun: false,
    actionRetries: 3,
    retryDelayMinutes: 1,
    commercialDepartmentId: 'commercial',
    botKey: 'bot',
    from: 'from',
  };
  const engine = new FollowupEngine({ config, client, store });
  const session = baseSession(20);

  await engine.transferAndStartChatbot(session, {
    window: '15m',
    referenceAt: session.lastMessageIn,
  });

  assert.deepEqual(calls, ['transfer']);
  store.close();
  rmSync(directory, { recursive: true, force: true });
});
