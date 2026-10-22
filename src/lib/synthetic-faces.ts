// Prompts for AI-generated (synthetic) test faces: no real person, so no consent
// is needed, and an audit can cover many regions and natural lip tones.
// Pure: unit-tested.

export type FacePreset = { id: string; label: string; description: string };

/** A spread of regions, ages and natural lip/skin tones for Dupe Audits. */
export const FACE_PRESETS: FacePreset[] = [
  { id: "south-asian", label: "South Asian", description: "a South Asian woman in her 30s with medium-deep brown skin and naturally deep rose-brown lips" },
  { id: "east-asian", label: "East Asian", description: "an East Asian woman in her 20s with light skin and naturally soft pink lips" },
  { id: "west-african", label: "West African", description: "a West African woman in her 40s with deep brown skin and naturally deep plum-brown lips" },
  { id: "northern-european", label: "Northern European", description: "a Northern European woman in her 50s with fair skin and naturally pale pink lips" },
  { id: "latin-american", label: "Latin American", description: "a Latin American woman in her 30s with medium olive skin and naturally rosy-mauve lips" },
  { id: "middle-eastern", label: "Middle Eastern", description: "a Middle Eastern woman in her 40s with light-medium olive skin and naturally muted rose lips" },
];

/** Everything an audit face needs, whoever is in the picture. */
const REQUIREMENTS =
  "Photorealistic head-and-shoulders portrait photo, facing the camera straight on, eyes open and looking at the camera, " +
  "mouth gently closed with relaxed lips, completely bare lips with no lipstick or gloss, no makeup, no glasses, " +
  "hair away from the face, plain light grey background, soft even daylight from the front, sharp focus on the face, natural skin texture.";

export const NEGATIVE_PROMPT =
  "lipstick, lip gloss, makeup, glasses, sunglasses, smiling with teeth, open mouth, hands near face, multiple people, " +
  "profile view, tilted head, harsh shadows, text, watermark, logo, cartoon, illustration, distorted face, blurry";

export const MAX_PROMPT = 800;

/** Builds the generator prompt for a preset or a custom description of the person. */
export function facePrompt(person: string): string {
  const p = `${REQUIREMENTS} The person is ${person.trim().replace(/\.$/, "")}.`;
  return p.length > MAX_PROMPT ? p.slice(0, MAX_PROMPT) : p;
}

/** Synthetic faces are saved with this filename prefix, so the audit can label them automatically. */
export const SYNTHETIC_PREFIX = "synthetic-";

export type FaceSource = "synthetic" | "real";

export function sourceFromFilename(name: string): FaceSource {
  return name.toLowerCase().startsWith(SYNTHETIC_PREFIX) ? "synthetic" : "real";
}

export const SOURCE_LABEL: Record<FaceSource, string> = { synthetic: "synthetic", real: "real volunteer" };

// --- Synthetic "look" photos (inspiration photos for the shopper flow) ---------------
// A full makeup look on an AI-generated person: clear lipstick, visible blush and loose
// hair down to the shoulders, so Makeup Transfer, blush matching and the hairstyle copy
// all have something to work with. Labeled AI-generated wherever they are shown.

export type LookPreset = { id: string; label: string; person: string; makeup: string; hair: string };

export const LOOK_PRESETS: LookPreset[] = [
  { id: "berry-glam", label: "Berry glam", person: "a South Asian woman in her 20s with medium brown skin", makeup: "deep berry matte lipstick and soft rose blush on the cheekbones", hair: "long glossy black hair in loose waves over the shoulders" },
  { id: "coral-sunkissed", label: "Coral sun-kissed", person: "a Latin American woman in her 30s with medium olive skin", makeup: "bright coral satin lipstick and warm peach blush on the cheeks", hair: "shoulder-length caramel balayage waves" },
  { id: "classic-red", label: "Classic red", person: "an East Asian woman in her 20s with light skin", makeup: "classic true red velvet lipstick and soft pink blush on the cheeks", hair: "sleek long straight dark brown hair with a side part, falling past the shoulders" },
  { id: "nude-glow", label: "Nude glow", person: "a West African woman in her 30s with deep brown skin", makeup: "warm nude-brown glossy lips and terracotta blush on the cheekbones", hair: "voluminous natural curls down to the shoulders" },
  { id: "copper-mauve", label: "Copper & mauve", person: "a Northern European woman in her 30s with fair skin and light freckles", makeup: "mauve satin lipstick and soft rose blush on the cheeks", hair: "long copper red hair in loose waves over the shoulders" },
  { id: "plum-chic", label: "Plum chic", person: "a Middle Eastern woman in her 40s with light-medium olive skin", makeup: "rich plum lipstick and berry blush on the cheekbones", hair: "long dark chocolate brown hair with soft curls over the shoulders" },
];

const LOOK_REQUIREMENTS =
  "Photorealistic beauty portrait photo, head and shoulders with both shoulders visible, facing the camera straight on, " +
  "eyes open and looking at the camera, no glasses, mouth gently closed so the lipstick is clearly visible, " +
  "hair framing the face but not covering the eyes or eyebrows, plain light grey background, soft even daylight from the front, " +
  "sharp focus, natural skin texture, one person only.";

export const LOOK_NEGATIVE_PROMPT =
  "glasses, sunglasses, hair over eyes, bangs covering eyebrows, hat, hands near face, smiling with teeth, open mouth, " +
  "multiple people, profile view, tilted head, cropped shoulders, harsh shadows, text, watermark, logo, cartoon, illustration, distorted face, blurry";

/** Prompt for a makeup look photo (a preset, or custom person/makeup/hair). */
export function lookPrompt(p: Pick<LookPreset, "person" | "makeup" | "hair">): string {
  const s = `${LOOK_REQUIREMENTS} The person is ${p.person.trim()}, wearing ${p.makeup.trim()}, with ${p.hair.trim()}.`;
  return s.length > MAX_PROMPT ? s.slice(0, MAX_PROMPT) : s;
}

/** Look photos are saved as selfies/synthetic-look-<preset>-<time>.jpg. */
export const LOOK_PREFIX = `${SYNTHETIC_PREFIX}look-`;
