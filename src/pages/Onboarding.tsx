import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Check,
  Sparkles,
  Music2,
  Bell,
  Mail,
  Apple,
  ArrowRight,
  Loader2,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { genreArtistMap } from "@/constants/genreArtists";

type Step =
  | "welcome"
  
  | "genres"
  | "subgenres"
  | "artists"
  | "similar"
  | "notifications"
  | "mood"
  | "done";

const STEP_ORDER: Step[] = [
  "welcome",
  
  "genres",
  "subgenres",
  "artists",
  "similar",
  "notifications",
  "mood",
  "done",
];

interface ArtistPick {
  id: number;
  name: string;
  picture?: string;
  monthlyListeners?: string;
}
interface GenrePick {
  id: number;
  name: string;
  gradient: string;
}

const GENRES: GenrePick[] = [
  { id: 1, name: "Hip-Hop", gradient: "from-emerald-500/30 via-emerald-400/10 to-background" },
  { id: 2, name: "Pop", gradient: "from-fuchsia-500/30 via-violet-400/10 to-background" },
  { id: 3, name: "R&B", gradient: "from-rose-500/30 via-pink-400/10 to-background" },
  { id: 4, name: "Rock", gradient: "from-orange-500/30 via-amber-400/10 to-background" },
  { id: 5, name: "Electronic", gradient: "from-cyan-500/30 via-sky-400/10 to-background" },
  { id: 6, name: "Afrobeats", gradient: "from-yellow-500/30 via-amber-400/10 to-background" },
  { id: 7, name: "Indie", gradient: "from-violet-500/30 via-purple-400/10 to-background" },
  { id: 8, name: "Jazz", gradient: "from-blue-500/30 via-indigo-400/10 to-background" },
  { id: 9, name: "Classical", gradient: "from-slate-300/20 via-slate-200/10 to-background" },
  { id: 10, name: "Country", gradient: "from-red-500/30 via-orange-400/10 to-background" },
  { id: 11, name: "Reggae", gradient: "from-lime-500/30 via-green-400/10 to-background" },
  { id: 12, name: "Metal", gradient: "from-zinc-500/30 via-slate-400/10 to-background" },
  { id: 13, name: "Latin", gradient: "from-teal-500/30 via-cyan-400/10 to-background" },
  { id: 14, name: "K-Pop", gradient: "from-pink-500/30 via-rose-400/10 to-background" },
  { id: 15, name: "Lo-fi", gradient: "from-indigo-500/30 via-sky-400/10 to-background" },
  { id: 16, name: "Gospel", gradient: "from-amber-500/30 via-yellow-400/10 to-background" },
];

const SUBGENRES_BY_GENRE: Record<string, string[]> = {
  "Hip-Hop": ["Trap", "Old School", "Drill", "Boom Bap", "Cloud Rap", "Alternative Hip-Hop"],
  "Pop": ["Synth Pop", "Electropop", "Dream Pop", "Bedroom Pop", "Dance Pop"],
  "R&B": ["Neo-Soul", "Alternative R&B", "Contemporary R&B", "Funk"],
  "Rock": ["Alternative", "Punk", "Grunge", "Classic Rock", "Indie Rock"],
  "Electronic": ["House", "Techno", "Dubstep", "Future Bass", "Ambient", "Drum & Bass"],
  "Afrobeats": ["Amapiano", "Alté", "Afro-fusion", "Highlife"],
  "Indie": ["Indie Folk", "Indie Pop", "Indie Rock", "Bedroom Pop"],
  "Jazz": ["Smooth Jazz", "Bebop", "Fusion", "Cool Jazz"],
  "Classical": ["Baroque", "Romantic", "Contemporary Classical", "Piano Solo"],
  "Country": ["Country Pop", "Bluegrass", "Outlaw", "Modern Country"],
  "Reggae": ["Dancehall", "Dub", "Roots Reggae", "Reggae Fusion"],
  "Metal": ["Metalcore", "Progressive Metal", "Death Metal", "Black Metal", "Thrash"],
  "Latin": ["Reggaeton", "Bachata", "Salsa", "Latin Trap", "Cumbia"],
  "K-Pop": ["K-Pop Boy Groups", "K-Pop Girl Groups", "K-R&B", "K-Hip-Hop"],
  "Lo-fi": ["Chillhop", "Vaporwave", "Study Beats", "Jazzhop"],
  "Gospel": ["Contemporary Gospel", "Traditional Gospel", "Christian R&B"],
};

const MOODS = [
  { name: "Chill", gradient: "from-cyan-500/30 via-sky-400/10 to-background" },
  { name: "Party", gradient: "from-fuchsia-500/30 via-pink-400/10 to-background" },
  { name: "Focus", gradient: "from-violet-500/30 via-indigo-400/10 to-background" },
  { name: "Workout", gradient: "from-emerald-500/30 via-lime-400/10 to-background" },
  { name: "Sleep", gradient: "from-slate-400/30 via-slate-200/10 to-background" },
  { name: "Romance", gradient: "from-rose-500/30 via-pink-400/10 to-background" },
  { name: "Sad", gradient: "from-blue-500/30 via-indigo-400/10 to-background" },
  { name: "Happy", gradient: "from-yellow-500/30 via-amber-400/10 to-background" },
];

const CURATED_ARTISTS_BY_GENRE: Record<string, string[]> = {
  "Hip-Hop": ["Drake", "Kendrick Lamar", "Travis Scott", "SZA", "J. Cole", "Doja Cat", "Tyler, The Creator", "Lil Baby"],
  Pop: ["Taylor Swift", "Dua Lipa", "Olivia Rodrigo", "The Weeknd", "Billie Eilish", "Ariana Grande", "Sabrina Carpenter", "Harry Styles"],
  "R&B": ["SZA", "Giveon", "Summer Walker", "H.E.R.", "Brent Faiyaz", "Usher", "Jhené Aiko", "Daniel Caesar"],
  Rock: ["The Staves", "The 1975", "Arctic Monkeys", "Tame Impala", "The Killers", "Nirvana", "Paramore", "Red Hot Chili Peppers"],
  Electronic: ["Fred again..", "Disclosure", "Calvin Harris", "David Guetta", "Avicii", "Martin Garrix", "Skrillex", "Major Lazer"],
  Afrobeats: ["Burna Boy", "Wizkid", "Tems", "Rema", "Asake", "Davido", "Ayra Starr", "Omah Lay"],
  Indie: ["Clairo", "Tame Impala", "Phoebe Bridgers", "Mitski", "Vampire Weekend", "The 1975", "Lorde", "Mac DeMarco"],
  Jazz: ["Miles Davis", "John Coltrane", "Ella Fitzgerald", "Nina Simone", "Herbie Hancock", "Kamasi Washington", "Norah Jones", "Chet Baker"],
  Classical: ["Ludovico Einaudi", "Yo-Yo Ma", "Lang Lang", "Hans Zimmer", "Bach", "Beethoven", "Chopin", "Mozart"],
  Country: ["Morgan Wallen", "Luke Combs", "Chris Stapleton", "Zach Bryan", "Lainey Wilson", "Dolly Parton", "Shania Twain", "Kacey Musgraves"],
  Reggae: ["Bob Marley & The Wailers", "Sean Paul", "Damian Marley", "Shaggy", "Chronixx", "Koffee", "Protoje", "Buju Banton"],
  Metal: ["Metallica", "Slipknot", "System Of A Down", "Bring Me The Horizon", "Iron Maiden", "Linkin Park", "Deftones", "Avenged Sevenfold"],
  Latin: ["Bad Bunny", "Karol G", "J Balvin", "Shakira", "Feid", "Rauw Alejandro", "Peso Pluma", "Maluma"],
  "K-Pop": ["BTS", "BLACKPINK", "NewJeans", "Stray Kids", "TWICE", "SEVENTEEN", "IVE", "LE SSERAFIM"],
  "Lo-fi": ["Nujabes", "Jinsang", "idealism", "potsu", "Kupla", "Tomppabeats", "j^p^n", "bsd.u"],
  Gospel: ["Kirk Franklin", "Tasha Cobbs Leonard", "Maverick City Music", "CeCe Winans", "Elevation Worship", "Mary Mary", "Fred Hammond", "Jonathan McReynolds"],
};

function saveOnboarding(data: any) {
  try {
    const existing = JSON.parse(localStorage.getItem("onboarding") || "{}");
    localStorage.setItem("onboarding", JSON.stringify({ ...existing, ...data }));
  } catch {
    localStorage.setItem("onboarding", JSON.stringify(data));
  }
}

async function deezer<T = any>(action: string, params: Record<string, any> = {}): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke("deezer", {
      body: { action, params },
    });
    if (error) throw error;
    return data as T;
  } catch (e) {
    console.error(`deezer ${action} failed`, e);
    return null;
  }
}

function toArtistPick(a: any, i = 0): ArtistPick | null {
  const name = a?.name || a?.artist;
  if (!name) return null;
  const picture = a?.picture_xl || a?.picture_big || a?.picture_medium || a?.picture;
  if (!picture) return null;
  return {
    id: Number(a.id ?? i),
    name,
    picture,
    monthlyListeners: a?.nb_fan ? `${(a.nb_fan / 1_000_000).toFixed(1)}M fans` : undefined,
  };
}

/**
 * Real artists for a genre or sub-genre.
 *
 * Deezer's /search/artist returns junk acts literally named "Trap" or
 * "Amapiano", and its genre charts ignore the genre id, so we instead read the
 * artists off the top editorial playlists for that style.
 */
async function fetchArtistsForStyle(query: string, limit = 10): Promise<ArtistPick[]> {
  const playlists = await deezer<any>("searchPlaylist", { query, limit: 3 });
  const ids: number[] = (playlists?.data || [])
    .filter((p: any) => p?.id && (p?.nb_tracks ?? 1) > 0)
    .slice(0, 3)
    .map((p: any) => p.id);

  const trackLists = await Promise.all(
    ids.map((playlistId) => deezer<any>("getPlaylistTracks", { playlistId, limit: 30 })),
  );

  const seen = new Set<string>();
  const out: ArtistPick[] = [];
  // Round-robin across playlists so one playlist can't dominate.
  const lists = trackLists.map((d) => (d?.data || []) as any[]);
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth && out.length < limit; i++) {
    for (const list of lists) {
      const pick = list[i]?.artist ? toArtistPick(list[i].artist) : null;
      if (!pick) continue;
      const key = pick.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pick);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function fetchRelatedArtists(artistId: number, limit = 8): Promise<ArtistPick[]> {
  const data = await deezer<any>("getArtistRelated", { artistId, limit });
  const list: any[] = data?.data || [];
  return list.map((a, i) => toArtistPick(a, i)).filter(Boolean) as ArtistPick[];
}

async function resolveKnownArtists(names: string[], limit = 16): Promise<ArtistPick[]> {
  const lists = await Promise.all(
    names.slice(0, limit).map(async (name) => {
      const res = await deezer<any>("searchArtist", { name, limit: 1 });
      const artist = res?.data?.[0];
      return artist ? toArtistPick(artist) : null;
    }),
  );
  return lists.filter(Boolean) as ArtistPick[];
}

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            i === index
              ? "h-1.5 w-6 rounded-full bg-primary transition-all"
              : i < index
              ? "h-1.5 w-1.5 rounded-full bg-primary/50"
              : "h-1.5 w-1.5 rounded-full bg-muted"
          }
        />
      ))}
    </div>
  );
}

function ArtistSearch({ onPick }: { onPick: (a: ArtistPick) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ArtistPick[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      const res = await deezer<any>("searchArtist", { name: term, limit: 6 });
      const list = (res?.data || [])
        .map((a: any, i: number) => toArtistPick(a, i))
        .filter(Boolean) as ArtistPick[];
      setResults(list);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div className="relative mt-3">
      <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any artist"
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-elevated">
          {results.map((a) => (
            <button
              key={a.id}
              onClick={() => { onPick(a); setQ(""); setResults([]); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary"
            >
              {a.picture && <img src={a.picture} className="h-8 w-8 rounded-full object-cover" />}
              <span className="text-sm font-semibold">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const initialStep: Step =
    new URLSearchParams(window.location.search).get("step") === "genres" ? "genres" : "welcome";
  const [step, setStep] = useState<Step>(initialStep);

  const [selectedGenres, setSelectedGenres] = useState<GenrePick[]>([]);
  const [selectedSubgenres, setSelectedSubgenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistPick[]>([]);
  const [similarArtists, setSimilarArtists] = useState<ArtistPick[]>([]);
  const [artists, setArtists] = useState<ArtistPick[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [artistsError, setArtistsError] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    newReleases: true,
    artistUpdates: true,
    playlistUpdates: false,
    friendActivity: false,
  });
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [signingIn, setSigningIn] = useState<"google" | "email" | null>(null);
  const stepIdx = STEP_ORDER.indexOf(step);
  const goto = (s: Step) => setStep(s);

  const availableSubgenres = Array.from(
    new Set(selectedGenres.flatMap((g) => SUBGENRES_BY_GENRE[g.name] || [])),
  );

  const loadArtists = async () => {
    setLoadingArtists(true);
    setArtistsError(false);
    try {
      const curatedArtistsForGenre = (genre: string) => {
        const direct = genreArtistMap[genre] || CURATED_ARTISTS_BY_GENRE[genre] || [];
        return Array.from(new Set(direct));
      };

      // 1. Curated artist seeds per genre so the onboarding experience feels polished and consistent across all genres.
      const seedNames = Array.from(
        new Set(selectedGenres.flatMap((g) => curatedArtistsForGenre(g.name))),
      );
      const knownArtists = await resolveKnownArtists(seedNames, 28);

      // 2. Sub-genres (more specific)
      const subgenreLists = await Promise.all(
        selectedSubgenres.slice(0, 4).map((sg) => fetchArtistsForStyle(sg, 8)),
      );

      // 3. Genres from Deezer playlist tracks.
      const genreLists = await Promise.all(
        selectedGenres.slice(0, 4).map((g) => fetchArtistsForStyle(g.name, 10)),
      );

      // 4. Similar artists from the recognizable seeds, plus a direct recommendation when the user has already picked an artist.
      const relatedLists = await Promise.all(
        selectedArtists.length > 0
          ? selectedArtists.slice(0, 4).map((a) => fetchRelatedArtists(a.id, 6))
          : knownArtists.slice(0, 4).map((a) => fetchRelatedArtists(a.id, 6)),
      );

      const buckets = [knownArtists, ...subgenreLists, ...genreLists, ...relatedLists].filter((l) => l.length > 0);
      const results: ArtistPick[] = [];
      const seen = new Set<string>();
      const banned = new Set(
        [...selectedSubgenres, ...selectedGenres.map((g) => g.name)].map((s) => s.toLowerCase()),
      );
      const depth = Math.max(0, ...buckets.map((l) => l.length));
      for (let i = 0; i < depth; i++) {
        for (const bucket of buckets) {
          const a = bucket[i];
          if (!a) continue;
          const k = a.name.toLowerCase();
          if (seen.has(k) || banned.has(k)) continue;
          seen.add(k);
          results.push(a);
        }
      }

      if (results.length === 0) {
        const fallback = await fetchArtistsForStyle("top hits", 24);
        setArtists(fallback);
        if (fallback.length === 0) setArtistsError(true);
        return;
      }
      setArtists(results.slice(0, 24));
    } finally {
      setLoadingArtists(false);
    }
  };

  // Load artists whenever we enter the artists step
  useEffect(() => {
    if (step !== "artists" || selectedGenres.length === 0) return;
    loadArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Load similar artists based on picks
  useEffect(() => {
    if (step !== "similar" || selectedArtists.length === 0) return;
    setLoadingSimilar(true);
    (async () => {
      const results: ArtistPick[] = [];
      const seen = new Set(selectedArtists.map((a) => a.name.toLowerCase()));
      const lists = await Promise.all(
        selectedArtists.slice(0, 3).map((a) => fetchRelatedArtists(a.id, 8)),
      );
      for (const list of lists) {
        for (const x of list) {
          const k = x.name.toLowerCase();
          if (!seen.has(k) && x.picture) {
            seen.add(k);
            results.push(x);
          }
        }
      }
      setSimilarArtists(results.slice(0, 18));
      setLoadingSimilar(false);
    })();
  }, [step, selectedArtists]);

  const toggleGenre = (g: GenrePick) => {
    setSelectedGenres((prev) =>
      prev.some((x) => x.id === g.id) ? prev.filter((x) => x.id !== g.id) : [...prev, g],
    );
  };
  const toggleSubgenre = (s: string) => {
    setSelectedSubgenres((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };
  const toggleArtist = (a: ArtistPick) => {
    setSelectedArtists((prev) =>
      prev.some((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a],
    );
  };
  const toggleMood = (m: string) => {
    setSelectedMoods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const handleGoogle = async () => {
    setSigningIn("google");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (e: any) {
      toast.error(e?.message || "Google sign-in failed");
      setSigningIn(null);
    }
  };

  const finish = async () => {
    const onboardingData = {
      genres: selectedGenres,
      subgenres: selectedSubgenres,
      artists: selectedArtists,
      moods: selectedMoods,
      notifPrefs,
      completedAt: new Date().toISOString(),
    };
    saveOnboarding(onboardingData);
    localStorage.setItem("routenet-onboarded", "true");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("user_settings").upsert({
          user_id: user.id,
          settings: onboardingData as any,
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      /* best-effort Cloud persistence */
    }
    toast.success("Welcome to Routenet");
    navigate("/home");
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_35%),radial-gradient(circle_at_bottom_right,hsl(0_0%_100%/0.06),transparent_30%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(0_0%_0%)_100%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-xl">
          <div className="mb-6 flex items-center justify-between gap-3">
            {step !== "welcome" && step !== "done" ? (
              <button
                onClick={() => {
                  const prev = STEP_ORDER[stepIdx - 1];
                  if (prev) goto(prev);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground backdrop-blur-md transition-all hover:border-primary/40 hover:bg-primary/10"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="h-11 w-11" />
            )}

            <div className="flex-1 px-3">
              <ProgressDots index={stepIdx} total={STEP_ORDER.length} />
            </div>

            {step === "genres" || step === "subgenres" || step === "artists" || step === "similar" || step === "mood" ? (
              <button
                onClick={() => {
                  const next = STEP_ORDER[stepIdx + 1];
                  if (next) goto(next);
                }}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip
              </button>
            ) : (
              <div className="h-11 w-11" />
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-xl flex-1"
          >
            {step === "welcome" && (
              <div className="flex min-h-[70vh] flex-col items-center justify-center px-2 text-center">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="mb-7 flex h-24 w-24 items-center justify-center rounded-[28px] border border-primary/30 bg-gradient-to-br from-primary via-primary/90 to-[#1b4d3e] shadow-[0_20px_50px_rgba(170,255,200,0.18)]"
                >
                  <Music2 className="h-11 w-11 text-white" />
                </motion.div>

                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Curated for your taste
                </div>

                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Routenet</h1>
                <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-muted-foreground">
                  Discover music that fits your world—tailored by genre, mood, and the artists you actually love.
                </p>

                <div className="mt-10 w-full space-y-3">
                  <button
                    onClick={() => goto("genres")}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_14px_32px_rgba(244,63,94,0.32)] transition-transform hover:scale-[1.01] active:scale-95"
                  >
                    Get Started <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem("routenet-guest", "true");
                      goto("genres");
                    }}
                    className="w-full text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Continue as Guest
                  </button>
                </div>

                <button
                  onClick={() => navigate("/auth")}
                  className="mt-6 text-sm font-medium text-foreground/80 underline decoration-border underline-offset-4 hover:text-white"
                >
                  Create an account
                </button>
              </div>
            )}

            {step === "genres" && (
              <div className="flex min-h-[70vh] flex-col rounded-[30px] border border-white/10 bg-white/[0.02] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-6">
                <div className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Step 1</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight">
                    Choose your sound
                  </h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pick the genres that shape how you listen, then we’ll build a feed around them.
                </p>

                <div className="mt-6 grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 pr-1 md:grid-cols-4">
                  {GENRES.map((g) => {
                    const active = selectedGenres.some((x) => x.id === g.id);
                    return (
                      <motion.button
                        key={g.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleGenre(g)}
                        className={`group relative h-28 overflow-hidden rounded-[22px] border bg-gradient-to-br ${g.gradient} p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-200 ${
                          active
                            ? "border-primary/60 ring-2 ring-primary/40 shadow-[0_18px_40px_rgba(244,63,94,0.18)]"
                            : "border-white/10 hover:border-white/20 hover:translate-y-[-1px]"
                        }`}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.52))]" />
                        <div className="relative z-10 flex h-full flex-col justify-between">
                          <span className="text-base font-black tracking-tight text-white drop-shadow-sm md:text-lg">
                            {g.name}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/75">
                            {active ? "Selected" : "Discover"}
                          </span>
                        </div>
                        {active && (
                          <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                <button
                  disabled={selectedGenres.length < 1}
                  onClick={() => goto("subgenres")}
                  className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue ({selectedGenres.length} selected)
                </button>
              </div>
            )}

            {step === "subgenres" && (
              <div className="flex min-h-[70vh] flex-col rounded-[30px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl sm:p-6">
                <div className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Step 2</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight">
                    Fine-tune your taste
                  </h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose the scene or sound that best matches your vibe.
                </p>

                <div className="mt-6 flex flex-1 flex-wrap content-start gap-2 overflow-y-auto pb-2 pr-1">
                  {availableSubgenres.length === 0 ? (
                    <div className="flex w-full items-center justify-center rounded-2xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
                      Pick at least one genre to unlock sub-genres.
                    </div>
                  ) : (
                    availableSubgenres.map((s) => {
                      const active = selectedSubgenres.includes(s);
                      return (
                        <motion.button
                          key={s}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => toggleSubgenre(s)}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                            active
                              ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_18px_rgba(244,63,94,0.28)]"
                              : "border-white/10 bg-secondary/50 text-foreground hover:border-primary/40 hover:text-white"
                          }`}
                        >
                          {s}
                        </motion.button>
                      );
                    })
                  )}
                </div>

                <button
                  onClick={() => goto("artists")}
                  className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {selectedSubgenres.length > 0 ? `Continue (${selectedSubgenres.length})` : "Skip for now"}
                </button>
              </div>
            )}

            {step === "artists" && (
              <div className="flex min-h-[70vh] flex-col rounded-[30px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl sm:p-6">
                <div className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Step 3</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight">Follow the artists you love</h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pick people you stream often or want to hear more from.
                </p>

                <ArtistSearch
                  onPick={(a) => {
                    setArtists((prev) => (prev.some((x) => x.id === a.id) ? prev : [a, ...prev]));
                    setSelectedArtists((prev) =>
                      prev.some((x) => x.id === a.id) ? prev : [...prev, a],
                    );
                  }}
                />

                <div className="mt-4 grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 pr-1 md:grid-cols-4">
                  {loadingArtists ? (
                    Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="shimmer aspect-[0.9] rounded-[22px] bg-muted/40" />
                    ))
                  ) : artistsError || artists.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
                      <p className="text-sm font-semibold text-foreground">Couldn't load artists</p>
                      <p className="mt-1 text-xs text-muted-foreground">Check your connection and try again.</p>
                      <button
                        onClick={loadArtists}
                        className="mt-4 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    artists.map((a) => {
                      const active = selectedArtists.some((x) => x.id === a.id);
                      return (
                        <motion.button
                          key={a.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleArtist(a)}
                          className="flex flex-col items-center gap-2 text-center"
                        >
                          <div
                            className={`relative aspect-square w-full overflow-hidden rounded-[22px] border transition-all ${
                              active ? "border-primary ring-2 ring-primary/40 shadow-[0_16px_34px_rgba(244,63,94,0.14)]" : "border-white/10"
                            }`}
                          >
                            {a.picture ? (
                              <img src={a.picture} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="h-full w-full bg-secondary" />
                            )}
                            {active && (
                              <div className="absolute inset-0 flex items-center justify-center bg-primary/45 backdrop-blur-[1px]">
                                <Check className="h-5 w-5 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-foreground/90">
                            {a.name}
                          </span>
                        </motion.button>
                      );
                    })
                  )}
                </div>

                <button
                  disabled={selectedArtists.length < 3}
                  onClick={() => goto("similar")}
                  className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue ({selectedArtists.length}/3)
                </button>
              </div>
            )}

            {step === "similar" && (
              <div className="flex min-h-[70vh] flex-col rounded-[30px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl sm:p-6">
                <div className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Step 4</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight">More like these</h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add a few more artists to tighten the recommendations.
                </p>

                <div className="mt-6 grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 pr-1 md:grid-cols-4">
                  {loadingSimilar
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="shimmer aspect-[0.92] rounded-[22px] bg-muted/40" />
                      ))
                    : similarArtists.map((a) => {
                        const active = selectedArtists.some((x) => x.id === a.id);
                        return (
                          <motion.button
                            key={a.id}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => toggleArtist(a)}
                            className="flex flex-col items-center gap-2 text-center"
                          >
                            <div
                              className={`relative aspect-square w-full overflow-hidden rounded-[22px] border transition-all ${
                                active ? "border-primary ring-2 ring-primary/40 shadow-[0_16px_34px_rgba(244,63,94,0.14)]" : "border-white/10"
                              }`}
                            >
                              {a.picture && (
                                <img src={a.picture} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                              )}
                              {active && (
                                <div className="absolute inset-0 flex items-center justify-center bg-primary/50 backdrop-blur-[1px]">
                                  <Check className="h-5 w-5 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                            <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-foreground/90">
                              {a.name}
                            </span>
                          </motion.button>
                        );
                      })}
                </div>

                <button
                  onClick={() => goto("notifications")}
                  className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  Continue
                </button>
              </div>
            )}

            {step === "notifications" && (
              <div className="flex min-h-[70vh] flex-col rounded-[30px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl sm:p-6">
                <div className="mx-auto mb-6 mt-4 flex h-20 w-20 items-center justify-center rounded-[24px] bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Bell className="h-9 w-9" />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Preferences</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight">Stay in the loop</h1>
                </div>
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  Only the updates that matter to you, with full control any time.
                </p>

                <div className="mt-8 space-y-3">
                  {[
                    { key: "newReleases", label: "New releases from artists you follow" },
                    { key: "artistUpdates", label: "Artist announcements & tours" },
                    { key: "playlistUpdates", label: "Playlist updates from friends" },
                    { key: "friendActivity", label: "Friend activity" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() =>
                        setNotifPrefs((p) => ({ ...p, [opt.key]: !p[opt.key as keyof typeof p] }))
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-secondary/30 p-4 text-left transition-colors hover:border-primary/30"
                    >
                      <span className="text-sm font-semibold text-foreground/90">{opt.label}</span>
                      <span
                        className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                          notifPrefs[opt.key as keyof typeof notifPrefs] ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            notifPrefs[opt.key as keyof typeof notifPrefs] ? "translate-x-5" : ""
                          }`}
                        />
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => goto("mood")}
                  className="mt-auto h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  Continue
                </button>
              </div>
            )}

            {step === "mood" && (
              <div className="flex min-h-[70vh] flex-col rounded-[30px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl sm:p-6">
                <div className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Step 5</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight">
                    What are you in the mood for?
                  </h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pick the vibe you want to hear right now and let the rest of the day follow.
                </p>

                <div className="mt-6 grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 pr-1 md:grid-cols-4">
                  {MOODS.map((m) => {
                    const active = selectedMoods.includes(m.name);
                    return (
                      <motion.button
                        key={m.name}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleMood(m.name)}
                        className={`relative h-28 overflow-hidden rounded-[22px] border bg-gradient-to-br ${m.gradient} p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all ${
                          active
                            ? "border-primary/60 ring-2 ring-primary/40 shadow-[0_18px_40px_rgba(244,63,94,0.18)]"
                            : "border-white/10 hover:border-white/20 hover:translate-y-[-1px]"
                        }`}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.48))]" />
                        <div className="relative z-10 flex h-full flex-col justify-between">
                          <span className="text-base font-black tracking-tight text-white drop-shadow-sm md:text-lg">
                            {m.name}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
                            {active ? "Selected" : "Set"}
                          </span>
                        </div>
                        {active && (
                          <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                <button
                  onClick={() => goto("done")}
                  className="mt-4 h-12 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  Continue
                </button>
              </div>
            )}

            {step === "done" && (
              <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-[30px] border border-white/10 bg-white/[0.02] p-6 text-center backdrop-blur-xl">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary via-primary/90 to-[#2b4b3b] shadow-[0_20px_50px_rgba(244,63,94,0.28)]"
                >
                  <Sparkles className="h-10 w-10 text-white" />
                </motion.div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Ready</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight">You’re all set</h1>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Your recommendations are now tuned around the music you actually like.
                </p>
                <button
                  onClick={finish}
                  className="mt-10 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_14px_32px_rgba(244,63,94,0.28)]"
                >
                  Start Listening <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
