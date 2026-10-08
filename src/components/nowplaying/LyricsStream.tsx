/** Synced lyrics that roll upward. Double-tap toggles auto-sync on/off. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Music2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface LyricLine { time: number; text: string }

export function parseSyncedLyrics(synced: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(synced)) !== null) {
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
    if (m[4].trim()) lines.push({ time, text: m[4].trim() });
  }
  return lines;
}

export function LyricsStream({ title, artist, currentTime, className, onSeek }: {
  title: string; artist: string; currentTime: number; className?: string; onSeek?: (t: number) => void;
}) {
  const activeRef = useRef<HTMLParagraphElement>(null);
  const [synced, setSynced] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lyrics", title, artist],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("lyrics", { body: { title, artist } });
      if (error) throw error;
      return data as { lyrics: string | null; syncedLyrics?: string | null };
    },
    enabled: !!title && !!artist,
    staleTime: 30 * 60 * 1000,
  });

  const lines = useMemo(() => (data?.syncedLyrics ? parseSyncedLyrics(data.syncedLyrics) : null), [data?.syncedLyrics]);
  const hasSynced = !!lines && lines.length > 0;
  const activeIndex = useMemo(() => {
    if (!lines) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= currentTime) idx = i; else break; }
    return idx;
  }, [lines, currentTime]);

  useEffect(() => {
    if (synced && activeRef.current) activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex, synced]);

  const toggleSync = () => {
    setSynced((s) => {
      setFlash(s ? "Sync off" : "Sync on");
      return !s;
    });
    window.setTimeout(() => setFlash(null), 1200);
  };

  const display = hasSynced ? lines! : (data?.lyrics || "").split("\n").filter((l) => l.trim()).map((text, i) => ({ time: i, text }));

  return (
    <div onDoubleClick={toggleSync} className={cn("relative h-full min-h-0 select-none", className)}>
      {flash && (
        <span className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-foreground/15 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">{flash}</span>
      )}
      <div className="custom-scrollbar h-full overflow-y-auto pr-4 [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]">
        {isLoading && <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {!isLoading && display.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><Music2 className="h-10 w-10" /><p className="text-sm">No lyrics available.</p></div>
        )}
        <div className="space-y-5 py-[30vh]">
          {display.map((line, i) => {
            const isActive = hasSynced && i === activeIndex;
            const isPast = hasSynced && i < activeIndex;
            return (
              <p
                key={i}
                ref={isActive ? activeRef : undefined}
                onClick={() => hasSynced && onSeek?.(line.time)}
                className={cn(
                  "cursor-pointer text-[28px] font-bold leading-[1.25] tracking-tight transition-all duration-500 xl:text-[34px]",
                  isActive ? "text-foreground" : isPast ? "text-foreground/30" : "text-foreground/55",
                )}
              >
                {line.text}
              </p>
            );
          })}
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted-foreground">Double-tap to turn sync {synced ? "off" : "on"}</p>
    </div>
  );
}
