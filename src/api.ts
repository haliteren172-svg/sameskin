import type { MatchedReview, Product, ProductMatch, Review, ScanResponse, SkinProfile, ArchetypeId } from "@shared/types";

export interface Config {
  demoMode: boolean;
  tier: "HD" | "SD";
  hasYouCamKey: boolean;
  hasClaude: boolean;
  unitsPerScan: number;
  concerns: string[];
  personas: string[];
}

export interface ApiError extends Error {
  code?: string;
  status?: number;
}

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? `Request failed (${res.status})`) as ApiError;
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export const api = {
  config: () => fetch("/api/config").then((r) => j<Config>(r)),
  scan: (file: File | null, persona?: string, mode?: "demo" | "live") => {
    const fd = new FormData();
    if (file) fd.append("image", file);
    if (persona) fd.append("persona", persona);
    if (mode) fd.append("mode", mode);
    return fetch("/api/scan", { method: "POST", body: fd }).then((r) => j<ScanResponse>(r));
  },
  profile: (id: string) => fetch(`/api/profile/${id}`).then((r) => j<{ profile: SkinProfile; hasSelfie: boolean }>(r)),
  deleteProfile: (id: string) => fetch(`/api/profile/${id}`, { method: "DELETE" }).then((r) => j<{ ok: true }>(r)),
  products: (profileId?: string) =>
    fetch(`/api/products${profileId ? `?profileId=${profileId}` : ""}`).then((r) =>
      j<{ products: { product: Product; match: ProductMatch | null; overallRating: number | null; reviewCount: number }[] }>(r),
    ),
  product: (id: string, profileId?: string) =>
    fetch(`/api/products/${id}${profileId ? `?profileId=${profileId}` : ""}`).then((r) =>
      j<{
        product: Product;
        match: ProductMatch | null;
        reviews: (MatchedReview | Review)[];
        twinThreshold?: number;
        byArchetype: Record<ArchetypeId, { count: number; avg: number | null }>;
      }>(r),
    ),
  verdict: (id: string, profileId: string) =>
    fetch(`/api/products/${id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    }).then((r) => j<{ summary: string; bullets: string[]; confidence: "low" | "medium" | "high"; source: "claude" | "rules"; toolCalls: string[] }>(r)),
  addReview: (input: Record<string, unknown>) =>
    fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).then((r) =>
      j<{ review: Review }>(r),
    ),
  brand: () =>
    fetch("/api/brand/insights").then((r) =>
      j<{
        rows: {
          product: Product;
          reviewCount: number;
          overall: number | null;
          byArchetype: Record<ArchetypeId, { count: number; avg: number | null }>;
          best: { archetype: string; avg: number | null } | null;
          worst: { archetype: string; avg: number | null } | null;
          spread: number;
        }[];
        totalReviews: number;
      }>(r),
    ),
  vto: (profileId: string, productId: string) =>
    fetch("/api/vto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, productId }) }).then(
      (r) => j<{ url: string; unitsSpent: number }>(r),
    ),
};
