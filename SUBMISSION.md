# Devpost submission: Pretty Smart

Checklist and ready-to-paste text. Items in [brackets] must be filled from your own
final recording or accounts; nothing in brackets should be submitted as is.

## Checklist

| Requirement | What to do | Status |
|---|---|---|
| Code repository | Private repo, shared with **contact_event@PerfectCorp.com** (or public with a license). README has setup and run instructions; `.env.example` lists the settings; demo mode runs without an API key. | [ ] invited |
| Text description | Paste "Project description" below into Devpost. | [ ] |
| Screenshots | 6–8 from demo mode, list below. | [ ] |
| Demo video, 1–3 min | Follow `DEMO_SCRIPT.md`; name the YouCam APIs on screen and in speech; show it running in the browser. Upload to **YouTube as Public** (the rules say "publicly visible") and paste the link into Devpost. | [ ] |
| No third-party trademarks / copyrighted material | Brands in the app are fictional. Use no music, or royalty-free music you have a license for. Only photos you have rights to (see "Photos" below). | [ ] |
| Exit interview / blog | Agree on the form. Your face and demo may appear in the blog. | [ ] |

### Photos: check before recording

Every face in the video, screenshots and repo must be one you have the right to show:
- **Your own selfie:** fine (you consented).
- **The look photo** (`public/demo/look/look.jpg`) appears large in the video and in
  the Twinning ending. Use it only if it's your own photo, a friend who agreed in
  writing, or a stock photo whose license allows this use. If unsure, replace it with
  your own photo of a makeup look, or a **synthetic face** made with the YouCam AI
  Image Generator (labeled "AI-generated" on screen), then re-record the demo.
- **Dupe Audit report:** uses synthetic faces plus your own photo.

### Repository check

- `.env.local` (API key), `selfies/`, `.data/`, `.next/`, `.next-build/` are git-ignored: confirm none are in the repo.
- `public/demo/` is included, so demo mode works for judges.
- `public/mediapipe/` is not committed; `npm install` recreates it (postinstall).
- If you make the repo public, add a `LICENSE` file. Draft only. Review required by
  Legal, Compliance, or relevant Omnissa control owner.

### Screenshots to take (demo mode, browser zoom ~90%)

1. Landing: Pretty Smart header, "Hey [name] ✨", the two photo pickers.
2. Me, in this look: lips-only preview next to the full-look toggle.
3. Lipstick tab: "My smart pick" box and a shade card with **✓ Twin … · I keep $X**.
4. A card with **✗ Not a true twin on me: the Maison Aurelle … is worth it here**.
5. Blush tab: the look's blush on bare skin vs the tried blushes.
6. Hair & brows tab: the look's hairstyle, salon vs box dye with the verdict, brow close-ups.
7. My look tab: the **Twinning ✨** card and "Happy with my look?".
8. Retailer Dupe Audit: the result grid with synthetic / real labels.

---

## Project description (paste into Devpost)

### Pretty Smart
**Pretty looks. Smart picks.**

You see a look you love: a friend's photo, a creator's post. You want it, and you
want to spend smart. But a shade that matches in the tube can look completely
different on your face. Pretty Smart lets you try any look on your own face, find
the products that recreate it, see them proven on you, and keep the difference.

### How it works
1. **Me, in this look.** Upload a selfie and a look photo. YouCam **Makeup Transfer**
   puts the whole look on your face.
2. **My lipstick.** Pretty Smart picks the closest shades and tries them on your lips
   with YouCam **Makeup VTO (lip color)**: the splurge and the smart version of each.
   Every result is measured on your face (face landmarks + CIEDE2000 color
   difference), not in the tube. If nothing is close, it learns how colors shift on
   *your* lips and tries again, and remembers that for next time.
3. **My blush.** It measures only the color the look's blush adds to your cheeks
   (cheeks vs forehead in the same photo), then proves the closest blushes on you
   with **Makeup VTO (blush)**.
4. **My hair & brows.** **AI Hairstyle Generator** gives you the look's hairstyle and
   color. Want a different color? **AI Hair Color** tries the salon color and the
   everyday box dye on your hair. After a big change, it suggests a matching brow
   shade and tries the gel and the pencil on your brows (**Makeup VTO, eyebrows**).
5. **My look.** Everything is combined on your own photo, with the total and how much
   you keep. A "Twinning ✨" reveal shows the original look next to you, ready to
   save as a short video, and **Get my look** adds everything to the cart.

### Saving, not settling
For every product, both versions are tried on you. A true match says
**"✓ Twin of the $42 splurge on me · I keep $36."** When the lower-priced version
doesn't match, it says so honestly: **"✗ Not a true twin on me: the Maison Aurelle
Rouge Couture is worth it here."** The app speaks in your voice, celebrates smart
choices, and never calls a product cheap.

### Value for shoppers
- Confidence before buying: every recommendation is proven on your own face.
- A whole look, not one product: lips, cheeks, hair color and brows together.
- Real savings, shown honestly, with a running "I've kept $X" total.
- Private by design: photos go only to YouCam for the try-ons; your lip profile and
  first name stay in your browser; the share card shows lip close-ups only.

### Value for retailers: the Dupe Audit
Before marketing a lower-priced "dupe", a brand can test shade pairs on several faces,
including **synthetic faces from the YouCam AI Image Generator** (always labeled), and
see where a dupe works and where it fails ("fails on deeper natural lip tones").
Results export as CSV/JSON. Fewer returns, more trust, and honest marketing.

### YouCam APIs used
| API | Used for |
|---|---|
| Makeup Transfer | The look photo's makeup on the shopper's face |
| Makeup VTO: lip color, blush, eyebrows | Trying every product on the shopper |
| AI Hairstyle Generator v2.1 | The look's hairstyle on the shopper |
| AI Hair Color | Salon vs box dye on the shopper's hair |
| AI Image Generator | Synthetic test faces for the retailer Dupe Audit |
| File API | Uploading photos for all of the above |

### How it's built
Next.js and TypeScript. MediaPipe face landmarks in the browser for measuring lips,
cheeks and brows; CIEDE2000 color science; a unit budget guard and caching on the
server; a demo mode that replays a recorded real session for judges at no cost;
106 automated tests.

### What's next
Real retailer catalogs and prices, more product types (eyeshadow, foundation), and a
mobile app with live camera try-on.

---

## Video description (paste into YouTube)

Pretty Smart: Pretty looks. Smart picks. Try any look on your own face, find the
lipstick, blush, hair color and brows that recreate it, proven on your face, and keep
the difference. Built for the YouCam API Skin AI & eCommerce VTO Hackathon with
YouCam Makeup Transfer, Makeup VTO, AI Hairstyle Generator, AI Hair Color and AI
Image Generator. All brands shown are fictional. @YouCam API
