import type { PiiSpan, PiiType, Provenance, RedactionResult } from "@/types/health";

const TOKEN_PREFIX: Record<PiiType, string> = {
  name: "NAME",
  national_id: "NIC",
  phone: "PHONE",
  address: "ADDRESS",
  hospital_id: "HOSPITAL_ID",
  email: "EMAIL",
  dob: "DOB",
  doctor: "DOCTOR",
};

interface Candidate {
  type: PiiType;
  start: number;
  end: number;
  detector: Provenance;
}

/** Value after a label, up to the end of the line or a run of 3+ spaces / a pipe (next column). */
function labelled(text: string, label: RegExp, type: PiiType, out: Candidate[]) {
  const re = new RegExp(String.raw`\b(?:${label.source})(?![A-Za-z])\s*[:\-#.]?\s*`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const lineEnd = text.indexOf("\n", start);
    const rest = text.slice(start, lineEnd === -1 ? undefined : lineEnd);
    const stop = rest.search(/\s{3,}|\t|\|/);
    const value = (stop === -1 ? rest : rest.slice(0, stop)).trimEnd();
    if (value.replace(/[^A-Za-z0-9]/g, "").length < 2) continue;
    out.push({ type, start, end: start + value.length, detector: "rule" });
  }
}

function pattern(text: string, re: RegExp, type: PiiType, out: Candidate[]) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) out.push({ type, start: m.index, end: m.index + m[0].length, detector: "rule" });
}

/**
 * Deterministic PII detection tuned for South Asian (Sri Lankan) and generic lab reports.
 * Runs entirely in the browser. On-device AI findings are merged in via `extraSpans`.
 */
export function detectPiiRules(text: string): Candidate[] {
  const out: Candidate[] = [];

  labelled(text, /patient(?:'s)?\s*name|name\s+of\s+patient|(?<!(?:test|lab|hospital|doctor|file)\s)name/, "name", out);
  labelled(text, /national\s*id(?:entity)?(?:\s*(?:card|no\.?|number))?|nic(?:\s*no\.?)?|passport\s*(?:no\.?)?/, "national_id", out);
  labelled(text, /address|residence/, "address", out);
  labelled(text, /hospital\s*(?:id|no\.?|number)|mrn|bht(?:\s*no\.?)?|reg(?:istration)?\.?\s*(?:no\.?|id)|lab\s*(?:no\.?|ref\.?)|patient\s*id|uhid/, "hospital_id", out);
  labelled(text, /tel(?:ephone)?|phone|mobile|contact(?:\s*no\.?)?/, "phone", out);
  labelled(text, /d\.?o\.?b\.?|date\s*of\s*birth|birth\s*date/, "dob", out);
  labelled(text, /ref(?:erred)?\.?\s*(?:by|doctor|physician)|requested\s*by/, "doctor", out);

  // Sri Lankan NIC: old (9 digits + V/X) and new (12 digits).
  pattern(text, /\b\d{9}[VvXx]\b|\b(?:19|20)\d{10}\b/, "national_id", out);
  // Sri Lankan mobiles and landlines, plus generic international numbers.
  pattern(text, /(?:\+94|\b0)\s?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/, "phone", out);
  pattern(text, /\+\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/, "phone", out);
  pattern(text, /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, "email", out);
  // Honorific + capitalised name, e.g. "Mr. Nimal Perera", "Dr. A. Silva".
  pattern(text, /\b(?:Mr|Mrs|Ms|Miss|Master|Rev)\.?[ \t]+(?:[A-Z]\.[ \t]?)*[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3}/, "name", out);
  pattern(text, /\b(?:Dr|Prof)\.?[ \t]+(?:[A-Z]\.[ \t]?)*[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3}/, "doctor", out);

  return out;
}

/** Merge overlaps; the earliest-starting, then longest, span wins. Doctor wins over name for "Dr." spans. */
function mergeSpans(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Candidate[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last && c.start < last.end) {
      if (c.end > last.end) last.end = c.end;
      if (c.type === "doctor") last.type = "doctor";
      if (c.detector === "on-device-ai") last.detector = "on-device-ai";
      continue;
    }
    merged.push({ ...c });
  }
  return merged;
}

/** After finding a name once, redact every other occurrence of its distinctive parts too. */
function propagateNames(text: string, spans: Candidate[]): Candidate[] {
  const extra: Candidate[] = [];
  const words = new Set<string>();
  for (const s of spans) {
    if (s.type !== "name" && s.type !== "doctor") continue;
    for (const w of text.slice(s.start, s.end).split(/[\s.,]+/)) {
      if (w.length >= 4 && /^[A-Z][a-z]+$/.test(w) && !HONORIFIC.has(w)) words.add(w);
    }
  }
  for (const w of words) pattern(text, new RegExp(String.raw`\b${w}\b`), "name", extra);
  return extra;
}

const HONORIFIC = new Set(["Miss", "Master", "Prof"]);

export function redact(raw: string, extraSpans: { type: PiiType; text: string }[] = []): RedactionResult {
  const cands = detectPiiRules(raw);

  // On-device AI returns literal strings; locate every occurrence.
  for (const s of extraSpans) {
    const needle = s.text.trim();
    if (needle.length < 3) continue;
    let idx = raw.indexOf(needle);
    while (idx !== -1) {
      cands.push({ type: s.type, start: idx, end: idx + needle.length, detector: "on-device-ai" });
      idx = raw.indexOf(needle, idx + needle.length);
    }
  }

  const merged = mergeSpans([...cands, ...propagateNames(raw, mergeSpans(cands))]);

  const counters: Partial<Record<PiiType, number>> = {};
  const tokenFor = new Map<string, string>();
  const vault: Record<string, string> = {};
  const spans: PiiSpan[] = [];

  let redacted = "";
  let cursor = 0;
  for (const c of merged) {
    const text = raw.slice(c.start, c.end);
    const key = `${c.type}:${text.toLowerCase()}`;
    let token = tokenFor.get(key);
    if (!token) {
      counters[c.type] = (counters[c.type] ?? 0) + 1;
      token = `[${TOKEN_PREFIX[c.type]}_${counters[c.type]}]`;
      tokenFor.set(key, token);
      vault[token] = text;
    }
    redacted += raw.slice(cursor, c.start) + token;
    cursor = c.end;
    spans.push({ type: c.type, start: c.start, end: c.end, text, token, detector: c.detector });
  }
  redacted += raw.slice(cursor);

  return { raw, redacted, spans, vault };
}

/** Replace tokens with their originals — for on-screen display only, never for outbound data. */
export function rehydrate(text: string, vault: Record<string, string>): string {
  return text.replace(/\[[A-Z_]+_\d+\]/g, (t) => vault[t] ?? t);
}
