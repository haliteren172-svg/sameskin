import "./env";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { Store } from "./store";
import {
  ACTIONS,
  YouCamError,
  analyseSelfie,
  toProfile,
  unitCost,
  type TaskPollResponse,
  type Tier,
} from "./youcam";
import { makeupTryOn } from "./makeup";
import { runAgent } from "./agent";
import { matchCatalog, matchProduct, matchReviews, ratingByArchetype, TWIN_THRESHOLD } from "../shared/matching";
import { CONCERNS, type Review, type SkinProfile } from "../shared/types";

const PORT = Number(process.env.PORT ?? 8787);
const DEMO_MODE = (process.env.DEMO_MODE ?? "true").toLowerCase() === "true";
const TIER: Tier = (process.env.YOUCAM_TIER ?? "HD").toUpperCase() === "SD" ? "SD" : "HD";
const YOUCAM_KEY = process.env.YOUCAM_API_KEY?.trim() || "";

const store = new Store();
const app = express();
app.use(express.json({ limit: "1mb" }));

// Selfies are kept in memory only (never on disk), for 30 minutes, so the
// shopper can see mask overlays and try makeup on without re-uploading.
const selfies = new Map<string, { bytes: Buffer; type: string; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of selfies) if (v.expires < now) selfies.delete(k);
}, 60_000).unref();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function loadFixture(name: string): TaskPollResponse {
  return JSON.parse(fs.readFileSync(path.resolve("data/demo", `${name}.json`), "utf8"));
}
const PERSONAS = ["oily_breakout", "dry_sensitive", "mature_firmness"] as const;

app.get("/api/config", (_req, res) => {
  res.json({
    demoMode: DEMO_MODE,
    tier: TIER,
    hasYouCamKey: Boolean(YOUCAM_KEY),
    hasClaude: Boolean(process.env.ANTHROPIC_API_KEY),
    unitsPerScan: unitCost(TIER, ACTIONS[TIER].length),
    concerns: ACTIONS[TIER],
    personas: PERSONAS,
  });
});

/** POST /api/scan  (multipart: image, optional persona for demo mode) */
app.post("/api/scan", upload.single("image"), async (req, res) => {
  const started = Date.now();
  const id = `sp_${crypto.randomBytes(6).toString("hex")}`;
  const file = req.file;
  const persona = typeof req.body?.persona === "string" ? req.body.persona : "";
  const live = Boolean(YOUCAM_KEY) && !DEMO_MODE && (req.body?.mode !== "demo");

  try {
    let profile: SkinProfile;
    let unitsSpent = 0;
    if (live) {
      if (!file) return res.status(400).json({ error: "Please upload a selfie.", code: "no_image" });
      const type = file.mimetype === "image/png" ? "image/png" : "image/jpeg";
      const r = await analyseSelfie(file.buffer, type, TIER, YOUCAM_KEY, id);
      profile = r.profile;
      unitsSpent = unitCost(TIER, ACTIONS[TIER].length);
    } else {
      // Demo: pick a recorded fixture, either by persona or deterministically from the image.
      let name: (typeof PERSONAS)[number] = PERSONAS[0];
      if ((PERSONAS as readonly string[]).includes(persona)) name = persona as any;
      else if (file) {
        const h = crypto.createHash("sha1").update(file.buffer).digest()[0];
        name = PERSONAS[h % PERSONAS.length];
      }
      profile = toProfile(loadFixture(name), TIER, "demo", id);
      await new Promise((r) => setTimeout(r, 1200)); // feel like a real round-trip
    }
    if (file) selfies.set(id, { bytes: file.buffer, type: file.mimetype, expires: Date.now() + 30 * 60_000 });
    store.saveProfile(profile);
    res.json({ profile, unitsSpent, mode: live ? "live" : "demo", elapsedMs: Date.now() - started });
  } catch (err) {
    if (err instanceof YouCamError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error(err);
    res.status(500).json({ error: "Unexpected error during analysis.", code: "internal" });
  }
});

app.get("/api/profile/:id", (req, res) => {
  const p = store.profile(req.params.id);
  if (!p) return res.status(404).json({ error: "Profile not found" });
  res.json({ profile: p, hasSelfie: selfies.has(p.id) });
});

app.delete("/api/profile/:id", (req, res) => {
  store.deleteProfile(req.params.id);
  selfies.delete(req.params.id);
  res.json({ ok: true });
});

app.get("/api/selfie/:id", (req, res) => {
  const s = selfies.get(req.params.id);
  if (!s) return res.status(404).end();
  res.setHeader("Content-Type", s.type);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(s.bytes);
});

app.get("/api/products", (req, res) => {
  const profile = typeof req.query.profileId === "string" ? store.profile(req.query.profileId) : undefined;
  const products = store.products;
  const reviews = store.reviews;
  if (!profile) {
    return res.json({
      products: products.map((p) => {
        const rs = reviews.filter((r) => r.productId === p.id);
        const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null;
        return { product: p, match: null, overallRating: avg ? Math.round(avg * 10) / 10 : null, reviewCount: rs.length };
      }),
    });
  }
  const matches = matchCatalog(profile, products, reviews);
  res.json({
    products: matches.map((m) => ({
      product: products.find((p) => p.id === m.productId)!,
      match: m,
      overallRating: m.overallRating,
      reviewCount: m.reviewCount,
    })),
  });
});

app.get("/api/products/:id", (req, res) => {
  const product = store.product(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const profile = typeof req.query.profileId === "string" ? store.profile(req.query.profileId) : undefined;
  const reviews = store.reviews.filter((r) => r.productId === product.id);
  if (!profile) {
    return res.json({ product, match: null, reviews, byArchetype: ratingByArchetype(reviews) });
  }
  const matched = matchReviews(profile, reviews);
  res.json({
    product,
    match: matchProduct(profile, product, store.reviews),
    reviews: matched,
    twinThreshold: TWIN_THRESHOLD,
    byArchetype: ratingByArchetype(reviews),
  });
});

app.post("/api/products/:id/verdict", async (req, res) => {
  const product = store.product(req.params.id);
  const profile = store.profile(String(req.body?.profileId ?? ""));
  if (!product || !profile) return res.status(404).json({ error: "Product or profile not found" });
  const reviews = store.reviews.filter((r) => r.productId === product.id);
  const matched = matchReviews(profile, reviews);
  const match = matchProduct(profile, product, store.reviews);
  const result = await runAgent({ viewer: profile, product, match, reviews: matched });
  res.json(result);
});

const ReviewInput = z.object({
  profileId: z.string().min(1),
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(10).max(1200),
  weeksUsed: z.number().int().min(1).max(104),
  outcomes: z.array(z.string()).max(5).default([]),
  alias: z.string().trim().max(40).optional(),
});

app.post("/api/reviews", (req, res) => {
  const parsed = ReviewInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" });
  const { profileId, productId, rating, title, body, weeksUsed, outcomes, alias } = parsed.data;
  const profile = store.profile(profileId);
  const product = store.product(productId);
  if (!profile || !product) return res.status(404).json({ error: "Product or profile not found" });
  const review: Review = {
    id: `rv_${crypto.randomBytes(5).toString("hex")}`,
    productId,
    profileId,
    rating: rating as Review["rating"],
    title,
    body,
    weeksUsed,
    outcomes: outcomes as Review["outcomes"],
    createdAt: new Date().toISOString(),
    profile: {
      scores: profile.scores,
      skinType: profile.skinType,
      archetype: profile.archetype,
      source: profile.source,
      skinAge: profile.skinAge,
    },
    authorAlias: alias || "You",
    verifiedSkin: profile.source === "youcam",
  };
  store.addReview(review);
  res.status(201).json({ review });
});

/** Brand dashboard: how each product lands with each skin-twin group. */
app.get("/api/brand/insights", (_req, res) => {
  const reviews = store.reviews;
  const rows = store.products.map((p) => {
    const rs = reviews.filter((r) => r.productId === p.id);
    const by = ratingByArchetype(rs);
    const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null;
    const groups = Object.entries(by).filter(([, v]) => v.count >= 3 && v.avg !== null);
    const best = groups.sort((a, b) => (b[1].avg ?? 0) - (a[1].avg ?? 0))[0];
    const worst = groups.sort((a, b) => (a[1].avg ?? 0) - (b[1].avg ?? 0))[0];
    return {
      product: p,
      reviewCount: rs.length,
      overall: avg ? Math.round(avg * 10) / 10 : null,
      byArchetype: by,
      best: best ? { archetype: best[0], avg: best[1].avg } : null,
      worst: worst ? { archetype: worst[0], avg: worst[1].avg } : null,
      spread: best && worst ? Math.round(((best[1].avg ?? 0) - (worst[1].avg ?? 0)) * 10) / 10 : 0,
    };
  });
  res.json({ rows, totalReviews: reviews.length, concerns: CONCERNS });
});

/** Makeup Virtual Try-On for makeup products (live mode only). */
app.post("/api/vto", async (req, res) => {
  const profileId = String(req.body?.profileId ?? "");
  const product = store.product(String(req.body?.productId ?? ""));
  const selfie = selfies.get(profileId);
  if (!product?.vto) return res.status(400).json({ error: "This product has no try-on effect." });
  if (!selfie) return res.status(404).json({ error: "Your selfie has expired. Scan again to try it on." });
  if (!YOUCAM_KEY || DEMO_MODE) {
    return res.status(409).json({ error: "Makeup try-on needs live mode (set YOUCAM_API_KEY and DEMO_MODE=false).", code: "demo" });
  }
  try {
    const url = await makeupTryOn(selfie.bytes, selfie.type === "image/png" ? "image/png" : "image/jpeg", product.vto, YOUCAM_KEY);
    res.json({ url, unitsSpent: 1 });
  } catch (err) {
    if (err instanceof YouCamError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: "Try-on failed." });
  }
});

// ---- static (production) ----
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve("dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`SameSkin API on http://localhost:${PORT}  mode=${DEMO_MODE || !YOUCAM_KEY ? "DEMO" : "LIVE"} tier=${TIER} claude=${process.env.ANTHROPIC_API_KEY ? "on" : "off"}`);
  if (!DEMO_MODE && !YOUCAM_KEY) console.log("  ! DEMO_MODE=false but no YOUCAM_API_KEY set: scans will use demo fixtures.");
});
