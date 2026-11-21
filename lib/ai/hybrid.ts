"use client";

import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type AI,
  type GenerativeModel,
} from "firebase/ai";
import { getFirebaseApp } from "@/lib/firebase";
import { assertNoPii } from "@/lib/privacy/guard";
import { CATALOG } from "@/lib/biomarkers/catalog";
import { SYMPTOM_LABELS } from "@/lib/ai/simulationEngine";
import type {
  Biomarker,
  Citation,
  Explanation,
  HealthProfileJSON,
  InferenceRoute,
  LedgerEntry,
  OrganId,
  PiiType,
  RedactionResult,
  SimulationRequest,
  SimulationResponse,
} from "@/types/health";
import { ORGAN_IDS } from "@/types/health";

/**
 * Firebase AI Logic hybrid inference.
 *
 *  Task                         Mode                Why
 *  ───────────────────────────  ──────────────────  ──────────────────────────────────────────
 *  PII detection on raw text    ONLY_ON_DEVICE      Raw report must never leave the device.
 *  Lab-value extraction assist  PREFER_ON_DEVICE    Input is already redacted; cloud is a safe fallback.
 *  Doctor-visit questions       PREFER_ON_DEVICE    Fast, private, offline-capable; cloud fallback.
 *  Grounded What-If research    ONLY_IN_CLOUD       Needs Google Search grounding + a larger model.
 */

export const CLOUD_MODEL = process.env.NEXT_PUBLIC_GEMINI_CLOUD_MODEL || "gemini-3.5-flash-lite";

export type DeviceAvailability = "unsupported" | "unavailable" | "downloadable" | "downloading" | "available";

type Logger = (e: Omit<LedgerEntry, "id" | "at" | "containsPii">) => void;

let ai: AI | null = null;
function getAi(): AI | null {
  const app = getFirebaseApp();
  if (!app) return null;
  ai ??= getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

export const cloudConfigured = () => Boolean(getAi());

interface LanguageModelStatic {
  availability(opts?: unknown): Promise<string>;
}

/** Chrome's built-in Prompt API (Gemini Nano). Used only to show status; inference goes through Firebase. */
export async function probeOnDevice(): Promise<DeviceAvailability> {
  const LM = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  if (!LM) return "unsupported";
  try {
    const a = await LM.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    return (["unavailable", "downloadable", "downloading", "available"].includes(a) ? a : "unavailable") as DeviceAvailability;
  } catch {
    return "unavailable";
  }
}

const SYSTEM_PII = `You find personal identifiers in medical lab reports. Output ONLY a JSON array, no prose.
Each item: {"type": "name"|"national_id"|"phone"|"address"|"hospital_id"|"email"|"dob"|"doctor", "text": "<exact substring copied from the report>"}.
Include patient names, doctor names, ID numbers, phone numbers, street addresses, dates of birth. Do NOT include test names, results, units or the laboratory's own name.`;

const SYSTEM_EXTRACT = `You read de-identified lab reports. Output ONLY a JSON array, no prose.
Each item: {"name": "<test name>", "value": <number>, "unit": "<unit>", "refLow": <number|null>, "refHigh": <number|null>}.
Only include numeric results that are printed in the report. Never invent values.`;

const SYSTEM_QUESTIONS = `You help patients prepare for a doctor visit. You never diagnose or recommend treatment.
Write short, specific questions the patient can ask about their own results. Output ONLY a JSON array of strings.`;

const textOnly = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

let models: {
  pii: GenerativeModel;
  extract: GenerativeModel;
  questions: GenerativeModel;
  cloud: GenerativeModel;
} | null = null;

function getModels() {
  const a = getAi();
  if (!a) return null;
  if (models) return models;
  models = {
    pii: getGenerativeModel(a, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: { ...textOnly, initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM_PII }] }] },
      },
    }),
    extract: getGenerativeModel(a, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: {
        createOptions: { ...textOnly, initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM_EXTRACT }] }] },
      },
      inCloudParams: { model: CLOUD_MODEL, systemInstruction: SYSTEM_EXTRACT, generationConfig: { temperature: 0 } },
    }),
    questions: getGenerativeModel(a, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: {
        createOptions: { ...textOnly, initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM_QUESTIONS }] }] },
      },
      inCloudParams: { model: CLOUD_MODEL, systemInstruction: SYSTEM_QUESTIONS, generationConfig: { temperature: 0.4 } },
    }),
    cloud: getGenerativeModel(a, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: CLOUD_MODEL,
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.3 },
      },
    }),
  };
  return models;
}

/** Must be called from a user gesture: starts the Gemini Nano download if needed. */
export function warmUpOnDevice(onProgress: (fraction: number) => void): boolean {
  const m = getModels();
  if (!m) return false;
  const withInit = m.pii as unknown as { initializeDeviceModel?: (cb: (v: number) => void) => void };
  withInit.initializeDeviceModel?.(onProgress);
  return typeof withInit.initializeDeviceModel === "function";
}

function routeOf(result: { response: { inferenceSource?: string } }): InferenceRoute {
  return result.response.inferenceSource === InferenceSource.ON_DEVICE ? "ON_DEVICE" : "IN_CLOUD";
}

function parseJsonArray<T>(text: string): T[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const PII_TYPES: PiiType[] = ["name", "national_id", "phone", "address", "hospital_id", "email", "dob", "doctor"];

/** ONLY_ON_DEVICE: the raw text is never offered to the cloud. Returns [] when Nano is unavailable. */
export async function detectPiiOnDevice(raw: string, log: Logger): Promise<{ type: PiiType; text: string }[]> {
  const m = getModels();
  const t0 = performance.now();
  if (!m) {
    log({ task: "PII scan (Gemini Nano)", route: "LOCAL_RULES", ms: 0, bytesOut: 0, ok: true, note: "Firebase not configured: rule-based redaction only" });
    return [];
  }
  try {
    const result = await m.pii.generateContent(`Report:\n"""\n${raw.slice(0, 6000)}\n"""`);
    const items = parseJsonArray<{ type: string; text: string }>(result.response.text()).filter(
      (i) => typeof i?.text === "string" && PII_TYPES.includes(i.type as PiiType) && raw.includes(i.text),
    ) as { type: PiiType; text: string }[];
    log({ task: "PII scan (Gemini Nano)", route: "ON_DEVICE", mode: "ONLY_ON_DEVICE", ms: performance.now() - t0, bytesOut: 0, ok: true, note: `${items.length} identifiers found on device` });
    return items;
  } catch (err) {
    log({
      task: "PII scan (Gemini Nano)",
      route: "LOCAL_RULES",
      mode: "ONLY_ON_DEVICE",
      ms: performance.now() - t0,
      bytesOut: 0,
      ok: false,
      note: `On-device model unavailable, so the raw report stayed local and rules did the redaction (${(err as Error).message.slice(0, 80)})`,
    });
    return [];
  }
}

/** PREFER_ON_DEVICE on redacted text: catches lab rows the rule parser missed. */
export async function extractAssist(
  redacted: RedactionResult,
  already: Biomarker[],
  log: Logger,
): Promise<Biomarker[]> {
  const m = getModels();
  if (!m) return [];
  const t0 = performance.now();
  try {
    const prompt = `De-identified report:\n"""\n${redacted.redacted.slice(0, 6000)}\n"""`;
    const { bytes } = assertNoPii({ prompt }, [redacted]);
    const result = await m.extract.generateContent(prompt);
    const route = routeOf(result);
    const items = parseJsonArray<{ name: string; value: number; unit?: string; refLow?: number | null; refHigh?: number | null }>(
      result.response.text(),
    );
    const known = new Set(already.map((b) => b.id));
    const added: Biomarker[] = [];
    for (const it of items) {
      if (typeof it?.name !== "string" || typeof it.value !== "number") continue;
      const lower = it.name.toLowerCase();
      const entry = CATALOG.find((c) => c.aliases.some((a) => lower === a || lower.startsWith(a + " ")));
      if (!entry || known.has(entry.id) || entry.qualitative) continue;
      // The value must literally appear in the report; models may not invent numbers.
      if (!redacted.redacted.includes(String(it.value))) continue;
      const refHigh = it.refHigh ?? entry.refHigh;
      const refLow = it.refLow ?? entry.refLow;
      const flag = refHigh !== undefined && it.value > refHigh ? "high" : refLow !== undefined && it.value < refLow ? "low" : "normal";
      added.push({
        id: entry.id,
        name: entry.name,
        value: it.value,
        unit: entry.unit,
        refLow,
        refHigh,
        flag,
        ratioToUln: refHigh ? Math.round((it.value / refHigh) * 100) / 100 : undefined,
        organs: entry.organs,
        sourceLine: `${it.name} ${it.value}`,
        confidence: 0.75,
        provenance: route === "ON_DEVICE" ? "on-device-ai" : "cloud-ai",
      });
      known.add(entry.id);
    }
    log({
      task: "Lab-value extraction assist",
      route,
      mode: "PREFER_ON_DEVICE",
      ms: performance.now() - t0,
      bytesOut: route === "ON_DEVICE" ? 0 : bytes,
      ok: true,
      note: `${added.length} extra value(s) recovered`,
    });
    return added;
  } catch (err) {
    log({ task: "Lab-value extraction assist", route: "BLOCKED", mode: "PREFER_ON_DEVICE", ms: performance.now() - t0, bytesOut: 0, ok: false, note: (err as Error).message.slice(0, 120) });
    return [];
  }
}

function compactProfile(p: HealthProfileJSON) {
  return {
    age: p.patient.ageYears,
    sex: p.patient.sex,
    results: p.biomarkers.map((b) => ({ test: b.name, value: b.value, unit: b.unit, refLow: b.refLow, refHigh: b.refHigh, flag: b.flag })),
  };
}

export async function generateDoctorQuestions(
  profile: HealthProfileJSON,
  sim: SimulationResponse,
  log: Logger,
): Promise<string[] | null> {
  const m = getModels();
  if (!m) return null;
  const t0 = performance.now();
  try {
    const payload = {
      results: compactProfile(profile).results.filter((r) => r.flag !== "normal"),
      pattern: sim.pattern?.label ?? null,
    };
    const prompt = `My flagged lab results: ${JSON.stringify(payload)}\nWrite 5 questions to ask my doctor.`;
    const { bytes } = assertNoPii({ prompt }, []);
    const result = await m.questions.generateContent(prompt);
    const route = routeOf(result);
    const qs = parseJsonArray<string>(result.response.text()).filter((q) => typeof q === "string" && q.length > 8).slice(0, 6);
    log({ task: "Doctor-visit questions", route, mode: "PREFER_ON_DEVICE", ms: performance.now() - t0, bytesOut: route === "ON_DEVICE" ? 0 : bytes, ok: qs.length > 0 });
    return qs.length ? qs : null;
  } catch (err) {
    log({ task: "Doctor-visit questions", route: "BLOCKED", mode: "PREFER_ON_DEVICE", ms: performance.now() - t0, bytesOut: 0, ok: false, note: (err as Error).message.slice(0, 120) });
    return null;
  }
}

interface CloudResearch {
  explanations?: { organ?: string; title?: string; body?: string }[];
  doctorQuestions?: string[];
}

/**
 * ONLY_IN_CLOUD + Google Search grounding. Receives the anonymised profile, symptoms, scenario
 * and the deterministic findings, and returns explanations with real web citations.
 */
export async function groundedResearch(
  req: SimulationRequest,
  sim: SimulationResponse,
  redactions: RedactionResult[],
  log: Logger,
): Promise<SimulationResponse | null> {
  const m = getModels();
  if (!m) return null;
  const t0 = performance.now();
  const payload = {
    profile: compactProfile(req.profile),
    symptoms: req.symptoms.map((s) => SYMPTOM_LABELS[s]),
    whatIf: req.scenario,
    engineFindings: {
      pattern: sim.pattern?.label ?? null,
      organs: sim.organs.filter((o) => o.status !== "healthy").map((o) => ({ organ: o.organ, status: o.status })),
    },
  };
  let guarded: { json: string; bytes: number };
  try {
    guarded = assertNoPii(payload, redactions);
  } catch (err) {
    log({ task: "Grounded What-If research", route: "BLOCKED", mode: "ONLY_IN_CLOUD", ms: 0, bytesOut: 0, ok: false, note: (err as Error).message });
    throw err;
  }

  const prompt = `You are a medical educator. A patient shares DE-IDENTIFIED lab results and a hypothetical lifestyle scenario.
Use Google Search to find current clinical guidance. Explain, in plain English for a patient:
- what the flagged results usually indicate and how the organs involved are anatomically connected;
- what the What-If scenario could plausibly change over 30/60/90 days, with honest uncertainty.
Never diagnose, never prescribe, always point to a clinician.
Organ ids you may use: ${ORGAN_IDS.join(", ")}.
Respond with ONLY JSON: {"explanations":[{"organ":"<organ id>","title":"<max 8 words>","body":"<2-4 sentences>"}],"doctorQuestions":["..."]}

DATA: ${guarded.json}`;

  try {
    const result = await m.cloud.generateContent(prompt);
    const text = result.response.text();
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    const parsed: CloudResearch = s !== -1 && e > s ? JSON.parse(text.slice(s, e + 1)) : {};

    const meta = result.response.candidates?.[0]?.groundingMetadata;
    const citations: Citation[] = (meta?.groundingChunks ?? [])
      .flatMap((c, i): Citation[] =>
        c.web?.uri ? [{ id: `g${i}`, title: c.web.title ?? c.web.uri, source: c.web.domain ?? c.web.title ?? "Web", url: c.web.uri, kind: "grounded-search" }] : [],
      );

    const explanations: Explanation[] = (parsed.explanations ?? [])
      .filter((x) => x?.title && x?.body)
      .slice(0, 6)
      .map((x, i) => ({
        id: `cloud_${i}`,
        organ: ORGAN_IDS.includes(x.organ as OrganId) ? (x.organ as OrganId) : undefined,
        title: x.title!,
        body: x.body!,
        citationIds: citations.map((c) => c.id),
        provenance: "cloud-ai",
      }));

    log({
      task: "Grounded What-If research",
      route: "IN_CLOUD",
      mode: "ONLY_IN_CLOUD",
      ms: performance.now() - t0,
      bytesOut: guarded.bytes,
      ok: explanations.length > 0,
      note: `${citations.length} web sources via Google Search grounding`,
    });

    if (!explanations.length) return null;
    return {
      ...sim,
      engine: { kind: "hybrid", cloudModel: CLOUD_MODEL, grounded: citations.length > 0 },
      explanations: [...explanations, ...sim.explanations.filter((x) => !explanations.some((c) => c.organ && c.organ === x.organ))],
      citations: [...citations, ...sim.citations],
      doctorQuestions: [...new Set([...(parsed.doctorQuestions ?? []).filter((q) => typeof q === "string"), ...sim.doctorQuestions])].slice(0, 8),
    };
  } catch (err) {
    log({ task: "Grounded What-If research", route: "IN_CLOUD", mode: "ONLY_IN_CLOUD", ms: performance.now() - t0, bytesOut: guarded.bytes, ok: false, note: (err as Error).message.slice(0, 140) });
    return null;
  }
}
