/** Shared domain types for SameSkin (client + server). */

export const CONCERNS = [
  "redness",
  "oiliness",
  "age_spot",
  "radiance",
  "moisture",
  "dark_circle",
  "eye_bag",
  "droopy_upper_eyelid",
  "droopy_lower_eyelid",
  "firmness",
  "tear_trough",
  "texture",
  "acne",
  "pore",
  "wrinkle",
] as const;

export type Concern = (typeof CONCERNS)[number];

export const CONCERN_LABELS: Record<Concern, string> = {
  redness: "Redness",
  oiliness: "Oil control",
  age_spot: "Dark spots",
  radiance: "Radiance",
  moisture: "Hydration",
  dark_circle: "Dark circles",
  eye_bag: "Eye bags",
  droopy_upper_eyelid: "Upper eyelid",
  droopy_lower_eyelid: "Lower eyelid",
  firmness: "Firmness",
  tear_trough: "Tear trough",
  texture: "Texture",
  acne: "Breakouts",
  pore: "Pores",
  wrinkle: "Fine lines",
};

export type SkinType = "oily" | "dry" | "combination" | "normal";

export const SKIN_TYPE_LABELS: Record<SkinType, string> = {
  oily: "Oily",
  dry: "Dry",
  combination: "Combination",
  normal: "Normal",
};

/** A concern score: 1-100, higher = healthier (YouCam ui_score convention). */
export type ConcernScores = Record<Concern, number>;

export interface SubScore {
  region: string;
  ui_score: number;
  raw_score: number;
}

export interface SkinProfile {
  id: string;
  createdAt: string;
  /** 'youcam' = live YouCam AI Skin Analysis result, 'demo' = recorded fixture, 'seed' = synthetic reviewer */
  source: "youcam" | "demo" | "seed";
  tier: "HD" | "SD";
  scores: ConcernScores;
  /** Region sub-scores where YouCam provides them (HD pore / wrinkle / skin_type). */
  subScores?: Partial<Record<Concern, SubScore[]>>;
  skinType: SkinType;
  overall: number;
  skinAge?: number;
  /** Mask overlay URLs returned by YouCam (expire after 24h). Never persisted with the selfie. */
  masks?: Partial<Record<Concern, string[]>>;
  archetype: ArchetypeId;
}

export type ArchetypeId =
  | "oily_breakout"
  | "dry_sensitive"
  | "combo_pores"
  | "mature_firmness"
  | "dull_tired"
  | "balanced";

export interface Archetype {
  id: ArchetypeId;
  name: string;
  short: string;
  emoji: string;
  /** Concerns that define this group (low scores). */
  signature: Concern[];
  skinTypes: SkinType[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "oily_breakout",
    name: "Oily & breakout-prone",
    short: "Oily / acne",
    emoji: "💧",
    signature: ["oiliness", "acne", "pore"],
    skinTypes: ["oily", "combination"],
  },
  {
    id: "dry_sensitive",
    name: "Dry & sensitive",
    short: "Dry / redness",
    emoji: "🌵",
    signature: ["moisture", "redness"],
    skinTypes: ["dry", "normal"],
  },
  {
    id: "combo_pores",
    name: "Combination with visible pores",
    short: "Combo / pores",
    emoji: "🎭",
    signature: ["pore", "texture", "oiliness"],
    skinTypes: ["combination"],
  },
  {
    id: "mature_firmness",
    name: "Mature, firmness-focused",
    short: "Mature",
    emoji: "⏳",
    signature: ["wrinkle", "firmness", "age_spot"],
    skinTypes: ["dry", "normal", "combination"],
  },
  {
    id: "dull_tired",
    name: "Dull & tired-looking",
    short: "Dull / tired",
    emoji: "🌙",
    signature: ["radiance", "dark_circle", "eye_bag"],
    skinTypes: ["normal", "combination", "dry"],
  },
  {
    id: "balanced",
    name: "Balanced, maintenance mode",
    short: "Balanced",
    emoji: "✨",
    signature: [],
    skinTypes: ["normal"],
  },
];

export type ProductCategory =
  | "cleanser"
  | "serum"
  | "moisturizer"
  | "sunscreen"
  | "treatment"
  | "eye"
  | "makeup";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  price: number;
  /** Concerns the product claims to improve. */
  targets: Concern[];
  /** Key ingredients (for the agent + "why it fits" explanations). */
  ingredients: string[];
  blurb: string;
  /** Simple visual: gradient + glyph, no third-party imagery. */
  art: { from: string; to: string; glyph: string };
  /** Optional makeup effect for YouCam Makeup VTO. */
  vto?: { category: "lip_color" | "blush" | "foundation"; color: string; texture?: string };
}

export type OutcomeTag =
  | "calmed_redness"
  | "fewer_breakouts"
  | "caused_breakouts"
  | "more_hydrated"
  | "felt_drying"
  | "smoother_texture"
  | "brighter"
  | "no_change"
  | "stinging"
  | "pilling"
  | "less_oily"
  | "softer_lines"
  | "faded_spots"
  | "less_puffy";

export const OUTCOME_LABELS: Record<OutcomeTag, string> = {
  calmed_redness: "calmed redness",
  fewer_breakouts: "fewer breakouts",
  caused_breakouts: "caused breakouts",
  more_hydrated: "more hydrated",
  felt_drying: "felt drying",
  smoother_texture: "smoother texture",
  brighter: "brighter skin",
  no_change: "no visible change",
  stinging: "stinging / irritation",
  pilling: "pilling under makeup",
  less_oily: "less oily by midday",
  softer_lines: "softer fine lines",
  faded_spots: "faded dark spots",
  less_puffy: "less puffy eyes",
};

export interface Review {
  id: string;
  productId: string;
  profileId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  weeksUsed: number;
  outcomes: OutcomeTag[];
  createdAt: string;
  /** Snapshot of the reviewer's skin profile at review time (scores only, no image). */
  profile: Pick<SkinProfile, "scores" | "skinType" | "archetype" | "source" | "skinAge">;
  authorAlias: string;
  verifiedSkin: boolean;
}

/** A review scored against the viewer's skin profile. */
export interface MatchedReview extends Review {
  similarity: number; // 0-100
  sharedConcerns: Concern[];
}

export type MatchVerdict =
  | "loved"
  | "liked"
  | "mixed"
  | "avoid"
  | "insufficient";

export interface ProductMatch {
  productId: string;
  /** 0-100: overall "for skin like yours" score. */
  forYouScore: number;
  verdict: MatchVerdict;
  twinCount: number;
  twinRating: number | null; // similarity-weighted rating among skin twins
  overallRating: number | null;
  reviewCount: number;
  /** 0-100: how much this product's claims target the viewer's weakest concerns. */
  claimFit: number;
  relevantTargets: Concern[];
  topOutcomes: { tag: OutcomeTag; count: number }[];
  warnings: { tag: OutcomeTag; count: number }[];
}

export interface ScanQuality {
  ok: boolean;
  issues: string[];
}

export interface ScanResponse {
  profile: SkinProfile;
  unitsSpent: number;
  mode: "live" | "demo";
  elapsedMs: number;
}
