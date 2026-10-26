# Devpost submission text (copy-paste)

**Project name:** SameSkin

**Tagline (60 chars):** Skincare reviews from people with skin like yours.

**Track:** Skin AI

**Built with:** YouCam AI Skin Analysis API (HD), YouCam AI Makeup Virtual Try-On API, TypeScript, React, Vite, Express, Claude (tool-use agent), Vitest

**Demo video:** https://youtu.be/e14wvcrRMLg · **Repo:** https://github.com/haliteren172-svg/sameskin · **Devpost project:** https://devpost.com/software/1509881

---

## Inspiration

Every skincare review ends with "worked for me". None of them say whose skin "me" is. We kept seeing the same pattern: a product with a 3.9-star blended rating that is actually a 4.8 for dry, reactive skin and a 2.3 for oily, acne-prone skin. Shoppers buy on the blend, get disappointed, return it, and leave the one-star review that misleads the next person. The information to fix this exists the moment someone takes a selfie. YouCam Skin AI turns that selfie into 15 numbers. We built the store that uses them.

## What it does

SameSkin scans your skin once with YouCam AI Skin Analysis and then rewrites a skincare store around you:

- **Skin twins.** We find reviewers whose skin measures like yours, weighting the dimensions where you actually struggle (your redness at 42 matters more than your fine lines at 90).
- **Twin rating vs. crowd rating.** Every product shows what people with skin like yours gave it next to what everyone gave it. The same cleanser is "Loved by skin like yours" (4.6★) for oily skin and "Skin like yours disliked it" (2.9★) for dry skin. The blended rating is 4.0.
- **Outcomes, not adjectives.** Twins' reported outcomes are tallied: fewer breakouts ×8, less oily by midday ×3, stinging ×2.
- **Verdict agent.** A Claude tool-use agent pulls twin reviews, outcome tallies, your weak spots and ingredient notes, and writes a two-sentence verdict with a confidence level. Without a key, a rules engine produces the same structure.
- **Reviews with a verified skin profile.** Post a review after a scan and your scores (never your image) travel with it, so the matching gets better with every review.
- **Brand dashboard.** One star rating, six audiences: a heatmap of each product's rating by skin group, sorted by the gap. The products at the top are being sold to people they were never going to work for.
- **Try it on.** Makeup products render on your scanned selfie with YouCam Makeup Virtual Try-On.

## How we built it

- **YouCam AI Skin Analysis (HD):** File API → pre-signed upload → `skin-analysis` task with all 16 HD actions → polling. We parse the 15 concern scores, HD region sub-scores (pore by forehead/nose/cheek, wrinkle by seven regions), skin type, skin age and mask URLs into a compact profile. Error codes map to actionable guidance ("too dark, face a window").
- **Matching engine (pure TypeScript, unit-tested):** a problem-weighted similarity, a similarity-weighted Bayesian twin rating, a claim-fit score, and a verdict threshold. It runs identically on client and server.
- **Agentic verdict:** Claude with four tools (`get_viewer_profile`, `get_twin_reviews`, `get_outcome_tally`, `get_ingredient_notes`), constrained to only claim what the evidence supports and to flag thin evidence.
- **Privacy:** the selfie lives in server memory for 30 minutes and is never written to disk. "Forget me" deletes everything.
- **Demo mode:** recorded YouCam-shaped responses for three personas, so judges can run the whole product without spending units. Deep links such as `/store?persona=dry_sensitive` load a persona instantly.

## Challenges we ran into

- Making "similar skin" mean something. Plain cosine similarity across 15 scores said everyone with healthy skin was a twin. The fix was to weight each dimension by how badly the weaker person scores on it, and to nearly ignore dimensions where both people are fine.
- Keeping the verdict honest. The agent is only allowed to claim what twin reviews support, must say when evidence is thin (< 3 twins), and falls back to deterministic rules so there is never a blank verdict.
- Spending units wisely: polling never costs units, failed tasks are free, and the demo mode means a judge can evaluate every screen for zero units.

## Accomplishments that we're proud of

The brand dashboard. Seven of fourteen demo products have a gap of 1.5 stars or more between skin groups. That is not a prototype insight; it is what every skincare catalogue looks like once reviews carry a skin profile.

## What we learned

A skin score is far more valuable as a *key* than as a *diagnosis*. The scan itself is a one-time event; joining it to reviews, products and outcomes is what compounds.

## What's next

- Shopify / Salesforce Commerce widget: "Rated 4.7 by skin like yours" on any product page.
- Retake-noise calibration: scan twice, ignore differences inside the noise band.
- Rescan-at-review-time: attach the *delta* in skin scores to a review, so "it worked" becomes measurable.

## YouCam APIs used

- AI Skin Analysis (HD): `/s2s/v2.0/file`, `/s2s/v2.0/task/skin-analysis` (create + poll)
- AI Makeup Virtual Try-On: `/s2s/v2.0/task/makeup-vto` (create + poll)
