import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useListeningHistory } from "@/hooks/useListeningHistory";
import { getChart, transformTrack } from "@/services/deezer";
import type { Track } from "@/data/mockData";
import { Button } from "@/components/ui/button";

const SLOTS = 8;

/**
 * Home quick access — exactly eight cards (2 across, 4 down) built from real
 * listening history and topped up with chart recommendations when the
 * listener hasn't played much yet.
 */
export function QuickAccessGrid() {
  const { playTrack } = usePlayer();
  const { history } = useListeningHistory();
  const [filler, setFiller] = useState<Track[]>([]);

  const needed = Math.max(0, SLOTS - history.length);

  useEffect(() => {
    if (needed === 0) { setFiller([]); return; }
    let cancelled = false;
    getChart(20)
      .then((rows: any[]) => {
        if (cancelled) return;
        setFiller((rows || []).map(transformTrack) as Track[]);
      })
      .catch(() => { /* history-only is fine */ });
    return () => { cancelled = true; };
  }, [needed]);

  const seen = new Set(history.map((t) => t.id));
  const recentSongs = [
    ...history.slice(0, SLOTS),
    ...filler.filter((t) => !seen.has(t.id)),
  ].slice(0, SLOTS);

  if (recentSongs.length === 0) return null;

  return (
    <section className="mb-7 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-3">
      {recentSongs.map((t) => (
        <Button
          variant="ghost"
          key={t.id}
          onClick={() => playTrack(t, recentSongs)}
          className="group flex h-[56px] min-w-0 justify-start gap-2.5 overflow-hidden rounded-[4px] bg-secondary/70 p-0 pr-2 text-left transition-colors hover:bg-muted lg:h-[64px] lg:gap-3"
        >
          <img src={t.artwork || "/placeholder.svg"} alt="" loading="lazy" className="h-full w-[56px] shrink-0 object-cover lg:w-[64px]" />
          <span className="line-clamp-2 min-w-0 flex-1 whitespace-normal text-[13px] font-bold leading-tight text-foreground lg:text-sm">{t.title}</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
          </span>
        </Button>
      ))}
    </section>
  );
}
