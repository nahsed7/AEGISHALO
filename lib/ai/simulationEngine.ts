import type {
  AnatomicalConnection,
  Biomarker,
  BiomarkerProjection,
  Citation,
  Explanation,
  Lesion,
  OrganId,
  OrganState,
  ProjectionDay,
  RedFlag,
  ScenarioToggles,
  SimulationRequest,
  SimulationResponse,
  SymptomId,
} from "@/types/health";
import { ORGAN_IDS, PROJECTION_DAYS } from "@/types/health";
import { CONNECTION_PATHS, LESION_SITES, ORGANS } from "@/lib/anatomy/layout";

/**
 * Deterministic "What-If" engine.
 *
 * It does not diagnose. It maps lab values against reference limits, recognises a few
 * textbook patterns, and projects how far-from-normal values *could* move under a scenario
 * using simple exponential recovery. Everything is labelled educational. The cloud model
 * (Firebase AI Logic) adds grounded explanations on top; geometry and numbers stay here so
 * the 3D view is stable and reproducible.
 */

export const DISCLAIMER =
  "Educational visualisation only. AegisHolo does not diagnose or recommend treatment. Bring these results and questions to a qualified clinician.";

const SAMPLE_DAYS = [0, 7, 14, 30, 45, 60, 75, 90];

interface Kinetics {
  /** Days for the out-of-range excess to halve under full adherence. */
  halfLife: number;
  /** Fraction of the excess that persists with no change in behaviour. */
  persistence: number;
  /** Which scenario levers speed recovery for this marker. */
  levers: Partial<Record<keyof ScenarioToggles, number>>;
}

const KINETICS: Record<string, Kinetics> = {
  lipase: { halfLife: 5, persistence: 0.35, levers: { dietReduction: 1.25, alcoholCessation: 1.45, hydration: 1.15, smokingCessation: 1.1 } },
  amylase: { halfLife: 4, persistence: 0.3, levers: { dietReduction: 1.2, alcoholCessation: 1.4, hydration: 1.15 } },
  crp: { halfLife: 4, persistence: 0.4, levers: { medicationAdherence: 1 } },
  wbc: { halfLife: 6, persistence: 0.35, levers: {} },
  alt: { halfLife: 18, persistence: 0.6, levers: { alcoholCessation: 1.5, dietReduction: 1.2 } },
  ast: { halfLife: 14, persistence: 0.6, levers: { alcoholCessation: 1.5 } },
  ggt: { halfLife: 21, persistence: 0.8, levers: { alcoholCessation: 1.8 } },
  alp: { halfLife: 25, persistence: 0.7, levers: {} },
  bilirubin_total: { halfLife: 10, persistence: 0.5, levers: { hydration: 1.1 } },
  glucose_fasting: { halfLife: 35, persistence: 1.0, levers: { dietReduction: 1.5, smokingCessation: 1.05 } },
  hba1c: { halfLife: 60, persistence: 1.05, levers: { dietReduction: 1.4 } },
  triglycerides: { halfLife: 14, persistence: 0.95, levers: { dietReduction: 1.6, alcoholCessation: 1.5 } },
  creatinine: { halfLife: 20, persistence: 0.85, levers: { hydration: 1.35 } },
  urea: { halfLife: 10, persistence: 0.8, levers: { hydration: 1.4 } },
  troponin: { halfLife: 4, persistence: 0.5, levers: { smokingCessation: 1.1 } },
  hemoglobin: { halfLife: 28, persistence: 0.9, levers: { medicationAdherence: 1 } },
  potassium: { halfLife: 3, persistence: 0.7, levers: { hydration: 1.1 } },
};

const DEFAULT_KINETICS: Kinetics = { halfLife: 20, persistence: 0.8, levers: {} };

function recoveryMultiplier(k: Kinetics, s: ScenarioToggles): number {
  const adherence = Math.max(0, Math.min(100, s.medicationAdherence)) / 100;
  let m = 0.35 + 0.65 * adherence;
  if (s.dietReduction) m *= k.levers.dietReduction ?? 1.05;
  if (s.alcoholCessation) m *= k.levers.alcoholCessation ?? 1.05;
  if (s.smokingCessation) m *= k.levers.smokingCessation ?? 1.03;
  if (s.hydration) m *= k.levers.hydration ?? 1.02;
  return m;
}

function targetFor(b: Biomarker): number | null {
  if (b.refHigh !== undefined && b.value > b.refHigh) return b.refHigh * 0.8;
  if (b.refLow !== undefined && b.value < b.refLow) return b.refLow * 1.04;
  return null;
}

function project(b: Biomarker, s: ScenarioToggles): BiomarkerProjection | null {
  const target = targetFor(b);
  if (target === null) return null;
  const k = KINETICS[b.id] ?? DEFAULT_KINETICS;
  const excess = b.value - target;
  const hl = k.halfLife / recoveryMultiplier(k, s);
  const round = (v: number) => Math.round(v * 100) / 100;

  const scenario = SAMPLE_DAYS.map((day) => ({ day, value: round(target + excess * Math.pow(0.5, day / hl)) }));
  const baseline = SAMPLE_DAYS.map((day) => {
    const resolving = Math.pow(0.5, day / (k.halfLife * 3));
    // persistence > 1 means the value keeps drifting away with no change in behaviour.
    const fraction = k.persistence >= 1 ? 1 + (k.persistence - 1) * (day / 30) : k.persistence + (1 - k.persistence) * resolving;
    return { day, value: round(target + excess * fraction) };
  });

  return { biomarkerId: b.id, name: b.name, unit: b.unit, refHigh: b.refHigh, refLow: b.refLow, scenario, baseline };
}

function valueAt(p: BiomarkerProjection, day: number): number {
  const pts = p.scenario;
  for (let i = 1; i < pts.length; i++) {
    if (day <= pts[i].day) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (day - a.day) / (b.day - a.day);
      return a.value + (b.value - a.value) * t;
    }
  }
  return pts[pts.length - 1].value;
}

/** 0–1 abnormality of a single value. */
function abnormality(b: Pick<Biomarker, "refHigh" | "refLow" | "flag">, value: number): number {
  if (b.flag === "positive") return 0.45;
  if (b.refHigh !== undefined && value > b.refHigh) {
    return Math.min(1, Math.log2(value / b.refHigh) / Math.log2(5) + 0.12);
  }
  if (b.refLow !== undefined && value < b.refLow) {
    return Math.min(1, ((b.refLow - value) / b.refLow) * 2.5 + 0.1);
  }
  return 0;
}

const SYMPTOM_ORGANS: Record<SymptomId, { organs: OrganId[]; weight: number }> = {
  epigastric_pain: { organs: ["pancreas", "stomach", "duodenum"], weight: 0.18 },
  pain_radiating_back: { organs: ["pancreas"], weight: 0.2 },
  nausea_vomiting: { organs: ["stomach", "pancreas"], weight: 0.1 },
  pain_relieved_by_food: { organs: ["duodenum"], weight: 0.2 },
  black_stools: { organs: ["duodenum", "stomach"], weight: 0.3 },
  jaundice: { organs: ["liver"], weight: 0.3 },
  chest_pain: { organs: ["heart"], weight: 0.3 },
  reduced_urine: { organs: ["kidneys"], weight: 0.25 },
};

export const SYMPTOM_LABELS: Record<SymptomId, string> = {
  epigastric_pain: "Epigastric pain",
  pain_radiating_back: "Pain radiating to back",
  nausea_vomiting: "Nausea or vomiting",
  pain_relieved_by_food: "Pain eased by eating",
  black_stools: "Black, tarry stools",
  jaundice: "Yellow skin or eyes",
  chest_pain: "Chest pain or pressure",
  reduced_urine: "Passing less urine",
};

export const CURATED_CITATIONS: Record<string, Citation> = {
  acg_pancreatitis: {
    id: "acg_pancreatitis",
    title: "American College of Gastroenterology Guidelines: Management of Acute Pancreatitis (Tenner et al., 2024)",
    source: "Am J Gastroenterol",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=American+College+of+Gastroenterology+Guidelines+Management+of+Acute+Pancreatitis+Tenner+2024",
    kind: "curated",
  },
  atlanta_2012: {
    id: "atlanta_2012",
    title: "Classification of acute pancreatitis — 2012: revision of the Atlanta classification (Banks et al.)",
    source: "Gut, 2013",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=Classification+of+acute+pancreatitis+2012+revision+of+the+Atlanta+classification",
    kind: "curated",
  },
  acg_hpylori: {
    id: "acg_hpylori",
    title: "ACG Clinical Guideline: Treatment of Helicobacter pylori Infection (Chey et al., 2024)",
    source: "Am J Gastroenterol",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=ACG+Clinical+Guideline+Treatment+of+Helicobacter+pylori+Infection+Chey+2024",
    kind: "curated",
  },
  lancet_pud: {
    id: "lancet_pud",
    title: "Peptic ulcer disease (Lanas & Chan)",
    source: "The Lancet, 2017",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=Lanas+Chan+Peptic+ulcer+disease+Lancet+2017",
    kind: "curated",
  },
  acg_liver: {
    id: "acg_liver",
    title: "ACG Clinical Guideline: Evaluation of Abnormal Liver Chemistries (Kwo et al.)",
    source: "Am J Gastroenterol, 2017",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=ACG+Clinical+Guideline+Evaluation+of+Abnormal+Liver+Chemistries",
    kind: "curated",
  },
  kdigo_ckd: {
    id: "kdigo_ckd",
    title: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
    source: "Kidney International, 2024",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=KDIGO+2024+Clinical+Practice+Guideline+Evaluation+and+Management+of+Chronic+Kidney+Disease",
    kind: "curated",
  },
  udmi4: {
    id: "udmi4",
    title: "Fourth Universal Definition of Myocardial Infarction (Thygesen et al.)",
    source: "Circulation / Eur Heart J, 2018",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=Fourth+Universal+Definition+of+Myocardial+Infarction+2018",
    kind: "curated",
  },
  ada_dx: {
    id: "ada_dx",
    title: "Diagnosis and Classification of Diabetes: Standards of Care in Diabetes",
    source: "American Diabetes Association, Diabetes Care",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=Diagnosis+and+Classification+of+Diabetes+Standards+of+Care+in+Diabetes",
    kind: "curated",
  },
};

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function runSimulation(req: SimulationRequest): SimulationResponse {
  const { profile, symptoms, scenario } = req;
  const markers = profile.biomarkers;
  const by = (id: string) => markers.find((m) => m.id === id);
  const has = (s: SymptomId) => symptoms.includes(s);
  const ratio = (id: string) => by(id)?.ratioToUln ?? 0;

  const projections = markers.map((b) => project(b, scenario)).filter((p): p is BiomarkerProjection => p !== null);
  const projOf = (id: string) => projections.find((p) => p.biomarkerId === id);

  // ── Organ severity per projection day ──
  const severityAt = (organ: OrganId, day: number) => {
    let s = 0;
    for (const b of markers) {
      if (!b.organs.includes(organ)) continue;
      const p = projOf(b.id);
      const v = p ? valueAt(p, day) : b.value;
      let a = abnormality(b, v);
      // Values past the critical threshold always read as an alert today.
      if (b.flag === "critical" && day === 0) a = Math.max(a, 0.75);
      // A positive H. pylori test clears only if the treatment plan is actually taken.
      if (b.flag === "positive" && day > 0) a *= scenario.medicationAdherence >= 60 ? Math.pow(0.5, (day / 14) * (scenario.medicationAdherence / 100)) : 0.9;
      s = Math.max(s, a);
    }
    // Very high triglycerides are a recognised cause of pancreatitis.
    if (organ === "pancreas" && (by("triglycerides")?.value ?? 0) >= 500) s = Math.max(s, 0.5);
    // Symptoms fade as the underlying values recover.
    const decay = day === 0 ? 1 : Math.max(0.15, s);
    for (const sym of symptoms) {
      const map = SYMPTOM_ORGANS[sym];
      if (map.organs.includes(organ) && s > 0) s = Math.min(1, s + map.weight * decay);
    }
    return Math.round(s * 100) / 100;
  };

  // ── Pattern recognition (educational, not diagnostic) ──
  const enzymeRatio = Math.max(ratio("lipase"), ratio("amylase"));
  const pain = has("epigastric_pain") || has("pain_radiating_back");
  const hp = by("hpylori")?.flag === "positive";
  const ulcerSymptoms = has("epigastric_pain") || has("pain_relieved_by_food") || has("black_stools");
  const biliary = ratio("bilirubin_total") > 1 && (ratio("alp") > 1 || ratio("ggt") > 1);

  const patterns: { id: string; label: string; confidence: number }[] = [];
  if (enzymeRatio >= 3 && pain) patterns.push({ id: "acute_pancreatitis", label: "Pattern consistent with acute pancreatic inflammation", confidence: 0.85 });
  else if (enzymeRatio >= 3) patterns.push({ id: "acute_pancreatitis", label: "Pancreatic enzymes above 3× the upper limit", confidence: 0.6 });
  else if (enzymeRatio > 1 && pain) patterns.push({ id: "pancreatic_irritation", label: "Mildly raised pancreatic enzymes with upper-abdominal pain", confidence: 0.45 });
  if (hp && ulcerSymptoms) patterns.push({ id: "duodenal_ulcer", label: "H. pylori with symptoms that fit a duodenal ulcer", confidence: 0.7 });
  else if (hp) patterns.push({ id: "hp_gastritis", label: "H. pylori detected", confidence: 0.5 });
  if (by("troponin") && by("troponin")!.flag !== "normal") patterns.push({ id: "cardiac_injury", label: "Raised cardiac troponin", confidence: 0.75 });
  if (ratio("creatinine") > 1 || by("egfr")?.flag === "low") patterns.push({ id: "renal", label: "Reduced kidney filtration", confidence: 0.6 });
  if (biliary) patterns.push({ id: "biliary", label: "Bile-duct (cholestatic) enzyme pattern", confidence: 0.55 });
  patterns.sort((a, b) => b.confidence - a.confidence);

  // ── Organs ──
  const triggersFor = (organ: OrganId) =>
    markers.filter((b) => b.organs.includes(organ) && abnormality(b, b.value) > 0).map((b) => b.id);

  const organs: OrganState[] = ORGAN_IDS.map((organ) => {
    const severityByDay = Object.fromEntries(PROJECTION_DAYS.map((d) => [d, severityAt(organ, d)])) as Record<ProjectionDay, number>;
    const severity = severityByDay[0];
    const triggers = triggersFor(organ);
    const status = severity >= 0.5 ? "alert" : severity > 0.08 ? "watch" : "healthy";
    const names = triggers.map((t) => by(t)?.name).filter(Boolean).join(", ");
    return {
      organ,
      status,
      severity,
      severityByDay,
      triggers,
      summary: status === "healthy" ? "No out-of-range values linked to this organ." : `Flagged by ${names || "symptoms"}.`,
    };
  });
  const organState = (id: OrganId) => organs.find((o) => o.organ === id)!;

  // ── Lesions ──
  const lesions: Lesion[] = [];
  const addLesion = (site: keyof typeof LESION_SITES, kind: Lesion["kind"], label: string, triggers: string[], weight = 1) => {
    const { organ, position } = LESION_SITES[site];
    const o = organState(organ);
    if (o.status === "healthy" && weight >= 1) return;
    lesions.push({
      id: site,
      organ,
      position,
      kind,
      label,
      triggers,
      intensityByDay: Object.fromEntries(PROJECTION_DAYS.map((d) => [d, Math.round(Math.min(1, o.severityByDay[d] * weight) * 100) / 100])) as Record<ProjectionDay, number>,
    });
  };

  if (enzymeRatio > 1) {
    addLesion(biliary || hp ? "pancreas_head" : "pancreas_body", "inflammation", "Pancreatic inflammation hotspot", ["lipase", "amylase"].filter((id) => by(id)));
  }
  if (hp && ulcerSymptoms) addLesion("duodenal_bulb", "ulcer", "Likely duodenal ulcer site", ["hpylori", ...(by("hemoglobin")?.flag === "low" ? ["hemoglobin"] : [])]);
  else if (hp) addLesion("gastric_antrum", "inflammation", "H. pylori gastritis zone", ["hpylori"], 0.6);
  if (organState("liver").status !== "healthy") addLesion("liver_hilum", biliary ? "obstruction" : "congestion", biliary ? "Bile outflow strain" : "Liver enzyme rise", triggersFor("liver"));
  if (organState("heart").status !== "healthy" && by("troponin")?.flag !== "normal" && by("troponin")) addLesion("myocardium", "inflammation", "Myocardial stress marker", ["troponin"]);
  if (organState("kidneys").status !== "healthy") addLesion("renal_cortex", "congestion", "Reduced filtration", triggersFor("kidneys"));

  // ── Connections ──
  const involved = (o: OrganId) => organState(o).status !== "healthy";
  const activeIds = new Set<string>();
  if (involved("pancreas") || involved("duodenum")) activeIds.add("pancreatic_duct");
  if (biliary || (involved("liver") && involved("pancreas"))) activeIds.add("biliary_tree");
  if (involved("liver") && (involved("stomach") || involved("pancreas"))) activeIds.add("hepatic_portal");
  if (involved("kidneys")) activeIds.add("renal_perfusion");
  const connections: AnatomicalConnection[] = Object.entries(CONNECTION_PATHS).map(([id, c]) => ({
    id,
    label: c.label,
    organs: c.organs,
    points: c.points,
    description: c.description,
    active: activeIds.has(id),
  }));

  // ── Red flags: always shown, never softened by the scenario ──
  const redFlags: RedFlag[] = [];
  if (by("troponin") && (by("troponin")!.flag === "high" || by("troponin")!.flag === "critical"))
    redFlags.push({ id: "troponin", message: "Raised troponin can mean heart-muscle injury. This needs same-day medical assessment." });
  if (has("chest_pain")) redFlags.push({ id: "chest_pain", message: "Chest pain or pressure: call emergency services if it is severe, lasting, or spreading to the arm or jaw." });
  if (has("black_stools")) redFlags.push({ id: "melena", message: "Black, tarry stools can mean bleeding in the stomach or duodenum. Seek urgent care." });
  if (enzymeRatio >= 3 && pain) redFlags.push({ id: "pancreatitis", message: "Pancreatic enzymes above 3× normal with abdominal pain should be assessed by a doctor promptly." });
  if (has("jaundice")) redFlags.push({ id: "jaundice", message: "New yellowing of the skin or eyes needs prompt medical review." });
  if ((by("potassium")?.value ?? 0) >= 6) redFlags.push({ id: "potassium", message: "Potassium at or above 6 mmol/L can affect heart rhythm. Seek urgent care." });

  // ── Explanations (curated; cloud AI may replace with grounded versions) ──
  const explanations: Explanation[] = [];
  const cite = (ids: string[]) => ids.filter((id) => CURATED_CITATIONS[id]);
  if (enzymeRatio > 1) {
    const l = by("lipase");
    explanations.push({
      id: "exp_pancreas",
      organ: "pancreas",
      title: enzymeRatio >= 3 ? "Why the pancreas is glowing red" : "Why the pancreas is on watch",
      body: `${l ? `Lipase is ${l.value} ${l.unit}, about ${l.ratioToUln}× the upper limit. ` : ""}When the pancreas is inflamed, its digestive enzymes leak into the blood. Guidelines use enzymes above 3× the upper limit, typical pain and imaging as the three criteria; two of the three are needed for a diagnosis, which only a clinician can make.`,
      citationIds: cite(["atlanta_2012", "acg_pancreatitis"]),
      provenance: "rule",
    });
  }
  if (hp) {
    explanations.push({
      id: "exp_duodenum",
      organ: "duodenum",
      title: "How H. pylori connects to the duodenum",
      body: "H. pylori lives in the stomach lining and raises acid exposure in the duodenal bulb, the most common site of peptic ulcers. Pain that eases with food is a classic but non-specific clue. Treatment and re-testing are decided with a doctor.",
      citationIds: cite(["acg_hpylori", "lancet_pud"]),
      provenance: "rule",
    });
  }
  if (involved("liver")) {
    explanations.push({
      id: "exp_liver",
      organ: "liver",
      title: biliary ? "Bile flow and the pancreatic head" : "Liver enzymes",
      body: biliary
        ? "Bilirubin with ALP or GGT points to bile-duct strain. The bile duct runs through the pancreatic head, which is why bile and pancreatic problems can appear together."
        : "Liver enzymes are mildly outside range. Alcohol, medicines, fatty liver and inflammation of nearby organs can all move them.",
      citationIds: cite(["acg_liver"]),
      provenance: "rule",
    });
  }
  if (involved("kidneys")) {
    explanations.push({
      id: "exp_kidneys",
      organ: "kidneys",
      title: "Kidney filtration",
      body: "Creatinine and eGFR estimate how well the kidneys filter. Dehydration from vomiting can raise creatinine temporarily; persistent changes are staged by kidney guidelines.",
      citationIds: cite(["kdigo_ckd"]),
      provenance: "rule",
    });
  }
  if (by("troponin") && by("troponin")!.flag !== "normal") {
    explanations.push({ id: "exp_heart", organ: "heart", title: "Troponin", body: "Troponin is released when heart muscle is damaged. A raised value needs urgent clinical interpretation alongside an ECG.", citationIds: cite(["udmi4"]), provenance: "rule" });
  }
  if ((by("glucose_fasting")?.flag ?? "normal") !== "normal" || (by("hba1c")?.flag ?? "normal") !== "normal") {
    explanations.push({ id: "exp_glucose", organ: "pancreas", title: "Blood sugar", body: "The pancreas also makes insulin. Fasting glucose and HbA1c above range are worth repeating and discussing; the What-If diet lever moves them slowly, over months.", citationIds: cite(["ada_dx"]), provenance: "rule" });
  }

  // ── Doctor-visit questions ──
  const doctorQuestions: string[] = [];
  if (enzymeRatio >= 3) doctorQuestions.push("My lipase is more than three times the upper limit. Do I need imaging, such as an ultrasound or CT, to check the pancreas and gallbladder?");
  else if (enzymeRatio > 1) doctorQuestions.push("My pancreatic enzymes are mildly raised. Should they be repeated, and when?");
  if (hp) doctorQuestions.push("H. pylori was positive. Which treatment do you recommend, and when should I be re-tested to confirm it has cleared?");
  if (hp && ulcerSymptoms) doctorQuestions.push("Do my symptoms justify an endoscopy to look for a duodenal ulcer?");
  if (by("hemoglobin")?.flag === "low") doctorQuestions.push("My haemoglobin is low. Could I be losing blood from my stomach or bowel?");
  if (biliary) doctorQuestions.push("Could a gallstone be blocking the bile duct, given my bilirubin and enzyme pattern?");
  if (by("triglycerides") && (by("triglycerides")!.ratioToUln ?? 0) > 1) doctorQuestions.push("Are my triglycerides high enough to affect my pancreas?");
  if (involved("kidneys")) doctorQuestions.push("Is my creatinine change likely due to dehydration, and when should it be rechecked?");
  doctorQuestions.push("Which of these values should be repeated, and when should I come back?");

  const top = patterns[0] ?? null;
  return {
    simulationId: uuid(),
    generatedAt: new Date().toISOString(),
    engine: { kind: "deterministic", grounded: false },
    pattern: top,
    organs,
    lesions,
    connections,
    projections,
    explanations,
    citations: Object.values(CURATED_CITATIONS).filter((c) => explanations.some((e) => e.citationIds.includes(c.id))),
    doctorQuestions,
    redFlags,
    disclaimer: DISCLAIMER,
  };
}

/** Exposed for the 3D callouts. */
export function organLabel(id: OrganId) {
  return ORGANS[id].label;
}
