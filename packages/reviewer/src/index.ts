import { RuleBasedReviewerProvider } from "./provider";
import { AnthropicReviewerProvider } from "./anthropicProvider";
import type { ReviewerProvider } from "./provider";

export * from "./provider";
export * from "./promptBuilder";
export { AnthropicReviewerProvider } from "./anthropicProvider";

export function createReviewerProvider(env: NodeJS.ProcessEnv = process.env): ReviewerProvider {
  const kind = (env.REVIEWER_PROVIDER ?? "rulebased").toLowerCase();
  if (kind === "llm") {
    if (!env.LLM_API_KEY) {
      throw new Error("REVIEWER_PROVIDER=llm requires LLM_API_KEY. Set REVIEWER_PROVIDER=rulebased to run offline.");
    }
    return new AnthropicReviewerProvider(env.LLM_API_KEY, env.LLM_MODEL ?? "claude-sonnet-4-6", env.LLM_BASE_URL);
  }
  return new RuleBasedReviewerProvider();
}
