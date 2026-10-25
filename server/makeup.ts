/**
 * YouCam AI Makeup Virtual Try-On (1 unit per task).
 * https://docs.perfectcorp.com/reference/makeup_vto
 */
import { YOUCAM_BASE, YouCamError, friendlyError, uploadImage } from "./youcam";
import type { Product } from "../shared/types";

function effectFor(vto: NonNullable<Product["vto"]>) {
  switch (vto.category) {
    case "lip_color":
      return {
        category: "lip_color",
        shape: { name: "original" },
        palettes: [{ color: vto.color, texture: vto.texture ?? "satin", colorIntensity: 75 }],
        style: { type: "full" },
      };
    case "blush":
      return {
        category: "blush",
        pattern: { name: "2colors1" },
        palettes: [
          { color: vto.color, texture: "matte", colorIntensity: 55 },
          { color: vto.color, texture: "matte", colorIntensity: 35 },
        ],
      };
    case "foundation":
    default:
      return {
        category: "foundation",
        palettes: [{ color: vto.color, colorIntensity: 60, glowIntensity: 30, coverageIntensity: 45 }],
      };
  }
}

export async function makeupTryOn(
  bytes: Buffer,
  contentType: "image/jpeg" | "image/png",
  vto: NonNullable<Product["vto"]>,
  apiKey: string,
): Promise<string> {
  const fileId = await uploadImage(bytes, contentType, apiKey);
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const create = await fetch(`${YOUCAM_BASE}/s2s/v2.0/task/makeup-vto`, {
    method: "POST",
    headers,
    body: JSON.stringify({ src_file_id: fileId, effects: [effectFor(vto)], version: "1.0" }),
  });
  const cj: any = await create.json();
  if (!create.ok || cj.status >= 400) {
    throw new YouCamError(friendlyError(cj.error_code, cj.error ?? "Try-on request failed"), cj.error_code ?? "vto_error", 400);
  }
  const taskId = cj.data.task_id;
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const r = await fetch(`${YOUCAM_BASE}/s2s/v2.0/task/makeup-vto/${taskId}`, { headers });
    const j: any = await r.json();
    const s = j.data?.task_status;
    if (s === "success") {
      const results = j.data.results;
      const url = Array.isArray(results) ? results[0]?.download_url ?? results[0]?.url : results?.url ?? results?.download_url;
      if (!url) throw new YouCamError("Try-on finished without an image.", "vto_no_url", 502);
      return url;
    }
    if (s === "error") {
      const code = j.data.error_code ?? j.data.error ?? "error_inference";
      throw new YouCamError(friendlyError(String(code), j.data.error_message ?? "Try-on failed."), String(code), 422);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new YouCamError("Try-on timed out.", "timeout", 504);
}
