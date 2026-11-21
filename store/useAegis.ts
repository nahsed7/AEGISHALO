"use client";

import { create } from "zustand";
import type {
  HealthProfileJSON,
  LedgerEntry,
  OrganId,
  ProjectionDay,
  ScenarioToggles,
  SimulationRequest,
  SimulationResponse,
  SourceKind,
  StoredRecord,
  SymptomId,
} from "@/types/health";
import { parseBiomarkers, parseDemographics } from "@/lib/biomarkers/parse";
import { redact } from "@/lib/privacy/redact";
import { assertNoPii, PrivacyViolation } from "@/lib/privacy/guard";
import { runSimulation } from "@/lib/ai/simulationEngine";
import {
  cloudConfigured,
  detectPiiOnDevice,
  extractAssist,
  generateDoctorQuestions,
  groundedResearch,
  probeOnDevice,
  warmUpOnDevice,
  type DeviceAvailability,
} from "@/lib/ai/hybrid";
import { deleteRecord, loadRecords, saveRecord } from "@/lib/storage/vault";
import { getFirestoreSync } from "@/lib/firebase";
import type { SampleReport } from "@/lib/samples/reports";

export type ViewMode = "full" | "focus" | "exploded";

interface Processing {
  label: string;
  fraction: number;
}

interface AegisState {
  ready: boolean;
  records: StoredRecord[];
  activeId: string | null;
  processing: Processing | null;
  error: string | null;

  symptoms: SymptomId[];
  scenario: ScenarioToggles;
  day: ProjectionDay;

  simulation: SimulationResponse | null;
  simulating: boolean;
  grounding: "idle" | "running" | "done" | "failed";

  doctorQuestions: string[];
  questionsBusy: boolean;

  ledger: LedgerEntry[];
  device: DeviceAvailability;
  deviceProgress: number | null;
  cloud: boolean;

  view: ViewMode;
  focusOrgan: OrganId | null;
  cameraNonce: number;
  /** Increments when a report lands; drives the one scan moment. */
  scanNonce: number;
  showDiff: boolean;
  ledgerOpen: boolean;
  selectedMarker: string | null;
  sync: "off" | "syncing" | "synced" | "failed";

  init(): Promise<void>;
  ingest(file: Blob, fileName: string, kind: SourceKind, preview?: string, fallbackText?: string): Promise<void>;
  loadSample(sample: SampleReport): Promise<void>;
  selectRecord(id: string): void;
  removeRecord(id: string): Promise<void>;
  toggleSymptom(s: SymptomId): void;
  setScenario(patch: Partial<ScenarioToggles>): void;
  setDay(d: ProjectionDay): void;
  simulate(): Promise<void>;
  ground(): Promise<void>;
  askQuestions(): Promise<void>;
  enableOnDevice(): void;
  setView(v: ViewMode, organ?: OrganId | null): void;
  resetCamera(): void;
  setShowDiff(v: boolean): void;
  setLedgerOpen(v: boolean): void;
  setSelectedMarker(id: string | null): void;
  syncAnonymised(): Promise<void>;
  dismissError(): void;
}

const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

let simTimer: ReturnType<typeof setTimeout> | undefined;

export const useAegis = create<AegisState>((set, get) => {
  const log = (e: Omit<LedgerEntry, "id" | "at" | "containsPii">) =>
    set((s) => ({
      ledger: [{ ...e, ms: Math.round(e.ms), id: uid(), at: new Date().toISOString(), containsPii: false as const }, ...s.ledger].slice(0, 60),
    }));

  const active = () => get().records.find((r) => r.id === get().activeId) ?? null;

  const scheduleSimulate = () => {
    clearTimeout(simTimer);
    simTimer = setTimeout(() => void get().simulate(), 120);
  };

  return {
    ready: false,
    records: [],
    activeId: null,
    processing: null,
    error: null,
    symptoms: ["epigastric_pain"],
    scenario: { dietReduction: true, medicationAdherence: 80, alcoholCessation: false, smokingCessation: false, hydration: true },
    day: 0,
    simulation: null,
    simulating: false,
    grounding: "idle",
    doctorQuestions: [],
    questionsBusy: false,
    ledger: [],
    device: "unsupported",
    deviceProgress: null,
    cloud: false,
    view: "full",
    focusOrgan: null,
    cameraNonce: 0,
    scanNonce: 0,
    showDiff: false,
    ledgerOpen: false,
    selectedMarker: null,
    sync: "off",

    async init() {
      const [records, device] = await Promise.all([loadRecords().catch(() => []), probeOnDevice()]);
      set({ records, device, cloud: cloudConfigured(), ready: true, activeId: records.at(-1)?.id ?? null });
      if (records.length) await get().simulate();
    },

    async ingest(file, fileName, kind, preview, fallbackText) {
      set({ processing: { label: "Reading report on this device", fraction: 0 }, error: null });
      try {
        // 1 ─ OCR, in the browser.
        const t0 = performance.now();
        let raw = "";
        let engine: HealthProfileJSON["report"]["ocr"] = { engine: "none" };
        try {
          const { extractText } = await import("@/lib/ocr/ocr");
          const r = await extractText(file, fileName, (stage, f) =>
            set({ processing: { label: `OCR · ${stage}`, fraction: f } }),
          );
          raw = r.text;
          engine = { engine: r.engine, confidence: r.confidence ? Math.round(r.confidence) : undefined };
        } catch (err) {
          if (!fallbackText) throw err;
          console.warn("OCR failed, using the sample's source text", err);
          raw = fallbackText;
        }
        if (fallbackText && raw.replace(/\s/g, "").length < 40) raw = fallbackText;
        log({ task: `Text extraction (${engine.engine})`, route: "LOCAL_RULES", ms: performance.now() - t0, bytesOut: 0, ok: raw.length > 0, note: engine.confidence ? `OCR confidence ${engine.confidence}%` : undefined });

        // 2 ─ PII: Gemini Nano on device (ONLY_ON_DEVICE) + deterministic rules.
        set({ processing: { label: "Finding personal details on device", fraction: 0.4 } });
        const aiSpans = await detectPiiOnDevice(raw, log);
        const t1 = performance.now();
        const redaction = redact(raw, aiSpans);
        log({ task: "Privacy firewall (redaction)", route: "LOCAL_RULES", ms: performance.now() - t1, bytesOut: 0, ok: true, note: `${Object.keys(redaction.vault).length} identifiers replaced with tokens` });

        // 3 ─ Lab values from the REDACTED text.
        set({ processing: { label: "Structuring lab values", fraction: 0.7 } });
        let biomarkers = parseBiomarkers(redaction.redacted);
        biomarkers = [...biomarkers, ...(await extractAssist(redaction, biomarkers, log))];
        const demo = parseDemographics(redaction.redacted);
        const title = fileName.replace(/\.[a-z0-9]+$/i, "");

        const profile: HealthProfileJSON = {
          schemaVersion: "1.0",
          profileId: uid(),
          createdAt: new Date().toISOString(),
          report: { title, collectedOn: demo.collectedOn, sourceKind: kind, ocr: engine },
          patient: { ageYears: demo.ageYears, sex: demo.sex ?? "unknown" },
          biomarkers,
          privacy: {
            piiRemoved: Object.keys(redaction.vault).length,
            piiTypes: [...new Set(redaction.spans.map((s) => s.type))],
            detectors: [...new Set(redaction.spans.map((s) => s.detector))],
          },
        };
        // The profile itself must be clean before it is stored as "exportable".
        assertNoPii(profile, [redaction]);

        const record: StoredRecord = { id: profile.profileId, createdAt: profile.createdAt, fileName, previewDataUrl: preview, redaction, profile };
        await saveRecord(record);
        const records = await loadRecords();
        set({ records, activeId: record.id, processing: null, grounding: "idle", doctorQuestions: [], selectedMarker: null });
        await get().simulate();
        // Start the sweep once the new simulation colours are in place.
        set({ scanNonce: get().scanNonce + 1 });
      } catch (err) {
        set({ processing: null, error: err instanceof PrivacyViolation ? err.message : `Could not read that report: ${(err as Error).message}` });
      }
    },

    async loadSample(sample) {
      const { renderReportImage } = await import("@/lib/samples/renderSample");
      const blob = await renderReportImage(sample.text);
      const preview = await new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.readAsDataURL(blob);
      });
      const file = new File([blob], `${sample.title}.png`, { type: "image/png" });
      await get().ingest(file, `${sample.title}.png`, "sample", preview, sample.text);
    },

    selectRecord(id) {
      set({ activeId: id, grounding: "idle", doctorQuestions: [], selectedMarker: null });
      void get().simulate();
    },

    async removeRecord(id) {
      await deleteRecord(id);
      const records = await loadRecords();
      const activeId = get().activeId === id ? (records.at(-1)?.id ?? null) : get().activeId;
      set({ records, activeId, simulation: activeId ? get().simulation : null });
      if (activeId) await get().simulate();
    },

    toggleSymptom(s) {
      const has = get().symptoms.includes(s);
      set({ symptoms: has ? get().symptoms.filter((x) => x !== s) : [...get().symptoms, s], grounding: "idle" });
      scheduleSimulate();
    },

    setScenario(patch) {
      set({ scenario: { ...get().scenario, ...patch }, grounding: "idle" });
      scheduleSimulate();
    },

    setDay(day) {
      set({ day });
    },

    async simulate() {
      const rec = active();
      if (!rec) return set({ simulation: null });
      const req: SimulationRequest = { profile: rec.profile, symptoms: get().symptoms, scenario: get().scenario };
      set({ simulating: true });
      const t0 = performance.now();
      try {
        const { json, bytes } = assertNoPii(req, [rec.redaction]);
        let sim: SimulationResponse;
        try {
          const res = await fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: json });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          sim = (await res.json()) as SimulationResponse;
          log({ task: "What-If engine (/api/simulate)", route: "APP_SERVER", ms: performance.now() - t0, bytesOut: bytes, ok: true, note: sim.pattern?.label });
        } catch {
          // Offline: the same deterministic engine runs in the browser.
          sim = runSimulation(req);
          log({ task: "What-If engine (offline, in browser)", route: "LOCAL_RULES", ms: performance.now() - t0, bytesOut: 0, ok: true, note: sim.pattern?.label });
        }
        set({ simulation: sim, simulating: false });
      } catch (err) {
        set({ simulating: false, error: (err as Error).message });
        log({ task: "What-If engine", route: "BLOCKED", ms: performance.now() - t0, bytesOut: 0, ok: false, note: (err as Error).message });
      }
    },

    async ground() {
      const rec = active();
      const sim = get().simulation;
      if (!rec || !sim) return;
      if (!get().cloud) {
        set({ error: "Cloud AI is not configured. Add your Firebase keys to .env.local (see README) to run grounded research." });
        return;
      }
      set({ grounding: "running" });
      try {
        const out = await groundedResearch({ profile: rec.profile, symptoms: get().symptoms, scenario: get().scenario }, sim, [rec.redaction], log);
        if (out) set({ simulation: out, grounding: "done" });
        else set({ grounding: "failed" });
      } catch (err) {
        set({ grounding: "failed", error: (err as Error).message });
      }
    },

    async askQuestions() {
      const rec = active();
      const sim = get().simulation;
      if (!rec || !sim) return;
      set({ questionsBusy: true });
      const qs = await generateDoctorQuestions(rec.profile, sim, log);
      if (!qs) log({ task: "Doctor-visit questions", route: "LOCAL_RULES", ms: 0, bytesOut: 0, ok: true, note: "Using rule-based questions" });
      set({ doctorQuestions: qs ?? sim.doctorQuestions, questionsBusy: false });
    },

    enableOnDevice() {
      const started = warmUpOnDevice((f) => set({ deviceProgress: f, device: f >= 1 ? "available" : "downloading" }));
      if (!started) {
        set({ error: get().cloud ? "This browser does not expose Gemini Nano. Use desktop Chrome 139+ with the Prompt API flag enabled." : "Add your Firebase keys first. On-device inference runs through Firebase AI Logic." });
        return;
      }
      set({ device: "downloading", deviceProgress: 0 });
      void probeOnDevice().then((d) => set({ device: d }));
    },

    setView(view, organ = null) {
      set({ view, focusOrgan: view === "focus" ? organ : null, cameraNonce: get().cameraNonce + 1 });
    },
    resetCamera() {
      set({ view: "full", focusOrgan: null, cameraNonce: get().cameraNonce + 1 });
    },
    setShowDiff(showDiff) {
      set({ showDiff });
    },
    setLedgerOpen(ledgerOpen) {
      set({ ledgerOpen });
    },
    setSelectedMarker(selectedMarker) {
      set({ selectedMarker });
    },

    async syncAnonymised() {
      const rec = active();
      const sim = get().simulation;
      if (!rec) return;
      set({ sync: "syncing" });
      const t0 = performance.now();
      try {
        const fs = await getFirestoreSync();
        if (!fs) {
          set({ sync: "off", error: "Firestore sync needs Firebase keys in .env.local." });
          return;
        }
        const doc = {
          ownerUid: fs.uid,
          profileId: rec.profile.profileId,
          collectedOn: rec.profile.report.collectedOn ?? null,
          biomarkers: rec.profile.biomarkers.map((b) => ({ id: b.id, value: b.value, unit: b.unit, flag: b.flag })),
          pattern: sim?.pattern?.id ?? null,
        };
        const { bytes } = assertNoPii(doc, [rec.redaction]);
        await fs.addDoc(fs.collection(fs.db, "anonymized_records"), { ...doc, createdAt: fs.serverTimestamp() });
        log({ task: "Firestore sync (anonymised)", route: "IN_CLOUD", ms: performance.now() - t0, bytesOut: bytes, ok: true });
        set({ sync: "synced" });
      } catch (err) {
        log({ task: "Firestore sync (anonymised)", route: "BLOCKED", ms: performance.now() - t0, bytesOut: 0, ok: false, note: (err as Error).message.slice(0, 120) });
        set({ sync: "failed" });
      }
    },

    dismissError() {
      set({ error: null });
    },
  };
});

export function useActiveRecord() {
  return useAegis((s) => s.records.find((r) => r.id === s.activeId) ?? null);
}
