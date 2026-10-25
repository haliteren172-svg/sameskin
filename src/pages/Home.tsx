import { Link } from "react-router-dom";
import { useApp } from "../state";

export default function Home() {
  const { profile } = useApp();
  return (
    <div className="fade-in">
      <section className="hero grid-2" style={{ alignItems: "center" }}>
        <div className="stack" style={{ gap: 20 }}>
          <span className="eyebrow">Skin AI × eCommerce</span>
          <h1>
            Reviews from people
            <br />
            with skin like <em style={{ color: "var(--accent)", fontStyle: "italic" }}>yours</em>.
          </h1>
          <p className="lead">
            A five-star review from oily, acne-prone skin tells dry, sensitive skin nothing. SameSkin reads your skin with
            YouCam Skin AI, finds reviewers whose skin measures like yours, and re-ranks every rating, review and product
            around them.
          </p>
          <div className="row">
            <Link to={profile ? "/store" : "/scan"} className="btn primary">
              {profile ? "Browse the store for my skin" : "Scan my skin · 20 seconds"}
            </Link>
            <Link to="/brand" className="btn ghost">
              See the brand view
            </Link>
          </div>
          <p className="tiny">Your selfie is analysed once and discarded. Only 15 scores and a skin type are kept.</p>
        </div>
        <div className="hero-visual">
          <svg viewBox="0 0 400 400" width="100%">
            <defs>
              <radialGradient id="g1" cx="50%" cy="40%">
                <stop offset="0%" stopColor="#ffd9cc" />
                <stop offset="100%" stopColor="#e8b4a0" />
              </radialGradient>
            </defs>
            <circle cx="200" cy="200" r="170" fill="url(#g1)" />
            <ellipse cx="200" cy="215" rx="95" ry="120" fill="#f3c9b6" />
            <circle cx="165" cy="195" r="7" fill="#2b1d1a" />
            <circle cx="235" cy="195" r="7" fill="#2b1d1a" />
            <path d="M172 255 q28 18 56 0" stroke="#2b1d1a" strokeWidth="5" fill="none" strokeLinecap="round" />
            <g fill="none" stroke="#c2543f" strokeWidth="2" strokeDasharray="5 4" opacity="0.8">
              <circle cx="150" cy="235" r="26" />
              <circle cx="250" cy="235" r="26" />
              <ellipse cx="200" cy="150" rx="60" ry="22" />
            </g>
          </svg>
          <div className="review-float" style={{ top: 10, left: -20 }}>
            <b>★★★★★ Finally something that works</b>
            <span className="pill good">94% skin match</span>
          </div>
          <div className="review-float" style={{ bottom: 40, right: -10, animationDelay: "1.2s" }}>
            <b>★★ Broke me out</b>
            <span className="pill">31% skin match · hidden</span>
          </div>
        </div>
      </section>

      <section className="steps" style={{ marginTop: 24 }}>
        <div className="step">
          <div className="num">1</div>
          <h3>One selfie</h3>
          <p className="muted">
            YouCam AI Skin Analysis (HD) scores 15 concerns from redness to pores, plus skin type and skin age.
          </p>
        </div>
        <div className="step">
          <div className="num">2</div>
          <h3>Find your skin twins</h3>
          <p className="muted">
            We weight the dimensions where you struggle most and find reviewers whose skin profile matches yours.
          </p>
        </div>
        <div className="step">
          <div className="num">3</div>
          <h3>Shop with evidence</h3>
          <p className="muted">
            Every product gets a "for skin like yours" score, twin-vs-crowd ratings and an honest agent verdict.
          </p>
        </div>
      </section>

      <section className="grid-2" style={{ marginTop: 40 }}>
        <div className="card pad-lg">
          <h2>Why this matters</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            Skincare is the most reviewed category in beauty and the least useful to read, because "it worked for me" means
            nothing without knowing whose skin "me" is. Shoppers buy on blended star ratings, get disappointed, return, and
            leave the one-star review that misleads the next person.
          </p>
        </div>
        <div className="card pad-lg">
          <h2>What brands get</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            A rating broken down by skin profile. A barrier cream that scores 4.8 with dry skin and 2.3 with oily skin is not
            a 3.9-star product. It is a great product being sold to the wrong people.
          </p>
        </div>
      </section>
    </div>
  );
}
