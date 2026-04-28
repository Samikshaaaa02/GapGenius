import * as React from "react";
import { Building2, Check, ChevronsUpDown, Hotel } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface HotelOption {
  id: string;
  name: string;
  city: string;
  rooms: number;
}

export const HOTELS: HotelOption[] = [
  { id: "downtown", name: "Downtown Tower", city: "New York", rooms: 248 },
  { id: "airport", name: "Airport Suites", city: "Chicago", rooms: 184 },
  { id: "beachfront", name: "Beachfront Resort", city: "Miami", rooms: 312 },
];

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function HotelSelector({ value, onChange }: Props) {
  const active = HOTELS.find((h) => h.id === value) ?? HOTELS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-left transition-all",
          "hover:border-primary/40 hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        {/* Logo placeholder */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/30 to-primary/10 text-primary ring-1 ring-primary/40">
          <Hotel className="h-4 w-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Building2 className="h-2.5 w-2.5" />
            Property
          </div>
          <div className="truncate text-[13px] font-semibold">{active.name}</div>
        </div>
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-72">
        <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Switch property
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {HOTELS.map((h) => {
          const selected = h.id === value;
          return (
            <DropdownMenuItem
              key={h.id}
              onSelect={() => onChange(h.id)}
              className="flex items-center gap-2.5 py-2"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1",
                  selected
                    ? "bg-primary/15 text-primary ring-primary/40"
                    : "bg-muted text-muted-foreground ring-border",
                )}
              >
                <Hotel className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                  {h.name}
                  {selected && <Check className="h-3 w-3 text-primary" />}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {h.city} · {h.rooms} rooms
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
