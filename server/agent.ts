/**
 * "For skin like yours" agent.
 *
 * Given the viewer's skin profile and a product, the agent decides which
 * evidence to pull (twin reviews, outcome tallies, ingredient notes, the
 * viewer's own weak spots) through tool calls, then writes a short, honest
 * verdict. When no ANTHROPIC_API_KEY is configured we fall back to the
 * deterministic summariser in shared/matching.ts, so the product always works.
 */
import {
  CONCERN_LABELS,
  OUTCOME_LABELS,
  SKIN_TYPE_LABELS,
  type MatchedReview,
  type Product,
  type ProductMatch,
  type SkinProfile,
} from "../shared/types";
import { concernsOf, fallbackSummary, TWIN_THRESHOLD } from "../shared/matching";

export interface AgentResult {
  summary: string;
  bullets: string[];
  confidence: "low" | "medium" | "high";
  source: "claude" | "rules";
  toolCalls: string[];
}

const INGREDIENT_NOTES: Record<string, string> = {
  "Salicylic acid 2%": "oil-soluble exfoliant; can be drying for dry or sensitive skin",
  "Niacinamide 10%": "high-strength niacinamide can sting on compromised barriers",
  "Retinaldehyde 0.2%": "stronger than retinol; expect a 2-4 week adjustment period",
  "L-ascorbic acid 15%": "low-pH vitamin C; stings on sensitive skin",
  "Glycolic acid 5%": "small-molecule AHA; irritating for barrier-impaired skin",
  "Azelaic acid 10%": "gentle on most skin; mild tingling early on is common",
  "Shea butter": "rich occlusive; may clog on acne-prone skin",
  "Ceramide NP": "barrier lipid; well tolerated",
  "Centella asiatica": "soothing; well tolerated",
  "Caffeine 5%": "temporary de-puffing; does not change pigmentation",
};

function buildTools(ctx: {
  viewer: SkinProfile;
  product: Product;
  match: ProductMatch;
  reviews: MatchedReview[];
}) {
  const twins = ctx.reviews.filter((r) => r.similarity >= TWIN_THRESHOLD);
  return {
    definitions: [
      {
        name: "get_viewer_profile",
        description: "The shopper's skin profile: concern scores (1-100, higher = healthier), skin type, weak spots.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "get_twin_reviews",
        description:
          "Reviews of this product from shoppers whose skin is similar to the viewer (skin similarity >= 70). Returns rating, weeks used, outcomes, body and similarity.",
        input_schema: {
          type: "object",
          properties: { limit: { type: "number", description: "max reviews, default 8" } },
        },
      },
      {
        name: "get_outcome_tally",
        description: "Counts of reported outcomes among twins vs. all reviewers, plus twin vs. overall rating.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "get_ingredient_notes",
        description: "Formulator notes on the product's key ingredients and how they interact with skin types.",
        input_schema: { type: "object", properties: {} },
      },
    ],
    run(name: string, input: any): unknown {
      switch (name) {
        case "get_viewer_profile":
          return {
            skinType: SKIN_TYPE_LABELS[ctx.viewer.skinType],
            archetype: ctx.viewer.archetype,
            weakSpots: concernsOf(ctx.viewer.scores).map((c) => ({ concern: CONCERN_LABELS[c], score: ctx.viewer.scores[c] })),
            scores: Object.fromEntries(Object.entries(ctx.viewer.scores).map(([k, v]) => [CONCERN_LABELS[k as keyof typeof CONCERN_LABELS], v])),
          };
        case "get_twin_reviews":
          return twins.slice(0, input?.limit ?? 8).map((r) => ({
            similarity: r.similarity,
            rating: r.rating,
            weeksUsed: r.weeksUsed,
            skinType: r.profile.skinType,
            outcomes: r.outcomes.map((o) => OUTCOME_LABELS[o]),
            body: r.body,
          }));
        case "get_outcome_tally":
          return {
            twinCount: ctx.match.twinCount,
            twinRating: ctx.match.twinRating,
            overallRating: ctx.match.overallRating,
            reviewCount: ctx.match.reviewCount,
            topOutcomes: ctx.match.topOutcomes.map((o) => ({ outcome: OUTCOME_LABELS[o.tag], count: o.count })),
            warnings: ctx.match.warnings.map((o) => ({ outcome: OUTCOME_LABELS[o.tag], count: o.count })),
            claimsRelevantToViewer: ctx.match.relevantTargets.map((c) => CONCERN_LABELS[c]),
          };
        case "get_ingredient_notes":
          return ctx.product.ingredients.map((i) => ({ ingredient: i, note: INGREDIENT_NOTES[i] ?? "no special notes" }));
        default:
          return { error: `unknown tool ${name}` };
      }
    },
  };
}

function rulesResult(product: Product, match: ProductMatch, twins: MatchedReview[]): AgentResult {
  const bullets: string[] = [];
  if (match.twinRating !== null && match.overallRating !== null) {
    const diff = match.twinRating - match.overallRating;
    bullets.push(
      diff >= 0.3
        ? `Skin twins rate it ${diff.toFixed(1)} stars higher than the crowd.`
        : diff <= -0.3
          ? `Skin twins rate it ${Math.abs(diff).toFixed(1)} stars lower than the crowd.`
          : "Skin twins and the crowd broadly agree on this one.",
    );
  }
  for (const o of match.topOutcomes.slice(0, 2)) bullets.push(`${o.count} twins reported ${OUTCOME_LABELS[o.tag]}.`);
  for (const w of match.warnings.slice(0, 1)) bullets.push(`Watch out: ${w.count} reported ${OUTCOME_LABELS[w.tag]}.`);
  if (match.relevantTargets.length)
    bullets.push(`Claims that matter to you: ${match.relevantTargets.map((c) => CONCERN_LABELS[c]).join(", ")}.`);
  return {
    summary: fallbackSummary(product, match, twins),
    bullets,
    confidence: match.twinCount >= 6 ? "high" : match.twinCount >= 3 ? "medium" : "low",
    source: "rules",
    toolCalls: [],
  };
}

export async function runAgent(ctx: {
  viewer: SkinProfile;
  product: Product;
  match: ProductMatch;
  reviews: MatchedReview[];
}): Promise<AgentResult> {
  const twins = ctx.reviews.filter((r) => r.similarity >= TWIN_THRESHOLD);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return rulesResult(ctx.product, ctx.match, twins);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const tools = buildTools(ctx);
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
    const toolCalls: string[] = [];

    const system = `You are SameSkin's review analyst. The shopper is looking at "${ctx.product.name}" by ${ctx.product.brand}.
Your job: tell them, honestly and specifically, how this product tends to go for people whose skin measures like theirs.
Rules:
- Use the tools to gather evidence before answering. Call get_viewer_profile and get_outcome_tally at minimum.
- Only claim what the evidence supports. If fewer than 3 skin twins reviewed it, say the evidence is thin.
- Mention concrete outcomes with counts, and typical time-to-results in weeks.
- Flag an ingredient risk only if it is relevant to the shopper's skin type or weak spots.
- Never give medical advice. This is shopping guidance, not dermatology.
- Respond ONLY with JSON: {"summary": string (<= 60 words), "bullets": string[] (2-4 items, <= 14 words each), "confidence": "low"|"medium"|"high"}`;

    const messages: any[] = [{ role: "user", content: "Write the 'For skin like yours' verdict." }];
    for (let step = 0; step < 6; step++) {
      const res = await client.messages.create({
        model,
        max_tokens: 700,
        system,
        tools: tools.definitions as any,
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason === "tool_use") {
        const results = res.content
          .filter((b: any) => b.type === "tool_use")
          .map((b: any) => {
            toolCalls.push(b.name);
            return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(tools.run(b.name, b.input)) };
          });
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      return {
        summary: String(json.summary),
        bullets: Array.isArray(json.bullets) ? json.bullets.map(String).slice(0, 4) : [],
        confidence: ["low", "medium", "high"].includes(json.confidence) ? json.confidence : "medium",
        source: "claude",
        toolCalls,
      };
    }
  } catch (err) {
    console.warn("[agent] falling back to rules:", (err as Error).message);
  }
  return rulesResult(ctx.product, ctx.match, twins);
}
