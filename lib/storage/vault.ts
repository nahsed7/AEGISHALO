"use client";

import { createStore, del, entries, set } from "idb-keyval";
import type { StoredRecord } from "@/types/health";

/** Local-only vault. Records include the redaction vault (PII) and never sync as-is. */
const store = typeof indexedDB !== "undefined" ? createStore("aegisholo-vault", "records") : undefined;

export async function saveRecord(r: StoredRecord) {
  if (store) await set(r.id, r, store);
}

export async function loadRecords(): Promise<StoredRecord[]> {
  if (!store) return [];
  const all = await entries<string, StoredRecord>(store);
  return all.map(([, v]) => v).sort((a, b) => (a.profile.report.collectedOn ?? a.createdAt).localeCompare(b.profile.report.collectedOn ?? b.createdAt));
}

export async function deleteRecord(id: string) {
  if (store) await del(id, store);
}
