/**
 * Records the SameSkin demo video by driving the real app in a headless Chrome.
 *
 *   1. npm run dev                      (live mode: YOUCAM_API_KEY set, DEMO_MODE=false)
 *   2. python scripts/demo/tts.py       (narration -> docs/video/audio)
 *   3. DEMO_SELFIE=path/to/selfie.png npx tsx scripts/demo/record.ts
 *   4. python scripts/demo/assemble.py  (frames + narration -> docs/video/sameskin-demo.mp4)
 *
 * The scan and the makeup try-on in the recording are real YouCam API calls (23 units).
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = process.env.DEMO_BASE ?? "http://localhost:5173";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SELFIE = process.env.DEMO_SELFIE;
const OUT = path.join(ROOT, "docs", "video");
const FRAMES = process.env.DEMO_FRAMES ?? path.join(OUT, "frames"); // keep this outside the project: thousands of files
const CARDS = "file:///" + path.join(ROOT, "scripts", "demo", "cards.html").replace(/\\/g, "/");
const durations: Record<string, number> = JSON.parse(fs.readFileSync(path.join(OUT, "audio", "durations.json"), "utf8"));
const PAD = 0.5; // seconds of silence after each narration

if (!SELFIE || !fs.existsSync(SELFIE)) {
  console.error("Set DEMO_SELFIE to a front-facing selfie (>=1080px short side, face filling >60% of the frame).");
  process.exit(1);
}
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CURSOR_CSS = `
  ::-webkit-scrollbar { display: none; }
  #__cursor { position: fixed; z-index: 2147483647; width: 26px; height: 26px; pointer-events: none;
    transition: left .45s cubic-bezier(.2,.8,.2,1), top .45s cubic-bezier(.2,.8,.2,1), transform .12s; left: 960px; top: 640px;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #__cursor.click { transform: scale(.8); }
`;
const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9-7 1.5L9 20z" fill="#fff" stroke="#221a17" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--window-size=1920,1080", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((css: string, svg: string) => {
    const add = () => {
      if (!document.head || !document.body) return;
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
      const c = document.createElement("div");
      c.id = "__cursor";
      c.innerHTML = svg;
      document.body.appendChild(c);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
    else add();
  }, CURSOR_CSS, CURSOR_SVG);

  // ---- screencast ----
  const client = await page.createCDPSession();
  const stamps: number[] = [];
  let n = 0;
  let t0 = Date.now();
  client.on("Page.screencastFrame", async (ev: any) => {
    const file = path.join(FRAMES, `f${String(n++).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(ev.data, "base64"));
    stamps.push((Date.now() - t0) / 1000);
    await client.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await client.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

  const timeline: { id: string; start: number }[] = [];
  let sceneStart = 0;
  const scene = async (id: string, run: () => Promise<void>) => {
    sceneStart = Date.now();
    timeline.push({ id, start: (sceneStart - t0) / 1000 });
    console.log(`▶ ${id}`);
    try {
      await run();
    } catch (err) {
      console.error(`  ! scene "${id}" failed, continuing:`, String((err as Error).message).slice(0, 200));
    }
    const need = (durations[id] ?? 3) + PAD;
    const left = need * 1000 - (Date.now() - sceneStart);
    if (left > 0) await sleep(left);
  };
  const elapsed = () => (Date.now() - sceneStart) / 1000;
  const holdUntil = async (sec: number) => {
    const left = sec * 1000 - (Date.now() - sceneStart);
    if (left > 0) await sleep(left);
  };

  // ---- helpers ----
  const goto = async (url: string) => {
    // domcontentloaded + an explicit render wait: networkidle never settles reliably with the Vite dev server.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 40, { timeout: 30_000 }).catch(() => {});
    await sleep(700);
  };
  const moveCursorTo = async (el: any) => {
    const box = await el.boundingBox();
    if (!box) return;
    await page.evaluate(
      (x: number, y: number) => {
        const c = document.getElementById("__cursor");
        if (c) {
          c.style.left = `${x}px`;
          c.style.top = `${y}px`;
        }
      },
      box.x + box.width / 2 - 4,
      box.y + box.height / 2 - 2,
    );
    await sleep(520);
  };
  const clickEl = async (el: any) => {
    await el.evaluate((e: Element) => e.scrollIntoView({ block: "center", behavior: "smooth" }));
    await sleep(600);
    await moveCursorTo(el);
    await page.evaluate(() => document.getElementById("__cursor")?.classList.add("click"));
    await el.click();
    await sleep(120);
    await page.evaluate(() => document.getElementById("__cursor")?.classList.remove("click"));
  };
  const byText = async (selector: string, text: string, timeout = 30_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const els = await page.$$(selector);
      for (const el of els) {
        const t = (await el.evaluate((e) => (e as HTMLElement).innerText || e.textContent || "")).trim();
        if (t.toLowerCase().includes(text.toLowerCase())) return el;
      }
      await sleep(200);
    }
    throw new Error(`not found: ${selector} "${text}"`);
  };
  const clickText = async (selector: string, text: string, timeout?: number) => clickEl(await byText(selector, text, timeout));
  const scrollTo = async (y: number) => {
    await page.evaluate((top: number) => window.scrollTo({ top, behavior: "smooth" }), y);
    await sleep(900);
  };
  const waitText = async (text: string, timeout = 90_000) => {
    await page.waitForFunction((t: string) => document.body.innerText.includes(t), { timeout }, text);
  };

  // ---- scenes ----
  // Load the title card first and start the clock on the first captured frame, so the
  // video and the narration share the same origin.
  await goto(`${CARDS}?card=intro`);
  while (n === 0) await sleep(50);
  const shift = (Date.now() - t0) / 1000;
  t0 = Date.now();
  for (let i = 0; i < stamps.length; i++) stamps[i] = Math.max(0, stamps[i] - shift);
  await scene("intro", async () => {});

  await scene("home", async () => {
    await goto(`${BASE}/`);
    await holdUntil(3.5);
    await scrollTo(520);
    await holdUntil(7);
    await scrollTo(1000);
  });

  await scene("scan", async () => {
    await goto(`${BASE}/scan`);
    const input = await page.waitForSelector('input[type="file"]');
    await (input as any).uploadFile(SELFIE);
    await sleep(900);
    await clickText("button", "Analyse my skin");
    await waitText("Your skin profile", 120_000); // live YouCam call
    await sleep(600);
  });

  await scene("masks", async () => {
    for (const label of ["Pores", "Redness", "Fine lines", "Texture"]) {
      try {
        await clickText("button.chip", label, 4000);
      } catch {
        /* chip not present in this response */
      }
      await sleep(Math.max(1200, ((durations.masks ?? 8) * 1000) / 5));
    }
  });

  await scene("store", async () => {
    await clickText("button", "Shop for skin like mine");
    await page.waitForSelector(".product-card");
    await holdUntil(6);
    await scrollTo(380);
    await holdUntil(11);
    await scrollTo(900);
  });

  await scene("product", async () => {
    await scrollTo(0);
    await sleep(300);
    const card = await page.waitForSelector(".product-card");
    await clickEl(card);
    await waitText("For skin like yours");
    await holdUntil(5);
    await scrollTo(420);
    await holdUntil(11);
    await scrollTo(760);
    await holdUntil(15);
    const twins = await byText("button.chip", "Skin twins only", 5000).catch(() => null);
    if (twins) await clickEl(twins);
    await scrollTo(1150);
  });

  await scene("review", async () => {
    await clickText("button", "Write a review with my skin profile");
    await page.waitForSelector('input[placeholder="Calmed my cheeks in two weeks"]');
    const title = await page.$('input[placeholder="Calmed my cheeks in two weeks"]');
    await clickEl(title);
    await title!.type("Smoother after three weeks, no sting", { delay: 28 });
    const body = await page.$("textarea");
    await clickEl(body);
    await body!.type("Texture on my cheeks is noticeably smoother and it never stung. Used it nightly for three weeks.", { delay: 14 });
    await clickText("button.chip", "smoother texture", 5000).catch(() => {});
    await clickText("button", "Post review");
    await waitText("verified skin profile", 20_000);
    const rv = await byText(".review", "Smoother after three weeks", 10_000).catch(() => null);
    if (rv) await rv.evaluate((e: Element) => e.scrollIntoView({ block: "center", behavior: "smooth" }));
  });

  await scene("vto", async () => {
    await goto(`${BASE}/product/lip-tint-rose`);
    await clickText("button", "Try on my selfie");
    await page.waitForFunction(() => !document.body.innerText.includes("Rendering…"), { timeout: 90_000 });
    await sleep(500);
    const img = await byText(".card", "Try it on", 5000).catch(() => null);
    if (img) await img.evaluate((e: Element) => e.scrollIntoView({ block: "center", behavior: "smooth" }));
    await sleep(4500); // let the rendered try-on breathe
  });

  await scene("contrast", async () => {
    await goto(`${BASE}/product/clear-start-gel?persona=oily_breakout`);
    await waitText("Loved by skin like yours", 30_000);
    await scrollTo(120);
    await holdUntil((durations.contrast ?? 20) * 0.45);
    await goto(`${BASE}/product/clear-start-gel?persona=dry_sensitive`);
    await waitText("disliked it", 30_000);
    await scrollTo(120);
  });

  await scene("brand", async () => {
    await goto(`${BASE}/brand`);
    await holdUntil(6);
    await scrollTo(430);
    await holdUntil(14);
    await scrollTo(760);
  });

  await scene("outro", async () => {
    await goto(`${CARDS}?card=outro`);
  });

  await sleep(800);
  await client.send("Page.stopScreencast");
  await sleep(300);
  fs.writeFileSync(path.join(OUT, "frames.json"), JSON.stringify({ frames: FRAMES, stamps, timeline }, null, 2));
  await browser.close();
  console.log(`done: ${n} frames, ${stamps[stamps.length - 1]?.toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
