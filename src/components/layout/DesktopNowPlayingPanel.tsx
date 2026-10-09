import { rightPanelPref } from "@/hooks/useUiPrefs";
import { useState } from "react";
import { EyeOff, Eye, ListMusic, Maximize2, X } from "lucide-react";
import { VideoCanvas } from "@/components/nowplaying/VideoCanvas";
import { getCachedYouTubeId } from "@/components/player/GlobalAudioPlayer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/context/PlayerContext";

export function DesktopNowPlayingPanel() {
  const navigate = useNavigate();
  const { currentTrack, queue, removeFromQueue } = usePlayer();

  const panelOpen = rightPanelPref.use();
  const [hidden, setHidden] = useState(() => localStorage.getItem("routenet_queue_hidden") === "1");
  const toggleHidden = () => setHidden((h) => { localStorage.setItem("routenet_queue_hidden", h ? "0" : "1"); return !h; });
  const currentIndex = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
  const upNext = currentIndex >= 0 ? queue.slice(currentIndex + 1, currentIndex + 11) : queue.slice(0, 10);

  if (panelOpen !== "open") return null;
  return (
    <aside className="custom-scrollbar hidden h-full min-h-0 w-[280px] shrink-0 overflow-y-auto rounded-md border-0 bg-background-elevated p-4 outline-none xl:block 2xl:w-[300px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Now playing</h2>
        <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleHidden} aria-pressed={hidden} aria-label={hidden ? "Show queue" : "Hide queue"}>
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/now-playing")} aria-label="Open player">
          <Maximize2 className="h-4 w-4" />
        </Button>
        </div>
      </div>

      {currentTrack && hidden ? (
        <div className="relative h-[calc(100%-2.5rem)] min-h-80 overflow-hidden rounded-lg">
          <VideoCanvas
            trackId={currentTrack.id}
            artwork={currentTrack.artwork || ""}
            videoId={currentTrack.youtubeId || getCachedYouTubeId(currentTrack.title, currentTrack.artist) || undefined}
          />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="truncate text-lg font-bold text-foreground">{currentTrack.title}</p>
            <p className="truncate text-sm text-muted-foreground">{currentTrack.artist}</p>
          </div>
        </div>
      ) : currentTrack ? (
        <>
          <div className="flex items-center gap-3">
            <img
              src={currentTrack.artwork || "/placeholder.svg"}
              alt={`${currentTrack.title} cover`}
              className="h-16 w-16 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{currentTrack.title}</p>
              <p className="truncate text-xs text-muted-foreground">{currentTrack.artist}</p>
            </div>
          </div>

          <div className="mt-5 pt-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><ListMusic className="h-4 w-4" /> Up next</span>
              <button onClick={() => navigate("/queue")} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Queue</button>
            </div>

            {upNext.length ? (
              <ul className="space-y-0.5">
                {upNext.map((track) => (
                  <li key={track.id} className="group flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-secondary">
                    <img src={track.artwork || "/placeholder.svg"} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{track.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{track.artist}</span>
                    </span>
                    <button
                      onClick={() => removeFromQueue(track.id)}
                      aria-label={`Remove ${track.title} from queue`}
                      className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">The queue is empty.</p>
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <ListMusic className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold">Nothing playing</p>
          <p className="mt-1 text-xs text-muted-foreground">Choose a song to start listening.</p>
        </div>
      )}
    </aside>
  );
}
