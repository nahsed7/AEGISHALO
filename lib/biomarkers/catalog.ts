import type { OrganId } from "@/types/health";

export interface CatalogEntry {
  id: string;
  name: string;
  /** Lower-case aliases matched at the start of a report line. Longest first wins. */
  aliases: string[];
  unit: string;
  refLow?: number;
  refHigh?: number;
  organs: OrganId[];
  qualitative?: boolean;
  /** Value at which the result is critical regardless of the printed range. */
  criticalHigh?: number;
}

/**
 * Adult reference ranges in conventional units. Labs differ; when a report prints its
 * own range the parser uses that instead.
 */
export const CATALOG: CatalogEntry[] = [
  { id: "lipase", name: "Lipase", aliases: ["serum lipase", "lipase"], unit: "U/L", refLow: 13, refHigh: 60, organs: ["pancreas"], criticalHigh: 180 },
  { id: "amylase", name: "Amylase", aliases: ["serum amylase", "amylase"], unit: "U/L", refLow: 28, refHigh: 100, organs: ["pancreas"], criticalHigh: 300 },
  { id: "alt", name: "ALT (SGPT)", aliases: ["alt (sgpt)", "alanine aminotransferase", "sgpt", "alt"], unit: "U/L", refLow: 7, refHigh: 56, organs: ["liver"] },
  { id: "ast", name: "AST (SGOT)", aliases: ["ast (sgot)", "aspartate aminotransferase", "sgot", "ast"], unit: "U/L", refLow: 10, refHigh: 40, organs: ["liver", "heart"] },
  { id: "alp", name: "Alkaline phosphatase", aliases: ["alkaline phosphatase", "alk phos", "alp"], unit: "U/L", refLow: 44, refHigh: 147, organs: ["liver"] },
  { id: "ggt", name: "GGT", aliases: ["gamma gt", "gamma glutamyl transferase", "ggt"], unit: "U/L", refLow: 8, refHigh: 61, organs: ["liver"] },
  { id: "bilirubin_total", name: "Bilirubin (total)", aliases: ["total bilirubin", "bilirubin total", "bilirubin (total)", "bilirubin"], unit: "mg/dL", refLow: 0.1, refHigh: 1.2, organs: ["liver"] },
  { id: "albumin", name: "Albumin", aliases: ["serum albumin", "albumin"], unit: "g/dL", refLow: 3.5, refHigh: 5.0, organs: ["liver"] },
  { id: "glucose_fasting", name: "Fasting glucose", aliases: ["fasting blood sugar", "fasting plasma glucose", "fasting glucose", "fbs", "glucose"], unit: "mg/dL", refLow: 70, refHigh: 99, organs: ["pancreas"] },
  { id: "hba1c", name: "HbA1c", aliases: ["glycated haemoglobin", "glycated hemoglobin", "hba1c"], unit: "%", refLow: 4.0, refHigh: 5.6, organs: ["pancreas"] },
  { id: "triglycerides", name: "Triglycerides", aliases: ["triglycerides", "triglyceride", "tg"], unit: "mg/dL", refHigh: 150, organs: ["heart"], criticalHigh: 1000 },
  { id: "calcium", name: "Calcium", aliases: ["serum calcium", "calcium"], unit: "mg/dL", refLow: 8.5, refHigh: 10.5, organs: ["pancreas", "kidneys"] },
  { id: "creatinine", name: "Creatinine", aliases: ["serum creatinine", "creatinine"], unit: "mg/dL", refLow: 0.7, refHigh: 1.3, organs: ["kidneys"] },
  { id: "egfr", name: "eGFR", aliases: ["egfr"], unit: "mL/min/1.73m²", refLow: 90, organs: ["kidneys"] },
  { id: "urea", name: "Blood urea", aliases: ["blood urea nitrogen", "blood urea", "bun", "urea"], unit: "mg/dL", refLow: 7, refHigh: 20, organs: ["kidneys"] },
  { id: "potassium", name: "Potassium", aliases: ["potassium", "k+"], unit: "mmol/L", refLow: 3.5, refHigh: 5.1, organs: ["kidneys", "heart"] },
  { id: "sodium", name: "Sodium", aliases: ["sodium", "na+"], unit: "mmol/L", refLow: 135, refHigh: 145, organs: ["kidneys"] },
  { id: "troponin", name: "Troponin I (hs)", aliases: ["hs troponin i", "troponin i", "troponin"], unit: "ng/L", refHigh: 34, organs: ["heart"], criticalHigh: 50 },
  { id: "hemoglobin", name: "Haemoglobin", aliases: ["haemoglobin", "hemoglobin", "hb"], unit: "g/dL", refLow: 13.5, refHigh: 17.5, organs: ["stomach", "duodenum"] },
  { id: "wbc", name: "White cell count", aliases: ["total white cell count", "white cell count", "wbc", "tlc"], unit: "×10⁹/L", refLow: 4.0, refHigh: 11.0, organs: [] },
  { id: "crp", name: "CRP", aliases: ["c-reactive protein", "c reactive protein", "crp"], unit: "mg/L", refHigh: 5, organs: [] },
  { id: "hpylori", name: "H. pylori stool antigen", aliases: ["h. pylori stool antigen", "h pylori stool antigen", "h. pylori", "h pylori", "helicobacter pylori"], unit: "", organs: ["stomach", "duodenum"], qualitative: true },
];

/** Aliases flattened and sorted longest-first so "total bilirubin" beats "bilirubin". */
export const ALIAS_INDEX: { alias: string; entry: CatalogEntry }[] = CATALOG.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias, entry })),
).sort((a, b) => b.alias.length - a.alias.length);

export function catalogById(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}
