import * as React from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { RouteTransition } from "@/components/RouteTransition";

import appCss from "../styles.css?url";
import { ActivityRail } from "@/components/ActivityRail";
import { CopilotPanel } from "@/components/CopilotPanel";
import { StatusBar } from "@/components/StatusBar";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { InventoryProvider } from "@/context/InventoryContext";
import { PersonaProvider } from "@/context/PersonaContext";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { RoomNight } from "@/data/mockInventory";
import type { AIRecommendation } from "@/api/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GapGenius · Hotel Revenue Intelligence" },
      {
        name: "description",
        content:
          "IDE-style hotel revenue workspace with an integrated AI Copilot. Recover orphan nights, channel blockages and shoulder leakage in one click.",
      },
      { property: "og:title", content: "GapGenius · Hotel Revenue Intelligence" },
      {
        property: "og:description",
        content: "AI-integrated revenue workspace for hotel managers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Persists across navigations; resets only on full page reload.
let _rootMounted = false;

function RootComponent() {
  const [bootDone, setBootDone] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setBootDone(true), 3000);
    return () => window.clearTimeout(t);
  }, []);

  const [copilotOpen, setCopilotOpen] = React.useState(false);
  const [selectedCell, setSelectedCell] = React.useState<RoomNight | null>(null);
  const [aiRecs, setAiRecs] = React.useState<AIRecommendation[]>([]);
  React.useEffect(() => {
    const onSelect = (e: Event) => {
      const ce = e as CustomEvent<RoomNight>;
      setSelectedCell(ce.detail);
    };
    const onOpen = () => setCopilotOpen(true);
    const onAiRecs = (e: Event) => {
      const ce = e as CustomEvent<AIRecommendation[]>;
      setAiRecs(ce.detail);
      setCopilotOpen(true);
    };
    window.addEventListener("copilot:select-cell", onSelect as EventListener);
    window.addEventListener("copilot:open", onOpen);
    window.addEventListener("copilot:ai-recommendations", onAiRecs as EventListener);
    return () => {
      window.removeEventListener("copilot:select-cell", onSelect as EventListener);
      window.removeEventListener("copilot:open", onOpen);
      window.removeEventListener("copilot:ai-recommendations", onAiRecs as EventListener);
    };
  }, []);

  return (
    <PersonaProvider>
      <InventoryProvider>
        <div className="flex h-screen w-full flex-col bg-background text-foreground">
          {/* Top: rail + main + copilot */}
          <div className="flex min-h-0 flex-1">
            <ActivityRail />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              <PersonaTopBar />
              <div className={cn("min-h-0 flex-1 overflow-y-auto", !bootDone && "invisible")}>
                <Outlet />
              </div>
            </main>
            <CopilotPanel
              open={copilotOpen}
              onClose={() => setCopilotOpen(false)}
              selectedCell={selectedCell}
              onClearCell={() => setSelectedCell(null)}
              aiRecommendations={aiRecs}
              onClearRecommendations={() => setAiRecs([])}
            />
          </div>
          <StatusBar />

          {/* Salesforce Agentforce-style floating Copilot launcher pinned to the right edge */}
          {!copilotOpen && (
            <button
              onClick={() => setCopilotOpen(true)}
              aria-label="Open GapGenius Copilot"
              className={cn(
                "group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full",
                "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
                "shadow-[0_10px_40px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)]",
                "ring-2 ring-primary/30 transition-all hover:scale-110 hover:ring-primary/60",
              )}
            >
              <span className="absolute inset-0 animate-pulse-glow rounded-full" />
              <Bot className="relative h-6 w-6" />
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald ring-2 ring-background" />
              </span>
              <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Ask GapGenius
              </span>
            </button>
          )}

          <RouteTransition triggerKey={1} />
          <Toaster theme="dark" position="bottom-right" />
        </div>
      </InventoryProvider>
    </PersonaProvider>
  );
}

function PersonaTopBar() {
  return (
    <div className="flex h-10 items-center justify-end border-b border-border bg-sidebar/80 px-3">
      <PersonaSwitcher />
    </div>
  );
}
