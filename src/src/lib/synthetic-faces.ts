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
