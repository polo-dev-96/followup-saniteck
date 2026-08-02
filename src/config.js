const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
};

const boolean = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.trim().toLowerCase());
};

const integer = (name, fallback, minimum = 1) => {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} deve ser um inteiro maior ou igual a ${minimum}`);
  }
  return value;
};

const loadedConfig = {
  apiBaseUrl: process.env.API_BASE_URL?.trim() || 'https://api.wts.chat/chat',
  apiToken: required('API_TOKEN'),
  sourceDepartmentId:
    process.env.SOURCE_DEPARTMENT_ID?.trim() || '6e9426e0-1166-46a7-9c4b-129e46af49bc',
  commercialDepartmentId:
    process.env.COMMERCIAL_DEPARTMENT_ID?.trim() || '20a67e6a-83dc-4f95-9430-5bc51eeae7e4',
  botKey:
    process.env.BOT_KEY?.trim() || 'c8ccb5ab-7f88-447d-b771-2d0ddd681a15',
  from: process.env.CHANNEL_FROM?.trim() || '9236121212',
  pollIntervalMs: integer('POLL_INTERVAL_SECONDS', 600, 10) * 1000,
  pageSize: integer('PAGE_SIZE', 100, 1),
  requestTimeoutMs: integer('REQUEST_TIMEOUT_MS', 30000, 1000),
  requestRetries: integer('REQUEST_RETRIES', 3, 0),
  actionRetries: integer('ACTION_RETRIES', 5, 1),
  retryDelayMinutes: integer('ACTION_RETRY_DELAY_MINUTES', 5, 1),
  databasePath: process.env.DATABASE_PATH?.trim() || './data/followups.sqlite',
  dryRun: boolean('DRY_RUN', true),
  healthPort: integer('HEALTH_PORT', 3000, 1),
  testPanelEnabled: boolean('TEST_PANEL_ENABLED', false),
  allowLiveTest: boolean('ALLOW_LIVE_TEST', false),
  testAdminToken: process.env.TEST_ADMIN_TOKEN?.trim() || '',
};

if (loadedConfig.testPanelEnabled && loadedConfig.testAdminToken.length < 16) {
  throw new Error('TEST_ADMIN_TOKEN deve ter pelo menos 16 caracteres quando o painel estiver ativo');
}
if (loadedConfig.allowLiveTest && !loadedConfig.testPanelEnabled) {
  throw new Error('ALLOW_LIVE_TEST exige TEST_PANEL_ENABLED=true');
}

export const config = Object.freeze(loadedConfig);

export const messages = Object.freeze({
  followup30: 'Olá! 😊 Para continuar o atendimento, é só responder às perguntas acima.',
  followup2h: 'Olá! 😊 Fico no aguardo da sua resposta para dar sequência ao atendimento.',
  closing:
    'Olá! 😊 Como não tive retorno, este atendimento será encerrado. Quando quiser continuar, é só retomar por aqui 🙂',
});
