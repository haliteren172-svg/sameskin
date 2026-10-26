import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SkinProfile } from "@shared/types";
import { api, type Config } from "./api";

interface State {
  profile: SkinProfile | null;
  hasSelfie: boolean;
  setProfile: (p: SkinProfile | null, hasSelfie?: boolean) => void;
  config: Config | null;
}

const Ctx = createContext<State>({ profile: null, hasSelfie: false, setProfile: () => {}, config: null });
const KEY = "sameskin.profile";

export function StateProvider({ children }: { children: ReactNode }) {
  const [profile, setP] = useState<SkinProfile | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as SkinProfile) : null;
    } catch {
      return null;
    }
  });
  const [hasSelfie, setHasSelfie] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
  }, []);

  // Deep link for judges & demos: /store?persona=dry_sensitive loads a demo profile without a photo.
  useEffect(() => {
    const persona = new URLSearchParams(window.location.search).get("persona");
    if (!persona) return;
    api
      .scan(null, persona, "demo")
      .then((r) => {
        setP(r.profile);
        setHasSelfie(false);
        try {
          localStorage.setItem(KEY, JSON.stringify({ ...r.profile, masks: undefined }));
        } catch {}
      })
      .catch(() => {});
  }, []);

  // Re-validate the stored profile against the server (it may have been deleted / server restarted).
  useEffect(() => {
    if (!profile) return;
    // A persona deep link replaces the profile; don't let this re-validation race it.
    if (new URLSearchParams(window.location.search).get("persona")) return;
    api
      .profile(profile.id)
      .then((r) => {
        setP(r.profile);
        setHasSelfie(r.hasSelfie);
      })
      .catch(() => {
        setP(null);
        try {
          localStorage.removeItem(KEY);
        } catch {}
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<State>(
    () => ({
      profile,
      hasSelfie,
      config,
      setProfile: (p, selfie = false) => {
        setP(p);
        setHasSelfie(selfie);
        try {
          if (p) localStorage.setItem(KEY, JSON.stringify({ ...p, masks: undefined }));
          else localStorage.removeItem(KEY);
        } catch {}
      },
    }),
    [profile, hasSelfie, config],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
