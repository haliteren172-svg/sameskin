import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ApiError } from "../api";
import { useApp } from "../state";
import { ArchetypeTag, Radar, ScoreBars } from "../components/ui";
import { ARCHETYPES, CONCERN_LABELS, SKIN_TYPE_LABELS, type Concern, type ScanResponse } from "@shared/types";
import { concernsOf } from "@shared/matching";

type Phase = "pick" | "camera" | "ready" | "scanning" | "done";

const PERSONA_LABELS: Record<string, string> = {
  oily_breakout: "💧 Oily & breakout-prone",
  dry_sensitive: "🌵 Dry & sensitive",
  mature_firmness: "⏳ Mature, firmness-focused",
};

export default function Scan() {
  const { config, setProfile } = useApp();
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [drag, setDrag] = useState(false);
  const [persona, setPersona] = useState<string>("");
  const [maskConcern, setMaskConcern] = useState<Concern | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const demo = !config || config.demoMode || !config.hasYouCamKey;

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function choose(f: File) {
    if (!/^image\/(jpeg|png)$/.test(f.type)) return setError("Please use a JPG or PNG photo.");
    if (f.size > 10 * 1024 * 1024) return setError("Max 10 MB.");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase("ready");
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1440 }, height: { ideal: 1920 } } });
      streamRef.current = stream;
      setPhase("camera");
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch {
      setError("Camera not available. Upload a photo instead.");
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        stopCamera();
        choose(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  async function run() {
    setPhase("scanning");
    setError(null);
    try {
      const r = await api.scan(file, demo ? persona || undefined : undefined);
      setResult(r);
      setProfile(r.profile, Boolean(file));
      setPhase("done");
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      setPhase(file ? "ready" : "pick");
    }
  }

  const profile = result?.profile;
  const weak = profile ? concernsOf(profile.scores) : [];
  const maskUrl = profile && maskConcern ? profile.masks?.[maskConcern]?.[0] : undefined;

  return (
    <div className="fade-in" style={{ paddingTop: 32 }}>
      {phase !== "done" && (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="stack">
            <span className="eyebrow" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12, letterSpacing: ".08em" }}>
              STEP 1 OF 2
            </span>
            <h1 style={{ fontSize: "2.4rem" }}>Scan your skin</h1>
            <p className="muted">
              Front-facing, no makeup if you can, soft daylight, face filling most of the frame. The photo is sent to YouCam AI
              Skin Analysis, scored, and discarded.
            </p>
            {config && (
              <div className={`banner ${demo ? "info" : "warn"}`}>
                {demo ? (
                  <span>
                    <b>Demo mode.</b> Scans return a recorded YouCam response so you can try the product without an API key.
                    Pick a demo skin profile below, or upload any photo.
                  </span>
                ) : (
                  <span>
                    <b>Live mode.</b> This scan calls YouCam AI Skin Analysis ({config.tier}) and spends about {config.unitsPerScan} API
                    units.
                  </span>
                )}
              </div>
            )}
            {demo && (
              <div className="field">
                <label>Demo skin profile</label>
                <div className="chips">
                  {(config?.personas ?? ["oily_breakout", "dry_sensitive", "mature_firmness"]).map((p) => (
                    <button key={p} className={`chip ${persona === p ? "on" : ""}`} onClick={() => setPersona(persona === p ? "" : p)}>
                      {PERSONA_LABELS[p] ?? p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {error && <div className="banner bad">{error}</div>}
            <div className="row">
              {phase === "ready" || phase === "scanning" ? (
                <>
                  <button className="btn primary" onClick={run} disabled={phase === "scanning"}>
                    {phase === "scanning" ? "Analysing…" : "Analyse my skin"}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                      setPhase("pick");
                    }}
                    disabled={phase === "scanning"}
                  >
                    Retake
                  </button>
                </>
              ) : (
                <>
                  <button className="btn primary" onClick={startCamera}>
                    Use camera
                  </button>
                  {demo && (
                    <button className="btn ghost" onClick={run} disabled={!persona}>
                      Skip photo, use demo profile
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            {phase === "camera" ? (
              <div className="preview">
                <video ref={videoRef} autoPlay playsInline muted />
                <div className="face-guide" />
                <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center" }}>
                  <button className="btn accent" onClick={capture}>
                    Capture
                  </button>
                </div>
              </div>
            ) : preview ? (
              <div className="preview">
                <img src={preview} alt="Your selfie" />
                {phase === "scanning" && <div className="scan-line" />}
              </div>
            ) : (
              <label
                className={`dropzone ${drag ? "active" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) choose(f);
                }}
              >
                <input type="file" accept="image/jpeg,image/png" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
                <div style={{ fontSize: "2.5rem" }}>🤳</div>
                <div style={{ fontWeight: 600, marginTop: 8 }}>Drop a selfie here, or click to choose</div>
                <div className="tiny" style={{ marginTop: 4 }}>
                  JPG or PNG · under 10 MB · HD analysis wants 1080px+ on the short side
                </div>
              </label>
            )}
          </div>
        </div>
      )}

      {phase === "done" && profile && result && (
        <div className="stack fade-in" style={{ gap: 24 }}>
          <div className="row between">
            <div>
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12, letterSpacing: ".08em" }}>STEP 2 OF 2</span>
              <h1 style={{ fontSize: "2.4rem" }}>Your skin profile</h1>
            </div>
            <div className="row">
              <span className={`pill ${result.mode === "live" ? "good" : "info"}`}>
                {result.mode === "live" ? `Live YouCam ${profile.tier} · ${result.unitsSpent} units` : "Demo fixture"} ·{" "}
                {(result.elapsedMs / 1000).toFixed(1)}s
              </span>
              <button className="btn primary" onClick={() => nav("/store")}>
                Shop for skin like mine →
              </button>
            </div>
          </div>

          <div className="grid-3" style={{ alignItems: "start" }}>
            <div className="card stack">
              <div className="row between">
                <div>
                  <div className="tiny">Overall skin score</div>
                  <div className="big-score">{profile.overall}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tiny">Skin type</div>
                  <div style={{ fontWeight: 700, fontSize: "1.2rem" }}>{SKIN_TYPE_LABELS[profile.skinType]}</div>
                  {profile.skinAge && <div className="tiny">AI skin age {profile.skinAge}</div>}
                </div>
              </div>
              <div>
                <div className="tiny" style={{ marginBottom: 6 }}>
                  Your skin-twin group
                </div>
                <ArchetypeTag id={profile.archetype} />
                <p className="tiny" style={{ marginTop: 8 }}>
                  {ARCHETYPES.find((a) => a.id === profile.archetype)?.signature.map((c) => CONCERN_LABELS[c]).join(" · ") ||
                    "No single dominant concern"}
                </p>
              </div>
              <div>
                <div className="tiny" style={{ marginBottom: 6 }}>
                  What we will match on
                </div>
                <div className="chips">
                  {weak.length ? (
                    weak.map((c) => (
                      <span key={c} className="tag bad">
                        {CONCERN_LABELS[c]} {profile.scores[c]}
                      </span>
                    ))
                  ) : (
                    <span className="tag good">Nothing below 65, nice skin</span>
                  )}
                </div>
              </div>
              <Radar a={profile.scores} size={280} />
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 12 }}>All 15 concerns</h3>
              <ScoreBars scores={profile.scores} highlight={weak} />
              {profile.subScores && Object.keys(profile.subScores).length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary className="tiny" style={{ cursor: "pointer" }}>
                    Region sub-scores (HD)
                  </summary>
                  <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                    {Object.entries(profile.subScores).map(([c, subs]) => (
                      <div key={c} className="tiny">
                        <b>{CONCERN_LABELS[c as Concern]}:</b>{" "}
                        {subs!.map((s) => `${s.region} ${s.ui_score}`).join(" · ")}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="card stack">
              <h3>Detection map</h3>
              {preview ? (
                <>
                  <div className="preview" style={{ aspectRatio: "3/4" }}>
                    <img src={maskUrl ?? preview} alt="Analysed selfie" />
                  </div>
                  {profile.masks && Object.keys(profile.masks).length > 0 ? (
                    <div className="chips">
                      <button className={`chip ${!maskConcern ? "on" : ""}`} onClick={() => setMaskConcern(null)}>
                        Original
                      </button>
                      {Object.keys(profile.masks).map((c) => (
                        <button key={c} className={`chip ${maskConcern === c ? "on" : ""}`} onClick={() => setMaskConcern(c as Concern)}>
                          {CONCERN_LABELS[c as Concern]}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="tiny">Per-concern detection masks are drawn from live YouCam results. In demo mode we only show your photo.</p>
                  )}
                </>
              ) : (
                <p className="tiny">No photo was uploaded for this demo profile.</p>
              )}
              <div className="banner info" style={{ fontSize: "0.82rem" }}>
                Your photo stays in server memory for 30 minutes for overlays and try-on, then disappears. It is never written to disk.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
