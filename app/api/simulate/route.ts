import { NextResponse } from "next/server";
import { runSimulation } from "@/lib/ai/simulationEngine";
import { assertNoPii } from "@/lib/privacy/guard";
import type { SimulationRequest } from "@/types/health";

/**
 * Deterministic What-If engine. Receives only the anonymised profile (the client guard has
 * already checked it; we check again server-side) and returns geometry, projections and
 * curated explanations. Generative, grounded research runs through Firebase AI Logic in the
 * client so App Check and the hybrid on-device/cloud routing apply.
 */
export async function POST(req: Request) {
  let body: SimulationRequest;
  try {
    body = (await req.json()) as SimulationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.profile?.biomarkers || !Array.isArray(body.symptoms) || !body.scenario) {
    return NextResponse.json({ error: "Expected { profile, symptoms, scenario }" }, { status: 400 });
  }
  try {
    assertNoPii(body, []);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json(runSimulation(body));
}
