type Inflight<T> = Promise<T>;

const inflight = new Map<string, Inflight<unknown>>();
let active = 0;
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 2;

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    queue.push(resolve);
  });
  active += 1;
}

function release(): void {
  active -= 1;
  const next = queue.shift();
  if (next) next();
}

export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const pending = (async () => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
      inflight.delete(key);
    }
  })();
  inflight.set(key, pending);
  return pending;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && /timeout|network|503|429/i.test(error.message));
      if (!retryable || i === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 200 + Math.random() * 300);
      });
    }
  }
  throw lastError;
}
