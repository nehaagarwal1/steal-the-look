import { describe, expect, it } from "vitest";
import { hexToLab, labToHex } from "@/lib/color";
import {
  deriveInsight, faceMix, faceTitle, refreshReport, buildAuditReport, catalogPairs, cellVerdict, csvTemplate, DEFAULT_AUDIT_FAMILIES, parseShadeCsv, reportToCsv,
  type AuditFace, type AuditMeasurement,
} from "./audit";

const shift = (hex: string, dL: number, da = 0, db = 0) => { const c = hexToLab(hex); return labToHex({ L: c.L + dL, a: c.a + da, b: c.b + db }); };

describe("shade CSV", () => {
  it("parses the template, which matches the catalog", () => {
    const { pairs, errors } = parseShadeCsv(csvTemplate());
    expect(errors).toEqual([]);
    expect(pairs).toHaveLength(2);
    const berry = catalogPairs(["berry"])[0];
    expect(pairs[0].premium).toEqual(berry.premium);
    expect(pairs[0].dupe).toEqual(berry.dupe);
  });

  it("reports bad rows clearly and keeps the good ones", () => {
    const csv = csvTemplate() + 'Bad,#ZZZ,matte,10,"Name, with comma",#112233,velvet,5\n';
    const { pairs, errors } = parseShadeCsv(csv);
    expect(pairs).toHaveLength(2);
    expect(errors[0]).toMatch(/Row 4: premium color "#ZZZ"/);
    expect(errors[0]).toMatch(/dupe finish "velvet"/);
  });

  it("explains missing columns", () => {
    expect(parseShadeCsv("name,hex\nA,#000000").errors[0]).toMatch(/Missing columns/);
  });
});

describe("catalog pairs", () => {
  it("pairs each family's premium with its cheapest version", () => {
    const pairs = catalogPairs(DEFAULT_AUDIT_FAMILIES);
    expect(pairs).toHaveLength(DEFAULT_AUDIT_FAMILIES.length);
    for (const p of pairs) expect(p.premium.price).toBeGreaterThan(p.dupe.price);
  });
});

describe("audit report", () => {
  const pairs = catalogPairs(["berry", "coral"]);
  // Faces A (deep natural lips) ... E (light natural lips)
  const faces: AuditFace[] = ["#5A2A30", "#6B353A", "#8A4A50", "#A65E62", "#B86E70"].map((naturalLipHex, i) => ({ label: "ABCDE"[i], naturalLipHex }));

  const measurements: AuditMeasurement[] = faces.flatMap((f, i) => [
    // berry: same on everyone
    { pairId: pairs[0].id, face: f.label, premiumHex: "#5E2A44", dupeHex: shift("#5E2A44", 1) },
    // coral: fine on lighter lips, clearly different on the two deepest
    { pairId: pairs[1].id, face: f.label, premiumHex: "#903830", dupeHex: shift("#903830", i < 2 ? -10 : 1.5) },
  ]);

  const report = buildAuditReport(pairs, faces, measurements, new Date("2026-10-19T00:00:00Z"));

  it("passes a true dupe on every face", () => {
    expect(report.results[0].passes).toBe(5);
    expect(report.results[0].verdict).toBe("true dupe on every face");
  });

  it("finds where a dupe fails and why", () => {
    const coral = report.results[1];
    expect(coral.passes).toBe(3);
    expect(coral.verdict).toBe("true dupe on most faces");
    expect(coral.insight).toBe("Fails on deeper natural lip tones.");
    expect(coral.worst?.verdict).toBe("different");
  });

  it("exports a spreadsheet without photos", () => {
    const csv = reportToCsv(report);
    expect(csv.split("\n")[0]).toContain("face_A_deltaE");
    expect(csv).toContain("3/5");
    expect(csv).not.toMatch(/data:image/);
  });

  it("verdict thresholds", () => {
    expect(cellVerdict(2)).toBe("true dupe");
    expect(cellVerdict(5)).toBe("close");
    expect(cellVerdict(9)).toBe("different");
  });
});

describe("face sources", () => {
  it("labels synthetic and real faces in titles, summary and CSV", () => {
    const faces: AuditFace[] = [
      { label: "A", naturalLipHex: "#5A2A30", source: "synthetic" },
      { label: "B", naturalLipHex: "#8A4A50", source: "synthetic" },
      { label: "C", naturalLipHex: "#B86E70", source: "real" },
    ];
    expect(faceTitle(faces[0])).toBe("Face A (synthetic)");
    expect(faceTitle(faces[2])).toBe("Face C (real volunteer)");
    expect(faceMix(faces)).toBe("2 synthetic, 1 real volunteer");
    const pairs = catalogPairs(["berry"]);
    const ms = faces.map((f) => ({ pairId: pairs[0].id, face: f.label, premiumHex: "#5E2A44", dupeHex: "#5F2B45" }));
    expect(reportToCsv(buildAuditReport(pairs, faces, ms))).toContain("A: synthetic; B: synthetic; C: real volunteer");
  });

  it("still reads older reports without sources", () => {
    expect(faceTitle({ label: "A", naturalLipHex: "#5A2A30" })).toBe("Face A");
  });
});

describe("insight honesty", () => {
  const faces: AuditFace[] = [
    { label: "A", naturalLipHex: "#503434", source: "synthetic" },
    { label: "B", naturalLipHex: "#D47F84", source: "synthetic" },
    { label: "C", naturalLipHex: "#673F35", source: "real" },
  ];
  const cell = (face: string, deltaE: number) => ({ face, deltaE, verdict: cellVerdict(deltaE) });

  it("calls near-threshold results borderline instead of inventing a pattern (real 2026-10-19 Coral Crush numbers)", () => {
    expect(deriveInsight([cell("A", 3.8), cell("B", 4.6), cell("C", 4.0)], faces)).toBe("Borderline on every face: close to the true-dupe limit.");
  });

  it("needs clearly worse failures before naming a lip-tone pattern", () => {
    // Fails on B (4.2) but only 0.7 worse than C (3.5): not clearly worse, so no pattern is claimed.
    expect(deriveInsight([cell("A", 1.0), cell("B", 4.2), cell("C", 3.5)], faces)).toBeUndefined();
  });

  it("re-applies current rules to a saved report", () => {
    const saved = {
      createdAt: "2026-10-19T22:44:13.028Z",
      faces,
      results: [{ ...buildAuditReport(catalogPairs(["coral"]), faces, []).results[0], cells: [cell("A", 3.8), cell("B", 4.6), cell("C", 4)], insight: "Fails on lighter natural lip tones." }],
    };
    expect(refreshReport(saved).results[0].insight).toBe("Borderline on every face: close to the true-dupe limit.");
  });
});

describe("small audits", () => {
  it("hedges a pattern found on fewer than 5 faces", () => {
    const pairs = catalogPairs(["coral"]);
    const faces: AuditFace[] = ["#5A2A30", "#8A4A50", "#B86E70"].map((naturalLipHex, i) => ({ label: "ABC"[i], naturalLipHex }));
    const ms: AuditMeasurement[] = faces.map((f, i) => ({ pairId: pairs[0].id, face: f.label, premiumHex: "#903830", dupeHex: shift("#903830", i === 0 ? -10 : 0.5) }));
    expect(buildAuditReport(pairs, faces, ms).results[0].insight).toBe("Fails on deeper natural lip tones (based on 3 faces: test more to confirm).");
  });
});

describe("catalog exports", () => {
  it("lists every lipstick with exact colors, incl. Cherry Noir's fake dupe", async () => {
    const { catalogToCsv } = await import("./audit");
    const lines = catalogToCsv().trim().split("\n");
    expect(lines[0]).toBe("id,product,shade,family,hex,texture,price,premium_id,deltaE_vs_premium_in_tube");
    expect(lines.length - 1).toBe(678);
    const { getProduct } = await import("@/data/catalog");
    const price = getProduct("db-blue-red")!.price;
    expect(lines.find((l) => l.startsWith("db-blue-red,"))).toBe(`db-blue-red,Daily Basics Color Stick,Cherry Noir,blue-red,#AA382C,satin,${price},aur-blue-red,9.7`);
  });

  it("exports all pairs in the upload format, and it parses back cleanly", async () => {
    const { allPairsCsv } = await import("./audit");
    const { pairs, errors } = parseShadeCsv(allPairsCsv());
    expect(pairs.length).toBe(20); // the parser caps one audit at 20 pairs
    expect(errors).toEqual(["Only the first 20 pairs are used per audit."]);
  });
});
