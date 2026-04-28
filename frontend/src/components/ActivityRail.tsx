import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  MessageSquare,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Booking", icon: CalendarDays },
  { to: "/rooms", label: "Room Management", icon: BedDouble },
  { to: "/feedback", label: "Feedback", icon: MessageSquare },
] as const;

/** Minimalist VS Code-style icon rail (left side, ~56px). */
export function ActivityRail() {
  const location = useLocation();

  return (
    <TooltipProvider delayDuration={150}>
      <aside className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-border bg-sidebar py-3">
        <div className="flex flex-col items-center gap-2">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="h-4 w-4" />
          </div>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.to}
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/65 transition-colors hover:text-sidebar-foreground",
                      active && "text-sidebar-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                    )}
                    <Icon className="h-[18px] w-[18px]" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/settings"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/65 transition-colors hover:text-sidebar-foreground",
                  location.pathname === "/settings" && "text-sidebar-foreground",
                )}
              >
                <SettingsIcon className="h-[18px] w-[18px]" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">AI Settings</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
