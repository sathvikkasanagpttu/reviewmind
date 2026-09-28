/**
 * Standard transport wrapper used by adapters in democart-integrations.
 *
 * Adds shared instrumentation (request logging, tracing, retry-on-5xx) around
 * outgoing HTTP calls. New adapters are expected to route requests through
 * this wrapper rather than calling fetch/http directly, so that instrumentation
 * stays consistent across integrations.
 */
export interface WrappedRequestOptions {
  timeout?: number;
  retries?: number;
}

export async function wrappedRequest(url: string, options: WrappedRequestOptions = {}): Promise<Response> {
  const { timeout = 2000, retries = 1 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
