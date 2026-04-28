import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Star } from "lucide-react";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Guest Feedback · Revenue Copilot" },
      { name: "description", content: "Guest reviews and sentiment analysis." },
    ],
  }),
  component: FeedbackPage,
});

const REVIEWS = [
  { score: 4.6, source: "Booking.com", text: "Loved the location, room was spotless." },
  { score: 4.2, source: "Direct", text: "Easy 1-night stay — glad you allowed it midweek." },
  { score: 3.9, source: "Expedia", text: "Great service. Wifi could be stronger." },
];

function FeedbackPage() {
  return (
    <div className="flex h-full flex-col p-6 lg:p-8">
      <header className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Guest Feedback</h1>
          <p className="text-xs text-muted-foreground">
            Recent reviews · Copilot extracts sentiment to refine rate strategy.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {REVIEWS.map((r, i) => (
          <article key={i} className="rounded-xl border border-border bg-card/60 p-4">
            <div className="flex items-center gap-1.5 text-amber">
              <Star className="h-3.5 w-3.5 fill-amber" />
              <span className="text-sm font-semibold tabular-nums">{r.score}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{r.source}</span>
            </div>
            <p className="mt-2 text-sm text-foreground/85">"{r.text}"</p>
          </article>
        ))}
      </div>
    </div>
  );
}
