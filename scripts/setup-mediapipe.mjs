// Copies MediaPipe WASM into public/ and downloads the face landmarker model if missing.
// Runs automatically after `npm install` (postinstall). Files are git-ignored (~40 MB).

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

mkdirSync("public/mediapipe", { recursive: true });
cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });

if (!existsSync("public/mediapipe/face_landmarker.task")) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed (${res.status}): ${MODEL_URL}`);
  writeFileSync("public/mediapipe/face_landmarker.task", Buffer.from(await res.arrayBuffer()));
  console.log("Downloaded public/mediapipe/face_landmarker.task");
}
console.log("MediaPipe assets ready in public/mediapipe");
