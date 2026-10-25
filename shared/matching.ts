/**
 * SameSkin matching engine.
 *
 * Everything here is deterministic and pure so it can run on client or server
 * and be unit-tested without the YouCam API.
 *
 * Score convention follows YouCam's ui_score: 1-100, higher = healthier.
 */
import {
  ARCHETYPES,
  CONCERNS,
  OUTCOME_LABELS,
  type ArchetypeId,
  type Concern,
  type ConcernScores,
  type MatchVerdict,
  type MatchedReview,
  type OutcomeTag,
  type Product,
  type ProductMatch,
  type Review,
  type SkinProfile,
  type SkinType,
} from "./types";

export const TWIN_THRESHOLD = 70; // similarity >= 70 => "skin twin"
const BAYES_PRIOR_WEIGHT = 2; // pseudo-reviews pulling toward the global mean
export const CONCERN_THRESHOLD = 65; // ui_score below this = "a concern for you"

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Concerns where the profile scores below the threshold, weakest first. */
export function concernsOf(scores: ConcernScores, threshold = CONCERN_THRESHOLD): Concern[] {
  return CONCERNS.filter((c) => scores[c] < threshold).sort((a, b) => scores[a] - scores[b]);
}

export function weakestConcerns(scores: ConcernScores, n = 3): Concern[] {
  return [...CONCERNS].sort((a, b) => scores[a] - scores[b]).slice(0, n);
}

/**
 * Skin similarity between two profiles (0-100).
 *
 * Problems matter more than strengths: a dimension where either person scores
 * low gets a higher weight, so two people who share the same weak spots come
 * out as twins even if their strong dimensions differ a little.
 */
export function similarity(
  a: { scores: ConcernScores; skinType: SkinType },
  b: { scores: ConcernScores; skinType: SkinType },
): number {
  let num = 0;
  let den = 0;
  for (const c of CONCERNS) {
    const sa = clamp(a.scores[c]);
    const sb = clamp(b.scores[c]);
    const lowest = Math.min(sa, sb);
    // Both healthy (>= 70): the dimension barely matters. Otherwise the weight
    // grows the worse the weaker person scores: 70 -> 1, 50 -> 2, 30 -> 3.
    const weight = lowest >= 70 ? 0.25 : 1 + (70 - lowest) / 20;
    num += weight * Math.abs(sa - sb);
    den += weight * 100;
  }
  const distance = num / den; // 0..1
  let sim = (1 - distance) * 100;
  // Skin type: same => small bonus, oily<->dry => penalty.
  if (a.skinType === b.skinType) sim += 6;
  else if (
    (a.skinType === "oily" && b.skinType === "dry") ||
    (a.skinType === "dry" && b.skinType === "oily")
  )
    sim -= 10;
  // Spread the distribution so that "twins" are meaningfully selective.
  sim = (sim - 40) * (100 / 60);
  return Math.round(clamp(sim) * 10) / 10;
}

export function sharedConcerns(a: ConcernScores, b: ConcernScores): Concern[] {
  const ca = new Set(concernsOf(a));
  return concernsOf(b).filter((c) => ca.has(c));
}

/** Derive a skin type when YouCam's skin_type output is unavailable. */
export function deriveSkinType(scores: ConcernScores): SkinType {
  const oil = scores.oiliness;
  const moist = scores.moisture;
  if (oil < 55 && moist >= 60) return "oily";
  if (moist < 55 && oil >= 60) return "dry";
  if (oil < 65 && moist < 65) return "combination";
  return "normal";
}

/** Classify a profile into a reviewer "skin twin group". */
export function classifyArchetype(scores: ConcernScores, skinType: SkinType): ArchetypeId {
  let best: { id: ArchetypeId; score: number } = { id: "balanced", score: -Infinity };
  for (const arch of ARCHETYPES) {
    if (arch.signature.length === 0) continue;
    const deficit =
      arch.signature.reduce((acc, c) => acc + (100 - scores[c]), 0) / arch.signature.length;
    const typeBonus = arch.skinTypes.includes(skinType) ? 8 : 0;
    const s = deficit + typeBonus;
    if (s > best.score) best = { id: arch.id, score: s };
  }
  // If the best group's signature is still healthy (avg score > 68), call it balanced.
  return best.score < 32 + 8 ? "balanced" : best.id;
}

export function overallScore(scores: ConcernScores): number {
  const vals = CONCERNS.map((c) => scores[c]);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** Score every review against the viewer. */
export function matchReviews(viewer: SkinProfile, reviews: Review[]): MatchedReview[] {
  return reviews
    .map((r) => ({
      ...r,
      similarity: similarity(viewer, r.profile),
      sharedConcerns: sharedConcerns(viewer.scores, r.profile.scores),
    }))
    .sort((a, b) => b.similarity - a.similarity || b.rating - a.rating);
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function countTags(reviews: Review[]): Map<OutcomeTag, number> {
  const m = new Map<OutcomeTag, number>();
  for (const r of reviews) for (const t of r.outcomes) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export const NEGATIVE_OUTCOMES: Set<OutcomeTag> = new Set([
  "caused_breakouts",
  "felt_drying",
  "stinging",
  "pilling",
  "no_change",
]);

/** How much a product's claims matter to this viewer (0-100). */
export function claimFit(viewerScores: ConcernScores, product: Product): number {
  if (!product.targets.length) return 0;
  // Average deficit (100 - score) across the product's target concerns.
  const deficit =
    product.targets.reduce((acc, c) => acc + (100 - viewerScores[c]), 0) / product.targets.length;
  // deficit 35 (score 65) is the "it's a concern" line => 50; deficit 70 (score 30) => 100.
  return Math.round(clamp(((deficit - 35) / 35) * 50 + 50));
}

/** Compute the "for skin like yours" match for one product. */
export function matchProduct(
  viewer: SkinProfile,
  product: Product,
  reviews: Review[],
  globalMean = 3.8,
): ProductMatch {
  const productReviews = reviews.filter((r) => r.productId === product.id);
  const matched = matchReviews(viewer, productReviews);
  const twins = matched.filter((r) => r.similarity >= TWIN_THRESHOLD);

  // Similarity-weighted Bayesian average among twins.
  const wsum = twins.reduce((a, r) => a + r.similarity / 100, 0);
  const wrating = twins.reduce((a, r) => a + (r.similarity / 100) * r.rating, 0);
  const twinRating =
    twins.length > 0
      ? (wrating + BAYES_PRIOR_WEIGHT * globalMean) / (wsum + BAYES_PRIOR_WEIGHT)
      : null;
  const overallRating = mean(productReviews.map((r) => r.rating));

  const fit = claimFit(viewer.scores, product);
  const viewerConcerns = new Set(concernsOf(viewer.scores));
  const relevantTargets = product.targets.filter((t) => viewerConcerns.has(t));

  const tags = countTags(twins.length >= 3 ? twins : productReviews);
  const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
  const topOutcomes = sorted
    .filter(([t]) => !NEGATIVE_OUTCOMES.has(t))
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count }));
  const warnings = sorted
    .filter(([t]) => NEGATIVE_OUTCOMES.has(t))
    .slice(0, 2)
    .map(([tag, count]) => ({ tag, count }));

  const confidence = clamp(twins.length / 6) * 100; // 6 twins => full confidence
  const ratingNorm = twinRating !== null ? ((twinRating - 1) / 4) * 100 : 50;
  const forYouScore = Math.round(0.6 * ratingNorm + 0.25 * fit + 0.15 * confidence);

  let verdict: MatchVerdict;
  if (twins.length < 2 || twinRating === null) verdict = "insufficient";
  else if (twinRating >= 4.3) verdict = "loved";
  else if (twinRating >= 3.8) verdict = "liked";
  else if (twinRating >= 3.0) verdict = "mixed";
  else verdict = "avoid";

  return {
    productId: product.id,
    forYouScore,
    verdict,
    twinCount: twins.length,
    twinRating: twinRating !== null ? Math.round(twinRating * 10) / 10 : null,
    overallRating: overallRating !== null ? Math.round(overallRating * 10) / 10 : null,
    reviewCount: productReviews.length,
    claimFit: fit,
    relevantTargets,
    topOutcomes,
    warnings,
  };
}

export function matchCatalog(viewer: SkinProfile, products: Product[], reviews: Review[]) {
  const globalMean = mean(reviews.map((r) => r.rating)) ?? 3.8;
  return products
    .map((p) => matchProduct(viewer, p, reviews, globalMean))
    .sort((a, b) => b.forYouScore - a.forYouScore);
}

/** Rating breakdown by skin-twin group, for the brand dashboard. */
export function ratingByArchetype(reviews: Review[]) {
  const out: Record<ArchetypeId, { count: number; avg: number | null }> = {
    oily_breakout: { count: 0, avg: null },
    dry_sensitive: { count: 0, avg: null },
    combo_pores: { count: 0, avg: null },
    mature_firmness: { count: 0, avg: null },
    dull_tired: { count: 0, avg: null },
    balanced: { count: 0, avg: null },
  };
  const sums: Partial<Record<ArchetypeId, number>> = {};
  for (const r of reviews) {
    const a = r.profile.archetype;
    out[a].count++;
    sums[a] = (sums[a] ?? 0) + r.rating;
  }
  for (const k of Object.keys(out) as ArchetypeId[]) {
    out[k].avg = out[k].count ? Math.round(((sums[k] ?? 0) / out[k].count) * 10) / 10 : null;
  }
  return out;
}

/** Deterministic plain-language summary, used when no Claude key is configured. */
export function fallbackSummary(
  product: Product,
  match: ProductMatch,
  twins: MatchedReview[],
): string {
  const label = (t: OutcomeTag) => OUTCOME_LABELS[t];
  if (match.verdict === "insufficient") {
    const n = match.twinCount;
    return `Only ${n} reviewer${n === 1 ? "" : "s"} with skin like yours ${
      n === 1 ? "has" : "have"
    } tried ${product.name} so far, so we won't call it yet. Overall it rates ${
      match.overallRating ?? "n/a"
    }/5 across ${match.reviewCount} reviews. ${
      match.relevantTargets.length
        ? `Its claims do target ${match.relevantTargets.length} of your concerns.`
        : "Its claims do not target your main concerns."
    }`;
  }
  const good = match.topOutcomes.map((o) => `${label(o.tag)} (${o.count})`).join(", ");
  const bad = match.warnings.map((o) => `${label(o.tag)} (${o.count})`).join(", ");
  const weeks = Math.round(mean(twins.map((t) => t.weeksUsed)) ?? 0);
  const concerns = match.relevantTargets.length
    ? `It targets ${match.relevantTargets.length} of your weaker areas.`
    : `None of its claims hit your weakest areas, so treat it as a nice-to-have.`;
  const verdictText = {
    loved: "loved it",
    liked: "mostly liked it",
    mixed: "were split",
    avoid: "mostly did not get on with it",
    insufficient: "",
  }[match.verdict];
  return `${match.twinCount} reviewers with skin like yours ${verdictText}: ${match.twinRating}/5 vs ${
    match.overallRating
  }/5 overall. ${good ? `Most reported ${good}` : "Few reported specific outcomes"}${
    bad ? `, but watch for ${bad}` : ""
  }. Typical results showed after about ${weeks} weeks. ${concerns}`;
}
