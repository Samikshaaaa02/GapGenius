import { Plug, Activity, ShieldCheck, Wifi } from "lucide-react";
import { useInventory } from "@/context/InventoryContext";
import { usePersona } from "@/context/PersonaContext";

/** VS Code-like status bar pinned to the bottom of the workspace. */
export function StatusBar() {
  const { active, activeState, totalRecoveredAcrossMonths } = useInventory();
  const { persona } = usePersona();

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-sidebar px-3 text-[11px] text-sidebar-foreground/80">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald" />
          </span>
          <Plug className="h-3 w-3" />
          Connected to Opera PMS
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Wifi className="h-3 w-3" />
          SiteMinder · Live
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          {persona.title.split(" · ")[0]}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Active month</span>
          <span className="font-medium text-foreground">{active.label}</span>
        </span>
        <span className="text-muted-foreground">
          Recovered{" "}
          <span className="font-semibold tabular-nums text-emerald">
            ${activeState.recovered.toLocaleString()}
          </span>
          <span className="ml-2 text-muted-foreground/70">
            (all months ${totalRecoveredAcrossMonths.toLocaleString()})
          </span>
        </span>
      </div>
    </footer>
  );
}
