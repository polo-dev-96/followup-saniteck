const serializeError = (error) => ({
  name: error?.name,
  message: error?.message ?? String(error),
  status: error?.status,
  response: error?.response,
  stack: error?.stack,
});

export const log = (level, event, details = {}) => {
  const normalized = { ...details };
  if (normalized.error instanceof Error) normalized.error = serializeError(normalized.error);
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...normalized })}\n`);
};

