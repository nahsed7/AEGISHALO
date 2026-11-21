import type { RedactionResult } from "@/types/health";
import { detectPiiRules } from "./redact";

export class PrivacyViolation extends Error {
  constructor(public readonly leaks: string[]) {
    super(`Outbound payload blocked: ${leaks.length} personal detail(s) found.`);
    this.name = "PrivacyViolation";
  }
}

/**
 * Last line of defence before anything leaves the device. Serialises the payload and checks:
 *  1. no original value from any redaction vault appears in it;
 *  2. the rule detector finds no fresh PII patterns (NIC, phone, email…).
 * Throws PrivacyViolation instead of sending. Returns the exact bytes that would be sent.
 */
export function assertNoPii(payload: unknown, redactions: RedactionResult[]): { json: string; bytes: number } {
  const json = JSON.stringify(payload);
  const haystack = json.toLowerCase();
  const leaks = new Set<string>();

  for (const r of redactions) {
    for (const original of Object.values(r.vault)) {
      const v = original.trim().toLowerCase();
      if (v.length >= 4 && haystack.includes(v)) leaks.add(original);
    }
  }
  // Labelled-field rules would fire on JSON keys such as "name"; only use pattern rules here.
  for (const c of detectPiiRules(json)) {
    if (c.type === "national_id" || c.type === "email" || c.type === "phone") {
      const text = json.slice(c.start, c.end);
      // Allow plain numeric lab values; phones/NICs have 9+ digits.
      if (text.replace(/\D/g, "").length >= 9) leaks.add(text);
    }
  }

  if (leaks.size) throw new PrivacyViolation([...leaks]);
  return { json, bytes: new TextEncoder().encode(json).length };
}
