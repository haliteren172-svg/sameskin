import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractSkinType, normaliseType, toProfile, unitCost, type TaskPollResponse } from "../server/youcam";

describe("YouCam response parsing", () => {
  it("normalises HD / versioned type names", () => {
    expect(normaliseType("hd_dark_circle")).toBe("dark_circle");
    expect(normaliseType("dark_circle_v2")).toBe("dark_circle");
    expect(normaliseType("hd_pore_output_all")).toBe("pore");
    expect(normaliseType("hd_skin_type")).toBe("skin_type");
    expect(normaliseType("something_else")).toBeNull();
  });

  it("finds a skin type word anywhere in the output entry", () => {
    expect(extractSkinType({ type: "hd_skin_type", whole: { skin_type: "Oily" } })).toBe("oily");
    expect(extractSkinType({ type: "skin_type", result: "combination" })).toBe("combination");
    expect(extractSkinType({ type: "skin_type", ui_score: 50 })).toBeNull();
  });

  it("converts the documented success response shape into a profile", () => {
    const res: TaskPollResponse = {
      status: 200,
      data: {
        task_status: "success",
        results: {
          output: [
            { type: "texture", ui_score: 68, raw_score: 57.33, mask_urls: ["https://x/texture.jpg"] },
            { type: "hd_pore", whole: { ui_score: 46, raw_score: 44 }, nose: { ui_score: 33, raw_score: 30 } },
          ],
        },
      },
    };
    const p = toProfile(res, "HD", "youcam", "id1");
    expect(p.scores.texture).toBe(68);
    expect(p.scores.pore).toBe(46);
    expect(p.subScores?.pore?.find((s) => s.region === "nose")?.ui_score).toBe(33);
    expect(p.masks?.texture?.[0]).toContain("texture");
    expect(p.scores.redness).toBe(70); // unreturned concerns default to neutral
    expect(p.source).toBe("youcam");
  });

  it("parses the real HD response captured from the live API (region entries, skin_type, skin_age)", () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/hd_live_response.json"), "utf8"));
    const p = toProfile(raw, "HD", "youcam", "live");
    expect(p.skinType).toBe("oily");
    expect(p.skinAge).toBe(51);
    expect(p.scores.pore).toBe(69); // the "whole" region, not the last region seen
    expect(p.scores.wrinkle).toBe(63);
    expect(p.scores.acne).toBe(99);
    expect(p.subScores?.pore?.map((s) => s.region).sort()).toEqual(["cheek", "forehead", "nose"]);
    expect(p.subScores?.wrinkle?.find((s) => s.region === "glabellar")?.ui_score).toBe(57);
    expect(Object.keys(p.masks ?? {})).toHaveLength(15);
    expect(p.archetype).toBeTruthy();
  });

  it("parses every demo fixture", () => {
    const dir = path.resolve("data/demo");
    for (const f of fs.readdirSync(dir)) {
      const p = toProfile(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), "HD", "demo", f);
      expect(Object.keys(p.scores)).toHaveLength(15);
      expect(p.skinType).toBeTruthy();
      expect(p.skinAge).toBeGreaterThan(0);
    }
  });

  it("knows the published unit table", () => {
    expect(unitCost("HD", 16)).toBe(22);
    expect(unitCost("SD", 16)).toBe(16);
    expect(unitCost("HD", 4)).toBe(12);
  });
});
