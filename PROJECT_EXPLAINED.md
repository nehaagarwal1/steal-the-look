# Pretty Smart, explained simply

A study guide for interviews, judges' questions and the exit interview.
No code knowledge needed. (Not for judges; keep it local or in the repo, your choice.)

---

## 1. The one-minute version

> Pretty Smart lets me try any makeup look I love on my own face, then finds the
> lipstick, blush, hair color and brow color that recreate it. For every product it
> tries a splurge and a smart (lower-priced) version on my face and measures the
> result, so it can honestly say "just as gorgeous on me, $36 saved" or "not quite
> the same, the splurge is worth it". At the end, a Twinning reveal shows me next
> to the look I loved, with everything I saved.

**Why it matters:** shoppers buy shades that look different on them than in the
photo or tube, which leads to returns and distrust. Pretty Smart proves the match on
*your* face before you buy.

---

## 2. The big idea (the thing judges should remember)

**Compare on the face, not in the tube.**

When YouCam puts a lipstick on your lips, the color blends with your natural lip
color and the lighting. So the color on your face isn't the color in the tube.

- Comparing a try-on with the tube color: unreliable.
- Comparing a try-on with another try-on, **on the same face**: reliable.

So the app puts everything on your face first (the look, each lipstick, each
blush...) and then compares face to face. That's the core idea; everything else
builds on it.

---

## 3. What happens in each tab

| Tab | What you see | What happens behind it |
|---|---|---|
| 📸 **Me** | Upload selfie + look photo; "Okayyy, look at me! 😍" | The browser checks both photos (one face, lips found). The server sends them to **YouCam Makeup Transfer**, which copies the look onto your selfie. The app then builds a "lips only" version, so we know exactly which lip color to match. |
| 💄 **Lips** | Shade cards with match %, "Made for me 💖" | The app measures the look's lip color and picks the closest shades from the catalog. **YouCam Makeup Virtual Try-On** puts each one on your lips (splurge + smart version). The app measures each result and scores it against the look. If nothing is close, it learns how colors shift on *your* lips and tries better guesses (and remembers that for next time). |
| 🌸 **Cheeks** | Blush cards | Blush is see-through, so the app measures only the color blush *adds*: cheek color minus forehead color in the same photo. Then it tries the closest blushes with Makeup Try-On and compares. |
| 💇‍♀️ **Hair & brows** | Hairstyle, hair colors, brow shades | **YouCam AI Hairstyle Generator** copies the look's hair. **YouCam AI Hair Color** tries salon vs box dye; the app finds the hair by comparing pictures before and after dyeing (only the hair changes). After a big hair change it suggests a brow shade (a stylist rule) and tries brow gel vs pencil with Makeup Try-On (eyebrows). |
| ✨ **My glow-up** | Combined picture, Twinning video, cart | The browser combines your chosen lips, blush, hair and brows onto one photo (no extra YouCam calls, so no cost). The Twinning reveal is drawn and recorded in the browser. |

---

## 4. How it's built (plain words)

```
Your browser (the app you click)          The app's server              YouCam
──────────────────────────────           ─────────────────              ──────
• checks photos                  ──────▶ • resizes photos      ──────▶  Makeup Transfer
• finds lips/cheeks/brows                • calls YouCam                 Makeup Try-On
  (face landmarks, MediaPipe)            • counts units (budget)        Hairstyle Generator
• measures colors                ◀────── • caches results       ◀──────  Hair Color
• combines the final picture             • demo mode replays             Image Generator
• draws the Twinning video                 a recorded session
```

- **Next.js + TypeScript:** one project for both the web page and the small server.
- **MediaPipe face landmarks** (free, runs in the browser): finds 478 points on the
  face, so the app knows exactly where the lips, cheeks and brows are.
- **CIEDE2000:** the standard formula for "how different do two colors look to a
  human eye". Under about 4 on lips = looks the same.
- **Demo mode:** a real session is recorded once, then replayed for free. Judges can
  try everything without an API key or spending units.
- **Unit budget guard:** every YouCam call is counted and capped, so a bug can't
  spend all the credits.
- **108 automated tests** check the matching logic, wording rules and edge cases.

---

## 5. Things we discovered (great answers to "what was hard?")

1. **Try-on colors don't match the tube.** A coral lipstick came out brick-red on my
   lips. That's why everything is compared face to face.
2. **One lip color isn't enough.** Makeup Transfer once turned a matte red look into a
   two-tone metallic one, and a flat lipstick scored 90% against it. Now the score
   also compares the light and dark parts of the lips.
3. **Cheap isn't always smart.** A cheaper berry lipstick scored close to an
   orange-red look. Now the "smart pick" skips shades with a clearly different hue.
4. **YouCam's pictures are slightly brighter than the selfie.** Copying brows or blush
   from a try-on pasted brighter skin too. Now the app copies only the *change* the
   product made.
5. **Blush and brows are subtle.** Blush is measured as the color it adds; brow tint at
   65% was invisible on dark brows, so it now uses full strength.

---

## 6. Likely questions and good answers

**"How did you build it? Did you use AI?"**
> I designed the product and every decision, and built it with an AI coding
> assistant. I tested it on my own photos at every step, found the problems (like
> try-on colors not matching the tube), and decided how to fix them. The ideas,
> the flow, the wording and the testing are mine.
(Check the hackathon rules for anything about AI-assisted coding; say it honestly
either way.)

**"How do you know the match is real?"**
> Every product is tried on my own face with YouCam and measured on my face with a
> standard color-difference formula (CIEDE2000), then compared with the look on my
> face. Nothing is guessed from the tube color.

**"Which YouCam APIs did you use?"**
> Five: Makeup Transfer, Makeup Virtual Try-On (lips, blush, brows), AI Hairstyle
> Generator and AI Hair Color, plus the AI Image Generator for the AI-generated look
> photo in the demo.

**"What's the value for retailers?"**
> A look someone loves turns into a full basket (lipstick, blush, hair color, brows)
> with one click; fewer returns, because every product is proven on the shopper's
> own face first; and trust that sells both price levels: the smart version only
> when it really matches, the splurge when it's worth it.

**"Why not just say 'dupe'?"**
> Shoppers shouldn't feel they're settling. Both versions are shown as equal choices,
> the app celebrates the money saved, and it's honest when the splurge is worth it.

**"What about privacy?"**
> Photos only go to YouCam for the try-ons (kept by them up to 24 hours); the app
> doesn't store them. The lip profile and first name stay in the shopper's own
> browser. The share card shows lip close-ups only. Look photos need permission, and
> AI-generated ones are labeled.

**"How much does one session cost?"**
> About 2 units for Makeup Transfer, 1 per lipstick or blush try-on, 2 for the
> hairstyle, 1 per hair color: roughly 10–20 units for a full session. Results are
> cached, and demo mode costs nothing.

**"What would you do next?"**
> Real retailer catalogs and prices, more products like eyeshadow and foundation,
> and a mobile app with live camera try-on.

**"What are the limitations?"**
> The catalog and brands are fictional. Matching works best with a front-facing,
> well-lit selfie without glasses. Very dark brows can't be lightened much by gels,
> in real life or in the try-on. Results depend on how YouCam renders each product.

---

## 7. Words you might hear

| Word | Meaning here |
|---|---|
| VTO | Virtual try-on: putting a product on a photo |
| Makeup Transfer | Copying a whole makeup look from one face to another |
| Landmarks | Points on the face (lips, cheeks, brows) found by MediaPipe |
| CIEDE2000 / ΔE (delta E) | How different two colors look; under ~4 on lips = same to most people |
| Calibration | Learning how colors shift on this person's lips |
| Unit | YouCam's credit; each API call costs a few units |
| Demo mode | Replays a recorded real session, free |
| AI-generated look | A look photo made with YouCam AI Image Generator; no real person |
