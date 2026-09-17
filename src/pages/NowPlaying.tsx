import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownCircle, ChevronDown, Heart, Loader2, ListMusic, MessageSquareQuote, MoreHorizontal, Pause, Play, Plus, Repeat, Repeat1, Share2, Shuffle, SkipBack, SkipForward, Volume1, Volume2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AddToPlaylistDialog } from "@/components/AddToPlaylistDialog";
import { ShareSheet } from "@/components/ShareSheet";
import { getCachedYouTubeId, getGlobalVolume, seekGlobalAudio, setGlobalVolume } from "@/components/player/GlobalAudioPlayer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlayer } from "@/context/PlayerContext";
import { cn } from "@/lib/utils";
import { SyncedVideoPanel } from "@/components/nowplaying/SyncedVideoPanel";
import { lookupMeta, peekMeta, type DeezerMeta } from "@/services/metadataEnrichment";

import { toTitleCase } from "@/utils/toTitleCase";
import { getDominantColor, gradientFromRGB } from "@/utils/dominantColor";

/** Progress ring geometry (viewBox is 100x100). */
const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R;

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}


export default function NowPlaying() {
  const navigate = useNavigate();
  const { currentTrack, duration, isPlaying, next, nextTrack, previous, progress, queue, repeat, seek, shuffle, togglePlay, toggleRepeat, toggleShuffle } = usePlayer();
  const [liked, setLiked] = useState(false);
  const [localProgress, setLocalProgress] = useState(progress);
  const [showMore, setShowMore] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading" | "done" | "failed">("idle");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [volume, setVolume] = useState(() => getGlobalVolume());
  /** Deezer metadata for the current song (title / artist / album / hi-res art). */
  const [meta, setMeta] = useState<DeezerMeta | null>(null);

  useEffect(() => setLocalProgress(progress), [progress]);
  // Snap the ring back to zero the instant the user skips forward/back.
  useEffect(() => setLocalProgress(0), [currentTrack?.id]);

  // Now Playing shows Deezer metadata when it resolves; YouTube data is the fallback.
  useEffect(() => {
    if (!currentTrack) { setMeta(null); return; }
    let alive = true;
    setMeta(peekMeta(currentTrack.title, currentTrack.artist) ?? null);
    lookupMeta(currentTrack.title, currentTrack.artist)
      .then((m) => { if (alive) setMeta(m); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [currentTrack?.title, currentTrack?.artist]);

  const display = useMemo(() => ({
    title: meta?.title || currentTrack?.title || "",
    artist: meta?.artist || currentTrack?.artist || "",
    album: meta?.album || currentTrack?.album || "",
    artwork: meta?.artwork || currentTrack?.artwork || "",
  }), [meta, currentTrack]);

  // Plain colour backdrop derived from the cover — no artwork image behind the page.
  const [bgColor, setBgColor] = useState("linear-gradient(180deg, #2a2030 0%, #14121a 45%, #0a0a0a 100%)");
  useEffect(() => {
    let alive = true;
    const art = display.artwork;
    if (!art) return;
    getDominantColor(art).then((c) => { if (alive) setBgColor(gradientFromRGB(c)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [display.artwork]);



  useEffect(() => {
    const compute = () => {
      if (!currentTrack) {
        setLiked(false);
        return;
      }
      try {
        const likedSongs = JSON.parse(localStorage.getItem("tunestream_liked_songs") || "[]");
        setLiked(likedSongs.some((song: any) => song.title === currentTrack.title && song.artist === currentTrack.artist));
      } catch {
        setLiked(false);
      }
    };
    compute();
    window.addEventListener("liked-updated", compute);
    return () => window.removeEventListener("liked-updated", compute);
  }, [currentTrack?.artist, currentTrack?.title]);

  const isResolving = useMemo(() => !!currentTrack && !currentTrack.youtubeId && !getCachedYouTubeId(currentTrack.title, currentTrack.artist), [currentTrack]);
  const videoId = useMemo(
    () => currentTrack?.youtubeId || getCachedYouTubeId(currentTrack?.title || "", currentTrack?.artist || "") || "",
    [currentTrack],
  );
  const actualDuration = duration || currentTrack?.duration || 0;
  const currentTime = Math.floor(localProgress * actualDuration);

  const handleSeek = useCallback((newProgress: number) => {
    seek(newProgress);
    setLocalProgress(newProgress);
    if (actualDuration > 0) seekGlobalAudio(newProgress * actualDuration);
  }, [actualDuration, seek]);

  const handleToggleLike = useCallback(() => {
    if (!currentTrack) return;
    import("@/pages/Library").then(({ toggleLikedSong }) => setLiked(toggleLikedSong(currentTrack)));
  }, [currentTrack]);

  const handleDownload = useCallback(async () => {
    if (!currentTrack || downloadStatus === "downloading") return;
    setDownloadStatus("downloading");
    setDownloadPercent(0);
    const mod = await import("@/services/downloadService");
    const ok = await mod.downloadTrack(currentTrack, (p) => setDownloadPercent(p));
    setDownloadStatus(ok ? "done" : "failed");
    if (ok) toast.success("Downloaded to offline library");
    else toast.error(mod.lastDownloadError || "Download failed");
  }, [currentTrack, downloadStatus]);

  if (!currentTrack) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <p className="text-lg font-extrabold text-foreground">No track playing</p>
          <Button onClick={() => navigate("/")} className="mt-4 rounded-full">Go Home</Button>
        </div>
      </main>
    );
  }

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-20 flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-background text-foreground">
      <AnimatePresence mode="wait">
        <motion.div
          key={bgColor}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="pointer-events-none absolute inset-0"
          style={{ background: bgColor }}
        />
      </AnimatePresence>

      {/* Grabber + collapse */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back" className="rounded-full text-foreground/70 hover:bg-foreground/10">
          <ChevronDown className="h-5 w-5" />
        </Button>
        <span className="h-[5px] w-9 rounded-full bg-foreground/30" />
        <span className="h-9 w-9" />
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-7">
        {/* Square artwork */}
        <motion.div
          key={currentTrack.id}
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          className="mx-auto aspect-square w-full max-w-[min(78vw,44dvh)] overflow-hidden rounded-[10px] shadow-[0_18px_50px_-12px_hsl(0_0%_0%/0.7)]"
        >
          {isResolving ? (
            <div className="flex h-full w-full items-center justify-center bg-secondary">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : (
            <img src={display.artwork} alt={display.title} className="h-full w-full object-cover" />
          )}
        </motion.div>

        {/* Title row */}
        <div className="mt-7 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[21px] font-semibold leading-tight text-foreground">{toTitleCase(display.title)}</h1>
            <button
              onClick={() => navigate(`/artist/${encodeURIComponent(display.artist)}`)}
              className="block max-w-full truncate text-[21px] font-normal leading-tight text-foreground/60 transition-colors hover:text-foreground"
            >
              {toTitleCase(display.artist)}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={handleToggleLike}
              aria-label="Like"
              className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-foreground/15 text-foreground/80", liked && "text-primary")}
            >
              <Heart className="h-[15px] w-[15px]" fill={liked ? "currentColor" : "none"} />
            </button>
            <button
              onClick={() => setShowMore(true)}
              aria-label="More"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/15 text-foreground/80"
            >
              <MoreHorizontal className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="mt-5">
          <Slider
            value={[localProgress * 100]}
            max={100}
            step={0.05}
            aria-label="Seek"
            onValueChange={([value]) => handleSeek(value / 100)}
            className="py-1 [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-0 [&>span]:h-[4px]"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-foreground/45">
            <span aria-label="Elapsed time">{formatTime(currentTime)}</span>
            <span aria-label="Remaining time">-{formatTime(Math.max(0, actualDuration - currentTime))}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="mt-6 flex items-center justify-center gap-14">
          <button onClick={previous} aria-label="Previous track" className="text-foreground transition-transform active:scale-[0.85]">
            <SkipBack className="h-[34px] w-[34px]" fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            disabled={isResolving}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="text-foreground transition-transform active:scale-[0.85] disabled:opacity-60"
          >
            {isResolving ? <Loader2 className="h-[42px] w-[42px] animate-spin" /> : isPlaying ? <Pause className="h-[42px] w-[42px]" fill="currentColor" /> : <Play className="h-[42px] w-[42px]" fill="currentColor" />}
          </button>
          <button onClick={next} aria-label="Next track" className="text-foreground transition-transform active:scale-[0.85]">
            <SkipForward className="h-[34px] w-[34px]" fill="currentColor" />
          </button>
        </div>

        {/* Volume row */}
        <div className="mt-8 flex items-center gap-3">
          <Volume1 className="h-4 w-4 shrink-0 text-foreground/45" />
          <Slider
            value={[volume * 100]}
            max={100}
            step={1}
            aria-label="Volume"
            onValueChange={([value]) => { setVolume(value / 100); setGlobalVolume(value / 100); }}
            className="flex-1 [&_[role=slider}]:hidden [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5 [&_[role=slider]]:border-0 [&>span]:h-[4px]"
          />
          <Volume2 className="h-4 w-4 shrink-0 text-foreground/45" />
        </div>
      </div>

      {/* Bottom icon bar */}
      <section className="relative z-10 shrink-0 px-10 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-5 lg:pb-[6rem]">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/lyrics")} aria-label="Lyrics" className="text-foreground/70 transition-colors hover:text-foreground">
            <MessageSquareQuote className="h-[22px] w-[22px]" />
          </button>
          <button onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" className={cn("text-foreground/70 transition-colors hover:text-foreground", shuffle && "text-primary")}>
            <Shuffle className="h-[21px] w-[21px]" />
          </button>
          <button onClick={toggleRepeat} aria-label={`Repeat: ${repeat}`} className={cn("text-foreground/70 transition-colors hover:text-foreground", repeat !== "off" && "text-primary")}>
            {repeat === "one" ? <Repeat1 className="h-[21px] w-[21px]" /> : <Repeat className="h-[21px] w-[21px]" />}
          </button>
          <button onClick={() => navigate("/queue")} aria-label="Queue" className="text-foreground/70 transition-colors hover:text-foreground">
            <ListMusic className="h-[22px] w-[22px]" />
          </button>
        </div>
        <p className="mt-2.5 truncate text-center text-[11px] font-medium text-foreground/40">
          {nextTrack ? `Next: ${toTitleCase(nextTrack.title)}` : "routenet"}
        </p>
      </section>

      <AnimatePresence>
        {showMore && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm" onClick={() => setShowMore(false)} />
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-card p-4 shadow-elevated">
              <div className="mb-4 flex items-center gap-3">
                <img src={currentTrack.artwork} alt={currentTrack.title} className="h-12 w-12 rounded-lg object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-foreground">{toTitleCase(currentTrack.title)}</p>
                  <p className="truncate text-xs font-semibold text-muted-foreground">{toTitleCase(currentTrack.artist)}</p>
                </div>
              </div>
              <div className="grid gap-2">
                {[
                  { icon: Plus, label: "Add to Playlist", action: () => setShowPlaylistDialog(true) },
                  { icon: ListMusic, label: "Open Queue", action: () => navigate("/queue") },
                  { icon: ArrowDownCircle, label: downloadStatus === "done" ? "Downloaded" : "Download", action: handleDownload },
                  { icon: Share2, label: "Share", action: () => setShowShareSheet(true) },
                ].map(({ icon: Icon, label, action }) => (
                  <Button key={label} variant="ghost" onClick={() => { action(); setShowMore(false); }} className="justify-start rounded-xl px-3 text-sm font-bold">
                    <Icon className="h-4 w-4 text-primary" />{label}
                  </Button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVideo && videoId && (
          <SyncedVideoPanel
            videoId={videoId}
            title={display.title}
            startSeconds={currentTime}
            onClose={() => setShowVideo(false)}
          />
        )}
      </AnimatePresence>

      <ShareSheet isOpen={showShareSheet} onClose={() => setShowShareSheet(false)} item={{ type: "track", title: currentTrack.title, subtitle: currentTrack.artist, image: currentTrack.artwork, id: currentTrack.id }} />
      <AddToPlaylistDialog isOpen={showPlaylistDialog} onClose={() => setShowPlaylistDialog(false)} track={{ title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album, artwork: currentTrack.artwork, duration: currentTrack.duration }} />
    </motion.main>
  );
}
