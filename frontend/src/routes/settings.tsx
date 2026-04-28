import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plug, ShieldCheck, BellRing, GitBranch, CheckCircle2, Bot, Eye, EyeOff, CheckCircle } from "lucide-react";
import { usePersona } from "@/context/PersonaContext";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { updateLlmConfig } from "@/api/client";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · AI Hotel Revenue Copilot" },
      {
        name: "description",
        content: "Product readiness toggles, PMS integrations, and AI auto-fix thresholds.",
      },
      { property: "og:title", content: "Settings · Revenue Copilot" },
      {
        property: "og:description",
        content: "Configure auto-apply rules, GM notifications, and PMS connections.",
      },
    ],
  }),
  component: SettingsView,
});

function SettingsView() {
  const { can } = usePersona();
  const [autoFix, setAutoFix] = React.useState(true);
  const [notify, setNotify] = React.useState(true);
  const [parity, setParity] = React.useState(true);
  const [minImpact, setMinImpact] = React.useState([200]);
  const [maxMinStayDrop, setMaxMinStayDrop] = React.useState([2]);

  if (!can("viewSettings")) return <Navigate to="/unauthorized" />;

  return (
    <div className="flex-1 p-6 lg:p-8">
      <header className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Product Readiness
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings & integrations</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Configure how aggressively the AI applies fixes and which systems it talks to.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-sm font-semibold">Automation</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Define what the AI is allowed to do without human review.
          </p>

          <div className="mt-5 space-y-5">
            <ToggleRow
              icon={<ShieldCheck className="h-4 w-4 text-emerald" />}
              title="Auto-apply safe fixes"
              description="Apply lower-min-stay and shoulder-date opens automatically."
              checked={autoFix}
              onChange={setAutoFix}
            />
            <ToggleRow
              icon={<BellRing className="h-4 w-4 text-primary" />}
              title="Notify GM on high-impact fixes"
              description="Email GM when a fix recovers more than the threshold below."
              checked={notify}
              onChange={setNotify}
            />
            <ToggleRow
              icon={<GitBranch className="h-4 w-4 text-primary" />}
              title="Respect rate parity rules"
              description="Never lower rates below contracted OTA parity floor."
              checked={parity}
              onChange={setParity}
            />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold">Thresholds</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Guardrails for the optimization engine.
          </p>

          <div className="mt-5 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Min revenue impact to auto-fix</Label>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  ${minImpact[0]}
                </span>
              </div>
              <Slider
                value={minImpact}
                onValueChange={setMinImpact}
                min={50}
                max={1000}
                step={25}
                className="mt-3"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Max min-stay reduction</Label>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  −{maxMinStayDrop[0]} nights
                </span>
              </div>
              <Slider
                value={maxMinStayDrop}
                onValueChange={setMaxMinStayDrop}
                min={1}
                max={4}
                step={1}
                className="mt-3"
              />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6">
          <LlmConfigCard />
        </Card>

        <Card className="lg:col-span-2 p-6">
          <h2 className="text-sm font-semibold">Connections</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Property management, channel managers, and revenue systems.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ConnectionCard name="Opera PMS" status="Connected" sync="2 min ago" />
            <ConnectionCard name="SiteMinder Channel Manager" status="Connected" sync="6 min ago" />
            <ConnectionCard name="Revenue Management System" status="Available" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const PROVIDERS = [
  { id: "claude",   label: "Claude",   defaultModel: "claude-sonnet-4-5",  keyLabel: "Anthropic API Key",  keyPlaceholder: "sk-ant-…" },
  { id: "openai",   label: "OpenAI",   defaultModel: "gpt-4.1-nano",       keyLabel: "OpenAI API Key",     keyPlaceholder: "sk-…" },
  { id: "gemini",   label: "Gemini",   defaultModel: "gemini-1.5-pro",     keyLabel: "Google API Key",     keyPlaceholder: "AIza…" },
  { id: "minimax",  label: "MiniMax",  defaultModel: "MiniMax-M2.7",       keyLabel: "MiniMax API Key",    keyPlaceholder: "your-minimax-key" },
] as const;

function LlmConfigCard() {
  const [provider, setProvider] = React.useState("claude");
  const [model, setModel] = React.useState("claude-sonnet-4-5");
  const [apiKey, setApiKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const active = PROVIDERS.find((p) => p.id === provider)!;

  const handleProviderChange = (id: string) => {
    const p = PROVIDERS.find((p) => p.id === id)!;
    setProvider(id);
    setModel(p.defaultModel);
    setApiKey("");
    setSaved(false);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    setSaving(true);
    try {
      await updateLlmConfig({ provider, model, api_key: apiKey });
      setSaved(true);
      toast.success(`Switched to ${active.label} · ${model}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not reach backend");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Bot className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">AI / LLM Configuration</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Select the provider, model, and API key used by the copilot. Changes take effect immediately without restarting.
      </p>

      {/* Provider tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => handleProviderChange(p.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all border ${
              provider === p.id
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Model */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Model</Label>
          <Input
            value={model}
            onChange={(e) => { setModel(e.target.value); setSaved(false); }}
            placeholder={active.defaultModel}
            className="h-9 text-sm font-mono"
          />
          <p className="text-[11px] text-muted-foreground">Default: {active.defaultModel}</p>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{active.keyLabel}</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
              placeholder={active.keyPlaceholder}
              className="h-9 text-sm font-mono pr-9"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save & Apply"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald">
            <CheckCircle className="h-3.5 w-3.5" />
            Applied
          </span>
        )}
      </div>
    </div>
  );
}

function ConnectionCard({
  name,
  status,
  sync,
}: {
  name: string;
  status: "Connected" | "Available";
  sync?: string;
}) {
  const isConnected = status === "Connected";
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Plug className={`h-4 w-4 ${isConnected ? "text-emerald" : "text-muted-foreground"}`} />
        <div className="font-medium text-sm">{name}</div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {isConnected ? (
          <Badge className="bg-emerald/15 text-emerald hover:bg-emerald/20">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Connected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Available
          </Badge>
        )}
        {sync && (
          <span className="text-[11px] text-muted-foreground">Last sync {sync}</span>
        )}
      </div>
    </div>
  );
}
