import type { HealthProfileJSON } from "@/types/health";

function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProfileJson(p: HealthProfileJSON) {
  download("health_profile.json", JSON.stringify(p, null, 2), "application/json");
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportProfileCsv(profiles: HealthProfileJSON[]) {
  const header = ["profile_id", "collected_on", "biomarker_id", "name", "value", "unit", "ref_low", "ref_high", "flag", "ratio_to_uln", "provenance"];
  const rows = profiles.flatMap((p) =>
    p.biomarkers.map((b) => [p.profileId, p.report.collectedOn, b.id, b.name, b.value, b.unit, b.refLow, b.refHigh, b.flag, b.ratioToUln, b.provenance]),
  );
  download("health_profile.csv", [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
}
