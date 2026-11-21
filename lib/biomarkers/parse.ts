import type { Biomarker, BiomarkerFlag } from "@/types/health";
import { ALIAS_INDEX, type CatalogEntry } from "./catalog";

/** Common OCR confusions inside numeric tokens. */
function cleanNumber(token: string): number | null {
  const fixed = token
    .replace(/[oO]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/,/g, ".");
  const n = Number.parseFloat(fixed);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`[0-9oOlI][0-9oOlI.,]*`;
const RANGE_RE = new RegExp(String.raw`(${NUM})\s*(?:-|–|—|to)\s*(${NUM})`);
const UPPER_RE = new RegExp(String.raw`(?:<|≤|up to|upto)\s*(${NUM})`, "i");
const LOWER_RE = new RegExp(String.raw`(?:>|≥)\s*(${NUM})`, "i");

function flagFor(value: number, entry: CatalogEntry, refLow?: number, refHigh?: number): BiomarkerFlag {
  if (entry.criticalHigh !== undefined && value >= entry.criticalHigh) return "critical";
  if (refHigh !== undefined && value > refHigh) return "high";
  if (refLow !== undefined && value < refLow) return "low";
  return "normal";
}

function matchAlias(line: string): { entry: CatalogEntry; rest: string } | null {
  const lower = line.toLowerCase().replace(/\s+/g, " ").trimStart();
  for (const { alias, entry } of ALIAS_INDEX) {
    if (!lower.startsWith(alias)) continue;
    const next = lower.charAt(alias.length);
    // Require a boundary so "alt" does not match "alternative".
    if (next && /[a-z]/.test(next)) continue;
    return { entry, rest: line.trimStart().slice(alias.length) };
  }
  return null;
}

/**
 * Rule-based extraction of lab values from (already redacted) report text.
 * Handles lines such as:
 *   "Lipase          412   H   U/L     13 - 60"
 *   "Serum Amylase : 298 U/L (28-100)"
 *   "H. pylori stool antigen    POSITIVE"
 */
export function parseBiomarkers(text: string): Biomarker[] {
  const found = new Map<string, Biomarker>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 3) continue;
    const hit = matchAlias(line);
    if (!hit) continue;
    const { entry, rest } = hit;
    if (found.has(entry.id)) continue;

    if (entry.qualitative) {
      const pos = /\b(positive|detected|reactive)\b/i.test(rest);
      const neg = /\b(negative|not detected|non[- ]?reactive)\b/i.test(rest);
      if (!pos && !neg) continue;
      found.set(entry.id, {
        id: entry.id,
        name: entry.name,
        value: pos ? 1 : 0,
        unit: "",
        flag: pos ? "positive" : "negative",
        organs: entry.organs,
        sourceLine: line,
        confidence: 0.9,
        provenance: "rule",
      });
      continue;
    }

    // First numeric token after the name is the result.
    // (Tokens must contain a real digit so a stray "I" or "O" is not read as a value.)
    const valueMatch = [...rest.matchAll(new RegExp(String.raw`(?:^|[\s:=(])(${NUM})`, "g"))].find((m) =>
      /\d/.test(m[1]),
    );
    if (!valueMatch) continue;
    const value = cleanNumber(valueMatch[1]);
    if (value === null) continue;

    const afterValue = rest.slice((valueMatch.index ?? 0) + valueMatch[0].length);
    let refLow = entry.refLow;
    let refHigh = entry.refHigh;
    let confidence = 0.7;

    const range = afterValue.match(RANGE_RE);
    if (range) {
      const lo = cleanNumber(range[1]);
      const hi = cleanNumber(range[2]);
      if (lo !== null && hi !== null && hi > lo) {
        refLow = lo;
        refHigh = hi;
        confidence = 0.92;
      }
    } else {
      const upper = afterValue.match(UPPER_RE);
      const lower = afterValue.match(LOWER_RE);
      if (upper) {
        const hi = cleanNumber(upper[1]);
        if (hi !== null) {
          refHigh = hi;
          refLow = undefined;
          confidence = 0.88;
        }
      } else if (lower) {
        const lo = cleanNumber(lower[1]);
        if (lo !== null) {
          refLow = lo;
          refHigh = undefined;
          confidence = 0.88;
        }
      }
    }

    // A value wildly outside the plausible range is more likely an OCR error.
    const scale = refHigh ?? refLow ?? 1;
    if (value > scale * 200) confidence = 0.3;

    found.set(entry.id, {
      id: entry.id,
      name: entry.name,
      value,
      unit: entry.unit,
      refLow,
      refHigh,
      flag: flagFor(value, entry, refLow, refHigh),
      ratioToUln: refHigh ? Math.round((value / refHigh) * 100) / 100 : undefined,
      organs: entry.organs,
      sourceLine: line,
      confidence,
      provenance: "rule",
    });
  }

  return [...found.values()];
}

/** Pulls age/sex/date without keeping anything identifying. */
export function parseDemographics(text: string): {
  ageYears?: number;
  sex?: "male" | "female" | "unknown";
  collectedOn?: string;
} {
  const age = text.match(/\bage\s*[:\-]?\s*(\d{1,3})\s*(?:y|yr|yrs|years)?\b/i);
  const sexWord = text.match(/\b(?:sex|gender)\s*[:\-]?\s*(male|female|m|f)\b/i);
  const date = text.match(/\b(?:collected|collection date|sample date|date)\s*(?:on)?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i);
  let sex: "male" | "female" | "unknown" | undefined;
  if (sexWord) sex = /^m/i.test(sexWord[1]) ? "male" : "female";
  return {
    ageYears: age ? Number(age[1]) : undefined,
    sex,
    collectedOn: date?.[1],
  };
}
