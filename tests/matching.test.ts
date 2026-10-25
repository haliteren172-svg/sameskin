import { describe, expect, it } from "vitest";
import { CONCERNS, type ConcernScores, type Product, type Review, type SkinProfile } from "../shared/types";
import {
  classifyArchetype,
  claimFit,
  concernsOf,
  deriveSkinType,
  matchCatalog,
  matchProduct,
  ratingByArchetype,
  similarity,
  TWIN_THRESHOLD,
} from "../shared/matching";

const scores = (over: Partial<ConcernScores> = {}): ConcernScores =>
  CONCERNS.reduce((o, c) => ({ ...o, [c]: over[c] ?? 80 }), {} as ConcernScores);

const profile = (over: Partial<ConcernScores>, skinType: SkinProfile["skinType"] = "normal"): SkinProfile => {
  const s = scores(over);
  return {
    id: "p",
    createdAt: "",
    source: "demo",
    tier: "HD",
    scores: s,
    skinType,
    overall: 0,
    archetype: classifyArchetype(s, skinType),
  };
};

const review = (productId: string, rating: Review["rating"], over: Partial<ConcernScores>, skinType: Review["profile"]["skinType"] = "normal"): Review => ({
  id: Math.random().toString(36).slice(2),
  productId,
  profileId: "x",
  rating,
  title: "t",
  body: "b",
  weeksUsed: 4,
  outcomes: rating >= 4 ? ["calmed_redness"] : ["stinging"],
  createdAt: "2026-05-01T00:00:00Z",
  profile: { scores: scores(over), skinType, archetype: classifyArchetype(scores(over), skinType), source: "seed" },
  authorAlias: "a",
  verifiedSkin: true,
});

const cream: Product = {
  id: "cream",
  name: "Cream",
  brand: "B",
  category: "moisturizer",
  price: 10,
  targets: ["redness", "moisture"],
  ingredients: [],
  blurb: "",
  art: { from: "#000", to: "#fff", glyph: "x" },
};

describe("similarity", () => {
  it("is 100 for identical profiles", () => {
    const a = profile({ redness: 40 });
    expect(similarity(a, a)).toBeGreaterThanOrEqual(99);
  });
  it("weights shared problems more than shared strengths", () => {
    const me = profile({ redness: 35, moisture: 40 }, "dry");
    const twin = profile({ redness: 38, moisture: 45, radiance: 60 }, "dry");
    const stranger = profile({ oiliness: 35, acne: 40 }, "oily");
    expect(similarity(me, twin)).toBeGreaterThan(TWIN_THRESHOLD);
    expect(similarity(me, stranger)).toBeLessThan(TWIN_THRESHOLD);
  });
  it("is symmetric", () => {
    const a = profile({ pore: 30 }, "oily");
    const b = profile({ wrinkle: 30 }, "dry");
    expect(similarity(a, b)).toBe(similarity(b, a));
  });
});

describe("archetype + skin type", () => {
  it("classifies dry/red skin as dry_sensitive", () => {
    expect(classifyArchetype(scores({ moisture: 38, redness: 42 }), "dry")).toBe("dry_sensitive");
  });
  it("classifies healthy skin as balanced", () => {
    expect(classifyArchetype(scores(), "normal")).toBe("balanced");
  });
  it("derives skin type from oil/moisture when the API omits it", () => {
    expect(deriveSkinType(scores({ oiliness: 40, moisture: 75 }))).toBe("oily");
    expect(deriveSkinType(scores({ oiliness: 80, moisture: 40 }))).toBe("dry");
  });
  it("lists concerns weakest first", () => {
    expect(concernsOf(scores({ acne: 50, pore: 40 }))).toEqual(["pore", "acne"]);
  });
});

describe("product match", () => {
  const me = profile({ redness: 40, moisture: 42 }, "dry");
  const reviews: Review[] = [
    ...Array.from({ length: 5 }, () => review("cream", 5, { redness: 42, moisture: 40 }, "dry")),
    ...Array.from({ length: 5 }, () => review("cream", 2, { oiliness: 35, acne: 40 }, "oily")),
  ];

  it("separates the twin rating from the blended rating", () => {
    const m = matchProduct(me, cream, reviews, 3.5);
    expect(m.overallRating).toBe(3.5);
    expect(m.twinCount).toBe(5);
    expect(m.twinRating!).toBeGreaterThan(4.3);
    expect(m.verdict).toBe("loved");
    expect(m.topOutcomes[0].tag).toBe("calmed_redness");
  });

  it("flags insufficient evidence with fewer than 2 twins", () => {
    const stranger = profile({ wrinkle: 30, firmness: 35 }, "normal");
    const m = matchProduct(stranger, cream, reviews);
    expect(m.twinCount).toBeLessThan(2);
    expect(m.verdict).toBe("insufficient");
  });

  it("claim fit rises when the product targets the viewer's weak spots", () => {
    expect(claimFit(scores({ redness: 30, moisture: 30 }), cream)).toBeGreaterThan(claimFit(scores(), cream));
    expect(claimFit(scores(), cream)).toBeLessThanOrEqual(50);
  });

  it("ranks the catalogue by for-you score", () => {
    const other: Product = { ...cream, id: "gel", targets: ["oiliness"] };
    const all = [...reviews, ...Array.from({ length: 4 }, () => review("gel", 3, { redness: 45, moisture: 45 }, "dry"))];
    const ranked = matchCatalog(me, [other, cream], all);
    expect(ranked[0].productId).toBe("cream");
  });

  it("breaks ratings down by archetype", () => {
    const by = ratingByArchetype(reviews);
    expect(by.dry_sensitive.count).toBe(5);
    expect(by.dry_sensitive.avg).toBe(5);
    expect(by.oily_breakout.avg).toBe(2);
  });
});
