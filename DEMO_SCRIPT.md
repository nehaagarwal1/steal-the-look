# Demo video script: Pretty Smart

**Pretty looks. Smart picks.**

Target length: about 2:40 (Devpost allows 1–3 minutes; judges don't have to watch
past 3:00). Record in **demo mode** (`DEMO_MODE=1`), so every step replays instantly
and costs nothing. Tag **@YouCam API** in the post.

Numbers in [brackets] come from your final recorded session: read them off the
screen when recording, don't use these placeholders.

**YouCam APIs:** each one is named the moment it's used, in one sentence that says
what it does here, with a caption on screen. The **🎬 Caption** lines below are the
exact caption text (iMovie: Titles → "Lower Third", about 3 seconds each). The rules
ask the video to explain the YouCam APIs used; this covers all of them, in context.

---

## 0:00–0:15 · The problem

**On screen:** a look photo, then a product page with a $40+ lipstick.

> I see a look I love: a friend's photo, a creator's post. I want to try it, and
> I want to spend smart. But a shade that matches in the tube can look totally
> different on my face. So how do I know what really works on me?

## 0:15–0:40 · 📸 Me: okayyy, look at me! 😍

**On screen:** 📸 Me tab → "Hey [name] ✨" → **💋 Let's Try This Look!** → "Okayyy, look at me! 😍" (lips-only preview) → tap **Compare before & after**, then tick **Show the full makeup ✨**.

🎬 **Captions:** `YouCam AI Image Generator` (only if the look is AI-generated) → `YouCam Makeup Transfer`

> Pretty Smart starts with two photos: my selfie and the look. (If the look is
> AI-generated: "This look photo was created with the **YouCam AI Image Generator**.")
> **YouCam Makeup Transfer** copies the whole look from the photo onto my face. Then the app finds
> my perfect match, one product at a time, starting with the lips.

## 0:40–1:10 · 💄 Lips: my lips, my shades

**On screen:** **Find my perfect shade 💄** → 💄 Lips tab → "Made for me 💖" box →
one shade card with **✓ Just as gorgeous on me…** → switch **Close-ups / Full face**.

🎬 **Caption:** `YouCam Makeup Virtual Try-On · lip color`

> **YouCam Makeup Virtual Try-On** puts each lipstick on my lips: the splurge and
> the smart version of every shade. Then the app measures each result on my face,
> not in the tube. [shade] is a [score]% match, and the $[smart] one is just as
> gorgeous on me as the $[splurge] splurge, so $[saved] goes in my kitty. And when
> it's not quite the same, it tells me honestly that the splurge is worth it.

**Optional line:** "It also remembers how colors shift on my lips, so my next look
needs fewer try-ons."

## 1:10–1:30 · 🌸 Cheeks: my glow

**On screen:** 🌸 Cheeks tab → **Match my blush 🌸** → "My glow 💖" card.

🎬 **Caption:** `YouCam Makeup Virtual Try-On · blush`

> Same **Makeup Try-On**, now with blush. Blush blends into skin, so the app
> measures only the color it *adds* to my cheeks, compared with my forehead in the
> same photo. My glow: [shade], [score]% match, $[saved] saved.

## 1:30–2:10 · 💇‍♀️ Hair & brows

**On screen:** 💇‍♀️ Hair & brows tab → **The look's hairstyle** → pick a hair color
that shows **✓ Just as gorgeous…** → pick one that doesn't (for example **Auburn**)
showing **✗ Not quite the same on me…** → the ★ brow suggestion → **Use in my look**
→ "My look so far" updates.

🎬 **Captions:** `YouCam AI Hairstyle Generator` → `YouCam AI Hair Color` →
`YouCam Makeup Virtual Try-On · eyebrows`

> The look includes the hair. The **YouCam AI Hairstyle Generator** gives me this
> hairstyle and color. Feeling bold? **YouCam AI Hair Color** tries the salon color
> and the everyday box dye on my hair: [color] is just as gorgeous for $[saved]
> less, but this Auburn box dye isn't quite the same, so the salon color is worth it.
> A big hair change can make my brows look off, so **Makeup Try-On** colors only my
> brows, keeping their shape, and checks the $[pencil] pencil against the $[gel] gel.

## 2:10–2:30 · ✨ My glow-up

**On screen:** ✨ My glow-up tab → "Gorgeous, [name]! Here's my glow-up ✨" → the
**Twinning ✨** reveal plays (the look photo and me slide in, lean toward each other,
sparkles, "Same look. $[saved] saved 💰") → **Love it 💖** (confetti) → **Get my
look 🛍️**. Optional: **Save as video** to show the shareable clip.

(No new API here: everything is combined in the browser from the try-ons above.)

> Here's the look I fell for, next to me in it, all combined on my own photo:
> lipstick, blush, hair color and brows for $[total], with $[saved] in my beauty
> kitty. Twinning!

## 2:30–2:37 · Close

**On screen:** end card (2–3 seconds):

```
Pretty Smart
Pretty looks. Smart picks.

Built with YouCam APIs:
Makeup Transfer · Makeup Virtual Try-On (lips, blush, brows)
AI Hairstyle Generator · AI Hair Color
(+ AI Image Generator, if the look photo is AI-generated)
```

> Pretty Smart. Pretty looks, smart picks. Built with YouCam APIs.

---

## Recording checklist

- [ ] Final demo recording done (hair colors incl. Auburn, ★ brow), then `DEMO_MODE=1`,
      `RECORD_DEMO=0`, one dev server, hard reload (Cmd+Shift+R).
- [ ] Look photo is your own, consented, or AI-generated (labeled in the app).
- [ ] "Reset profile" first if you want the 2-round calibration on camera.
- [ ] Browser zoom about 90% so the tab bar and the cards fit; hide the bookmarks bar.
- [ ] Read real numbers from the screen for every [bracket].
- [ ] All API captions + the end card added; spoken API names match the captions.
- [ ] No music, or royalty-free music you're licensed to use (iMovie's built-in is fine).
- [ ] Total length under 3:00; captions/subtitles on for muted viewers.

---

## Short text (Devpost tagline / social post)

**Tagline:** Pretty looks. Smart picks.

**One-liner (under 200 characters):**
Try any look on my own face, find the lipstick, blush, hair color and brows that
match it, proven on my face, and save while I play.

**Elevator pitch:**
A shade that matches in the tube can look different on your face. Pretty Smart puts
a look you love on your own face with YouCam's Makeup Transfer and Hairstyle
Generator, then tries the splurge and the smart version of each product on you and
measures every result on your face. You see what's made for you, an honest "just as
gorgeous or not" for every lower-priced version, how much you saved, and the whole
look combined on your photo with one cart. Saving feels like a smart choice, not
settling.

**YouCam APIs used:** Makeup Transfer, Makeup Virtual Try-On (lip color, blush,
eyebrows), AI Hairstyle Generator v2.1, AI Hair Color, and AI Image Generator for
the AI-generated look photo.
