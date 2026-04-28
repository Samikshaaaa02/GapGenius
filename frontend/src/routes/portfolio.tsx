import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersona } from "@/context/PersonaContext";
import { useInventory } from "@/context/InventoryContext";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { uploadBookingsCSV } from "@/api/client";
import type { UploadBooking, UploadOrphanGap } from "@/data/mockInventory";
import {
  CalendarDays,
  Upload,
  Download,
  Search,
  X,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Save,
} from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Booking Management · GapGenius" },
      { name: "description", content: "Booking records — room, guest, channel, dates and status." },
    ],
  }),
  component: BookingsView,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Booking {
  booking_id:  string;
  room_number: string;
  room_type:   string;
  check_in:    string;
  check_out:   string;
  channel:     string;
  guest_name:  string;
  rate:        number;
  status:      string;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_BOOKINGS: Booking[] = [];
const STORAGE_KEY = "gg:bookings";

function loadSavedBookings(): Booking[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch {
    return [];
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOM_TYPES = ["Standard King","Deluxe Queen","Deluxe King","Suite","Executive","Family Room","Penthouse"] as const;
const CHANNELS   = ["Direct","Booking.com","Expedia","GDS","Airbnb","Other"] as const;
const STATUSES   = ["confirmed","checked_in","pending","cancelled"] as const;

const bookingSchema = z.object({
  booking_id:  z.string().trim().min(1, "Booking ID is required").max(20),
  room_number: z.string().trim().min(1, "Room number is required").max(10),
  room_type:   z.string().trim().min(1, "Room type is required").max(50),
  check_in:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  check_out:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  channel:     z.string().trim().min(1, "Channel is required"),
  guest_name:  z.string().trim().min(1, "Guest name is required").max(100),
  rate:        z.coerce.number().min(0).max(100000),
  status:      z.enum(STATUSES),
});

type BookingForm = z.infer<typeof bookingSchema>;

const STATUS_STYLES: Record<string, string> = {
  confirmed:  "bg-emerald/15 text-emerald ring-1 ring-emerald/30",
  checked_in: "bg-primary/15 text-primary ring-1 ring-primary/30",
  pending:    "bg-amber/15 text-amber ring-1 ring-amber/30",
  cancelled:  "bg-rose/15 text-rose ring-1 ring-rose/30",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn), b = new Date(checkOut);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function parseBookingCSV(text: string): Booking[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  return lines.slice(1).flatMap((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const get  = (name: string) => cols[idx(name)] ?? "";
    const rateRaw = parseFloat(get("rate") || "0");
    if (!get("booking_id") && !get("room_number")) return [];
    return [{
      booking_id:  get("booking_id")  || get("booking id") || get("id") || `BK${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      room_number: get("room_number") || get("room_no")    || get("room_num") || get("room number") || get("roomnumber") || get("room#") || get("room id") || get("room"),
      room_type:   get("room_type")   || get("room type")  || get("type")     || "Standard King",
      check_in:    get("check_in")    || get("check in")   || get("checkin")  || get("check-in")   || get("arrival"),
      check_out:   get("check_out")   || get("check out")  || get("checkout") || get("check-out")  || get("departure"),
      channel:     get("channel")     || get("source")     || "Direct",
      guest_name:  get("guest_name")  || get("guest name") || get("guest")    || get("name")       || "—",
      rate:        isNaN(rateRaw) ? 0 : rateRaw,
      status:      get("status")      || "confirmed",
    }];
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

function BookingsView() {
  const { can } = usePersona();
  const { loadRealData } = useInventory();
  const [bookings,        setBookings]        = React.useState<Booking[]>(() => loadSavedBookings());
  const [pendingBookings, setPendingBookings] = React.useState<Booking[] | null>(null);
  const [lastOrphanGaps,  setLastOrphanGaps]  = React.useState<UploadOrphanGap[]>([]);
  const [query,         setQuery]         = React.useState("");
  const [editing,       setEditing]       = React.useState<Booking | null>(null);
  const [dialogOpen,    setDialogOpen]    = React.useState(false);

  // Keep InventoryContext in sync whenever saved bookings change
  React.useEffect(() => {
    if (bookings.length === 0) return;
    const upload: UploadBooking[] = bookings.map((b) => ({
      room_number: b.room_number,
      room_type:   b.room_type,
      check_in:    b.check_in,
      check_out:   b.check_out,
      rate:        b.rate,
      guest_name:  b.guest_name,
      status:      b.status,
    }));
    loadRealData(upload, lastOrphanGaps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);
  const [loading,       setLoading]       = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const saveToStorage = (data: Booking[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const commitPending = () => {
    if (!pendingBookings) return;
    const existingIds = new Set(bookings.map((b) => b.booking_id));
    const fresh = pendingBookings.filter((b) => !existingIds.has(b.booking_id));
    const merged = [...bookings, ...fresh];
    setBookings(merged);
    saveToStorage(merged);
    setPendingBookings(null);
    // Sync InventoryContext (and localStorage) with the now-complete booking list
    const uploadBookings: UploadBooking[] = merged.map((b) => ({
      room_number: b.room_number,
      room_type: b.room_type,
      check_in: b.check_in,
      check_out: b.check_out,
      rate: b.rate,
      guest_name: b.guest_name,
      status: b.status,
    }));
    loadRealData(uploadBookings, lastOrphanGaps);
    toast.success(`Saved ${fresh.length} booking${fresh.length !== 1 ? "s" : ""}`);
  };

  const discardPending = () => {
    setPendingBookings(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!can("viewPortfolio")) return <Navigate to="/unauthorized" />;

  const allDisplayed = React.useMemo(() => {
    if (!pendingBookings) return bookings;
    return [...bookings, ...pendingBookings];
  }, [bookings, pendingBookings]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allDisplayed;
    return allDisplayed.filter((b) =>
      b.booking_id.toLowerCase().includes(q)  ||
      b.guest_name.toLowerCase().includes(q)  ||
      b.room_number.includes(q)               ||
      b.room_type.toLowerCase().includes(q)   ||
      b.channel.toLowerCase().includes(q)     ||
      b.status.toLowerCase().includes(q),
    );
  }, [allDisplayed, query]);

  const pendingIds = React.useMemo(
    () => new Set(pendingBookings?.map((b) => b.booking_id) ?? []),
    [pendingBookings],
  );

  // Channel mix for summary chips
  const byChannel = React.useMemo(() => {
    const m = new Map<string, number>();
    bookings.forEach((b) => m.set(b.channel, (m.get(b.channel) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [bookings]);

  const openAdd  = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (b: Booking) => { setEditing(b); setDialogOpen(true); };
  const remove   = (id: string) => {
    setBookings((bs) => {
      const updated = bs.filter((b) => b.booking_id !== id);
      saveToStorage(updated);
      return updated;
    });
    toast.success("Booking removed");
  };

  const upsert = (data: BookingForm): boolean => {
    if (editing) {
      setBookings((bs) => {
        const updated = bs.map((b) => b.booking_id === editing.booking_id ? { ...b, ...data } : b);
        saveToStorage(updated);
        return updated;
      });
      toast.success(`Booking ${data.booking_id} updated`);
    } else {
      if (bookings.some((b) => b.booking_id === data.booking_id)) {
        toast.error(`Booking ID ${data.booking_id} already exists`);
        return false;
      }
      setBookings((bs) => {
        const updated = [...bs, data];
        saveToStorage(updated);
        return updated;
      });
      toast.success(`Booking ${data.booking_id} added`);
    }
    return true;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setLoading(true);
    try {
      const text   = await file.text();
      const parsed = parseBookingCSV(text);
      if (!parsed.length) {
        toast.error("No bookings found", { description: "Check your CSV format matches the template." });
        return;
      }
      const existingIds = new Set(bookings.map((b) => b.booking_id));
      const fresh   = parsed.filter((b) => !existingIds.has(b.booking_id));
      const skipped = parsed.length - fresh.length;

      if (fresh.length === 0) {
        toast.error("All rows already exist", { description: "No new bookings to import." });
        return;
      }

      setPendingBookings(fresh);
      toast.info(`${fresh.length} booking${fresh.length !== 1 ? "s" : ""} ready to save`, {
        description: skipped
          ? `${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped · review below then click Save`
          : "Review below then click Save",
      });

      // Sync with backend for orphan gap analysis; fall back to empty gaps if backend is down
      const uploadBookings: UploadBooking[] = parsed.map((b) => ({
        room_number: b.room_number,
        room_type: b.room_type,
        check_in: b.check_in,
        check_out: b.check_out,
        rate: b.rate,
        guest_name: b.guest_name,
        status: b.status,
      }));
      let orphanGaps: UploadOrphanGap[] = [];
      try {
        const resp = await uploadBookingsCSV(file, "Uploaded Property");
        if (resp.success && resp.orphan_gaps) {
          orphanGaps = resp.orphan_gaps as UploadOrphanGap[];
        }
      } catch {
        /* backend unavailable — heatmap shows bookings without orphan gap analysis */
      }
      setLastOrphanGaps(orphanGaps);
      loadRealData(uploadBookings, orphanGaps);
    } catch {
      toast.error("Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const rows = [
      "booking_id,room_number,room_type,check_in,check_out,channel,guest_name,rate,status",
      "BK001,101,Standard King,2026-05-01,2026-05-03,Direct,Jane Smith,219,confirmed",
      "BK002,101,Standard King,2026-05-05,2026-05-08,Booking.com,John Doe,235,confirmed",
      "BK003,102,Deluxe Queen,2026-05-02,2026-05-04,Expedia,Alice Brown,265,confirmed",
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "gapgenius-bookings-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/30 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Booking Management</h1>
            <p className="text-xs text-muted-foreground">
              {bookings.length} bookings · Add, edit or bulk-import records
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Template
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
          >
            {loading
              ? <><FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 animate-pulse" />Reading…</>
              : <><Upload className="mr-1.5 h-3.5 w-3.5" />Import Bookings CSV</>}
          </Button>
          <Button
            size="sm"
            onClick={openAdd}
            className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:from-primary hover:to-primary/80"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Booking
          </Button>
        </div>
      </header>

      {/* Channel mix chips */}
      {byChannel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-5 py-2.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Channel mix
          </span>
          {byChannel.map(([channel, count]) => (
            <Badge
              key={channel}
              variant="secondary"
              className="bg-secondary/60 text-[11px] font-medium"
            >
              {channel} · {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Search + table */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by guest, room, channel, status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card/40">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-[100px]">Booking ID</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead className="w-[105px]">Check-in</TableHead>
                <TableHead className="w-[105px]">Check-out</TableHead>
                <TableHead className="w-[60px] text-right">Nights</TableHead>
                <TableHead className="w-[120px]">Channel</TableHead>
                <TableHead className="w-[100px] text-right">Rate/Night</TableHead>
                <TableHead className="w-[100px] text-right">Total</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[90px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-12 text-center">
                    <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <div className="text-sm font-medium">No bookings found</div>
                    <div className="text-xs text-muted-foreground">
                      Try a different search, add a booking, or import a CSV.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((b) => {
                  const nights = nightsBetween(b.check_in, b.check_out);
                  const isPending = pendingIds.has(b.booking_id);
                  return (
                    <TableRow key={b.booking_id} className={`text-sm ${isPending ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {b.booking_id}
                        {isPending && (
                          <span className="ml-1.5 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                            new
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{b.guest_name}</TableCell>
                      <TableCell>
                        <div className="font-semibold tabular-nums">{b.room_number}</div>
                        <div className="text-xs text-muted-foreground">{b.room_type}</div>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{b.check_in}</TableCell>
                      <TableCell className="tabular-nums text-xs">{b.check_out}</TableCell>
                      <TableCell className="text-right tabular-nums">{nights}</TableCell>
                      <TableCell><ChannelBadge channel={b.channel} /></TableCell>
                      <TableCell className="text-right tabular-nums">${b.rate}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        ${(b.rate * nights).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium capitalize ${STATUS_STYLES[b.status] ?? "bg-muted text-muted-foreground ring-1 ring-border"}`}
                        >
                          {b.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isPending && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(b)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-rose hover:bg-rose/10 hover:text-rose"
                              onClick={() => remove(b.booking_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Save / Discard bar — shown only when there are pending (unsaved) rows */}
        {pendingBookings && pendingBookings.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold text-primary">{pendingBookings.length} new booking{pendingBookings.length !== 1 ? "s" : ""}</span>
              {" "}imported from CSV — save to keep them.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discardPending}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={commitPending}
                className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:from-primary hover:to-primary/80"
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save {pendingBookings.length} Booking{pendingBookings.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
      </div>

      <BookingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSubmit={upsert}
      />
    </div>
  );
}

// ── Booking Dialog ────────────────────────────────────────────────────────────

function BookingDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Booking | null;
  onSubmit: (data: BookingForm) => boolean;
}) {
  const blank = {
    booking_id:  "",
    room_number: "",
    room_type:   ROOM_TYPES[0] as string,
    check_in:    "",
    check_out:   "",
    channel:     CHANNELS[0] as string,
    guest_name:  "",
    rate:        "0",
    status:      "confirmed" as typeof STATUSES[number],
  };

  const [form,   setForm]   = React.useState(blank);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setErrors({});
      setForm(editing
        ? { ...editing, rate: String(editing.rate), status: editing.status as typeof STATUSES[number] }
        : blank
      );
    }
  }, [open, editing]);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = bookingSchema.safeParse({ ...form });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    if (onSubmit(result.data)) onOpenChange(false);
  };

  const f = (id: keyof typeof form, label: string, node: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {node}
      {errors[id] && <p className="text-[11px] text-rose">{errors[id]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Booking ${editing.booking_id}` : "Add new booking"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the booking details below. Changes save immediately."
              : "Fill in the booking details. Records update instantly."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          {f("booking_id", "Booking ID *",
            <Input id="booking_id" value={form.booking_id}
              onChange={(e) => set("booking_id", e.target.value)}
              placeholder="e.g. BK016" maxLength={20} disabled={!!editing} />
          )}
          {f("guest_name", "Guest name *",
            <Input id="guest_name" value={form.guest_name}
              onChange={(e) => set("guest_name", e.target.value)}
              placeholder="e.g. Jane Smith" maxLength={100} />
          )}
          {f("room_number", "Room number *",
            <Input id="room_number" value={form.room_number}
              onChange={(e) => set("room_number", e.target.value)}
              placeholder="e.g. 101" maxLength={10} />
          )}
          {f("room_type", "Room type *",
            <Select value={form.room_type} onValueChange={(v) => set("room_type", v)}>
              <SelectTrigger id="room_type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {f("check_in", "Check-in *",
            <Input id="check_in" value={form.check_in}
              onChange={(e) => set("check_in", e.target.value)}
              placeholder="YYYY-MM-DD" maxLength={10} />
          )}
          {f("check_out", "Check-out *",
            <Input id="check_out" value={form.check_out}
              onChange={(e) => set("check_out", e.target.value)}
              placeholder="YYYY-MM-DD" maxLength={10} />
          )}
          {f("channel", "Channel *",
            <Select value={form.channel} onValueChange={(v) => set("channel", v)}>
              <SelectTrigger id="channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {f("rate", "Rate / night ($) *",
            <Input id="rate" type="number" min={0} step={1} value={form.rate}
              onChange={(e) => set("rate", e.target.value)} />
          )}
          {f("status", "Status *",
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          )}

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:from-primary hover:to-primary/80"
            >
              {editing ? "Save changes" : "Add booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const c = channel.toLowerCase();
  const cls =
    c.includes("direct")   ? "bg-emerald/15 text-emerald border-emerald/25" :
    c.includes("booking")  ? "bg-primary/15 text-primary border-primary/25" :
    c.includes("expedia")  ? "bg-amber/15 text-amber border-amber/25"       :
    c.includes("gds")      ? "bg-rose/15 text-rose border-rose/25"          :
                             "bg-muted/40 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${cls}`}>
      {channel}
    </span>
  );
}
