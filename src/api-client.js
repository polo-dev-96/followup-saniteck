import { setTimeout as delay } from 'node:timers/promises';

export class ApiError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }
}

const safeBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 2000);
  }
};

export class FlwChatClient {
  constructor(config) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, '');
    this.token = config.apiToken;
    this.timeoutMs = config.requestTimeoutMs;
    this.retries = config.requestRetries;
    this.pageSize = Math.min(config.pageSize, 100);
  }

  async request(path, { method = 'GET', query, body } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && item !== null && item !== '') url.searchParams.append(key, String(item));
      }
    }

    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            authorization: `Bearer ${this.token}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const responseBody = await safeBody(response);
        if (response.ok) return responseBody;

        const error = new ApiError(`flw.chat respondeu HTTP ${response.status}`, response.status, responseBody);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError && error.status < 500 && error.status !== 429) throw error;
      }

      if (attempt < this.retries) await delay(Math.min(1000 * 2 ** attempt, 10000));
    }
    throw lastError;
  }

  async *listSessions({ after }) {
    let pageNumber = 1;
    do {
      const page = await this.request('/v2/session', {
        query: {
          'LastInteractionAt.After': after,
          IncludeDetails: 'ContactDetails',
          PageNumber: pageNumber,
          PageSize: this.pageSize,
        },
      });
      for (const session of page?.items ?? []) yield session;
      if (!page?.hasMorePages) break;
      pageNumber += 1;
    } while (true);
  }

  transferToDepartment(sessionId, newDepartmentId) {
    return this.request(`/v1/session/${encodeURIComponent(sessionId)}/transfer`, {
      method: 'PUT',
      body: {
        type: 'DEPARTMENT',
        newDepartmentId,
        options: { stopBotInExecution: false },
      },
    });
  }

  startChatbot({ botKey, from, to, sessionId }) {
    return this.request('/v1/chatbot/send', {
      method: 'POST',
      body: {
        botKey,
        from,
        ...(to ? { to } : {}),
        sessionId,
        options: {
          skipIfBotInExecution: true,
          skipIfInProgress: false,
          forceStartSession: false,
        },
      },
    });
  }
}
