/**
 * Generates the demo catalogue and a synthetic review corpus.
 *
 * The reviewer skin profiles are SYNTHETIC: they are sampled from six skin
 * archetypes so the matching engine has a realistic population to match
 * against. In production every profile comes from a real YouCam scan at
 * review time (see POST /api/reviews). Run with `npm run seed`.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ARCHETYPES,
  CONCERNS,
  type ArchetypeId,
  type Concern,
  type ConcernScores,
  type OutcomeTag,
  type Product,
  type Review,
  type SkinType,
} from "../shared/types";
import { classifyArchetype, overallScore } from "../shared/matching";

// ---------- deterministic RNG ----------
let seed = 20261025;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const gauss = (mu: number, sd: number) => {
  const u = 1 - rand();
  const v = rand();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clampScore = (v: number) => Math.round(Math.max(5, Math.min(98, v)));

// ---------- products ----------
export const PRODUCTS: Product[] = [
  {
    id: "clear-start-gel",
    name: "Clear Start 2% BHA Gel Cleanser",
    brand: "Northline",
    category: "cleanser",
    price: 14,
    targets: ["acne", "oiliness", "pore"],
    ingredients: ["Salicylic acid 2%", "Zinc PCA", "Green tea"],
    blurb: "A low-foam gel that clears congestion without stripping.",
    art: { from: "#0ea5e9", to: "#2563eb", glyph: "🫧" },
  },
  {
    id: "calm-barrier-cream",
    name: "Calm Barrier Repair Cream",
    brand: "Haven",
    category: "moisturizer",
    price: 28,
    targets: ["redness", "moisture", "firmness"],
    ingredients: ["Ceramide NP", "Panthenol", "Centella asiatica", "Squalane"],
    blurb: "Thick, fragrance-free cream for skin that stings at everything.",
    art: { from: "#f9a8d4", to: "#f43f5e", glyph: "🛡️" },
  },
  {
    id: "niacinamide-10",
    name: "Niacinamide 10% + Zinc Serum",
    brand: "Formula Lab",
    category: "serum",
    price: 9,
    targets: ["pore", "oiliness", "redness", "texture"],
    ingredients: ["Niacinamide 10%", "Zinc PCA 1%"],
    blurb: "The internet's favourite pore-minimising serum.",
    art: { from: "#a7f3d0", to: "#059669", glyph: "🧪" },
  },
  {
    id: "retinal-02",
    name: "Retinal 0.2% Night Serum",
    brand: "Meridian",
    category: "treatment",
    price: 42,
    targets: ["wrinkle", "firmness", "texture", "age_spot"],
    ingredients: ["Retinaldehyde 0.2%", "Bakuchiol", "Peptide complex"],
    blurb: "Encapsulated retinal for lines and texture, faster than retinol.",
    art: { from: "#c4b5fd", to: "#6d28d9", glyph: "🌙" },
  },
  {
    id: "vit-c-15",
    name: "Vitamin C 15% Brightening Serum",
    brand: "Meridian",
    category: "serum",
    price: 38,
    targets: ["radiance", "age_spot", "firmness"],
    ingredients: ["L-ascorbic acid 15%", "Ferulic acid", "Vitamin E"],
    blurb: "Morning antioxidant serum for dull, uneven skin.",
    art: { from: "#fde68a", to: "#f59e0b", glyph: "🍊" },
  },
  {
    id: "hydra-ha-serum",
    name: "Hydra 5-Weight Hyaluronic Serum",
    brand: "Haven",
    category: "serum",
    price: 22,
    targets: ["moisture", "radiance", "texture"],
    ingredients: ["Hyaluronic acid (5 weights)", "Glycerin", "Beta-glucan"],
    blurb: "Water-light hydration that layers under anything.",
    art: { from: "#bae6fd", to: "#0284c7", glyph: "💧" },
  },
  {
    id: "azelaic-10",
    name: "Azelaic Acid 10% Treatment",
    brand: "Formula Lab",
    category: "treatment",
    price: 16,
    targets: ["redness", "acne", "age_spot", "texture"],
    ingredients: ["Azelaic acid 10%", "Allantoin"],
    blurb: "The quiet multitasker for redness, bumps and marks.",
    art: { from: "#fecaca", to: "#dc2626", glyph: "🌿" },
  },
  {
    id: "spf50-fluid",
    name: "Invisible SPF50+ Fluid",
    brand: "Northline",
    category: "sunscreen",
    price: 19,
    targets: ["age_spot", "wrinkle", "redness"],
    ingredients: ["Uvinul A Plus", "Tinosorb S", "Niacinamide"],
    blurb: "No white cast, no pilling, no excuses.",
    art: { from: "#fef3c7", to: "#fb923c", glyph: "☀️" },
  },
  {
    id: "caffeine-eye",
    name: "Caffeine 5% Eye Serum",
    brand: "Formula Lab",
    category: "eye",
    price: 11,
    targets: ["dark_circle", "eye_bag", "tear_trough"],
    ingredients: ["Caffeine 5%", "EGCG", "Hyaluronic acid"],
    blurb: "Morning de-puffing for the under-eye area.",
    art: { from: "#d9f99d", to: "#65a30d", glyph: "👁️" },
  },
  {
    id: "peptide-firm-cream",
    name: "Peptide Firming Night Cream",
    brand: "Meridian",
    category: "moisturizer",
    price: 54,
    targets: ["firmness", "wrinkle", "droopy_upper_eyelid", "droopy_lower_eyelid"],
    ingredients: ["Matrixyl 3000", "Argireline", "Shea butter", "Ceramides"],
    blurb: "A rich overnight cream for loss of bounce.",
    art: { from: "#fbcfe8", to: "#be185d", glyph: "🪷" },
  },
  {
    id: "aha-pha-toner",
    name: "Glow AHA/PHA Resurfacing Toner",
    brand: "Northline",
    category: "treatment",
    price: 17,
    targets: ["texture", "radiance", "pore", "age_spot"],
    ingredients: ["Glycolic acid 5%", "Gluconolactone", "Aloe"],
    blurb: "Nightly exfoliating toner for smoother, brighter skin.",
    art: { from: "#fcd34d", to: "#d97706", glyph: "✨" },
  },
  {
    id: "cica-gel-moist",
    name: "Cica Water Gel Moisturiser",
    brand: "Haven",
    category: "moisturizer",
    price: 21,
    targets: ["moisture", "redness", "oiliness"],
    ingredients: ["Centella asiatica", "Madecassoside", "Hyaluronic acid"],
    blurb: "Oil-free gel hydration for skin that gets shiny and sensitive.",
    art: { from: "#bbf7d0", to: "#16a34a", glyph: "🍃" },
  },
  {
    id: "tinted-skin-serum",
    name: "Skin Tint Serum Foundation",
    brand: "Haven",
    category: "makeup",
    price: 32,
    targets: ["redness", "radiance", "moisture"],
    ingredients: ["Niacinamide", "Squalane", "Mineral pigments"],
    blurb: "Sheer, skin-like coverage that evens redness without masking.",
    art: { from: "#f5d0a9", to: "#b45309", glyph: "🎨" },
    vto: { category: "foundation", color: "#d9a57a" },
  },
  {
    id: "lip-tint-rose",
    name: "Hydrating Lip Tint, Rosewood",
    brand: "Northline",
    category: "makeup",
    price: 15,
    targets: ["moisture"],
    ingredients: ["Jojoba oil", "Vitamin E", "Red 7 Lake"],
    blurb: "Balm comfort with a soft rosewood stain.",
    art: { from: "#fda4af", to: "#be123c", glyph: "💄" },
    vto: { category: "lip_color", color: "#b4565f", texture: "satin" },
  },
];

// ---------- synthetic reviewer population ----------
type ArchetypeSpec = { id: ArchetypeId; weight: number; mu: Partial<ConcernScores>; sd: number; types: SkinType[] };

const BASE_MU: ConcernScores = CONCERNS.reduce((o, c) => ({ ...o, [c]: 78 }), {} as ConcernScores);

const SPECS: ArchetypeSpec[] = [
  { id: "oily_breakout", weight: 0.24, mu: { oiliness: 38, acne: 42, pore: 48, texture: 60, redness: 62 }, sd: 9, types: ["oily", "oily", "combination"] },
  { id: "dry_sensitive", weight: 0.2, mu: { moisture: 40, redness: 45, texture: 62, firmness: 66 }, sd: 9, types: ["dry", "dry", "normal"] },
  { id: "combo_pores", weight: 0.17, mu: { pore: 42, texture: 50, oiliness: 55, moisture: 60 }, sd: 8, types: ["combination"] },
  { id: "mature_firmness", weight: 0.17, mu: { wrinkle: 42, firmness: 45, age_spot: 50, droopy_upper_eyelid: 58, radiance: 62, moisture: 60 }, sd: 9, types: ["dry", "normal", "combination"] },
  { id: "dull_tired", weight: 0.12, mu: { radiance: 45, dark_circle: 44, eye_bag: 52, tear_trough: 55, moisture: 62 }, sd: 8, types: ["normal", "combination", "dry"] },
  { id: "balanced", weight: 0.1, mu: {}, sd: 7, types: ["normal", "normal", "combination"] },
];

function sampleProfile(): { scores: ConcernScores; skinType: SkinType; archetype: ArchetypeId; skinAge: number } {
  const r = rand();
  let acc = 0;
  let spec = SPECS[SPECS.length - 1];
  for (const s of SPECS) {
    acc += s.weight;
    if (r <= acc) {
      spec = s;
      break;
    }
  }
  const scores = {} as ConcernScores;
  for (const c of CONCERNS) {
    const mu = spec.mu[c] ?? BASE_MU[c];
    scores[c] = clampScore(gauss(mu, spec.sd));
  }
  const skinType = pick(spec.types);
  const archetype = classifyArchetype(scores, skinType);
  const skinAge = Math.round(spec.id === "mature_firmness" ? between(42, 62) : between(19, 44));
  return { scores, skinType, archetype, skinAge };
}

// ---------- how each archetype tends to experience each product ----------
// Mean rating + typical outcomes. This is where "same product, different skin,
// different result" comes from.
type Experience = { mu: number; good: OutcomeTag[]; bad: OutcomeTag[] };
const EXPERIENCE: Record<string, Partial<Record<ArchetypeId, Experience>>> = {
  "clear-start-gel": {
    oily_breakout: { mu: 4.6, good: ["fewer_breakouts", "less_oily"], bad: [] },
    combo_pores: { mu: 4.2, good: ["less_oily", "smoother_texture"], bad: ["felt_drying"] },
    dry_sensitive: { mu: 2.1, good: [], bad: ["felt_drying", "stinging"] },
    mature_firmness: { mu: 2.8, good: [], bad: ["felt_drying"] },
    dull_tired: { mu: 3.4, good: ["smoother_texture"], bad: ["felt_drying"] },
    balanced: { mu: 3.9, good: ["fewer_breakouts"], bad: [] },
  },
  "calm-barrier-cream": {
    dry_sensitive: { mu: 4.8, good: ["calmed_redness", "more_hydrated"], bad: [] },
    mature_firmness: { mu: 4.4, good: ["more_hydrated", "softer_lines"], bad: [] },
    oily_breakout: { mu: 2.4, good: ["calmed_redness"], bad: ["caused_breakouts"] },
    combo_pores: { mu: 3.1, good: ["calmed_redness"], bad: ["caused_breakouts"] },
    dull_tired: { mu: 4.0, good: ["more_hydrated"], bad: [] },
    balanced: { mu: 3.8, good: ["more_hydrated"], bad: [] },
  },
  "niacinamide-10": {
    oily_breakout: { mu: 4.3, good: ["less_oily", "fewer_breakouts"], bad: ["pilling"] },
    combo_pores: { mu: 4.4, good: ["smoother_texture", "less_oily"], bad: [] },
    dry_sensitive: { mu: 2.9, good: [], bad: ["stinging", "no_change"] },
    mature_firmness: { mu: 3.5, good: ["brighter"], bad: ["no_change"] },
    dull_tired: { mu: 3.7, good: ["brighter"], bad: ["pilling"] },
    balanced: { mu: 3.9, good: ["smoother_texture"], bad: [] },
  },
  "retinal-02": {
    mature_firmness: { mu: 4.7, good: ["softer_lines", "smoother_texture", "faded_spots"], bad: [] },
    combo_pores: { mu: 4.1, good: ["smoother_texture"], bad: ["felt_drying"] },
    oily_breakout: { mu: 3.9, good: ["fewer_breakouts", "smoother_texture"], bad: ["felt_drying"] },
    dry_sensitive: { mu: 2.3, good: [], bad: ["stinging", "felt_drying"] },
    dull_tired: { mu: 4.0, good: ["brighter", "smoother_texture"], bad: ["felt_drying"] },
    balanced: { mu: 4.1, good: ["smoother_texture"], bad: [] },
  },
  "vit-c-15": {
    dull_tired: { mu: 4.5, good: ["brighter"], bad: [] },
    mature_firmness: { mu: 4.3, good: ["brighter", "faded_spots"], bad: [] },
    dry_sensitive: { mu: 2.6, good: [], bad: ["stinging"] },
    oily_breakout: { mu: 3.6, good: ["brighter"], bad: ["caused_breakouts"] },
    combo_pores: { mu: 3.9, good: ["brighter"], bad: [] },
    balanced: { mu: 4.2, good: ["brighter"], bad: [] },
  },
  "hydra-ha-serum": {
    dry_sensitive: { mu: 4.4, good: ["more_hydrated"], bad: [] },
    dull_tired: { mu: 4.2, good: ["more_hydrated", "brighter"], bad: [] },
    oily_breakout: { mu: 4.0, good: ["more_hydrated"], bad: [] },
    combo_pores: { mu: 3.9, good: ["more_hydrated"], bad: ["pilling"] },
    mature_firmness: { mu: 4.1, good: ["more_hydrated", "softer_lines"], bad: [] },
    balanced: { mu: 3.9, good: ["more_hydrated"], bad: ["no_change"] },
  },
  "azelaic-10": {
    dry_sensitive: { mu: 4.5, good: ["calmed_redness"], bad: [] },
    oily_breakout: { mu: 4.4, good: ["fewer_breakouts", "faded_spots"], bad: [] },
    combo_pores: { mu: 4.0, good: ["smoother_texture"], bad: [] },
    mature_firmness: { mu: 3.9, good: ["faded_spots"], bad: ["no_change"] },
    dull_tired: { mu: 3.7, good: ["brighter"], bad: ["no_change"] },
    balanced: { mu: 3.8, good: ["calmed_redness"], bad: [] },
  },
  "spf50-fluid": {
    oily_breakout: { mu: 4.5, good: ["less_oily"], bad: [] },
    combo_pores: { mu: 4.4, good: [], bad: [] },
    dry_sensitive: { mu: 3.3, good: [], bad: ["felt_drying"] },
    mature_firmness: { mu: 4.0, good: [], bad: [] },
    dull_tired: { mu: 4.2, good: [], bad: [] },
    balanced: { mu: 4.4, good: [], bad: [] },
  },
  "caffeine-eye": {
    dull_tired: { mu: 4.2, good: ["less_puffy", "brighter"], bad: [] },
    mature_firmness: { mu: 3.2, good: ["less_puffy"], bad: ["no_change"] },
    oily_breakout: { mu: 3.6, good: ["less_puffy"], bad: ["no_change"] },
    combo_pores: { mu: 3.5, good: [], bad: ["no_change"] },
    dry_sensitive: { mu: 3.4, good: [], bad: ["felt_drying"] },
    balanced: { mu: 3.6, good: ["less_puffy"], bad: ["no_change"] },
  },
  "peptide-firm-cream": {
    mature_firmness: { mu: 4.6, good: ["softer_lines", "more_hydrated"], bad: [] },
    dry_sensitive: { mu: 4.2, good: ["more_hydrated"], bad: [] },
    oily_breakout: { mu: 2.2, good: [], bad: ["caused_breakouts"] },
    combo_pores: { mu: 2.9, good: ["more_hydrated"], bad: ["caused_breakouts"] },
    dull_tired: { mu: 3.8, good: ["more_hydrated"], bad: [] },
    balanced: { mu: 3.6, good: [], bad: ["no_change"] },
  },
  "aha-pha-toner": {
    combo_pores: { mu: 4.5, good: ["smoother_texture", "brighter"], bad: [] },
    dull_tired: { mu: 4.4, good: ["brighter", "smoother_texture"], bad: [] },
    oily_breakout: { mu: 4.1, good: ["smoother_texture"], bad: ["stinging"] },
    mature_firmness: { mu: 4.0, good: ["brighter"], bad: [] },
    dry_sensitive: { mu: 2.0, good: [], bad: ["stinging", "felt_drying"] },
    balanced: { mu: 4.0, good: ["brighter"], bad: [] },
  },
  "cica-gel-moist": {
    oily_breakout: { mu: 4.6, good: ["more_hydrated", "calmed_redness"], bad: [] },
    combo_pores: { mu: 4.4, good: ["more_hydrated"], bad: [] },
    dry_sensitive: { mu: 3.2, good: ["calmed_redness"], bad: ["felt_drying"] },
    mature_firmness: { mu: 3.0, good: [], bad: ["felt_drying", "no_change"] },
    dull_tired: { mu: 3.9, good: ["more_hydrated"], bad: [] },
    balanced: { mu: 4.1, good: ["more_hydrated"], bad: [] },
  },
  "tinted-skin-serum": {
    dry_sensitive: { mu: 4.5, good: ["calmed_redness", "more_hydrated"], bad: [] },
    dull_tired: { mu: 4.3, good: ["brighter"], bad: [] },
    oily_breakout: { mu: 2.9, good: [], bad: ["caused_breakouts"] },
    combo_pores: { mu: 3.4, good: [], bad: ["pilling"] },
    mature_firmness: { mu: 4.1, good: ["brighter"], bad: [] },
    balanced: { mu: 4.2, good: ["brighter"], bad: [] },
  },
  "lip-tint-rose": {
    dry_sensitive: { mu: 4.4, good: ["more_hydrated"], bad: [] },
    mature_firmness: { mu: 4.2, good: ["more_hydrated"], bad: [] },
    oily_breakout: { mu: 4.1, good: [], bad: [] },
    combo_pores: { mu: 4.0, good: [], bad: [] },
    dull_tired: { mu: 4.3, good: ["brighter"], bad: [] },
    balanced: { mu: 4.2, good: [], bad: [] },
  },
};

const ALIASES = ["Maya", "Jonas", "Priya", "Elif", "Noor", "Sam", "Lucía", "Kenji", "Amara", "Tomás", "Hana", "Leo", "Zara", "Ivy", "Mateo", "Aylin", "Ruth", "Omar", "Sofie", "Dev", "Nia", "Arda", "Wren", "Yusuf", "Mila", "Theo", "Lena", "Kai", "Rosa", "Emir"];
const CITIES = ["Istanbul", "Berlin", "Lagos", "Seoul", "Toronto", "Lisbon", "Mumbai", "Dubai", "Manila", "São Paulo", "Austin", "Cairo"];

const TITLES: Record<number, string[]> = {
  5: ["Finally something that works", "Holy grail", "Repurchased three times", "My skin has never looked better", "Worth every penny"],
  4: ["Really good, minor gripes", "Solid everyday pick", "Does what it says", "Pleasantly surprised", "Good, not magic"],
  3: ["Fine, nothing special", "Mixed feelings", "Okay for the price", "Jury's still out", "Decent but not for me"],
  2: ["Didn't work for me", "Made things worse", "Disappointed", "Not for my skin", "Returned it"],
  1: ["Irritated my skin", "Broke me out badly", "Avoid if you're sensitive", "Awful experience", "Wasted my money"],
};

const SENTENCES: Record<OutcomeTag, string[]> = {
  calmed_redness: ["The redness on my cheeks visibly calmed down.", "My face stopped looking flushed by week three.", "It took the angry red tone down a notch."],
  fewer_breakouts: ["I get maybe one spot a month now instead of a cluster.", "Breakouts along my jaw basically stopped.", "Fewer whiteheads, fewer closed comedones."],
  caused_breakouts: ["Within a week I had new bumps along my chin.", "It clogged me up, little bumps everywhere.", "Broke out on my forehead, which never happens."],
  more_hydrated: ["My skin finally stopped feeling tight after cleansing.", "Plump and comfortable all day.", "No more flaky patches around my nose."],
  felt_drying: ["Left my skin tight and papery.", "I had to layer two moisturisers on top.", "Drying, especially around my mouth."],
  smoother_texture: ["Texture on my cheeks is noticeably smoother.", "Makeup sits better, bumps smoothed out.", "Those tiny bumps on my forehead are gone."],
  brighter: ["Noticeably brighter and more even tone.", "People asked if I'd been on holiday.", "Dullness lifted within a couple of weeks."],
  no_change: ["Honestly didn't notice much after six weeks.", "Pleasant but I can't say it changed anything.", "No visible difference."],
  stinging: ["Stung on application every single time.", "Burned around my nose.", "Tingling turned into real irritation by day four."],
  pilling: ["Pills under sunscreen, annoying.", "Rolls off if I layer anything on top.", "Pilling under foundation."],
  less_oily: ["I'm not blotting at lunch anymore.", "T-zone stays matte until the afternoon.", "Way less shine by midday."],
  softer_lines: ["Crow's feet look softer.", "Lines around my mouth are less etched.", "Forehead lines look shallower in daylight."],
  faded_spots: ["Old acne marks faded faster than usual.", "A dark spot on my cheek lightened a lot.", "Sun spots look lighter after two months."],
  less_puffy: ["Morning puffiness is noticeably less.", "Under-eyes look more awake.", "The bags look less heavy."],
};

const FILLER = [
  "Fragrance-free, which I appreciate.",
  "Texture is lovely and absorbs fast.",
  "A little goes a long way.",
  "Packaging could be better but the formula is what matters.",
  "I use it every night after cleansing.",
  "Started slowly, three nights a week.",
  "Used it morning and night for the whole trial.",
  "Took photos in the same light each week to be sure.",
];

function sampleRating(mu: number): 1 | 2 | 3 | 4 | 5 {
  const r = Math.round(gauss(mu, 0.75));
  return Math.max(1, Math.min(5, r)) as 1 | 2 | 3 | 4 | 5;
}

function writeBody(rating: number, outcomes: OutcomeTag[], weeks: number) {
  const parts = outcomes.map((o) => pick(SENTENCES[o]));
  parts.push(pick(FILLER));
  if (rating >= 4) parts.push(`Used it for ${weeks} weeks and I'm keeping it in rotation.`);
  else if (rating === 3) parts.push(`Gave it ${weeks} weeks. Might work for someone else.`);
  else parts.push(`Stopped after ${weeks} weeks.`);
  return parts.join(" ");
}

function generateReviews(n: number): Review[] {
  const reviews: Review[] = [];
  const start = new Date("2026-04-01T00:00:00Z").getTime();
  const span = new Date("2026-10-20T00:00:00Z").getTime() - start;
  for (let i = 0; i < n; i++) {
    const p = sampleProfile();
    const product = pick(PRODUCTS);
    const exp = EXPERIENCE[product.id]?.[p.archetype] ?? { mu: 3.7, good: [], bad: ["no_change"] };
    const rating = sampleRating(exp.mu);
    const outcomes: OutcomeTag[] = [];
    if (rating >= 4) {
      outcomes.push(...exp.good.slice(0, rand() < 0.6 ? 2 : 1));
      if (exp.bad.length && rand() < 0.15) outcomes.push(exp.bad[0]);
    } else if (rating === 3) {
      if (exp.good.length && rand() < 0.5) outcomes.push(exp.good[0]);
      outcomes.push(exp.bad[0] ?? "no_change");
    } else {
      outcomes.push(...exp.bad.slice(0, 2));
      if (!outcomes.length) outcomes.push("no_change");
    }
    const weeks = Math.round(between(rating <= 2 ? 1 : 3, rating <= 2 ? 5 : 12));
    const alias = `${pick(ALIASES)} · ${pick(CITIES)}`;
    reviews.push({
      id: `rv_${String(i + 1).padStart(3, "0")}`,
      productId: product.id,
      profileId: `seed_${String(i + 1).padStart(3, "0")}`,
      rating,
      title: pick(TITLES[rating]),
      body: writeBody(rating, [...new Set(outcomes)], weeks),
      weeksUsed: weeks,
      outcomes: [...new Set(outcomes)],
      createdAt: new Date(start + rand() * span).toISOString(),
      profile: { scores: p.scores, skinType: p.skinType, archetype: p.archetype, source: "seed", skinAge: p.skinAge },
      authorAlias: alias,
      verifiedSkin: true,
    });
  }
  return reviews.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const out = path.resolve(process.cwd(), "data", "seed");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "products.json"), JSON.stringify(PRODUCTS, null, 2));
const reviews = generateReviews(220);
fs.writeFileSync(path.join(out, "reviews.json"), JSON.stringify(reviews, null, 2));

const byArch: Record<string, number> = {};
for (const r of reviews) byArch[r.profile.archetype] = (byArch[r.profile.archetype] ?? 0) + 1;
console.log(`Wrote ${PRODUCTS.length} products and ${reviews.length} reviews.`);
console.log("Reviewers by skin group:", byArch);
console.log(
  "Archetype names:",
  ARCHETYPES.map((a) => a.id).join(", "),
  "| overall of first reviewer:",
  overallScore(reviews[0].profile.scores),
);
