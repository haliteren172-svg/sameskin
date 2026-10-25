import { Link } from "react-router-dom";
import {
  ARCHETYPES,
  CONCERNS,
  CONCERN_LABELS,
  OUTCOME_LABELS,
  type Concern,
  type ConcernScores,
  type MatchVerdict,
  type Product,
  type ProductMatch,
  type SkinProfile,
} from "@shared/types";
import { NEGATIVE_OUTCOMES } from "@shared/matching";

export function Stars({ value, size = 0.95 }: { value: number | null; size?: number }) {
  if (value === null) return <span className="tiny">no reviews</span>;
  const full = Math.round(value);
  return (
    <span className="stars" style={{ fontSize: `${size}rem` }} aria-label={`${value} out of 5`}>
      {"★".repeat(full)}
      <span style={{ color: "#e2d8cf" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

export const VERDICT: Record<MatchVerdict, { label: string; cls: string }> = {
  loved: { label: "Loved by skin like yours", cls: "good" },
  liked: { label: "Liked by skin like yours", cls: "good" },
  mixed: { label: "Mixed for skin like yours", cls: "warn" },
  avoid: { label: "Skin like yours disliked it", cls: "bad" },
  insufficient: { label: "Few skin twins yet", cls: "" },
};

export function MatchBadge({ match }: { match: ProductMatch }) {
  const v = VERDICT[match.verdict];
  return <span className={`pill ${v.cls}`}>{v.label}</span>;
}

export function ProductArt({ product, children, style }: { product: Product; children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="product-art" style={{ background: `linear-gradient(135deg, ${product.art.from}, ${product.art.to})`, ...style }}>
      <span style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.25))" }}>{product.art.glyph}</span>
      {children}
    </div>
  );
}

export function ProductCard({
  product,
  match,
  overallRating,
  reviewCount,
}: {
  product: Product;
  match: ProductMatch | null;
  overallRating: number | null;
  reviewCount: number;
}) {
  return (
    <Link to={`/product/${product.id}`} className="product-card fade-in">
      <ProductArt product={product}>
        {match && (
          <span className="match-chip">
            <MatchBadge match={match} />
          </span>
        )}
      </ProductArt>
      <div className="product-body">
        <div className="tiny">{product.brand}</div>
        <div className="name">{product.name}</div>
        {match ? (
          <div className="row between">
            <div>
              <div className="row" style={{ gap: 6 }}>
                <Stars value={match.twinRating ?? overallRating} />
                <b className="mono">{match.twinRating ?? overallRating ?? "–"}</b>
              </div>
              <div className="tiny">
                {match.twinCount} skin twin{match.twinCount === 1 ? "" : "s"} · {reviewCount} reviews
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="big-score" style={{ fontSize: "1.6rem" }}>
                {match.forYouScore}
              </div>
              <div className="tiny">for you</div>
            </div>
          </div>
        ) : (
          <div className="row between">
            <div className="row" style={{ gap: 6 }}>
              <Stars value={overallRating} />
              <b className="mono">{overallRating ?? "–"}</b>
            </div>
            <div className="tiny">{reviewCount} reviews</div>
          </div>
        )}
        <div className="row between">
          <span className="mono" style={{ fontWeight: 600 }}>
            ${product.price}
          </span>
          <span className="tiny">{product.category}</span>
        </div>
      </div>
    </Link>
  );
}

export function barClass(score: number) {
  return score >= 75 ? "good" : score >= 60 ? "mid" : "low";
}

export function ScoreBars({ scores, highlight, limit }: { scores: ConcernScores; highlight?: Concern[]; limit?: number }) {
  const order = [...CONCERNS].sort((a, b) => scores[a] - scores[b]).slice(0, limit ?? CONCERNS.length);
  const hl = new Set(highlight ?? []);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {order.map((c) => (
        <div className="score-row" key={c}>
          <span style={{ fontWeight: hl.has(c) ? 700 : 500 }}>{CONCERN_LABELS[c]}</span>
          <div className={`bar ${barClass(scores[c])}`}>
            <i style={{ width: `${scores[c]}%` }} />
          </div>
          <b className="mono" style={{ textAlign: "right" }}>
            {scores[c]}
          </b>
        </div>
      ))}
    </div>
  );
}

/** Radar chart of the 15 concern scores (optionally overlaid with a second profile). */
export function Radar({ a, b, size = 300 }: { a: ConcernScores; b?: ConcernScores; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const n = CONCERNS.length;
  const pt = (i: number, v: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(ang) * r * (v / 100), cy + Math.sin(ang) * r * (v / 100)] as const;
  };
  const poly = (s: ConcernScores) => CONCERNS.map((c, i) => pt(i, s[c]).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: "block", margin: "0 auto" }}>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={CONCERNS.map((_, i) => pt(i, v).join(",")).join(" ")} fill="none" stroke="#e9dfd5" strokeWidth={1} />
      ))}
      {CONCERNS.map((c, i) => {
        const [x, y] = pt(i, 121);
        return (
          <text key={c} x={x} y={y} fontSize={8} textAnchor="middle" dominantBaseline="middle" fill="#8f827b">
            {CONCERN_LABELS[c]}
          </text>
        );
      })}
      {b && <polygon points={poly(b)} fill="rgba(59,111,182,0.15)" stroke="#3b6fb6" strokeWidth={1.5} strokeDasharray="4 3" />}
      <polygon points={poly(a)} fill="rgba(194,84,63,0.18)" stroke="#c2543f" strokeWidth={2} />
    </svg>
  );
}

export function ArchetypeTag({ id }: { id: SkinProfile["archetype"] }) {
  const a = ARCHETYPES.find((x) => x.id === id)!;
  return (
    <span className="pill accent">
      {a.emoji} {a.name}
    </span>
  );
}

export function OutcomeTags({ tags }: { tags: Product["targets"] | string[] }) {
  return (
    <div className="chips">
      {tags.map((t) => (
        <span key={t} className={`tag ${NEGATIVE_OUTCOMES.has(t as any) ? "bad" : "good"}`}>
          {OUTCOME_LABELS[t as keyof typeof OUTCOME_LABELS] ?? t}
        </span>
      ))}
    </div>
  );
}
