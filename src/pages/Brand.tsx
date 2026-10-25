import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ARCHETYPES, type ArchetypeId } from "@shared/types";

type Row = Awaited<ReturnType<typeof api.brand>>["rows"][number];

function cellColor(avg: number | null) {
  if (avg === null) return { background: "var(--bg-2)", color: "var(--ink-3)" };
  if (avg >= 4.3) return { background: "#cdebd8", color: "#1f6b42" };
  if (avg >= 3.8) return { background: "#e3f4ea", color: "#2f8f5b" };
  if (avg >= 3.2) return { background: "#fbf0d8", color: "#8a5e10" };
  return { background: "#fbe3e0", color: "#a3281c" };
}

export default function Brand() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    api.brand().then((r) => {
      setRows(r.rows.sort((a, b) => b.spread - a.spread));
      setTotal(r.totalReviews);
    });
  }, []);

  const archName = (id: string) => ARCHETYPES.find((a) => a.id === id)?.short ?? id;

  return (
    <div className="fade-in" style={{ paddingTop: 32 }}>
      <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12, letterSpacing: ".08em" }}>FOR BRANDS & RETAILERS</span>
      <h1 style={{ fontSize: "2.4rem" }}>One star rating hides six audiences</h1>
      <p className="muted" style={{ maxWidth: "62ch", marginTop: 8 }}>
        Every review on SameSkin carries a verified skin profile, so a rating can be split by who gave it. Sorted by spread: the
        products at the top are being sold to people they were never going to work for.
      </p>

      {rows && (
        <div className="grid-3" style={{ margin: "22px 0" }}>
          <div className="card">
            <div className="tiny">Reviews with skin profiles</div>
            <div className="big-score">{total}</div>
          </div>
          <div className="card">
            <div className="tiny">Products with a 1.5★+ gap between groups</div>
            <div className="big-score">{rows.filter((r) => r.spread >= 1.5).length}</div>
          </div>
          <div className="card">
            <div className="tiny">Biggest gap</div>
            <div className="big-score">{rows[0]?.spread ?? 0}★</div>
            <div className="tiny">{rows[0]?.product.name}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="heat">
          <thead>
            <tr>
              <th>Product</th>
              <th>All</th>
              {ARCHETYPES.map((a) => (
                <th key={a.id}>
                  {a.emoji} {a.short}
                </th>
              ))}
              <th>Gap</th>
              <th>Insight</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.product.id}>
                <td>
                  <Link to={`/product/${r.product.id}`} style={{ fontWeight: 600 }}>
                    {r.product.name}
                  </Link>
                  <div className="tiny">
                    {r.product.brand} · {r.reviewCount} reviews
                  </div>
                </td>
                <td>
                  <span className="cell" style={cellColor(r.overall)}>
                    {r.overall ?? "–"}
                  </span>
                </td>
                {ARCHETYPES.map((a) => {
                  const v = r.byArchetype[a.id as ArchetypeId];
                  return (
                    <td key={a.id}>
                      <span className="cell" style={cellColor(v.count >= 2 ? v.avg : null)} title={`${v.count} reviews`}>
                        {v.count >= 2 ? v.avg : "·"}
                      </span>
                    </td>
                  );
                })}
                <td>
                  <b className="mono">{r.spread}★</b>
                </td>
                <td className="tiny" style={{ maxWidth: 220 }}>
                  {r.best && r.worst && r.spread >= 1
                    ? `Market to ${archName(r.best.archetype)} (${r.best.avg}★). Warn ${archName(r.worst.archetype)} (${r.worst.avg}★) before checkout.`
                    : "Lands evenly across skin groups."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny" style={{ marginTop: 12 }}>
        Demo data: reviewer profiles in this catalogue are synthetic, sampled from six skin archetypes. In production every profile
        comes from a YouCam scan at review time.
      </p>
    </div>
  );
}
