import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useApp } from "./state";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import Store from "./pages/Store";
import ProductPage from "./pages/ProductPage";
import Brand from "./pages/Brand";
import { ARCHETYPES } from "@shared/types";
import { api } from "./api";

export default function App() {
  const { profile, config, setProfile } = useApp();
  const nav = useNavigate();
  const arch = profile ? ARCHETYPES.find((a) => a.id === profile.archetype) : null;

  async function forget() {
    if (profile) await api.deleteProfile(profile.id).catch(() => {});
    setProfile(null);
    nav("/");
  }

  return (
    <>
      <header className="header">
        <div className="container">
          <NavLink to="/" className="brand">
            <span className="dot" /> SameSkin
          </NavLink>
          <nav className="nav">
            <NavLink to="/scan">Scan</NavLink>
            <NavLink to="/store">Store</NavLink>
            <NavLink to="/brand">For brands</NavLink>
          </nav>
          <div className="row" style={{ gap: 8 }}>
            {config && (
              <span className={`pill ${config.demoMode || !config.hasYouCamKey ? "info" : "good"}`} title="Scan mode">
                {config.demoMode || !config.hasYouCamKey ? "Demo mode" : `Live · YouCam ${config.tier}`}
              </span>
            )}
            {profile && arch ? (
              <button className="pill accent" onClick={forget} title="Delete my skin profile">
                {arch.emoji} {arch.short} · forget me
              </button>
            ) : (
              <NavLink to="/scan" className="btn primary sm">
                Scan my skin
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main className="container" style={{ paddingBottom: 48 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/store" element={<Store />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/brand" element={<Brand />} />
        </Routes>
      </main>
      <footer className="footer">
        Built on the YouCam AI Skin Analysis API · Your selfie is analysed and discarded; only scores are kept · Not medical advice
      </footer>
    </>
  );
}
