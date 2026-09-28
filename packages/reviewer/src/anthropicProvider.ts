import type { ReviewInput } from "@reviewmind/contracts";
import type { MemoryFact } from "@reviewmind/memory";
import { buildReviewPrompt } from "./promptBuilder";
import type { ReviewerProvider } from "./provider";

/**
 * Real provider adapter. Calls the Anthropic Messages API directly with a
 * server-held API key (never exposed to the browser). Enable with:
 *   REVIEWER_PROVIDER=llm
 *   LLM_API_KEY=sk-ant-...
 *   LLM_MODEL=claude-sonnet-4-6   (or another current model)
 *
 * The server always re-validates the JSON response against ReviewOutputSchema
 * and resolves waivers itself — per the PRD, "the model cannot grant a waiver."
 */
export class AnthropicReviewerProvider implements ReviewerProvider {
  constructor(
    private apiKey: string,
    private model: string = "claude-sonnet-4-6",
    private baseUrl: string = "https://api.anthropic.com/v1/messages"
  ) {}

  async generate(input: ReviewInput, evidencePacket: MemoryFact[], baselineRules: string[]) {
    const { system, user } = buildReviewPrompt(input, evidencePacket, baselineRules);

    const doRequest = async (extraNote?: string) => {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1200,
          system,
          messages: [{ role: "user", content: extraNote ? `${user}\n\n${extraNote}` : user }],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM provider error ${res.status}: ${text.slice(0, 500)}`);
      }
      const data = await res.json();
      const text = (data.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      return text;
    };

    let raw = await doRequest();
    let parsed = tryParseJson(raw);

    if (parsed === null) {
      // One bounded repair attempt for invalid JSON, per PRD.
      raw = await doRequest("Your previous response was not valid JSON matching the schema. Return ONLY the JSON object, nothing else.");
      parsed = tryParseJson(raw);
    }

    return { raw, parsed };
  }
}

function tryParseJson(text: string): unknown | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
