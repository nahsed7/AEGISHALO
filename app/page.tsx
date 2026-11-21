"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useAegis } from "@/store/useAegis";
import { Header } from "@/components/hud/Header";
import { AiLedger } from "@/components/hud/AiLedger";
import { VaultPanel } from "@/components/vault/VaultPanel";
import { HoloStage } from "@/components/holo/HoloStage";
import { SimulatorPanel } from "@/components/simulator/SimulatorPanel";
import { TimelineBar } from "@/components/timeline/TimelineBar";

function ErrorToast() {
  const error = useAegis((s) => s.error);
  const dismiss = useAegis((s) => s.dismissError);
  if (!error) return null;
  return (
    <div role="alert" className="fixed bottom-4 left-1/2 z-50 flex w-[min(520px,calc(100%-32px))] -translate-x-1/2 items-start gap-3 rounded-[12px] border border-[var(--hud-crimson)] bg-[rgba(30,6,8,0.95)] p-3 text-[13px] text-[#ffd6d2] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.8)]">
      <p className="flex-1">{error}</p>
      <button aria-label="Dismiss" className="text-[#ffb3ad]" onClick={dismiss}>
        <X size={15} />
      </button>
    </div>
  );
}

export default function Home() {
  const init = useAegis((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex min-h-dvh flex-col gap-3 pb-3 lg:h-dvh">
      <div className="boot-fade">
        <Header />
      </div>
      <main className="relative grid min-h-0 flex-1 overflow-x-clip grid-cols-1 gap-3 px-3 lg:grid-cols-[300px_minmax(0,1fr)_340px] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="boot-left order-2 min-h-0 lg:order-1 max-lg:max-h-[70vh]">
          <VaultPanel />
        </div>
        <div className="boot-lead order-1 flex min-h-[62vh] flex-col lg:order-2 lg:min-h-0">
          <HoloStage />
        </div>
        <div className="boot-right order-3 min-h-0 max-lg:max-h-[80vh]">
          <SimulatorPanel />
        </div>
        <AiLedger />
      </main>
      <div className="boot-rise px-3">
        <TimelineBar />
      </div>
      <ErrorToast />
    </div>
  );
}
