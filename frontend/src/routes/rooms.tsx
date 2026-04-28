import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { uploadRoomsCSV } from "@/api/client";
import {
  BedDouble,
  Plus,
  Upload,
  Pencil,
  Trash2,
  Search,
  FileSpreadsheet,
  Download,
  Save,
  X,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Room Management · GapGenius" },
      {
        name: "description",
        content:
          "Manage room types, inventory and rate plans. Add rooms manually or upload a CSV / Excel sheet.",
      },
    ],
  }),
  component: RoomsPage,
});

const ROOM_TYPES = [
  "Standard King",
  "Deluxe Queen",
  "Deluxe King",
  "Suite",
  "Executive Suite",
  "Family Room",
  "Penthouse",
] as const;

type RoomType = (typeof ROOM_TYPES)[number];
type RoomStatus = "active" | "maintenance" | "inactive";

interface Room {
  id: string;
  number: string;
  type: RoomType | string;
  floor: number;
  capacity: number;
  rate: number;
  status: RoomStatus;
  notes?: string;
}

const SEED_ROOMS: Room[] = [];
const STORAGE_KEY = "gg:rooms";

function loadSavedRooms(): Room[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Room[]) : [];
  } catch {
    return [];
  }
}

const roomSchema = z.object({
  number: z.string().trim().min(1, "Room number is required").max(10),
  type: z.string().trim().min(1, "Type is required").max(50),
  floor: z.coerce.number().int().min(0).max(200),
  capacity: z.coerce.number().int().min(1).max(20),
  rate: z.coerce.number().min(0).max(100000),
  status: z.enum(["active", "maintenance", "inactive"]),
  notes: z.string().max(300).optional(),
});

type RoomForm = z.infer<typeof roomSchema>;

const STATUS_STYLES: Record<RoomStatus, string> = {
  active: "bg-emerald/15 text-emerald ring-1 ring-emerald/30",
  maintenance: "bg-amber/15 text-amber ring-1 ring-amber/30",
  inactive: "bg-muted text-muted-foreground ring-1 ring-border",
};

function RoomsPage() {
  const [rooms, setRooms] = React.useState<Room[]>(() => loadSavedRooms());
  const [pendingRooms, setPendingRooms] = React.useState<Room[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<Room | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const saveToStorage = (data: Room[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const commitPending = () => {
    if (!pendingRooms) return;
    const merged = [...rooms];
    const existingNumbers = new Set(rooms.map((r) => r.number));
    const fresh = pendingRooms.filter((r) => !existingNumbers.has(r.number));
    merged.push(...fresh);
    setRooms(merged);
    saveToStorage(merged);
    setPendingRooms(null);
    toast.success(`Saved ${fresh.length} room${fresh.length !== 1 ? "s" : ""}`);
  };

  const discardPending = () => {
    setPendingRooms(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const allDisplayed = React.useMemo(() => {
    if (!pendingRooms) return rooms;
    return [...rooms, ...pendingRooms];
  }, [rooms, pendingRooms]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allDisplayed;
    return allDisplayed.filter(
      (r) =>
        r.number.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [allDisplayed, query]);

  const pendingIds = React.useMemo(
    () => new Set(pendingRooms?.map((r) => r.id) ?? []),
    [pendingRooms],
  );

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (room: Room) => {
    setEditing(room);
    setDialogOpen(true);
  };
  const removeRoom = (id: string) => {
    setRooms((r) => {
      const updated = r.filter((x) => x.id !== id);
      saveToStorage(updated);
      return updated;
    });
    toast.success("Room removed");
  };

  const upsertRoom = (data: RoomForm) => {
    if (editing) {
      setRooms((rs) => {
        const updated = rs.map((r) => (r.id === editing.id ? { ...editing, ...data } : r));
        saveToStorage(updated);
        return updated;
      });
      toast.success(`Room ${data.number} updated`);
    } else {
      if (rooms.some((r) => r.number === data.number)) {
        toast.error(`Room ${data.number} already exists`);
        return false;
      }
      setRooms((rs) => {
        const updated = [...rs, { id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data }];
        saveToStorage(updated);
        return updated;
      });
      toast.success(`Room ${data.number} added`);
    }
    return true;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large", { description: "Max 10MB." });
      return;
    }

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const parsed: Room[] = [];
      const errors: string[] = [];
      rows.forEach((row, idx) => {
        try {
          const normalized = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]),
          );
          const candidate = {
            number: String(normalized.number ?? normalized["room number"] ?? "").trim(),
            type: String(normalized.type ?? normalized["room type"] ?? "Standard King").trim(),
            floor: Number(normalized.floor ?? 1),
            capacity: Number(normalized.capacity ?? 2),
            rate: Number(normalized.rate ?? normalized.price ?? 0),
            status: String(normalized.status ?? "active").trim().toLowerCase() as RoomStatus,
            notes: normalized.notes ? String(normalized.notes) : undefined,
          };
          const safe = roomSchema.parse(candidate);
          parsed.push({
            id: `r-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            ...safe,
          });
        } catch (err) {
          errors.push(`Row ${idx + 2}: ${(err as Error).message.split("\n")[0]}`);
        }
      });

      if (parsed.length === 0) {
        toast.error("No valid rows", {
          description: errors[0] ?? "Check the column headers (number, type, floor, capacity, rate, status).",
        });
        return;
      }

      const existingNumbers = new Set(rooms.map((r) => r.number));
      const fresh = parsed.filter((r) => !existingNumbers.has(r.number));
      const skipped = parsed.length - fresh.length;
      if (fresh.length === 0) {
        toast.error("All rows already exist", { description: "No new rooms to import." });
        return;
      }
      setPendingRooms(fresh);
      toast.info(`${fresh.length} room${fresh.length !== 1 ? "s" : ""} ready to save`, {
        description: skipped
          ? `${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped · review below then click Save`
          : "Review below then click Save",
      });

      // Silently sync CSV to backend for gap analysis (fails gracefully if backend is down)
      if (file.name.endsWith(".csv")) {
        uploadRoomsCSV(file).catch(() => {});
      }
    } catch (err) {
      toast.error("Import failed", { description: (err as Error).message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const sample = [
      { number: "401", type: "Deluxe King", floor: 4, capacity: 2, rate: 279, status: "active", notes: "" },
      { number: "402", type: "Suite", floor: 4, capacity: 3, rate: 419, status: "active", notes: "" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rooms");
    XLSX.writeFile(wb, "gapgenius-rooms-template.xlsx");
  };

  // Aggregate by type for summary chips
  const byType = React.useMemo(() => {
    const m = new Map<string, number>();
    rooms.forEach((r) => m.set(r.type, (m.get(r.type) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rooms]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/30 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <BedDouble className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Room Management</h1>
            <p className="text-xs text-muted-foreground">
              {rooms.length} rooms · Add, edit or bulk-import inventory
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
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import CSV / Excel
          </Button>
          <Button
            size="sm"
            onClick={openAdd}
            className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:from-primary hover:to-primary/80"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Room
          </Button>
        </div>
      </header>

      {/* Summary chips */}
      {byType.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-5 py-2.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Inventory mix
          </span>
          {byType.map(([type, count]) => (
            <Badge
              key={type}
              variant="secondary"
              className="bg-secondary/60 text-[11px] font-medium"
            >
              {type} · {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Search + table */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by room number, type or status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card/40">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-[110px]">Room #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-[80px]">Floor</TableHead>
                <TableHead className="w-[100px]">Capacity</TableHead>
                <TableHead className="w-[120px]">Rate / night</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <div className="text-sm font-medium">No rooms found</div>
                    <div className="text-xs text-muted-foreground">
                      Try a different search, add a room, or import a spreadsheet.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((room) => {
                  const isPending = pendingIds.has(room.id);
                  return (
                    <TableRow
                      key={room.id}
                      className={isPending ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}
                    >
                      <TableCell className="font-semibold tabular-nums">
                        {room.number}
                        {isPending && (
                          <span className="ml-1.5 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                            new
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{room.type}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {room.floor}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {room.capacity}
                      </TableCell>
                      <TableCell className="tabular-nums">${room.rate}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium capitalize ${STATUS_STYLES[room.status]}`}
                        >
                          {room.status}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {room.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isPending && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(room)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose hover:bg-rose/10 hover:text-rose"
                              onClick={() => removeRoom(room.id)}
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
        {pendingRooms && pendingRooms.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold text-primary">{pendingRooms.length} new room{pendingRooms.length !== 1 ? "s" : ""}</span>
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
                Save {pendingRooms.length} Room{pendingRooms.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
      </div>

      <RoomDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSubmit={upsertRoom}
      />
    </div>
  );
}

function RoomDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Room | null;
  onSubmit: (data: RoomForm) => boolean;
}) {
  const [form, setForm] = React.useState<{
    number: string;
    type: string;
    floor: string;
    capacity: string;
    rate: string;
    status: RoomStatus;
    notes: string;
  }>({
    number: "",
    type: ROOM_TYPES[0],
    floor: "1",
    capacity: "2",
    rate: "0",
    status: "active",
    notes: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setErrors({});
      if (editing) {
        setForm({
          number: editing.number,
          type: editing.type,
          floor: String(editing.floor),
          capacity: String(editing.capacity),
          rate: String(editing.rate),
          status: editing.status,
          notes: editing.notes ?? "",
        });
      } else {
        setForm({
          number: "",
          type: ROOM_TYPES[0],
          floor: "1",
          capacity: "2",
          rate: "0",
          status: "active",
          notes: "",
        });
      }
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = roomSchema.safeParse({
      ...form,
      notes: form.notes || undefined,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message;
      });
      setErrors(errs);
      return;
    }
    const ok = onSubmit(result.data);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Room ${editing.number}` : "Add new room"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the room details below. Changes save immediately."
              : "Fill in the room details. Inventory updates instantly."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="number">Room number *</Label>
            <Input
              id="number"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              placeholder="e.g. 405"
              maxLength={10}
            />
            {errors.number && <p className="text-[11px] text-rose">{errors.number}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">Room type *</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v })}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-[11px] text-rose">{errors.type}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="floor">Floor *</Label>
            <Input
              id="floor"
              type="number"
              min={0}
              max={200}
              value={form.floor}
              onChange={(e) => setForm({ ...form, floor: e.target.value })}
            />
            {errors.floor && <p className="text-[11px] text-rose">{errors.floor}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="capacity">Capacity *</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              max={20}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
            {errors.capacity && <p className="text-[11px] text-rose">{errors.capacity}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rate">Rate / night ($) *</Label>
            <Input
              id="rate"
              type="number"
              min={0}
              step={1}
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
            {errors.rate && <p className="text-[11px] text-rose">{errors.rate}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status *</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as RoomStatus })}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional · e.g. corner unit, recently renovated"
              maxLength={300}
            />
          </div>

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:from-primary hover:to-primary/80"
            >
              {editing ? "Save changes" : "Add room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
