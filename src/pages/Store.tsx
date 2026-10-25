import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";
import { ArchetypeTag, ProductCard } from "../components/ui";
import { CONCERN_LABELS, type Product, type ProductCategory, type ProductMatch } from "@shared/types";
import { concernsOf } from "@shared/matching";

type Row = { product: Product; match: ProductMatch | null; overallRating: number | null; reviewCount: number };
const CATS: (ProductCategory | "all")[] = ["all", "cleanser", "serum", "treatment", "moisturizer", "sunscreen", "eye", "makeup"];

export default function Store() {
  const { profile } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cat, setCat] = useState<ProductCategory | "all">("all");
  const [sort, setSort] = useState<"foryou" | "overall" | "price">("foryou");

  useEffect(() => {
    setRows(null);
    api.products(profile?.id).then((r) => setRows(r.products));
  }, [profile?.id]);

  const shown = useMemo(() => {
    if (!rows) return [];
    let xs = cat === "all" ? rows : rows.filter((r) => r.product.category === cat);
    if (sort === "overall") xs = [...xs].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    else if (sort === "price") xs = [...xs].sort((a, b) => a.product.price - b.product.price);
    else if (profile) xs = [...xs].sort((a, b) => (b.match?.forYouScore ?? 0) - (a.match?.forYouScore ?? 0));
    return xs;
  }, [rows, cat, sort, profile]);

  const weak = profile ? concernsOf(profile.scores) : [];
  const movers = useMemo(() => {
    if (!rows || !profile) return [];
    return rows
      .filter((r) => r.match && r.match.twinRating !== null && r.overallRating !== null)
      .map((r) => ({ ...r, delta: (r.match!.twinRating ?? 0) - (r.overallRating ?? 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [rows, profile]);

  return (
    <div className="fade-in" style={{ paddingTop: 32 }}>
      <div className="row between" style={{ alignItems: "end", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: "2.4rem" }}>{profile ? "Ranked for skin like yours" : "The store"}</h1>
          {profile ? (
            <div className="row" style={{ marginTop: 8 }}>
              <ArchetypeTag id={profile.archetype} />
              {weak.slice(0, 4).map((c) => (
                <span key={c} className="tag bad">
                  {CONCERN_LABELS[c]} {profile.scores[c]}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 6 }}>
              Showing blended ratings. <Link to="/scan" style={{ color: "var(--accent)", fontWeight: 600 }}>Scan your skin</Link> to see what
              people with skin like yours actually think.
            </p>
          )}
        </div>
        <div className="row">
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} style={{ width: "auto" }}>
            <option value="foryou">Sort: for skin like mine</option>
            <option value="overall">Sort: overall rating</option>
            <option value="price">Sort: price</option>
          </select>
        </div>
      </div>

      {profile && movers.length > 0 && (
        <div className="card soft" style={{ marginBottom: 18 }}>
          <div className="tiny" style={{ marginBottom: 8 }}>
            Where your skin twins disagree with the crowd
          </div>
          <div className="grid-3">
            {movers.map((m) => (
              <Link key={m.product.id} to={`/product/${m.product.id}`} className="row between" style={{ gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{m.product.name}</div>
                  <div className="tiny">
                    twins {m.match!.twinRating} · crowd {m.overallRating}
                  </div>
                </div>
                <span className={`pill ${m.delta > 0 ? "good" : "bad"}`}>
                  {m.delta > 0 ? "+" : ""}
                  {m.delta.toFixed(1)}★
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="chips" style={{ marginBottom: 18 }}>
        {CATS.map((c) => (
          <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
            {c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      {!rows ? (
        <div className="product-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 300 }}>
              <div className="skeleton" style={{ height: 140, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: "60%" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="product-grid">
          {shown.map((r) => (
            <ProductCard key={r.product.id} {...r} />
          ))}
        </div>
      )}
    </div>
  );
}
