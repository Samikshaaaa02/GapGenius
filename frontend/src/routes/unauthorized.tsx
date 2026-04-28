import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { usePersona } from "@/context/PersonaContext";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Access restricted · Revenue Copilot" },
      { name: "description", content: "This page requires a different role." },
    ],
  }),
  component: UnauthorizedView,
});

function UnauthorizedView() {
  const { persona } = usePersona();
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber/15 ring-1 ring-amber/30">
          <ShieldAlert className="h-6 w-6 text-amber" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in as{" "}
          <span className="font-medium text-foreground">{persona.name}</span> ({persona.title}).
          This area requires elevated permissions.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Switch persona in the sidebar to continue the demo, or return to your dashboard.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
