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
  assert.equal(decideWindow(30), '30m');
  assert.equal(decideWindow(39.99), '30m');
  assert.equal(decideWindow(40), null);
  assert.equal(decideWindow(120), '2h');
  assert.equal(decideWindow(129.99), '2h');
  assert.equal(decideWindow(1380), 'closing');
  assert.equal(decideWindow(1440), null);
  assert.equal(decideWindow(1450, true), 'closing');
});

test('ignora conversa de outra equipe ou sem resposta posterior', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');
  assert.equal(evaluateSession(baseSession(30, { departmentId: 'outra' }), SOURCE_TEAM, now), null);
  const session = baseSession(30);
  session.lastMessageOut = session.lastMessageIn;
  assert.equal(evaluateSession(session, SOURCE_TEAM, now), null);
});

test('executa mensagem, chatbot e transferência na ordem e sem duplicar', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'followup-test-'));
  const store = new ActionStore(join(directory, 'test.sqlite'));
  const calls = [];
  const client = {
    sendMessage: async () => calls.push('message'),
    startChatbot: async () => calls.push('chatbot'),
    transferToDepartment: async (_sessionId, departmentId) => calls.push(`transfer:${departmentId}`),
  };
  const config = {
    dryRun: false,
    actionRetries: 3,
    retryDelayMinutes: 1,
    botKey: 'bot',
    from: 'from',
    commercialDepartmentId: 'commercial',
  };
  const engine = new FollowupEngine({ config, client, store });
  const session = baseSession(30);
  const context = {
    window: '30m',
    referenceAt: session.lastMessageIn,
    closingAlreadySent: false,
  };

  await engine.reactivate(session, context);
  await engine.reactivate(session, context);
  assert.deepEqual(calls, ['message', 'chatbot', `transfer:${SELLER_DEPARTMENTS.GABRIELA}`]);

  store.close();
  rmSync(directory, { recursive: true, force: true });
});
