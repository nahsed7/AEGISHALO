/**
 * AegisHolo Health — core data contracts.
 *
 * Two boundaries matter:
 *  - Everything in `RawReport` / `RedactionResult.vault` stays on the device.
 *  - `HealthProfileJSON` and `SimulationRequest` are the only shapes allowed to
 *    leave the device, and they are checked by `lib/privacy/guard.ts` first.
 */

export type OrganId = "pancreas" | "stomach" | "duodenum" | "liver" | "heart" | "kidneys";

export const ORGAN_IDS: OrganId[] = ["heart", "liver", "stomach", "duodenum", "pancreas", "kidneys"];

export type BiomarkerFlag = "low" | "normal" | "high" | "critical" | "positive" | "negative" | "unknown";

/** Where a value or decision came from. Shown in the UI so the hybrid routing is never hidden. */
export type Provenance = "rule" | "on-device-ai" | "cloud-ai" | "manual";

export interface Biomarker {
  /** Stable catalog id, e.g. "lipase". */
  id: string;
  name: string;
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  flag: BiomarkerFlag;
  /** Value / upper reference limit; 1 = at the limit. Undefined for qualitative tests. */
  ratioToUln?: number;
  organs: OrganId[];
  /** Redacted source line the value was read from. */
  sourceLine: string;
  confidence: number;
  provenance: Provenance;
}

export type PiiType =
  | "name"
  | "national_id"
  | "phone"
  | "address"
  | "hospital_id"
  | "email"
  | "dob"
  | "doctor";

export interface PiiSpan {
  type: PiiType;
  start: number;
  end: number;
  text: string;
  /** Token that replaces the text, e.g. "[NAME_1]". */
  token: string;
  detector: Provenance;
}

export interface RedactionResult {
  raw: string;
  redacted: string;
  spans: PiiSpan[];
  /** token → original value. NEVER serialised into any outbound payload. */
  vault: Record<string, string>;
}

export type SourceKind = "image" | "pdf" | "text" | "sample";

export interface HealthProfileJSON {
  schemaVersion: "1.0";
  /** Random id, not derived from any identifier. */
  profileId: string;
  createdAt: string;
  report: {
    title: string;
    collectedOn?: string;
    sourceKind: SourceKind;
    ocr: { engine: "tesseract.js" | "pdf-text" | "none"; confidence?: number };
  };
  patient: {
    ageYears?: number;
    sex?: "male" | "female" | "unknown";
  };
  biomarkers: Biomarker[];
  privacy: {
    piiRemoved: number;
    piiTypes: PiiType[];
    detectors: Provenance[];
  };
}

/** A report as stored locally (IndexedDB). Contains PII — device only. */
export interface StoredRecord {
  id: string;
  createdAt: string;
  fileName: string;
  previewDataUrl?: string;
  redaction: RedactionResult;
  profile: HealthProfileJSON;
}

// ───────────────────────────── Simulation ─────────────────────────────

export type SymptomId =
  | "epigastric_pain"
  | "pain_radiating_back"
  | "nausea_vomiting"
  | "pain_relieved_by_food"
  | "black_stools"
  | "jaundice"
  | "chest_pain"
  | "reduced_urine";

export interface ScenarioToggles {
  /** Reduce dietary sugar, acid and fat load. */
  dietReduction: boolean;
  /** 0–100 % adherence to the medication plan agreed with a clinician. */
  medicationAdherence: number;
  alcoholCessation: boolean;
  smokingCessation: boolean;
  hydration: boolean;
}

export interface SimulationRequest {
  profile: HealthProfileJSON;
  symptoms: SymptomId[];
  scenario: ScenarioToggles;
}

export type OrganStatus = "healthy" | "watch" | "alert";

export interface OrganState {
  organ: OrganId;
  status: OrganStatus;
  /** 0–1 at day 0. */
  severity: number;
  /** Severity at each projection day under the selected scenario. */
  severityByDay: Record<ProjectionDay, number>;
  triggers: string[];
  summary: string;
}

export type ProjectionDay = 0 | 30 | 60 | 90;
export const PROJECTION_DAYS: ProjectionDay[] = [0, 30, 60, 90];

export type Vec3 = [number, number, number];

export interface Lesion {
  id: string;
  organ: OrganId;
  position: Vec3;
  kind: "inflammation" | "ulcer" | "congestion" | "obstruction";
  label: string;
  intensityByDay: Record<ProjectionDay, number>;
  triggers: string[];
}

export interface AnatomicalConnection {
  id: string;
  label: string;
  organs: OrganId[];
  /** Spline control points in viewer space. */
  points: Vec3[];
  description: string;
  active: boolean;
}

export interface ProjectionPoint {
  day: number;
  value: number;
}

export interface BiomarkerProjection {
  biomarkerId: string;
  name: string;
  unit: string;
  refHigh?: number;
  refLow?: number;
  /** Trajectory under the selected What-If scenario. */
  scenario: ProjectionPoint[];
  /** Trajectory with no change in behaviour. */
  baseline: ProjectionPoint[];
}

export interface Citation {
  id: string;
  title: string;
  source: string;
  url: string;
  kind: "grounded-search" | "curated";
}

export interface Explanation {
  id: string;
  organ?: OrganId;
  title: string;
  body: string;
  citationIds: string[];
  provenance: Provenance;
}

export interface RedFlag {
  id: string;
  message: string;
}

export interface SimulationResponse {
  simulationId: string;
  generatedAt: string;
  engine: {
    kind: "deterministic" | "hybrid";
    cloudModel?: string;
    grounded: boolean;
  };
  pattern: { id: string; label: string; confidence: number } | null;
  organs: OrganState[];
  lesions: Lesion[];
  connections: AnatomicalConnection[];
  projections: BiomarkerProjection[];
  explanations: Explanation[];
  citations: Citation[];
  doctorQuestions: string[];
  redFlags: RedFlag[];
  disclaimer: string;
}

// ───────────────────────────── AI routing ledger ─────────────────────────────

export type InferenceRoute = "ON_DEVICE" | "IN_CLOUD" | "LOCAL_RULES" | "APP_SERVER" | "BLOCKED";

export interface LedgerEntry {
  id: string;
  at: string;
  task: string;
  route: InferenceRoute;
  mode?: string;
  ms: number;
  /** Bytes that left the device for this step (0 for on-device). */
  bytesOut: number;
  containsPii: false;
  note?: string;
  ok: boolean;
}
