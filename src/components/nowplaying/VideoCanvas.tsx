/**
 * Spotify-style canvas: each song randomly gets its cover art, a muted looped
 * YouTube clip of the song, or a free ambient loop. Purely decorative and
 * never receives taps (pointer-events-none).
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const AMBIENT_LOOPS = [
  "https://cdn.pixabay.com/video/2020/05/25/40130-424930032_large.mp4",
  "https://cdn.pixabay.com/video/2019/10/09/27706-365890968_large.mp4",
  "https://cdn.pixabay.com/video/2021/08/04/83880-585600454_large.mp4",
  "https://cdn.pixabay.com/video/2020/08/30/48569-454825064_large.mp4",
];

type Mode = "artwork" | "youtube" | "ambient";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickCanvasMode(trackId: string, hasVideo: boolean): Mode {
  const modes: Mode[] = hasVideo ? ["artwork", "youtube", "youtube", "ambient"] : ["artwork", "ambient"];
  return modes[(hash(trackId) + Math.floor(Math.random() * 1000)) % modes.length];
}

interface Props {
  trackId: string;
  artwork: string;
  videoId?: string;
  className?: string;
}

export function VideoCanvas({ trackId, artwork, videoId, className }: Props) {
  const mode = useMemo(() => pickCanvasMode(trackId, !!videoId), [trackId, !!videoId]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [trackId]);
  const ambient = AMBIENT_LOOPS[hash(trackId) % AMBIENT_LOOPS.length];
  const effective: Mode = failed ? "artwork" : mode;

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden select-none", className)}>
      {effective === "artwork" && artwork && (
        <img src={artwork} alt="" className="h-full w-full scale-110 animate-[pulse_12s_ease-in-out_infinite] object-cover" />
      )}
      {effective === "youtube" && videoId && (
        <iframe
          key={videoId}
          title="canvas"
          tabIndex={-1}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&start=30`}
          allow="autoplay; encrypted-media"
          className="absolute left-1/2 top-1/2 h-[180%] w-[320%] -translate-x-1/2 -translate-y-1/2 sm:w-[180%] lg:h-[140%] lg:w-[140%]"
        />
      )}
      {effective === "ambient" && (
        <video
          key={ambient}
          src={ambient}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background/90" />
    </div>
  );
}
