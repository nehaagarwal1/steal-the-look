# Pretty Smart

**Pretty looks. Smart picks.**

Upload a selfie and a look you love. See the whole look on your own face, then find
the lipstick, blush, hair color and brow color that match it, **proven on your own
face**. The app tries the closest lipstick and blush options on you and compares
premium and lower-priced versions when available, so you can see which alternatives
are close matches.

The app speaks in the shopper's voice ("💋 Let's Try This Look!", "Made for me 💖").
It compares products on the shopper's face and calls out when a lower-priced
version isn't a close match. Built on the YouCam API for the
[YouCam API Skin AI & eCommerce VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/).

## The shopper flow (tabs)

| Tab | What happens | YouCam feature | Units |
|---|---|---|---|
| **📸 Me** | Selfie + look photo, checked in the browser (one face and lips highlighted). Makeup Transfer recreates the look; the page scrolls to the result, with a lip-only preview and a **Show the full makeup** toggle (hover for its info tip). | Makeup Transfer | 2 |
| **💄 Lips** | Tries the closest shade families on your lips and measures them on-face. Close matches and weaker shades tried are both shown. Each card keeps the product name, price, and match easy to scan; **Details** opens the finish and color comparison. **Made for me 💖** appears after the shade options. | Makeup VTO (lip color) | 4–6 |
| **🌸 Cheeks** | Measures the color the look's blush adds to your cheeks, predicts and tries the closest shades, and proves them. Cards include **Details** for finish and tint difference; **My glow 💖** appears after the options. | Makeup VTO (blush) | 3–4 |
| **💇‍♀️ Hair & brows** | Shows three hair colors first, with the rest under **More hair colors**. Try hairstyle or color and compare before/after. Brow shades also show three first; a recommended shade is promoted into that list, with the rest under **More brow shades** and a before/after comparison for the brow try-on. | Hairstyle Generator v2.1, Hair Color, Makeup VTO (eyebrows) | 2 + 2 per color + 2 per brow shade |
| **✨ My glow-up** | **Twinning ✨** reveal: the look photo and **my picks combined on my own photo** slide in, lean toward each other and sparkle. **Compare my look** opens a full-look comparison. **Love it 💖** adds confetti; **Let me play more** returns to a tab. **Save as video** records the 6-second reveal in the browser (MP4 on Safari, WebM elsewhere; a picture if the browser can't record). The **Get my look** button shows the cart total. | none (all in the browser) | 0 |

Lip and cheek result cards show the product name, price, and match; their **Details**
control expands the extra comparison information. Lipstick results also show weaker
shades tried under **Also tried · less exact matches**. A **Close-ups / Full face**
switch shows either the measured close-ups or your whole face. A shareable result
card (lip close-ups only) can be downloaded and closed when you're done.

## How the matching works

**Measure on the face, not in the tube.** YouCam renders products realistically,
so a shade looks different on each person. Comparing a try-on with the tube color
is unreliable; comparing on-face with on-face is reliable (in testing, two price
tiers of the same lipstick measured ΔE 0.6 apart on one face, different shades 11+).

| Product | Measured how | "Looks the same" |
|---|---|---|
| Lipstick | Lip mask from MediaPipe face landmarks → middle color **plus the light and dark parts** (so a flat shade can't score high against a two-tone or metallic look), CIEDE2000 | ΔE < 4 |
| Lip finish | Share of specular highlights → matte / satin / glossy | — |
| Blush | Cheek color minus forehead color in the same photo (foundation cancels out); model of how strongly blush shows on these cheeks, fitted from the first try-ons | difference < 2.5 |
| Hair dye | Pixels that changed between the undyed and dyed pictures = the hair (no segmentation model); YouCam's slight overall brightening is removed first | ΔE < 3 |
| Brows | Same change-detection, against a lipstick try-on (same YouCam lighting) | ΔE < 3 |

**Smart pick** = the lowest-priced shade that matches about as well as the best one, has
the look's finish if possible, and whose hue isn't clearly further off (so a lower-priced
berry isn't recommended for an orange-red look).

**Lip profile:** after a look, how colors shift on your lips is saved in this
browser (numbers only, keyed by a hash of the selfie). Next time the first try-ons
are already calibrated, so fewer are needed.

**"My look" picture:** your photo (or the hairstyle/hair color result) + lips
from the chosen lipstick try-on + only the *change* the chosen brow and blush
try-ons made. YouCam's try-on images are slightly brighter than the selfie, so
copying pixels would paste brighter skin; adding the difference doesn't.

## Code map

| Piece | File |
|---|---|
| Shopper flow (tabs, picks, cart) | `src/app/page.tsx` |
| "$X saved" vs the splurge version (beauty kitty) | `src/lib/kept.ts` |
| Twinning ending (timeline / drawing and video) | `src/lib/twinning.ts`, `src/app/twinning.tsx` |
| Lipstick: candidates, calibration, proof cards, smart pick | `src/lib/lips/plan.ts` |
| Face landmarks, lip/cheek/brow measurement, crops, composites | `src/lib/lips/detect.ts` |
| Lip color, tones, blush tint, verdicts | `src/lib/lips/measure.ts` |
| Finish, explanations, makeup-vto parameters | `src/lib/lips/{finish,explain,palette}.ts` |
| Blush model and proof | `src/lib/blush/plan.ts` |
| Hair dye / brow measurement and brow advice | `src/lib/hair/{compare,brows}.ts` |
| Catalogs (fictional brands, price tiers, a few deliberate non-twins) | `src/data/{catalog,blush-catalog,hair-catalog,brow-catalog}.ts` |
| Color science (Lab, CIEDE2000) | `src/lib/color.ts` |
| YouCam client (upload, run task, poll, resize, errors) | `src/lib/youcam.ts` |
| Server pipeline, caching, demo record/replay | `src/lib/look-session.ts` |
| Shopper API | `src/app/api/look/{start,tryon,blush,hair,haircolor,brows,config}/route.ts` |
| AI-generated look photos (prompts) | `src/lib/synthetic-faces.ts`, `npm run week1 -- looks` |
| Saved lip profile | `src/lib/lip-profile.ts` |
| Share card | `src/lib/share.ts`, `src/lib/share-card.ts` |
| Unit budget guard and ledger | `src/lib/units.ts` |
| Test pages | `src/app/lab/lips/page.tsx`, `src/app/lab/blush/page.tsx` |
| CLI for real API checks | `scripts/week1.ts` |

## Run it

```bash
npm install                  # also copies MediaPipe files into public/mediapipe
cp .env.example .env.local   # add YOUCAM_API_KEY
npm run dev                  # http://localhost:3000
npm test
```

| Mode | `.env.local` | Units |
|---|---|---|
| Demo (judges' link, UI work) | `DEMO_MODE=1` | 0, replays `public/demo/look/` |
| Live | `DEMO_MODE=0` | about 6–10 for lips + blush; hair and brows extra (see above) |
| Live + record the demo | `DEMO_MODE=0`, `RECORD_DEMO=1` | same as live; a new session replaces the recorded one |

Restart `npm run dev` after changing `.env.local`, and run only one dev server.
For a verification build that doesn't disturb a running dev server, use
`npm run build:check`. In demo mode only the shades, colors and brows that were
recorded are offered.

## Unit costs and budget

| Feature | Units per call |
|---|---|
| Makeup Transfer (`mu-transfer`) | 2 |
| Makeup VTO (`makeup-vto`: lipstick, blush, eyebrows) | 1 |
| Hairstyle Generator v2.1 (`hair-transfer`) | 2 |
| Hair Color (`hair-color`) | 1 |
| AI Image Generator (`text-to-image/youcam`, AI-generated look photos) | 1 |

`UNIT_BUDGET` caps total spend for the app and CLI (ledger: `.data/units.json`).
Failed YouCam tasks are not charged. Repeat try-ons are cached while the server runs.

## CLI

```bash
npm run week1 -- costs                                          # unit costs per feature (free)
npm run week1 -- balance                                        # account balance (free)
npm run week1 -- units                                          # spent by this project (free)
npm run week1 -- tryon ./selfies/me.jpg aur-coral --yes         # 1 unit
npm run week1 -- transfer ./selfies/me.jpg ./selfies/look.jpg --yes   # 2 units
npm run week1 -- blush ./selfies/me.jpg "#F27F6B" matte --yes   # 1 unit
npm run week1 -- looks all --yes                                # AI-generated makeup look photos (lipstick, blush, loose hair), 1 unit each
```

## Photo requirements

- **Selfie:** one face, front-facing, **no glasses** (Makeup Transfer rejects covered eyes), bare or light lips.
  For the hairstyle: shoulders visible, camera at eye level, hair loose (not tied back).
- **Look:** one face, lips visible; your own photo or one the person agreed to.
  Or an AI-generated look from `npm run week1 -- looks`: keep its `synthetic-look-…` filename, and the app labels it "AI-generated" everywhere.
- Photos are resized automatically (1024px for Makeup Transfer and hairstyle, 1920px for try-ons).

## Privacy

Photos are sent to YouCam to create the try-ons and kept by them for up to 24
hours. The app server doesn't store them, except when `RECORD_DEMO=1` is set,
which saves one session for demo mode (use only photos you have consent for).
The lip profile stores numbers only, and the optional first name (for the greeting) is stored only in the shopper's browser; neither is sent to the server or YouCam, and the name never appears on the share card. The share card
shows lip close-ups only. `selfies/`, `week1-results/` and `.data/` are git-ignored;
never commit `.env.local`.

## Archive

`archive/retailer-audit/` holds the retailer Twin Shade Audit (removed from the app
on 2026-10-28 to keep the story on the shopper; see its README to restore it).
`archive/echomirror/` holds the earlier voice-first prototype (excluded from the
build and tests). Delete it when it's no longer needed.
