/**
 * YouCam AI Skin Analysis client.
 *
 * Flow (per https://docs.perfectcorp.com/reference/ai_skin_analysis):
 *   1. POST /s2s/v2.0/file                 -> file_id + pre-signed PUT url
 *   2. PUT  <pre-signed url>               -> raw image bytes
 *   3. POST /s2s/v2.0/task/skin-analysis   -> task_id
 *   4. GET  /s2s/v2.0/task/skin-analysis/:task_id  (poll until success|error)
 *
 * The selfie is held in memory only for the duration of the request and is
 * never written to disk. Only the derived scores are kept.
 */
import { CONCERNS, type Concern, type ConcernScores, type SkinProfile, type SkinType, type SubScore } from "../shared/types";
import { classifyArchetype, deriveSkinType, overallScore } from "../shared/matching";

export const YOUCAM_BASE = process.env.YOUCAM_BASE_URL ?? "https://yce-api-01.makeupar.com";

export type Tier = "HD" | "SD";

/** dst_actions per tier. HD and SD cannot be mixed in one request. */
export const ACTIONS: Record<Tier, string[]> = {
  HD: [
    "hd_redness",
    "hd_oiliness",
    "hd_age_spot",
    "hd_radiance",
    "hd_moisture",
    "hd_dark_circle",
    "hd_eye_bag",
    "hd_droopy_upper_eyelid",
    "hd_droopy_lower_eyelid",
    "hd_firmness",
    "hd_tear_trough",
    "hd_texture",
    "hd_acne",
    "hd_pore",
    "hd_wrinkle",
    "hd_skin_type",
  ],
  SD: [
    "redness",
    "oiliness",
    "age_spot",
    "radiance",
    "moisture",
    "dark_circle_v2",
    "eye_bag",
    "droopy_upper_eyelid",
    "droopy_lower_eyelid",
    "firmness",
    "tear_trough",
    "texture",
    "acne",
    "pore",
    "wrinkle",
    "skin_type",
  ],
};

/** Published unit cost per task by number of concerns (docs, Oct 2026). */
export function unitCost(tier: Tier, nConcerns: number): number {
  const table = tier === "HD" ? [12, 16, 20, 22] : [9, 12, 14, 16];
  if (nConcerns <= 4) return table[0];
  if (nConcerns <= 8) return table[1];
  if (nConcerns <= 12) return table[2];
  return table[3];
}

export class YouCamError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 500,
    public hint?: string,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  error_no_face: "We couldn't find a face. Use a front-facing selfie with your whole face visible.",
  error_src_face_too_small: "Your face is too small in the frame. Move closer so it fills most of the photo.",
  error_src_face_out_of_bound: "Part of your face is cut off. Keep your whole face inside the frame.",
  error_lighting_dark: "The photo is too dark. Face a window or a soft light and try again.",
  error_multiple_people: "More than one face was detected. Please scan one person at a time.",
  error_large_face_angle: "Your face is turned too far. Look straight at the camera.",
  error_below_min_image_size: "The image is too small. HD analysis needs at least 1080px on the short side.",
  error_exceed_max_image_size: "The image is too large (max 10 MB).",
  exceed_max_filesize: "The image is too large (max 10 MB).",
  error_nsfw_content_detected: "The image was rejected by the content filter.",
  CreditInsufficiency: "Your YouCam account has no units left. Redeem your hackathon code in the console.",
  InvalidAccessToken: "The YouCam API key is missing or invalid. Check YOUCAM_API_KEY in .env.",
  InvalidApiKey: "The YouCam API key is missing or invalid. Check YOUCAM_API_KEY in .env.",
};

export function friendlyError(code: string, fallback: string): string {
  return FRIENDLY[code] ?? fallback;
}

interface FileApiResponse {
  status: number;
  data: {
    files: {
      file_id: string;
      requests: { method: string; url: string; headers: Record<string, string> }[];
    }[];
  };
}

interface TaskCreateResponse {
  status: number;
  data: { task_id: string };
  error?: string;
  error_code?: string;
}

export interface SkinOutput {
  type: string;
  ui_score?: number;
  raw_score?: number;
  mask_urls?: string[];
  /** Region sub-results (HD pore / wrinkle / skin_type). Shape varies; parsed defensively. */
  [k: string]: unknown;
}

export interface TaskPollResponse {
  status: number;
  data: {
    task_status: "running" | "queued" | "processing" | "success" | "error";
    results?: { output?: SkinOutput[]; url?: string; dst_id?: string };
    error?: string | null;
    error_code?: string;
    error_message?: string;
  };
  error?: string;
  error_code?: string;
}

async function api<T>(path: string, init: RequestInit, apiKey: string): Promise<T> {
  const res = await fetch(`${YOUCAM_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new YouCamError(`YouCam returned non-JSON (${res.status})`, "bad_response", 502);
  }
  if (!res.ok || (json.status && json.status >= 400)) {
    const code = json.error_code ?? `http_${res.status}`;
    throw new YouCamError(
      friendlyError(code, json.error ?? `YouCam error ${res.status}`),
      code,
      res.status === 200 ? 400 : res.status,
    );
  }
  return json as T;
}

/** Step 1 + 2: register the file and upload the bytes to the pre-signed URL. */
export async function uploadImage(
  bytes: Buffer,
  contentType: "image/jpeg" | "image/png",
  apiKey: string,
  fileName = `selfie.${contentType === "image/png" ? "png" : "jpg"}`,
): Promise<string> {
  const reg = await api<FileApiResponse>(
    "/s2s/v2.0/file",
    {
      method: "POST",
      body: JSON.stringify({
        files: [{ content_type: contentType, file_name: fileName, file_size: bytes.length }],
      }),
    },
    apiKey,
  );
  const file = reg.data.files[0];
  const req = file.requests[0];
  const put = await fetch(req.url, {
    method: req.method || "PUT",
    headers: { ...req.headers, "Content-Type": contentType, "Content-Length": String(bytes.length) },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) {
    throw new YouCamError(`Upload to storage failed (${put.status})`, "error_upload", 502);
  }
  return file.file_id;
}

/** Step 3: create the analysis task. */
export async function createSkinTask(fileId: string, tier: Tier, apiKey: string): Promise<string> {
  const res = await api<TaskCreateResponse>(
    "/s2s/v2.0/task/skin-analysis",
    {
      method: "POST",
      body: JSON.stringify({
        src_file_id: fileId,
        dst_actions: ACTIONS[tier],
        miniserver_args: { enable_mask_overlay: false },
        format: "json",
      }),
    },
    apiKey,
  );
  return res.data.task_id;
}

/** Step 4: poll until the task finishes. Polling does not consume units. */
export async function pollSkinTask(
  taskId: string,
  apiKey: string,
  { intervalMs = 2000, timeoutMs = 120_000 } = {},
): Promise<TaskPollResponse> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await api<TaskPollResponse>(`/s2s/v2.0/task/skin-analysis/${taskId}`, { method: "GET" }, apiKey);
    const s = res.data.task_status;
    if (s === "success") return res;
    if (s === "error") {
      const code = res.data.error_code ?? res.data.error ?? "error_inference";
      throw new YouCamError(
        friendlyError(String(code), res.data.error_message ?? "Analysis failed. Try another photo."),
        String(code),
        422,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new YouCamError("Analysis timed out. Please try again.", "timeout", 504);
}

/** Normalise `hd_dark_circle`, `dark_circle_v2`, `hd_pore_output_all`... to a Concern key. */
export function normaliseType(type: string): Concern | "skin_type" | null {
  let t = type.toLowerCase();
  t = t.replace(/^hd_/, "").replace(/_v\d+$/, "").replace(/_output.*$/, "");
  if (t === "skin_type") return "skin_type";
  return (CONCERNS as readonly string[]).includes(t) ? (t as Concern) : null;
}

const SKIN_TYPE_WORDS: Record<string, SkinType> = {
  oily: "oily",
  dry: "dry",
  combination: "combination",
  combo: "combination",
  normal: "normal",
  neutral: "normal",
};

/** Try hard to find a skin-type word anywhere inside an output entry. */
export function extractSkinType(out: SkinOutput): SkinType | null {
  const stack: unknown[] = [out];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === "string") {
      const w = v.toLowerCase().trim();
      if (SKIN_TYPE_WORDS[w]) return SKIN_TYPE_WORDS[w];
    } else if (Array.isArray(v)) stack.push(...v);
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (k === "type" || k === "mask_urls") continue;
        stack.push(val);
      }
    }
  }
  return null;
}

/** Pull region sub-scores (forehead/nose/cheek/...) out of an output entry if present. */
export function extractSubScores(out: SkinOutput): SubScore[] {
  const subs: SubScore[] = [];
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (typeof o.ui_score === "number") {
        subs.push({ region: k, ui_score: o.ui_score, raw_score: Number(o.raw_score ?? o.ui_score) });
      }
    }
  }
  return subs;
}

/** Convert a successful poll response into a SkinProfile (scores only, no image). */
export function toProfile(
  res: TaskPollResponse,
  tier: Tier,
  source: SkinProfile["source"],
  id: string,
): SkinProfile {
  const outputs = res.data.results?.output ?? [];
  const scores = {} as ConcernScores;
  const masks: SkinProfile["masks"] = {};
  const subScores: SkinProfile["subScores"] = {};
  let skinType: SkinType | null = null;
  let skinAge: number | undefined;

  // Live HD responses (verified 25 Oct 2026) return one entry per concern *and region*:
  //   { type: "hd_pore", region: "cheek", ui_score, raw_score, mask_urls }
  //   { type: "hd_pore", region: "whole", ... }            <- the headline score
  //   { type: "hd_skin_type", region: "whole", skin_type: "Oily" }
  //   { type: "skin_age", score: 51 }
  // Older/SD shapes nest regions as sub-objects; both are handled.
  const seenWhole = new Set<Concern>();
  for (const out of outputs) {
    const t = String(out.type ?? "").toLowerCase();
    if (t === "skin_age") {
      const v = (out as any).score ?? (out as any).ui_score ?? (out as any).value;
      if (typeof v === "number") skinAge = Math.round(v);
      continue;
    }
    if (typeof (out as any).skin_age === "number") skinAge = (out as any).skin_age;
    const key = normaliseType(t);
    if (key === "skin_type") {
      const region = String((out as any).region ?? "whole");
      const st = extractSkinType(out);
      if (st && (region === "whole" || !skinType)) skinType = st;
      continue;
    }
    if (!key) continue;

    const region = typeof (out as any).region === "string" ? ((out as any).region as string) : null;
    const whole = (out as any).whole;
    const ui = typeof out.ui_score === "number" ? out.ui_score : whole?.ui_score;

    if (region && region !== "whole") {
      // Region entry: record as a sub-score; only use it as the headline if no "whole" arrives.
      if (typeof ui === "number") {
        (subScores[key] ??= []).push({ region, ui_score: Math.round(ui), raw_score: Number(out.raw_score ?? ui) });
        if (!seenWhole.has(key) && typeof scores[key] !== "number") scores[key] = Math.round(ui);
      }
      continue;
    }
    if (typeof ui === "number") {
      scores[key] = Math.round(ui);
      seenWhole.add(key);
    }
    if (out.mask_urls?.length) masks[key] = out.mask_urls;
    const subs = extractSubScores(out);
    if (subs.length) subScores[key] = subs;
  }
  if (typeof (res.data.results as any)?.skin_age === "number") skinAge = (res.data.results as any).skin_age;
  for (const k of Object.keys(subScores) as Concern[]) if (!subScores[k]?.length) delete subScores[k];

  // Fill any concern the API did not return with a neutral score so matching still works.
  for (const c of CONCERNS) if (typeof scores[c] !== "number") scores[c] = 70;

  const st = skinType ?? deriveSkinType(scores);
  return {
    id,
    createdAt: new Date().toISOString(),
    source,
    tier,
    scores,
    subScores,
    skinType: st,
    overall: overallScore(scores),
    skinAge,
    masks,
    archetype: classifyArchetype(scores, st),
  };
}

/** Full live pipeline. */
export async function analyseSelfie(
  bytes: Buffer,
  contentType: "image/jpeg" | "image/png",
  tier: Tier,
  apiKey: string,
  id: string,
): Promise<{ profile: SkinProfile; raw: TaskPollResponse }> {
  const fileId = await uploadImage(bytes, contentType, apiKey);
  const taskId = await createSkinTask(fileId, tier, apiKey);
  const raw = await pollSkinTask(taskId, apiKey);
  return { profile: toProfile(raw, tier, "youcam", id), raw };
}
