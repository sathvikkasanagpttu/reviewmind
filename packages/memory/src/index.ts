import { InMemoryHindsightAdapter } from "./inMemoryAdapter";
import { HindsightCloudAdapter } from "./hindsightCloudAdapter";
import type { HindsightAdapter } from "./types";

export * from "./types";
export { InMemoryHindsightAdapter } from "./inMemoryAdapter";
export { HindsightCloudAdapter } from "./hindsightCloudAdapter";

export function createMemoryAdapter(env: NodeJS.ProcessEnv = process.env): HindsightAdapter {
  const kind = (env.MEMORY_ADAPTER ?? "inmemory").toLowerCase();
  if (kind === "hindsight") {
    return new HindsightCloudAdapter(env.HINDSIGHT_BASE_URL ?? "", env.HINDSIGHT_API_KEY ?? "");
  }
  return new InMemoryHindsightAdapter();
}
