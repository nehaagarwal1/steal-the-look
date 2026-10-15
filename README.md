# Steal the Look, for Less

See any lipstick look on your own face, then get the shade that matches it best
for the lowest price, **proven on your own lips**. Built on the YouCam API for the
[YouCam API Skin AI & eCommerce VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/).

## How it works

```
1. Upload       your selfie + a look you love          (checked in the browser first: one face, lips found)
2. See it on you   YouCam Makeup Transfer → lips-only preview (toggle: full look)        2 units
3. Find it for less
   round 1      look's lip color vs catalog → 2 closest shade families, premium + cheapest   4 units
   round 2      if nothing is very close: learn how color shifts on *these* lips,
                pick an adjusted family                                                       2 units
4. Proof        every try-on is measured on the lips and compared with the look on the lips
                (CIEDE2000). Best buy = cheapest shade within reach of the best match.
                Cheaper versions are checked against the premium one: true dupe or not.
5. Cart
```

**Why measure on the face?** YouCam renders lipstick realistically, so a shade
looks different on each person's lips. Comparing a try-on result with the color
in the tube is unreliable; comparing on-face with on-face is reliable. In testing,
two price tiers of the same shade measured 0.6 apart on the same face (looks the
same), while different shades measured 11+ apart.

| Piece | File |
|---|---|
| Main flow (UI) | `src/app/page.tsx` |
| Candidate picking, calibration, proof cards, grouping | `src/lib/lips/plan.ts` |
| Lip detection (MediaPipe), lips-only preview, lip crops | `src/lib/lips/detect.ts` |
| Robust lip color measurement, match verdicts | `src/lib/lips/measure.ts` |
| Color science (Lab, CIEDE2000) | `src/lib/color.ts` |
| Lipstick catalog (fictional brands, 3 price tiers per shade) | `src/data/catalog.ts` |
| Finish-specific makeup-vto parameters | `src/lib/lips/palette.ts` |
| YouCam client (upload, run task, poll, resize to limits) | `src/lib/youcam.ts` |
| Server pipeline, caching, demo record/replay | `src/lib/look-session.ts` |
| API routes | `src/app/api/look/{start,tryon,config}/route.ts` |
| Unit budget guard and ledger | `src/lib/units.ts` |
| Lip lab (manual testing page) | `src/app/lab/lips/page.tsx` |
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
| Live | `DEMO_MODE=0` | about 6–8 per session |
| Live + record the demo | `DEMO_MODE=0`, `RECORD_DEMO=1` | same as live |

Restart `npm run dev` after changing `.env.local`. For a verification build that
doesn't disturb a running dev server, use `npm run build:check`.

## Unit costs and budget

| Feature | Units per call |
|---|---|
| Makeup Transfer (`mu-transfer`) | 2 |
| Makeup try-on (`makeup-vto`) | 1 |

`UNIT_BUDGET` caps total spend for the app and CLI (ledger: `.data/units.json`).
Failed YouCam tasks are not charged. Repeat try-ons of the same photo and shade are
cached while the server runs.

## CLI

```bash
npm run week1 -- costs                                 # unit costs per feature (free)
npm run week1 -- balance                               # account balance (free)
npm run week1 -- units                                 # spent by this project (free)
npm run week1 -- tryon ./selfies/me.jpg aur-coral --yes        # 1 unit
npm run week1 -- transfer ./selfies/me.jpg ./selfies/look.jpg --yes  # 2 units
```

## Photo requirements

- **Selfie:** one face, front-facing, **no glasses** (Makeup Transfer rejects covered eyes), bare or light lips.
- **Look:** one face, lips visible; use your own photo or one you have rights to.
- Photos are resized automatically (1024px for Makeup Transfer, 1920px for try-on).

## Privacy

Photos are sent to YouCam to create the try-ons and kept by them for up to 24
hours. The app server doesn't store them, except when `RECORD_DEMO=1` is set,
which saves one session for demo mode (use only photos you have consent for).
`selfies/` and `week1-results/` are git-ignored.

## Archive

`archive/echomirror/` holds the earlier voice-first prototype (excluded from the
build and tests). Delete it when it's no longer needed.
