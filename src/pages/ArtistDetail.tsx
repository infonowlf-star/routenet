import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Shuffle, Heart, MoreHorizontal, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Track, Artist } from "@/data/mockData";
const PLACEHOLDER_ART = "/placeholder.svg";
import { usePlayer } from "@/context/PlayerContext";
import { TrackCard } from "@/components/cards/TrackCard";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeezerArtist, useArtistDetails } from "@/hooks/useMusicSearch";
import { usePreloadYouTube } from "@/hooks/usePreloadYouTube";
import { toggleLikedArtist, getLikedArtists } from "@/pages/Library";
import { toast } from "sonner";
import { formatExactNumber } from "@/utils/formatExactNumber";
import { toTitleCase } from "@/utils/toTitleCase";
import { supabase } from "@/integrations/supabase/client";
import { genreArtistMap } from "@/constants/genreArtists";

interface Release {
  id: string;
  name: string;
  artwork: string;
  year: string;
  type: "album" | "single" | "ep";
}

/** Songs where the artist appears as a guest / feature rather than the lead. */
function useCollaborations(artistName: string) {
  return useQuery({
    queryKey: ["artist-collabs", artistName],
    enabled: !!artistName,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Track[]> => {
      const { data } = await supabase.functions.invoke("deezer", {
        body: { action: "searchTrack", params: { query: `${artistName} feat`, limit: 40 } },
      });
      const rows: any[] = data?.data || [];
      const norm = (s: string) => (s || "").toLowerCase().trim();
      const seen = new Set<string>();
      return rows
        .filter((t) => {
          const lead = norm(t?.artist?.name);
          const title = norm(t?.title);
          const me = norm(artistName);
          const guest = lead !== me && (title.includes(me) || title.includes("feat"));
          if (!guest) return false;
          const key = `${title}::${lead}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 12)
        .map((t) => ({
          id: `deezer-${t.id}`,
          title: t.title,
          artist: t.artist?.name || artistName,
          album: t.album?.title || "",
          artwork: t.album?.cover_medium || t.album?.cover || "",
          duration: t.duration || 180,
        })) as Track[];
    },
  });
}

/** Official music videos from YouTube. */
function useArtistVideos(artistName: string) {
  return useQuery({
    queryKey: ["artist-videos", artistName],
    enabled: !!artistName,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("youtube", {
        body: { action: "search", params: { query: `${artistName} official music video`, maxResults: 12 } },
      });
      const items: any[] = data?.items || data?.results || data?.videos || (Array.isArray(data) ? data : []);
      return items
        .filter((v) => v?.id && (v.duration ?? 0) < 20 * 60)
        .slice(0, 10)
        .map((v) => ({
          id: String(v.id),
          title: String(v.title || ""),
          thumbnail: v.thumbnail || PLACEHOLDER_ART,
          channelTitle: v.channelTitle || artistName,
          duration: v.duration || 0,
        }));
    },
  });
}

const ArtistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { play, setQueue, playVideo } = usePlayer();
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAllTracks, setShowAllTracks] = useState(false);

  const artistName = decodeURIComponent(id || "");
  const { data: deezerData, isLoading: loadingDeezer } = useDeezerArtist(artistName);
  const { data: apiData, isLoading: loadingApi } = useArtistDetails(artistName);
  const { data: collaborations } = useCollaborations(artistName);
  const { data: videos } = useArtistVideos(artistName);
  const isLoading = loadingDeezer || loadingApi;

  const artist = deezerData?.artist ? {
    id: deezerData.artist.id.toString(), name: deezerData.artist.name,
    realName: apiData?.artist?.realName || apiData?.artist?.name || deezerData.artist.name,
    stageName: deezerData.artist.name || apiData?.artist?.name || artistName,
    age: apiData?.artist?.age || null,
    avatar: deezerData.artist.picture, monthlyListeners: deezerData.artist.nb_fan || 0,
    bio: apiData?.artist?.bio || `${deezerData.artist.name} is a celebrated artist known for a distinctive sound, standout performances, and a deep connection with fans across multiple releases.`,
    genre: apiData?.artist?.genre || (artistName ? "Artist" : "Music"), country: apiData?.artist?.country || "Worldwide",
    banner: apiData?.artist?.banner || deezerData.artist.picture,
    origin: apiData?.artist?.country || "Worldwide",
  } : apiData?.artist ? {
    id: apiData.artist.id, name: apiData.artist.name, realName: apiData.artist.realName || apiData.artist.name,
    stageName: apiData.artist.name, age: apiData.artist.age || null,
    avatar: apiData.artist.avatar, monthlyListeners: apiData.artist.monthlyListeners || 0,
    bio: apiData.artist.bio || `${apiData.artist.name} brings a bold, expressive voice to modern music with a style shaped by deep emotion and strong artistic identity.`,
    genre: apiData.artist.genre, country: apiData.artist.country, banner: apiData.artist.banner,
    origin: apiData.artist.country || "Worldwide",
  } : null;

  useEffect(() => {
    if (artist) setIsFollowing(getLikedArtists().some((a) => a.name === artist.name));
  }, [artist]);

  const deezerTracks: (Track & { rank?: number })[] = (deezerData?.tracks || []).map((t: any) => ({
    id: `deezer-${t.id}`, title: t.title, artist: t.artist?.name || artistName,
    album: t.album?.title || "unknown album", artwork: t.album?.cover_medium || t.album?.cover || artist?.avatar || "",
    duration: t.duration || 180, rank: t.rank || 0,
  }));

  const apiTracks: Track[] = apiData?.topTracks?.map((t) => ({
    id: t.id, title: t.title, artist: t.artist, album: t.album || "unknown album",
    artwork: t.artwork || artist?.avatar || "", duration: t.duration || 180,
  })) || [];

  const allTracks = deezerTracks.length > 0 ? deezerTracks : apiTracks;
  const displayedTracks = showAllTracks ? allTracks : allTracks.slice(0, 5);

  usePreloadYouTube(displayedTracks, displayedTracks.length > 0);

  // Deezer marks each release as album / single / ep — split them into sections.
  const releases: Release[] = useMemo(() => {
    const raw = (deezerData?.albums || []) as any[];
    if (raw.length) {
      const seen = new Set<string>();
      return raw
        .filter((a) => {
          const k = (a.title || "").toLowerCase().trim();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((a) => ({
          id: a.id.toString(),
          name: a.title,
          artwork: a.cover_medium || a.cover || PLACEHOLDER_ART,
          year: a.release_date?.split("-")[0] || "",
          type: (a.record_type === "single" ? "single" : a.record_type === "ep" ? "ep" : "album") as Release["type"],
        }))
        .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    }
    return (apiData?.albums || []).map((a, i) => ({
      id: a.id, name: a.name, artwork: a.artwork || PLACEHOLDER_ART,
      year: a.year || String(2024 - i), type: "album" as const,
    }));
  }, [deezerData?.albums, apiData?.albums]);

  const albums = releases.filter((r) => r.type === "album").slice(0, 12);
  const epsAndSingles = releases.filter((r) => r.type !== "album").slice(0, 12);

  const similarArtists: Artist[] = apiData?.similar?.map((s) => ({
    id: s.id, name: s.name, avatar: s.avatar || PLACEHOLDER_ART, monthlyListeners: s.monthlyListeners || 0,
  })) || [];

  const suggestedArtists = useMemo(() => {
    const names = artist?.genre ? (genreArtistMap[artist.genre] || []) : [];
    return names
      .filter((name) => name.toLowerCase() !== (artist?.name || "").toLowerCase())
      .slice(0, 8)
      .map((name, index) => ({
        id: `suggested-${index}-${name}`,
        name,
        avatar: PLACEHOLDER_ART,
        monthlyListeners: 650000 + index * 180000,
      }));
  }, [artist?.genre, artist?.name]);

  if (!artist && !isLoading) return <div className="flex h-full items-center justify-center"><p className="text-muted-foreground">artist not found</p></div>;
  if (isLoading && !artist) return <div className="flex h-full items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="text-muted-foreground">loading artist...</p></div>;

  const handlePlayAll = () => { if (allTracks.length) { setQueue(allTracks); play(allTracks[0]); } };
  const handleShuffle = () => { if (allTracks.length) { const s = [...allTracks].sort(() => Math.random() - 0.5); setQueue(s); play(s[0]); } };

  const handleLike = () => {
    if (!artist) return;
    const result = toggleLikedArtist({ name: artist.name, avatar: artist.avatar });
    setIsFollowing(result);
    toast.success(result ? `${artist.name} added to library` : `${artist.name} removed from library`);
  };

  const bannerImage = (artist as any)?.banner || artist?.avatar;

  const ReleaseRow = ({ title, items, delay }: { title: string; items: Release[]; delay: number }) => (
    <section className="mb-8 px-4" style={{ animationDelay: `${delay}s` }}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{items[0]?.type || "release"}</span>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3">
        {items.map((r) => {
          const compact = r.type === "ep" || r.type === "single";
          return (
            <div key={r.id} onClick={() => navigate(`/album/${r.id}`)} className={`shrink-0 cursor-pointer ${compact ? "w-28" : "w-36"}`}>
              <img
                src={r.artwork}
                alt={r.name}
                className={`${compact ? "h-28 w-28" : "h-36 w-36"} rounded-xl object-cover shadow-[0_12px_24px_rgba(0,0,0,0.18)]`}
                onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_ART; }}
              />
              <h3 className="mt-2 truncate text-sm font-semibold text-foreground">{toTitleCase(r.name)}</h3>
              <p className="truncate text-[11px] text-muted-foreground">{[r.year, toTitleCase(r.type)].filter(Boolean).join(" • ")}</p>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="min-h-full pb-28">
      <div className="relative overflow-hidden">
        <div className="relative h-64 overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bannerImage})` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-background" />
          <button onClick={() => navigate(-1)} className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {isLoading && (
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              updating
            </div>
          )}
        </div>

        <div className="relative z-10 -mt-12 px-4">
          <div className="flex items-end gap-3">
            <img
              src={artist?.avatar || PLACEHOLDER_ART}
              alt={artist?.name}
              className="h-24 w-24 rounded-full border-4 border-background object-cover shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
              onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_ART; }}
            />
            <div className="min-w-0 flex-1 pb-2">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Artist</span>
                {(artist as any)?.genre && (
                  <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {toTitleCase((artist as any).genre)}
                  </span>
                )}
              </div>
              <h1 className="truncate text-3xl font-black tracking-tight text-foreground">{toTitleCase(artist?.name || artistName)}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{formatExactNumber(artist?.monthlyListeners || 0)} monthly listeners</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handlePlayAll} size="lg" disabled={allTracks.length === 0} className="h-12 rounded-full bg-primary px-5 text-sm font-semibold text-black shadow-[0_12px_30px_rgba(29,185,84,0.28)] hover:bg-primary/90">
              <Play className="mr-2 h-4 w-4 fill-current" />
              Play
            </Button>
            <Button onClick={handleShuffle} variant="ghost" size="icon" className="h-11 w-11 rounded-full bg-white/5 hover:bg-white/10">
              <Shuffle className="h-4 w-4 text-primary" />
            </Button>
            <Button onClick={handleLike} variant={isFollowing ? "secondary" : "outline"} className="h-11 rounded-full border-white/10 bg-white/5 px-4 text-sm font-semibold">
              <Heart className={`mr-2 h-4 w-4 ${isFollowing ? "fill-primary text-primary" : ""}`} />
              {isFollowing ? "Liked" : "Follow"}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-6">
        <section className="mt-6 rounded-2xl border border-white/10 bg-background/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">About</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Story</span>
          </div>
          <p className="text-sm leading-7 text-foreground/85">{artist?.bio || "Artist information not available."}</p>
        </section>

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Popular</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Top songs</span>
          </div>
          {allTracks.length > 0 ? (
            <div className="space-y-1">
              {displayedTracks.map((track, index) => (
                <TrackCard key={track.id} track={track} index={index} showIndex contextTracks={allTracks} hideStreams />
              ))}
            </div>
          ) : !isLoading ? <p className="py-4 text-sm text-muted-foreground">No tracks available</p> : null}
          {allTracks.length > 5 && (
            <button onClick={() => setShowAllTracks(!showAllTracks)} className="mt-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
              {showAllTracks ? "Show less" : "See more"}
            </button>
          )}
        </motion.section>

        {albums.length > 0 && <ReleaseRow title="Discography" items={albums} delay={0.1} />}
        {epsAndSingles.length > 0 && <ReleaseRow title="Singles & EPs" items={epsAndSingles} delay={0.15} />}

        {!!videos?.length && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Music videos</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Video</span>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {videos.map((v) => (
                <motion.button
                  key={v.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => playVideo({ id: `yt-${v.id}`, title: v.title, artist: v.channelTitle, youtubeId: v.id, thumbnail: v.thumbnail, duration: v.duration })}
                  className="w-52 shrink-0 overflow-hidden rounded-[20px] border border-white/10 bg-card/60 p-2 text-left"
                >
                  <img src={v.thumbnail} alt={v.title} className="h-28 w-full rounded-[14px] object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_ART; }} />
                  <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-foreground">{v.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{v.channelTitle}</p>
                </motion.button>
              ))}
            </div>
          </motion.section>
        )}

        {suggestedArtists.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Fans also like</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Curated</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {suggestedArtists.map((suggested) => (
                <button
                  key={suggested.id}
                  onClick={() => navigate(`/artist/${encodeURIComponent(suggested.name)}`)}
                  className="group w-28 shrink-0 rounded-[22px] border border-white/10 bg-background/60 p-2 text-left transition hover:border-primary/30"
                >
                  <div className="mb-2 overflow-hidden rounded-[16px] bg-muted/30">
                    <img src={suggested.avatar} alt={suggested.name} className="h-24 w-full object-cover transition duration-200 group-hover:scale-105" />
                  </div>
                  <p className="truncate text-sm font-semibold text-foreground">{suggested.name}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Similar</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {similarArtists.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">More like this</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Discovery</span>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {similarArtists.map((ra) => (
                <motion.div key={ra.id} whileTap={{ scale: 0.98 }} onClick={() => navigate(`/artist/${encodeURIComponent(ra.name)}`)} className="w-28 shrink-0 cursor-pointer text-center">
                  <img src={ra.avatar} alt={ra.name} className="mx-auto h-24 w-24 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_ART; }} />
                  <h3 className="mt-2 truncate text-sm font-semibold text-foreground">{toTitleCase(ra.name)}</h3>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Artist</p>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      </div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="px-4 pb-8 text-center text-[10px] text-muted-foreground">
        Data pulled from Deezer, Last.fm, and YouTube.
      </motion.p>
    </div>
  );
};

export default ArtistDetail;
