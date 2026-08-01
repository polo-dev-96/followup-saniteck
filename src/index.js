import { createServer } from 'node:http';
import { config } from './config.js';
import { FlwChatClient } from './api-client.js';
import { FollowupEngine } from './engine.js';
import { log } from './logger.js';
import { ActionStore } from './store.js';

const once = process.argv.includes('--once');
const store = new ActionStore(config.databasePath);
const client = new FlwChatClient(config);
const engine = new FollowupEngine({ config, client, store });

let timer;
let server;
let stopping = false;

const shutdown = async (signal, exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  log('info', 'service.stopping', { signal });
  if (timer) clearInterval(timer);
  if (server) await new Promise((resolve) => server.close(resolve));
  store.close();
  process.exitCode = exitCode;
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => log('error', 'unhandled_rejection', { error }));

if (once) {
  try {
    await engine.runOnce();
    await shutdown('run-once');
  } catch {
    await shutdown('run-once-error', 1);
  }
} else {
  server = createServer((request, response) => {
    if (request.method === 'GET' && ['/health', '/ready'].includes(request.url)) {
      response.writeHead(engine.lastError ? 503 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(engine.health()));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  server.listen(config.healthPort, '0.0.0.0', () =>
    log('info', 'service.started', {
      healthPort: config.healthPort,
      intervalMs: config.pollIntervalMs,
      dryRun: config.dryRun,
    }),
  );

  const run = () => engine.runOnce().catch(() => undefined);
  await run();
  timer = setInterval(run, config.pollIntervalMs);
  timer.unref();
}

