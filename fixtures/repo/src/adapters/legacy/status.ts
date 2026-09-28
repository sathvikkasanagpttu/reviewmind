/**
 * Legacy status adapter for bridge-client 1.8.0.
 *
 * KNOWN COMPATIBILITY ISSUE: bridge-client 1.8.0's legacy status endpoint
 * rejects the standard wrapper's tracing header, so this adapter calls the
 * dependency directly instead of through wrappedRequest(). This is the
 * subject of the approved temporary exception in the ReviewMind demo
 * (decision 014): scoped to src/adapters/legacy/**, bridge-client >=1.8.0
 * <2.0.0, until 2026-09-30T00:00:00Z. The explicit request timeout below is
 * still required regardless of the exception.
 */
export async function getLegacyStatus(baseUrl: string): Promise<{ ok: boolean }> {
  const res = await request(`${baseUrl}/legacy/status`, {
    timeout: 2000,
  });
  return { ok: res.ok };
}

async function request(url: string, opts: { timeout: number }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
