import { ChevronsUpDown, Eye, Wrench, Building2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERSONAS, usePersona, type PersonaRole } from "@/context/PersonaContext";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ROLE_ICON = {
  front_desk: Eye,
  property_manager: Wrench,
  portfolio_admin: Building2,
} as const;

const ROLE_DESCRIPTION: Record<PersonaRole, string> = {
  front_desk: "Read-only · view inventory",
  property_manager: "Apply fixes for this property",
  portfolio_admin: "Multi-property + settings",
};

export function PersonaSwitcher() {
  const { persona, role, setRole } = usePersona();
  const navigate = useNavigate();
  const location = useLocation();
  const Icon = ROLE_ICON[role];

  const handleSelect = (next: PersonaRole) => {
    setRole(next);
    const newPerms = PERSONAS[next].permissions;
    // Redirect away from pages the new persona can't access
    if (location.pathname === "/portfolio" && !newPerms.viewPortfolio) {
      navigate({ to: "/" });
    } else if (location.pathname === "/settings" && !newPerms.viewSettings) {
      navigate({ to: "/" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2 py-1 text-left transition-colors hover:bg-card">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary ring-1 ring-primary/30">
          {persona.initials}
        </div>
        <div className="hidden min-w-0 leading-tight sm:block">
          <div className="truncate text-[11px] font-semibold">{persona.name}</div>
          <div className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
            <Icon className="h-2.5 w-2.5" />
            {persona.title}
          </div>
        </div>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Switch persona (demo)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(PERSONAS) as PersonaRole[]).map((r) => {
          const p = PERSONAS[r];
          const RIcon = ROLE_ICON[r];
          const active = r === role;
          return (
            <DropdownMenuItem
              key={r}
              onSelect={() => handleSelect(r)}
              className="flex items-start gap-2.5 py-2"
            >
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
                  active
                    ? "bg-primary/15 text-primary ring-primary/40"
                    : "bg-muted text-muted-foreground ring-border",
                )}
              >
                <RIcon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {p.name}
                  {active && <Check className="h-3 w-3 text-primary" />}
                </div>
                <div className="text-[10px] text-muted-foreground">{ROLE_DESCRIPTION[r]}</div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
