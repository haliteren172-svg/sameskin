/**
 * Tiny JSON-file store. Seed data lives in data/seed (committed); anything
 * users create at runtime lands in data/runtime (git-ignored).
 */
import fs from "node:fs";
import path from "node:path";
import type { Product, Review, SkinProfile } from "../shared/types";

const ROOT = path.resolve(process.cwd(), "data");
const SEED = path.join(ROOT, "seed");
const RUNTIME = path.join(ROOT, "runtime");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export class Store {
  products: Product[];
  private seedReviews: Review[];
  private userReviews: Review[];
  private profiles: Map<string, SkinProfile>;

  constructor() {
    this.products = readJson<Product[]>(path.join(SEED, "products.json"), []);
    this.seedReviews = readJson<Review[]>(path.join(SEED, "reviews.json"), []);
    this.userReviews = readJson<Review[]>(path.join(RUNTIME, "reviews.json"), []);
    this.profiles = new Map(
      readJson<SkinProfile[]>(path.join(RUNTIME, "profiles.json"), []).map((p) => [p.id, p]),
    );
  }

  get reviews(): Review[] {
    return [...this.userReviews, ...this.seedReviews];
  }

  product(id: string) {
    return this.products.find((p) => p.id === id);
  }

  profile(id: string) {
    return this.profiles.get(id);
  }

  saveProfile(p: SkinProfile) {
    // Mask URLs expire in 24h and point at the analysed image; keep them in memory only.
    const { masks: _masks, ...persisted } = p;
    this.profiles.set(p.id, p);
    writeJson(
      path.join(RUNTIME, "profiles.json"),
      [...this.profiles.values()].map(({ masks: _m, ...rest }) => rest),
    );
    void persisted;
  }

  addReview(r: Review) {
    this.userReviews.unshift(r);
    writeJson(path.join(RUNTIME, "reviews.json"), this.userReviews);
  }

  deleteProfile(id: string) {
    this.profiles.delete(id);
    writeJson(path.join(RUNTIME, "profiles.json"), [...this.profiles.values()]);
  }
}
