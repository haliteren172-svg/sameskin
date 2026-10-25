import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ApiError } from "../api";
import { useApp } from "../state";
import { MatchBadge, OutcomeTags, ProductArt, Radar, Stars, VERDICT } from "../components/ui";
import {
  ARCHETYPES,
  CONCERN_LABELS,
  OUTCOME_LABELS,
  SKIN_TYPE_LABELS,
  type ArchetypeId,
  type MatchedReview,
  type OutcomeTag,
  type Product,
  type ProductMatch,
  type Review,
} from "@shared/types";
import { TWIN_THRESHOLD } from "@shared/matching";

type Data = {
  product: Product;
  match: ProductMatch | null;
  reviews: (MatchedReview | Review)[];
  byArchetype: Record<ArchetypeId, { count: number; avg: number | null }>;
};
type Verdict = { summary: string; bullets: string[]; confidence: string; source: "claude" | "rules"; toolCalls: string[] };

const OUTCOME_CHOICES = Object.keys(OUTCOME_LABELS) as OutcomeTag[];

export default function ProductPage() {
  const { id = "" } = useParams();
  const { profile, hasSelfie, config } = useApp();
  const [data, setData] = useState<Data | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [filter, setFilter] = useState<"twins" | "all">("twins");
  const [showForm, setShowForm] = useState(false);
  const [vto, setVto] = useState<{ url?: string; error?: string; loading?: boolean }>({});

  async function load() {
    const d = await api.product(id, profile?.id);
    setData(d);
  }
  useEffect(() => {
    setData(null);
    setVerdict(null);
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile?.id]);

  useEffect(() => {
    if (!profile || !data) return;
    api.verdict(id, profile.id).then(setVerdict).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile?.id, data?.reviews.length]);

  const reviews = useMemo(() => {
    if (!data) return [];
    const rs = data.reviews as MatchedReview[];
    if (profile && filter === "twins") return rs.filter((r) => r.similarity >= TWIN_THRESHOLD);
    return rs;
  }, [data, filter, profile]);

  async function tryOn() {
    if (!profile) return;
    setVto({ loading: true });
    try {
      const r = await api.vto(profile.id, id);
      setVto({ url: r.url });
    } catch (e) {
      setVto({ error: (e as ApiError).message });
    }
  }

  if (!data)
    return (
      <div style={{ paddingTop: 40 }} className="stack">
        <div className="skeleton" style={{ height: 32, width: "40%" }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );

  const { product, match } = data;
  const twinAvgScores = profile
    ? averageScores((data.reviews as MatchedReview[]).filter((r) => r.similarity >= TWIN_THRESHOLD))
    : null;

  return (
    <div className="fade-in" style={{ paddingTop: 28 }}>
      <Link to="/store" className="tiny">
        ← Back to store
      </Link>
      <div className="grid-2" style={{ marginTop: 10, alignItems: "start" }}>
        <div className="stack">
          <ProductArt product={product} style={{ borderRadius: "var(--radius)", aspectRatio: "5/4", fontSize: "5rem" }}>
            {match && (
              <span className="match-chip">
                <MatchBadge match={match} />
              </span>
            )}
          </ProductArt>
          <div className="card">
            <div className="tiny">Key ingredients</div>
            <div className="chips" style={{ marginTop: 6 }}>
              {product.ingredients.map((i) => (
                <span key={i} className="tag">
                  {i}
                </span>
              ))}
            </div>
            <div className="tiny" style={{ marginTop: 12 }}>
              Claims to help with
            </div>
            <div className="chips" style={{ marginTop: 6 }}>
              {product.targets.map((t) => {
                const relevant = match?.relevantTargets.includes(t);
                return (
                  <span key={t} className={`tag ${relevant ? "good" : ""}`} title={relevant ? "This is one of your weaker areas" : ""}>
                    {CONCERN_LABELS[t]}
                    {profile ? ` · you ${profile.scores[t]}` : ""}
                  </span>
                );
              })}
            </div>
            {match && (
              <p className="tiny" style={{ marginTop: 10 }}>
                Claim relevance to you: <b>{match.claimFit}/100</b>.{" "}
                {match.relevantTargets.length
                  ? `${match.relevantTargets.length} of ${product.targets.length} claims target an area where you score under 65.`
                  : "None of its claims target an area where you score under 65."}
              </p>
            )}
          </div>
          {product.vto && (
            <div className="card stack">
              <div className="row between">
                <h3>Try it on</h3>
                <span className="pill info">YouCam Makeup VTO · 1 unit</span>
              </div>
              {vto.url ? (
                <div className="preview" style={{ aspectRatio: "3/4" }}>
                  <img src={vto.url} alt="Try-on result" />
                </div>
              ) : (
                <p className="tiny">
                  See this shade on the selfie you just scanned. {config?.demoMode ? "Needs live mode." : ""}
                </p>
              )}
              {vto.error && <div className="banner warn">{vto.error}</div>}
              <button className="btn ghost sm" onClick={tryOn} disabled={!profile || !hasSelfie || vto.loading}>
                {vto.loading ? "Rendering…" : !profile ? "Scan first" : !hasSelfie ? "Selfie expired, rescan" : "Try on my selfie"}
              </button>
            </div>
          )}
        </div>

        <div className="stack">
          <div>
            <div className="tiny">{product.brand}</div>
            <h1 style={{ fontSize: "2.2rem" }}>{product.name}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {product.blurb}
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: "1.3rem" }}>
                ${product.price}
              </span>
              <button className="btn primary sm">Add to bag</button>
            </div>
          </div>

          {match && profile ? (
            <div className="card stack">
              <div className="row between">
                <h3>For skin like yours</h3>
                <span className="pill">
                  for-you score <b className="mono">{match.forYouScore}</b>
                </span>
              </div>
              <div className="twin-compare">
                <div className="box hl">
                  <div className="tiny">
                    {match.twinCount} skin twin{match.twinCount === 1 ? "" : "s"} (≥{TWIN_THRESHOLD}% match)
                  </div>
                  <div className="val">{match.twinRating ?? "–"}</div>
                  <Stars value={match.twinRating} />
                </div>
                <div className="box">
                  <div className="tiny">Everyone ({match.reviewCount})</div>
                  <div className="val">{match.overallRating ?? "–"}</div>
                  <Stars value={match.overallRating} />
                </div>
              </div>
              {(match.topOutcomes.length > 0 || match.warnings.length > 0) && (
                <div className="row">
                  {match.topOutcomes.map((o) => (
                    <span key={o.tag} className="tag good">
                      {OUTCOME_LABELS[o.tag]} ×{o.count}
                    </span>
                  ))}
                  {match.warnings.map((o) => (
                    <span key={o.tag} className="tag bad">
                      {OUTCOME_LABELS[o.tag]} ×{o.count}
                    </span>
                  ))}
                </div>
              )}
              <div className="card agent">
                <div className="row between">
                  <b>Verdict</b>
                  {verdict && (
                    <span className="tiny">
                      {verdict.source === "claude" ? `Claude agent · ${verdict.toolCalls.length} tool calls` : "rules engine"} · confidence{" "}
                      {verdict.confidence}
                    </span>
                  )}
                </div>
                {verdict ? (
                  <>
                    <p style={{ marginTop: 6 }}>{verdict.summary}</p>
                    {verdict.bullets.length > 0 && (
                      <ul>
                        {verdict.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                    <div className="skeleton" />
                    <div className="skeleton" style={{ width: "80%" }} />
                  </div>
                )}
              </div>
              {twinAvgScores && (
                <details>
                  <summary className="tiny" style={{ cursor: "pointer" }}>
                    Your profile vs. the average skin twin who reviewed this
                  </summary>
                  <Radar a={profile.scores} b={twinAvgScores} size={260} />
                  <div className="row tiny" style={{ justifyContent: "center" }}>
                    <span className="legend-dot" style={{ background: "#c2543f" }} /> you
                    <span className="legend-dot" style={{ background: "#3b6fb6", marginLeft: 10 }} /> average twin
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="row between">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <Stars value={avg(data.reviews)} size={1.2} />
                    <b className="mono">{avg(data.reviews) ?? "–"}</b>
                  </div>
                  <div className="tiny">{data.reviews.length} reviews, all skin types blended</div>
                </div>
                <Link to="/scan" className="btn accent sm">
                  Scan to see your match
                </Link>
              </div>
            </div>
          )}

          <div className="card">
            <div className="tiny" style={{ marginBottom: 8 }}>
              How this product lands by skin group
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {ARCHETYPES.map((a) => {
                const v = data.byArchetype[a.id];
                const mine = profile?.archetype === a.id;
                return (
                  <div key={a.id} className="score-row" style={{ gridTemplateColumns: "190px 1fr 60px" }}>
                    <span style={{ fontWeight: mine ? 700 : 500 }}>
                      {a.emoji} {a.short}
                      {mine ? " (you)" : ""}
                    </span>
                    <div className={`bar ${v.avg === null ? "" : v.avg >= 4 ? "good" : v.avg >= 3.2 ? "mid" : "low"}`}>
                      <i style={{ width: `${v.avg ? (v.avg / 5) * 100 : 0}%` }} />
                    </div>
                    <span className="tiny mono" style={{ textAlign: "right" }}>
                      {v.avg ?? "–"} ({v.count})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2>Reviews</h2>
          <div className="row">
            {profile && (
              <div className="chips">
                <button className={`chip ${filter === "twins" ? "on" : ""}`} onClick={() => setFilter("twins")}>
                  Skin twins only ({(data.reviews as MatchedReview[]).filter((r) => r.similarity >= TWIN_THRESHOLD).length})
                </button>
                <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
                  All ({data.reviews.length})
                </button>
              </div>
            )}
            <button className="btn ghost sm" onClick={() => setShowForm((s) => !s)} disabled={!profile} title={!profile ? "Scan first" : ""}>
              {profile ? "Write a review with my skin profile" : "Scan to review"}
            </button>
          </div>
        </div>
        {showForm && profile && (
          <ReviewForm
            productId={product.id}
            profileId={profile.id}
            onDone={() => {
              setShowForm(false);
              load();
            }}
          />
        )}
        <div className="card" style={{ marginTop: 12 }}>
          {reviews.length === 0 && <p className="muted">No reviews from skin twins yet. Switch to "All" to see everyone.</p>}
          {reviews.map((r) => {
            const m = r as MatchedReview;
            const isTwin = profile && m.similarity >= TWIN_THRESHOLD;
            const arch = ARCHETYPES.find((a) => a.id === r.profile.archetype);
            return (
              <div key={r.id} className={`review ${isTwin ? "twin" : ""}`}>
                <div className="row between">
                  <div className="row">
                    {profile && (
                      <div className="sim-ring" style={{ ["--p" as any]: m.similarity }} title="Skin similarity">
                        <span>{Math.round(m.similarity)}%</span>
                      </div>
                    )}
                    <div>
                      <div className="row" style={{ gap: 8 }}>
                        <Stars value={r.rating} />
                        <b>{r.title}</b>
                      </div>
                      <div className="meta">
                        <span>{r.authorAlias}</span>
                        <span>·</span>
                        <span>
                          {arch?.emoji} {arch?.short} · {SKIN_TYPE_LABELS[r.profile.skinType]}
                          {r.profile.skinAge ? ` · skin age ${r.profile.skinAge}` : ""}
                        </span>
                        <span>·</span>
                        <span>{r.weeksUsed} wks</span>
                        {r.verifiedSkin && (
                          <span className="pill good" style={{ padding: "2px 8px" }}>
                            ✓ verified skin profile
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="tiny">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                <p style={{ fontSize: "0.95rem" }}>{r.body}</p>
                <div className="row">
                  <OutcomeTags tags={r.outcomes} />
                  {profile && m.sharedConcerns?.length > 0 && (
                    <span className="tiny">shares your {m.sharedConcerns.map((c) => CONCERN_LABELS[c].toLowerCase()).join(", ")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function avg(rs: Review[]) {
  return rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : null;
}

function averageScores(rs: MatchedReview[]) {
  if (!rs.length) return null;
  const out: any = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.profile.scores)) out[k] = (out[k] ?? 0) + v;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] / rs.length);
  return out as Review["profile"]["scores"];
}

function ReviewForm({ productId, profileId, onDone }: { productId: string; profileId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [alias, setAlias] = useState("");
  const [outcomes, setOutcomes] = useState<OutcomeTag[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.addReview({ productId, profileId, rating, title, body, weeksUsed: weeks, outcomes, alias });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack fade-in" style={{ marginTop: 12 }}>
      <div className="row between">
        <h3>Your review</h3>
        <span className="pill good">✓ attaches your verified skin profile (scores only)</span>
      </div>
      <div className="star-pick">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={n <= rating ? "on" : ""} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            ★
          </button>
        ))}
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Calmed my cheeks in two weeks" />
        </div>
        <div className="field">
          <label>Name (optional)</label>
          <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Elif · Istanbul" />
        </div>
      </div>
      <div className="field">
        <label>What happened</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="How did your skin respond, and when?" />
      </div>
      <div className="field">
        <label>Weeks used: {weeks}</label>
        <input type="range" min={1} max={24} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Outcomes</label>
        <div className="chips">
          {OUTCOME_CHOICES.map((o) => (
            <button
              key={o}
              className={`chip ${outcomes.includes(o) ? "on" : ""}`}
              onClick={() => setOutcomes((xs) => (xs.includes(o) ? xs.filter((x) => x !== o) : xs.length < 5 ? [...xs, o] : xs))}
            >
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>
      </div>
      {err && <div className="banner bad">{err}</div>}
      <div className="row">
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "Posting…" : "Post review"}
        </button>
        <span className="tiny">Verdict: {VERDICT.loved.label.toLowerCase()} is earned, not claimed.</span>
      </div>
    </div>
  );
}
