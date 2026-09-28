/**
 * New integration's status adapter, also depending on bridge-client 1.8.0.
 *
 * Unlike the legacy adapter, this path has no recorded compatibility issue
 * with the standard transport wrapper and should use wrappedRequest()
 * directly rather than a bespoke request implementation.
 */
import { wrappedRequest } from "../../lib/transport";

export async function getNewStatus(baseUrl: string): Promise<{ ok: boolean }> {
  const res = await request(`${baseUrl}/status`, { timeout: 2000 });
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
