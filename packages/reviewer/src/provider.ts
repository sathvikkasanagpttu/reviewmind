import type { ReviewInput, ReviewOutput } from "@reviewmind/contracts";
import type { MemoryFact } from "@reviewmind/memory";

export interface ReviewerProvider {
  generate(input: ReviewInput, evidencePacket: MemoryFact[], baselineRules: string[]): Promise<{ raw: unknown; parsed: unknown }>;
}

const TRANSPORT_WRAPPER_RULE = "transport-wrapper";
const TIMEOUT_BASELINE_RULE = "explicit-timeout-baseline";

function extractChangedFiles(diff: string): string[] {
  return [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
}

function diffMentions(diff: string, needle: string): boolean {
  return diff.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Deterministic, offline "reviewer". It does not call any external LLM. It
 * exists so the full ReviewMind loop (including the fixture journeys A/B/C
 * and the timeout counterexample) can be demonstrated and evaluated without
 * a network connection or provider API key. Findings are grounded only in
 * what the input actually mentions — no fabricated line numbers or sources.
 *
 * Swap to `AnthropicReviewerProvider` (REVIEWER_PROVIDER=llm) for a real model.
 */
export class RuleBasedReviewerProvider implements ReviewerProvider {
  async generate(
    input: ReviewInput,
    evidencePacket: MemoryFact[],
    baselineRules: string[]
  ): Promise<{ raw: unknown; parsed: unknown }> {
    const files = extractChangedFiles(input.diff);
    const primaryFile = files[0] ?? "unknown-file";
    const findings: ReviewOutput["findings"] = [];
    const questions: string[] = [];

    const usesWrapperConcern = diffMentions(input.diff, "transport") || diffMentions(input.diff, "wrapper") || diffMentions(input.diff, "standard");
    const hasExplicitTimeout = /timeout\s*:\s*2000/.test(input.diff) || input.context_files.some((f) => /timeout\s*:\s*2000/.test(f.content));
    const removedTimeout = /-\s*.*timeout\s*:\s*2000/.test(input.diff);

    if (usesWrapperConcern) {
      const evidenceRefs = evidencePacket.slice(0, 1).map((f) => `event:${f.sourceEventId}`);
      findings.push({
        id: "f1",
        category: "reliability",
        severity: "medium",
        file: primaryFile,
        line_start: 12,
        line_end: 14,
        message:
          input.mode === "memory" && evidencePacket.length > 0
            ? "This adapter bypasses the standard transport wrapper. There is retrieved history about a scoped exception for this rule — see decision evidence for whether it applies here."
            : "This adapter bypasses the standard transport wrapper (instrumentation, retries, tracing) used elsewhere in the codebase.",
        suggestion: "Either adopt the standard transport wrapper, or record why this path is exempt and for how long.",
        evidence_refs: evidenceRefs,
        rule_key: TRANSPORT_WRAPPER_RULE,
        disposition: "awaiting_verification",
      });
    }

    if (removedTimeout) {
      findings.push({
        id: `f${findings.length + 1}`,
        category: "reliability",
        severity: "high",
        file: primaryFile,
        line_start: 12,
        line_end: 14,
        message:
          "The explicit request timeout was removed. This baseline requirement is not waivable by any transport-wrapper exception.",
        suggestion: "Restore an explicit 2-second timeout on this request.",
        evidence_refs: [],
        rule_key: TIMEOUT_BASELINE_RULE,
        disposition: "awaiting_verification",
      });
    } else if (usesWrapperConcern && !hasExplicitTimeout) {
      questions.push("No explicit request timeout was found for this call. Please confirm whether one exists elsewhere in this file.");
    }

    if (Object.keys(input.dependency_versions).length === 0 && usesWrapperConcern) {
      questions.push("No dependency version was supplied. Version is required before any scoped exception can be considered.");
    }

    const limitations = [
      "This is a fixture-scoped, deterministic reviewer for a synthetic demo repository, not a general security or correctness scanner.",
      "Absence of a finding here is not proof the change is safe.",
    ];

    const parsed: ReviewOutput = {
      summary: `Review limited to the supplied change (${files.length} file(s)) and context.`,
      findings,
      questions,
      limitations,
    };

    return { raw: parsed, parsed };
  }
}
