import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.API_TOKEN = 'test-token';
const { TestPanel } = await import('../src/panel.js');
const { ActionStore } = await import('../src/store.js');
const { SELLER_DEPARTMENTS } = await import('../src/routing.js');

const SOURCE = 'general';
const session = {
  id: 'session-test',
  departmentId: SOURCE,
  status: 'PENDING',
  endAt: null,
  lastMessageIn: '2026-08-02T10:00:00.000Z',
  lastMessageOut: '2026-08-02T10:01:00.000Z',
  contactDetails: { phonenumber: '5592994414222', tagsName: ['Marines'] },
};

const createPanel = ({ allowLiveTest }) => {
  const directory = mkdtempSync(join(tmpdir(), 'panel-test-'));
  const store = new ActionStore(join(directory, 'test.sqlite'));
  const calls = [];
  const client = {
    async *listSessions() { yield session; },
    async sendMessage() { calls.push('message'); },
    async startChatbot() { calls.push('chatbot'); },
    async transferToDepartment(_sessionId, departmentId) { calls.push(`transfer:${departmentId}`); },
  };
  const config = {
    allowLiveTest,
    testAdminToken: '1234567890123456',
    sourceDepartmentId: SOURCE,
    commercialDepartmentId: 'commercial',
    botKey: 'bot',
    from: 'from',
    actionRetries: 3,
    retryDelayMinutes: 1,
  };
  return {
    panel: new TestPanel({ config, client, store }),
    calls,
    close() { store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
};

test('localiza e descreve somente a sessão aberta do contato', async () => {
  const fixture = createPanel({ allowLiveTest: false });
  try {
    const result = await fixture.panel.lookup({ phone: '92994414222' });
    assert.equal(result.sessionsFound, 1);
    assert.equal(result.sessions[0].routing.departmentId, SELLER_DEPARTMENTS.MARINES);
    assert.equal(result.sessions[0].inSourceDepartment, true);
  } finally { fixture.close(); }
});

test('bloqueia execução real quando ALLOW_LIVE_TEST está desligado', async () => {
  const fixture = createPanel({ allowLiveTest: false });
  try {
    await assert.rejects(
      fixture.panel.execute({ phone: '92994414222', sessionId: session.id, confirmation: 'ENVIAR FOLLOWUP' }),
      /ALLOW_LIVE_TEST/,
    );
    assert.deepEqual(fixture.calls, []);
  } finally { fixture.close(); }
});

test('executa uma vez e impede duplicidade na mesma sessão e referência', async () => {
  const fixture = createPanel({ allowLiveTest: true });
  const body = { phone: '92994414222', sessionId: session.id, confirmation: 'ENVIAR FOLLOWUP' };
  try {
    await fixture.panel.execute(body);
    await fixture.panel.execute(body);
    assert.deepEqual(fixture.calls, [
      'message',
      'chatbot',
      `transfer:${SELLER_DEPARTMENTS.MARINES}`,
    ]);
  } finally { fixture.close(); }
});
