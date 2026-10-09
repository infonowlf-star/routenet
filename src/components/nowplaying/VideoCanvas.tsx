/**
 * Background canvas: always a muted, looped YouTube video. Uses the song's
 * own video first; otherwise searches YouTube for an official video by the
 * same artist. Purely decorative and never receives taps.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { searchYouTubeVideos } from "@/services/musicApi";

const fallbackCache = new Map<string, string>();

async function findArtistVideo(artist: string, title: string): Promise<string> {
  const key = artist.toLowerCase();
  if (fallbackCache.has(key)) return fallbackCache.get(key)!;
  for (const q of [`${artist} ${title} official music video`, `${artist} official music video`]) {
    try {
      const items: any[] = await searchYouTubeVideos(q, 8);
      const pick = items.find((v) => {
        const t = `${v.title || v.snippet?.title || ""} ${v.channelTitle || v.uploader || v.snippet?.channelTitle || ""}`.toLowerCase();
        return t.includes(artist.toLowerCase().split(" ")[0]);
      }) || items[0];
      const id = pick?.videoId || pick?.id?.videoId || (typeof pick?.id === "string" ? pick.id : "") || pick?.url?.split("v=")[1];
      if (id) { fallbackCache.set(key, id); return id; }
    } catch { /* try next */ }
  }
  return "";
}

interface Props {
  trackId: string;
  artwork: string;
  videoId?: string;
  artist?: string;
  title?: string;
  enabled?: boolean;
  className?: string;
  onActiveChange?: (active: boolean) => void;
}

export function VideoCanvas({ trackId, artwork, videoId, artist = "", title = "", enabled = true, className, onActiveChange }: Props) {
  const [id, setId] = useState(videoId || "");

  useEffect(() => {
    let cancelled = false;
    setId(videoId || "");
    if (!videoId && artist && enabled) {
      findArtistVideo(artist, title).then((v) => { if (!cancelled) setId(v); });
    }
    return () => { cancelled = true; };
  }, [trackId, videoId, artist, title, enabled]);

  const active = enabled && !!id;
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden select-none", className)}>
      {active ? (
        <iframe
          key={id}
          title="canvas"
          tabIndex={-1}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&start=30`}
          allow="autoplay; encrypted-media"
          className="absolute left-1/2 top-1/2 h-[180%] w-[320%] -translate-x-1/2 -translate-y-1/2 sm:w-[180%] lg:h-[140%] lg:w-[140%]"
        />
      ) : artwork ? (
        <img src={artwork} alt="" className="h-full w-full scale-110 object-cover blur-2xl opacity-60" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/20 to-background/90" />
    </div>
  );
}
