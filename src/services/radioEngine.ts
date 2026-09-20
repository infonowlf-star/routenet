/**
 * AI Recommendation Engine V2 — the ONE recommendation engine in the project.
 *
 * There is no YouTube "related videos" input any more. Every queue is written
 * by Lovable AI (the `ai-recommend` edge function) from the seed song plus the
 * listener's taste signals, then resolved to real songs with Deezer metadata.
 *
 *  - Selecting a song starts a SESSION and builds ONE 100-song queue.
 *  - The queue is only rebuilt when the user picks a new song, fewer than 10
 *    tracks remain, or the session expires.
 *  - Distribution per queue: 30% closely related · 20% trending · 15% new
 *    releases · 15% fan favourites · 10% classics · 10% hidden gems.
 *  - Songs and artists respect persistent cooldowns (playedSongs /
 *    recentArtists / queueHistory in localStorage).
 *  - The result is ordered like a DJ set, not shuffled.
 */
import type { Track } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { getTopSignalArtists, getRecentSignals } from "@/services/tasteEvents";
import { enrichTracks } from "@/services/metadataEnrichment";
import { toTitleCase } from "@/utils/toTitleCase";
import { getLikedSongs, getRecentlyPlayed } from "@/services/fallbackRecommendation";
import { isRecentlyRecommended, rememberRecommended } from "@/services/recommendedSongs";
import { getUserPlaylists, getPlaylistTracks } from "@/services/playlistService";




/** One manual selection == one 100-song listening session. */
export const INITIAL_QUEUE_SIZE = 100;
export const REFILL_BATCH_SIZE = 40;
export const REFILL_THRESHOLD = 10;
/** A session goes stale after this long and the next advance rebuilds it. */
export const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

/** Target composition of every queue. */
const MIX = {
  related: 0.24, trending: 0.16, recent: 0.3, fanfav: 0.14, classic: 0.1, hidden: 0.06,
} as const;
type Bucket = keyof typeof MIX;
/** DJ ordering cycle — the queue is laid out in this rotation. */
const BUCKET_ORDER: Bucket[] = ["related", "trending", "fanfav", "recent", "classic", "hidden"];

/** Minimum share of the queue released within the last 9 months. */
const FRESH_TARGET = 0.57;
/** Never place more than this many songs of the same freshness lane in a row. */
const MAX_SAME_LANE_RUN = 2;

/** A song can only come back after this long. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const COOLDOWN_MAX_ENTRIES = 1200;

/** An artist waits for this many OTHER distinct artists before returning. */
const ARTIST_COOLDOWN_DISTINCT = 12;
const ARTIST_HISTORY_MAX = 160;

/** Spacing rules inside a single queue. */
const MIN_ARTIST_GAP = 8;
const MAX_PER_ARTIST = 2;

/** How many songs get Deezer artwork before the queue is handed to the player. */
const EAGER_ENRICH = 12;


interface Suggestion {
  title: string;
  artist: string;
  role?: string;
  reason?: string;
  /** Release year, when the curator reported one. */
  year?: number;
  /** "current" = released within the last 9 months. */
  freshness?: string;
  /** Already-resolved metadata (local fallback path). */
  track?: Track;
}


/* ------------------------------------------------------------------ */
/* Session state                                                       */
/* ------------------------------------------------------------------ */

const SESSION_KEY = "radio_session_v3";
const COOLDOWN_KEY = "radio_cooldown_v1";
const ARTIST_KEY = "radio_artist_history_v1";
const QUEUE_HISTORY_KEY = "radio_queue_history_v1";

export interface RadioSession {
  played: string[];
  queue: Track[];
  index: number;
}

let played = new Set<string>();
/** key -> timestamp when it was last played (survives reloads). */
let cooldown = new Map<string, number>();
/** Most-recently-played artists, newest first (survives reloads). */
let artistHistory: string[] = [];

export const artistKey = (a: string) =>
  (a || "")
    .toLowerCase()
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*(vevo|official)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const songKey = (title: string, artist: string) =>
  `${artistKey(artist)}::${(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

function loadCooldown() {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (raw) cooldown = new Map(Object.entries(JSON.parse(raw)) as [string, number][]);
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(ARTIST_KEY);
    if (raw) artistHistory = JSON.parse(raw) as string[];
  } catch { /* ignore */ }
}
loadCooldown();

function saveCooldown() {
  try {
    if (cooldown.size > COOLDOWN_MAX_ENTRIES) {
      const sorted = [...cooldown.entries()].sort((a, b) => b[1] - a[1]).slice(0, COOLDOWN_MAX_ENTRIES);
      cooldown = new Map(sorted);
    }
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(Object.fromEntries(cooldown)));
    localStorage.setItem(ARTIST_KEY, JSON.stringify(artistHistory.slice(0, ARTIST_HISTORY_MAX)));
  } catch { /* quota */ }
}

function onCooldown(key: string): boolean {
  const at = cooldown.get(key);
  return !!at && Date.now() - at < COOLDOWN_MS;
}

/**
 * True when a song may not be recommended right now.
 * `strict` also enforces the 7-day recommended-song block; the 6-hour
 * play cooldown is NEVER relaxed.
 */
export function isSongBlocked(title: string, artist: string, strict = true): boolean {
  const key = songKey(title, artist);
  if (!key) return true;
  if (onCooldown(key)) return true;
  return strict && isRecentlyRecommended(key);
}

/** How many distinct artists have played since this one — Infinity if never. */
export function artistDistance(artist: string): number {
  const k = artistKey(artist);
  if (!k) return Infinity;
  const seen = new Set<string>();
  for (const a of artistHistory) {
    if (a === k) return seen.size;
    seen.add(a);
  }
  return Infinity;
}

export function artistOnCooldown(artist: string): boolean {
  return artistDistance(artist) < ARTIST_COOLDOWN_DISTINCT;
}

function rememberArtist(artist: string) {
  const k = artistKey(artist);
  if (!k) return;
  artistHistory = [k, ...artistHistory.filter((a) => a !== k)].slice(0, ARTIST_HISTORY_MAX);
}

function readSession(): (RadioSession & { at?: number }) | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadSession(): RadioSession | null {
  const s = readSession();
  if (!s) return null;
  played = new Set(s.played || []);
  return { played: s.played || [], queue: s.queue || [], index: s.index || 0 };
}

export function saveSession(queue: Track[], index: number) {
  try {
    const slim = queue.slice(0, 120).map((t) => ({
      id: t.id, title: t.title, artist: t.artist, album: t.album,
      artwork: t.artwork, duration: t.duration, youtubeId: t.youtubeId,
    }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ played: [...played].slice(-400), queue: slim, index, at: Date.now() }));
  } catch { /* quota */ }
}

export function markPlayed(track: Track | null | undefined) {
  if (!track?.title) return;
  const key = songKey(track.title, track.artist);
  played.add(key);
  cooldown.set(key, Date.now());
  rememberArtist(track.artist);
  saveCooldown();
}

export function hasPlayed(key: string) { return played.has(key); }

export function resetSession() {
  played = new Set();
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function sessionExpired(): boolean {
  const s = readSession();
  if (!s?.at) return true;
  return Date.now() - s.at > SESSION_TTL_MS;
}

export function videoIdOf(track?: Track | null): string {
  return track?.youtubeId || "";
}

/* ------------------------------------------------------------------ */
/* Queue history — never repeat the previous sessions' songs           */
/* ------------------------------------------------------------------ */

interface QueueHistoryEntry { at: number; keys: string[] }

function readQueueHistory(): QueueHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_HISTORY_KEY) || "[]"); } catch { return []; }
}

function rememberQueue(keys: string[]) {
  try {
    const next = [{ at: Date.now(), keys: keys.slice(0, 120) }, ...readQueueHistory()].slice(0, 5);
    localStorage.setItem(QUEUE_HISTORY_KEY, JSON.stringify(next));
  } catch { /* quota */ }
}

function recentQueueSongs(): Set<string> {
  const out = new Set<string>();
  for (const entry of readQueueHistory()) {
    if (Date.now() - entry.at > 24 * 60 * 60 * 1000) continue;
    entry.keys.forEach((k) => out.add(k));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* AI candidate generation                                             */
/* ------------------------------------------------------------------ */

function followedArtists(): string[] {
  const out = new Set<string>(getTopSignalArtists(12));
  try {
    const raw = localStorage.getItem("onboarding");
    if (raw) {
      const o = JSON.parse(raw);
      ((o?.artists || []) as any[]).forEach((a) => out.add(String(a?.name || a)));
    }
  } catch { /* ignore */ }
  return [...out].filter(Boolean).slice(0, 25);
}

function tasteSignals() {
  try {
    return getRecentSignals(30).map((s: any) => ({
      type: s.type, title: s.title, artist: s.artist, genre: s.genre, weight: s.weight,
    }));
  } catch {
    return [];
  }
}

/** Albums the listener saved in their library. */
function savedAlbums(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem("tunestream_liked_albums") || "[]");
    return (Array.isArray(raw) ? raw : [])
      .map((a: any) => `${a?.title ?? ""} — ${a?.artist ?? ""}`.trim())
      .filter((s: string) => s.length > 3)
      .slice(0, 20);
  } catch {
    return [];
  }
}

interface LibraryContext {
  liked: Track[];
  recent: Track[];
  albums: string[];
  playlistTracks: Track[];
}

/** Songs sitting in the listener's own playlists (taste signal + tiny source). */
async function playlistTracks(): Promise<Track[]> {
  try {
    const playlists = (await getUserPlaylists()).slice(0, 4);
    const lists = await Promise.all(playlists.map((p) => getPlaylistTracks(p.id).catch(() => [])));
    return lists.flat().slice(0, 60).map((r, i) => ({
      id: `pl-${r.id ?? i}`,
      title: r.track_title,
      artist: r.track_artist,
      album: r.track_album || "",
      artwork: r.track_artwork || "/placeholder.svg",
      duration: r.track_duration || 0,
    })) as Track[];
  } catch {
    return [];
  }
}

async function libraryContext(): Promise<LibraryContext> {
  const [liked, pl] = await Promise.all([
    getLikedSongs().catch(() => [] as Track[]),
    playlistTracks(),
  ]);
  return { liked: liked.slice(0, 60), recent: getRecentlyPlayed(25), albums: savedAlbums(), playlistTracks: pl };
}

const label = (t: Track) => `${t.title} — ${t.artist}`;

/**
 * Candidate generation — straight from the music catalog, no AI.
 * Real release dates, real popularity, real artwork.
 */
async function getCandidates(seed: Track | null, count: number): Promise<Suggestion[]> {
  const rows = await getRecommendations(
    seed ? { title: seed.title, artist: seed.artist } : null,
    count,
  ).catch(() => [] as CatalogCandidate[]);

  return rows.map((c) => ({
    title: c.title,
    artist: c.artist,
    role: c.role,
    reason: c.reason,
    year: c.year,
    freshness: c.freshness,
    track: {
      id: c.deezerId ? `deezer-${c.deezerId}` : `cat-${songKey(c.title, c.artist)}`,
      title: toTitleCase(c.title),
      artist: toTitleCase(c.artist),
      album: c.album,
      artwork: c.artwork || "/placeholder.svg",
      duration: c.duration,
    } as Track,
  }));
}

function bucketOf(role?: string): Bucket {
  const r = (role || "").toLowerCase();
  if (r.startsWith("trend")) return "trending";
  if (r.startsWith("new") || r.startsWith("recent")) return "recent";
  if (r.startsWith("fan") || r.startsWith("popular")) return "fanfav";
  if (r.startsWith("class") || r.startsWith("throw")) return "classic";
  if (r.startsWith("hidden") || r.startsWith("gem") || r.startsWith("deep")) return "hidden";
  return "related";
}

/* ------------------------------------------------------------------ */
/* Selection: cooldowns, diversity, DJ ordering                        */
/* ------------------------------------------------------------------ */

interface Scored extends Suggestion { key: string; bucket: Bucket }

/**
 * Filter candidates. `strict` also enforces the 7-day recommended-song block
 * and the recent-queue memory so the engine keeps finding new material.
 * The 6-hour play cooldown is enforced in BOTH modes — it is never relaxed.
 */
function prepare(list: Suggestion[], excludeKeys: Set<string>, strict = true): Scored[] {
  const seen = new Set<string>();
  const out: Scored[] = [];
  const recent = recentQueueSongs();
  for (const s of list) {
    const key = songKey(s.title, s.artist);
    if (!key || seen.has(key) || excludeKeys.has(key)) continue;
    if (onCooldown(key)) continue;
    if (strict && isRecentlyRecommended(key)) continue;
    if (strict && recent.has(key)) continue;
    seen.add(key);
    out.push({ ...s, key, bucket: bucketOf(s.role) });
  }
  return out;
}


/* ---------------- Intelligent constrained shuffle ---------------- */

const CURRENT_YEAR = new Date().getFullYear();

/** True when the song counts toward the "last 9 months" freshness target. */
function isFresh(c: Scored): boolean {
  const f = (c.freshness || "").toLowerCase();
  if (f.startsWith("current") || f.startsWith("new") || f.startsWith("recent")) return true;
  if (c.year && c.year >= CURRENT_YEAR) return true;
  return c.bucket === "recent";
}

/** Rough energy proxy so the order alternates instead of flatlining. */
function energyOf(c: Scored): number {
  switch (c.bucket) {
    case "trending": return 0.85;
    case "recent": return 0.75;
    case "fanfav": return 0.65;
    case "related": return 0.55;
    case "classic": return 0.4;
    default: return 0.3;
  }
}

/** Multi-signal desirability score — higher lands earlier in the queue. */
function scoreOf(c: Scored): number {
  let s = 0;
  s += (MIX[c.bucket] ?? 0.1) * 2;                       // wanted composition
  if (isFresh(c)) s += 0.55;                              // recency
  if (c.year) s += Math.max(0, 0.35 - (CURRENT_YEAR - c.year) * 0.035); // decay
  if (c.reason) s += 0.08;                                // curator gave rationale
  const dist = artistDistance(c.artist);
  s += dist === Infinity ? 0.4 : Math.min(0.4, dist / 40); // unheard artists first
  s += Math.random() * 0.22;                              // natural variation
  return s;
}

/**
 * Build the final order: quota-aware bucket rotation with hard constraints —
 * artist spacing, max songs per artist, no same album back to back, no long
 * runs of the same freshness lane, alternating energy, and a >=57% share of
 * recent music spread naturally across the whole queue.
 */
function arrange(pool: Scored[], limit: number): Scored[] {
  const ranked = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a));

  const byBucket = new Map<Bucket, Scored[]>();
  BUCKET_ORDER.forEach((b) => byBucket.set(b, []));
  for (const c of ranked) byBucket.get(c.bucket)!.push(c);

  const quota = new Map<Bucket, number>();
  BUCKET_ORDER.forEach((b) => quota.set(b, Math.round(MIX[b] * limit)));

  const picked: Scored[] = [];
  const perArtist = new Map<string, number>();
  const lastIndexByArtist = new Map<string, number>();
  let freshCount = 0;
  let laneRun = 0;
  let lastFresh: boolean | null = null;
  const freshTarget = Math.ceil(FRESH_TARGET * limit);

  const albumOf = (c: Scored) => `${artistKey(c.artist)}::${(c.track?.album || "").toLowerCase()}`;

  const violates = (c: Scored, relax: number): boolean => {
    const a = artistKey(c.artist);
    if ((perArtist.get(a) || 0) >= MAX_PER_ARTIST + (relax > 1 ? 1 : 0)) return true;
    const last = lastIndexByArtist.get(a);
    const gap = Math.max(2, MIN_ARTIST_GAP - relax * 3);
    if (last !== undefined && picked.length - last < gap) return true;
    if (relax === 0) {
      const prev = picked[picked.length - 1];
      if (prev && (prev.track?.album || "") && albumOf(prev) === albumOf(c)) return true;
      // Never stack more than MAX_SAME_LANE_RUN of one freshness lane.
      const fresh = isFresh(c);
      if (lastFresh === fresh && laneRun >= MAX_SAME_LANE_RUN) return true;
      // Keep the energy moving.
      if (prev && Math.abs(energyOf(prev) - energyOf(c)) < 0.02 && picked.length > 2) {
        const before = picked[picked.length - 2];
        if (before && Math.abs(energyOf(before) - energyOf(c)) < 0.02) return true;
      }
    }
    return false;
  };

  const commit = (c: Scored) => {
    const a = artistKey(c.artist);
    perArtist.set(a, (perArtist.get(a) || 0) + 1);
    lastIndexByArtist.set(a, picked.length);
    const fresh = isFresh(c);
    if (fresh) freshCount += 1;
    laneRun = lastFresh === fresh ? laneRun + 1 : 1;
    lastFresh = fresh;
    picked.push(c);
    const list = byBucket.get(c.bucket)!;
    const i = list.indexOf(c);
    if (i >= 0) list.splice(i, 1);
    quota.set(c.bucket, (quota.get(c.bucket) || 0) - 1);
  };

  /** Remaining slots vs. remaining fresh songs still needed. */
  const needsFresh = () => freshTarget - freshCount >= limit - picked.length;

  const pickFrom = (candidates: Scored[], relax: number): Scored | undefined => {
    const wantFresh = needsFresh();
    if (wantFresh) {
      const f = candidates.find((c) => isFresh(c) && !violates(c, relax));
      if (f) return f;
    }
    return candidates.find((c) => !violates(c, relax));
  };

  let cursor = 0;
  let guard = 0;
  while (picked.length < limit && guard++ < limit * 10) {
    let placed = false;
    for (let step = 0; step < BUCKET_ORDER.length && !placed; step++) {
      const bucket = BUCKET_ORDER[(cursor + step) % BUCKET_ORDER.length];
      const list = byBucket.get(bucket)!;
      if (!list.length) continue;
      if ((quota.get(bucket) || 0) <= 0 && pool.length > limit) continue;
      const choice = pickFrom(list, 0);
      if (!choice) continue;
      commit(choice);
      cursor = (cursor + step + 1) % BUCKET_ORDER.length;
      placed = true;
    }
    if (placed) continue;

    // Relax progressively rather than dropping songs.
    let recovered = false;
    for (let relax = 1; relax <= 3 && !recovered; relax++) {
      const rest = BUCKET_ORDER.flatMap((b) => byBucket.get(b)!);
      if (!rest.length) break;
      BUCKET_ORDER.forEach((b) => quota.set(b, (quota.get(b) || 0) + Math.ceil(limit / 6)));
      const next = pickFrom(rest, relax);
      if (next) { commit(next); recovered = true; }
    }
    if (!recovered) break;
  }

  return picked.slice(0, limit);
}

function toTrack(s: Scored, seed?: Track | null): Track {
  if (s.track) return s.track;
  return {
    id: `ai-${s.key.replace(/\s+/g, "-")}`,
    title: toTitleCase(s.title),
    artist: toTitleCase(s.artist),
    album: "",
    artwork: "/placeholder.svg",
    duration: 0,
  } as Track;
}

/** Deezer artwork/album for the head of the queue; the tail resolves lazily. */
async function decorate(tracks: Track[]): Promise<Track[]> {
  if (!tracks.length) return tracks;
  const needsArt = (t: Track) => !t.artwork || t.artwork === "/placeholder.svg";
  const head = tracks.slice(0, EAGER_ENRICH);
  const tail = tracks.slice(EAGER_ENRICH);
  const enrichedHead = head.some(needsArt)
    ? await enrichTracks(head, 10).catch(() => head)
    : head;
  // Background: fill in the rest so the queue page and mini player look right.
  if (tail.some(needsArt)) enrichTracks(tail, 6).catch(() => undefined);
  return [...enrichedHead, ...tail];
}

/**
 * The queue is written entirely by the AI. The listener's library (liked
 * songs, playlists, saved albums, history) is sent as a TASTE PROFILE only —
 * songs from the library are never placed in the queue, and there is no
 * local library fallback.
 */
async function buildBatch(seed: Track | null, existing: Track[], limit: number): Promise<Track[]> {
  const excludeKeys = new Set<string>(existing.map((t) => songKey(t.title, t.artist)));
  if (seed) excludeKeys.add(songKey(seed.title, seed.artist));
  const excludeTitles = existing.slice(-24).map((t) => `${t.title} — ${t.artist}`);

  const ctx = await libraryContext();
  const aiCount = Math.min(60, Math.max(35, Math.ceil(limit * 0.7)));
  const ai = await askAI(seed, excludeTitles, aiCount, ctx).catch(() => [] as Suggestion[]);

  let pool = prepare(ai, excludeKeys);

  // Thin result: relax ONLY the 7-day recommended block and the queue memory.
  // The 6-hour play cooldown always stays enforced.
  if (pool.length < Math.min(limit, 8)) {
    const relaxed = prepare(ai, new Set<string>(), false);
    const seen = new Set(pool.map((p) => p.key));
    pool = [...pool, ...relaxed.filter((p) => !seen.has(p.key))];
  }

  if (!pool.length) return [];

  const arranged = arrange(pool, limit).slice(0, limit);

  rememberQueue(arranged.map((c) => c.key));
  // Everything recommended here is unavailable for the next 7 days.
  rememberRecommended(arranged.map((c) => c.key));
  return decorate(arranged.map((c) => toTrack(c, seed)));
}





/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Build the full session queue for a freshly selected song. */
export async function buildRadioQueue(seed: Track): Promise<Track[]> {
  const rest = await buildBatch(seed, [seed], INITIAL_QUEUE_SIZE - 1);
  return [seed, ...rest];
}

/** Append another batch, seeded by what is playing now. */
export async function expandRadioQueue(currentSeed: Track, queue: Track[]): Promise<Track[]> {
  return buildBatch(currentSeed, queue, REFILL_BATCH_SIZE);
}

export function needsRefill(queue: Track[], index: number) {
  return queue.length - index <= REFILL_THRESHOLD;
}
