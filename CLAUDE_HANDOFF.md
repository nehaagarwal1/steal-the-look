# Handoff: Pretty Smart (YouCam hackathon project)

Paste this file into a new Claude conversation (or attach it) to continue the work.
It summarizes the project, decisions, lessons learned and next steps as of
2026-10-22. Personal details and secrets are left out on purpose.

## What it is

**Pretty Smart: "Pretty looks. Smart picks."** A Next.js web app for the
YouCam API Skin AI & eCommerce VTO Hackathon on Devpost (solo entry; deadline
2026-11-02 11:45 ET, aiming to submit by 2026-11-01).

The shopper uploads a selfie and a look photo, sees the look on their own face, and
the app finds the lipstick, blush, hair color and brow color that recreate it. Each
product is tried on the shopper in a splurge and a smart (lower-priced) version and
measured on the face, with an honest "true twin or not" verdict. (The retailer Twin Shade
Audit was removed on 2026-10-28 and moved to `archive/retailer-audit/`.)

Project folder: `~/Documents/workspace/steal-the-look` (old name; GitHub repo is
private and still called `steal-the-look`). `README.md` has the full feature list,
code map, run modes and unit costs. `DEMO_SCRIPT.md` has the video script.
`SUBMISSION.md` has the Devpost checklist and paste-ready description.

## Tabs (shopper flow)

1. **My photos:** selfie + look, browser checks (one face, lips found), consent box,
   optional first name (kept in the browser only). YouCam Makeup Transfer → "Me, in
   this look" (lips-only preview, toggle for the full look).
2. **Lipstick:** candidate shades → try premium + cheapest per family → if nothing is
   close, a calibration round learns how colors shift on these lips (saved as a lip
   profile in localStorage). Proof cards, "My smart pick", share card.
3. **Blush:** cheek-minus-forehead tint, fitted strength model, proof cards.
4. **Hair & brows:** 1) copy the look's hairstyle + color (Hairstyle Generator v2.1);
   2) optional hair dye: salon vs box dye, compared on the hair; 3) brow suggestion
   after a big hair change, gel vs pencil, with brow close-ups. Sticky "My look so
   far" preview.
5. **My look:** "Twinning ✨" canvas reveal (look photo and my look lean in, sparkles,
   "Same look. $X saved 💰"), Love it 💖 / Let me play more, Save as video (MediaRecorder:
   MP4 on Safari, WebM elsewhere, PNG fallback), Get my look, cart with Remove.

## YouCam API facts (verified)

| Feature | Endpoint | Units |
|---|---|---|
| Makeup Transfer | `POST /s2s/v2.0/task/mu-transfer` (≤1024px, no glasses) | 2 |
| Makeup VTO: lip color, blush (`pattern 1color1`), eyebrows (`pattern {type:"color"}`) | `POST /s2s/v2.0/task/makeup-vto` | 1 |
| Hairstyle Generator v2.1 | `POST /s2s/v2.1/task/hair-transfer` (`ref_file_id`, `hair_color` ref/src; needs shoulders visible, pitch ±10°, hair not too short) | 2 |
| Hair Color | `POST /s2s/v2.0/task/hair-color` (`pattern {name:"full"}`, palettes color/intensity/shine) | 1 |
| AI Image Generator | `POST /s2s/v2.0/task/text-to-image/youcam` (model youcam-image-v2, 1104*1472) | 1 |

Flow: `POST /s2s/v2.0/file` → PUT to the presigned URL → POST task → poll until
`task_status` is success → download `results.url`. Docs:
https://docs.perfectcorp.com/reference/makeup_vto (sidebar lists all features).
Lip finish rules: gloss/sheer need transparencyIntensity; shimmer types need the
shimmer fields (see `src/lib/lips/palette.ts`).

## Lessons learned (important for any further work)

- **Measure on-face vs on-face, never against the tube color.** VTO renders blend with
  the natural lip and lighting.
- **YouCam results are PNGs with 4 channels**, even when named `.jpg`; the selfie is a
  3-channel JPEG. Compare with `removeAlpha()`, or the numbers are garbage.
- **Every YouCam makeup try-on is ~12/255 brighter than the selfie** across the face,
  but identical across try-ons (≈0.1). So brows and blush are combined into "My look"
  as the *difference* vs the lipstick try-on (`deltaComposite` in `src/lib/lips/detect.ts`),
  and brow/hair measurements use a try-on (or remove the global shift) as the base.
- Makeup Transfer can exaggerate a look (e.g. made a matte red look two-tone metallic).
  The lip score therefore includes light and dark tones, not just the middle color.
- Best buy must not pick a cheaper shade with a clearly different hue (`HUE_SLACK`).
- Brow tint at 65% intensity was barely visible on dark brows; now 100%. Dark brows
  can't be lightened much by gels in reality either.
- The project has a unit cap: `UNIT_BUDGET` in `.env.local` (ledger `.data/units.json`).
  It was at 286 of 300 on 2026-10-22; raise it before more live runs.
- The sandbox the assistant ran in couldn't reach YouCam from Node, so the user ran
  all unit-spending commands (`npm run week1 -- …`) in their own terminal.

## Wording and tone (agreed after friend feedback)

- Shopper's voice: "💋 Let's Try This Look!", "Find my match", "My look", "Use in my look".
- Saving, never settling: "My smart pick", "✓ Just as gorgeous on me as the $42 splurge 💅 · $36 saved 💰"; when not a match: "✗ Not quite the same on me: the Maison Aurelle Rouge Couture is worth the splurge here 💖" (name the premium product, not its price). No "cheap", "budget",
  "for less", "dupe" or "fake" anywhere.
- Theme (2026-10-22): casual and playful; the shopper is already gorgeous and wants to play with a new shade or look ("Hey gorgeous ✨ Ready to play with a new look?", "Look at you! 😍", "Made for me 💖", "My glow-up ✨"). Compliment everyone, never rank or score looks.
- Money: say "save" / "saved" / "beauty kitty", never "keep" or "kept" ("$36 saved 💰", "💰 My beauty kitty: $82 saved so far").
- All brands are fictional (Maison Aurelle, Lumen, Daily Basics).

## How the user likes to work

- **Never commit or push.** The user uploads to their personal GitHub themselves.
- Explain in plain, simple language; one change at a time; show what to test and how.
- Say the unit cost before anything that spends YouCam units; prefer demo mode (free).
- Don't use other people's photos (only own photos, consented friends, or AI-generated
  looks labeled as such). Never upload `.env.local`, `selfies/`, `.data/`, `.next*`.
- Run only one dev server; verify builds with `npm run build:check` (separate folder).

## Status on 2026-10-22

Done: all features above, 107 passing tests, README, DEMO_SCRIPT.md, SUBMISSION.md,
AI-generated look photo presets (`npm run week1 -- looks [all|ids] --yes`, saved as
`selfies/synthetic-look-*.jpg`, labeled "AI-generated" in the app via the filename).

Next steps:
1. Raise `UNIT_BUDGET` (e.g. 400) in `.env.local`.
2. Generate look photos (`npm run week1 -- looks all --yes`, 6 units), pick one with
   clear lipstick, visible blush, uncovered eyes and shoulders in view.
   **Replace the current demo look photo** unless its rights are confirmed (it appears
   large in the video).
3. Final demo recording: `DEMO_MODE=0`, `RECORD_DEMO=1`, full flow incl. hair colors
   (one true twin, one non-twin like Auburn) and the ★ brow (~20 units); then `DEMO_MODE=1`.
4. Screenshots (list in SUBMISSION.md), 1–3 min video per DEMO_SCRIPT.md, upload to
   YouTube as Public, no copyrighted music.
5. Devpost form: description from SUBMISSION.md, repo link, invite
   contact_event@PerfectCorp.com to the private repo. Optional: Vercel deploy in demo mode.
