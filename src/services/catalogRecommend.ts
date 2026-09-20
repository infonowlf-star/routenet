/**
 * Catalog recommendation engine — NO AI.
 *
 * Builds the candidate pool for a queue straight from the Deezer catalog,
 * which gives us REAL release dates, real popularity (rank) and real artwork.
 * Everything runs in a couple of parallel waves so a queue is ready fast.
 *
 * Sources
 *   - track radio for the seed song            -> "related"
 *   - related artists' top tracks              -> "fanfav"
 *   - recent albums (last 9 months) of the seed
 *     artist + related artists + editorial     -> "recent"   (verified fresh)
 *   - genre chart / global chart               -> "trending"
 *   - older albums of related artists          -> "classic" / "hidden"
 */
import { supabase } from "@/integrations/supabase/client";

export interface CatalogCandidate {
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  deezerId?: number;
  role: string;
  year?: number;
  freshness: "current" | "catalog";
  rank: number;
  reason?: string;
}

const FRESH_WINDOW_DAYS = 275; // ~9 months
const cutoff = () => Date.now() - FRESH_WINDOW_DAYS * 86_400_000;

async function dz(action: string, params: Record<string, any> = {}, timeoutMs = 9000): Promise<any> {
  const run = supabase.functions
    .invoke("deezer", { body: { action, params } })
    .then(({ data, error }) => (error ? null : data));
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  try {
    return await Promise.race([run, timeout]);
  } catch {
    return null;
  }
}

const rows = (d: any): any[] => (Array.isArray(d?.data) ? d.data : Array.isArray(d?.tracks?.data) ? d.tracks.data : []);

function isFreshDate(raw?: string): boolean {
  if (!raw) return false;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) && t >= cutoff() && t <= Date.now() + 7 * 86_400_000;
}

function yearOf(raw?: string): number | undefined {
  if (!raw) return undefined;
  const y = Number(String(raw).slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : undefined;
}

function toCandidate(
  t: any,
  role: string,
  opts: { album?: any; releaseDate?: string; reason?: string } = {},
): CatalogCandidate | null {
  const title = String(t?.title ?? t?.title_short ?? "").trim();
  const artist = String(t?.artist?.name ?? "").trim();
  if (!title || !artist) return null;
  const release = opts.releaseDate || t?.release_date || t?.album?.release_date || opts.album?.release_date;
  const fresh = isFreshDate(release);
  const album = opts.album || t?.album || {};
  return {
    title,
    artist,
    album: String(album?.title ?? t?.album?.title ?? "").trim(),
    artwork:
      album?.cover_big || album?.cover_medium || t?.album?.cover_big || t?.album?.cover_medium || t?.album?.cover || "/placeholder.svg",
    duration: Number(t?.duration) || 0,
    deezerId: Number(t?.id) || undefined,
    role: fresh ? (role === "trending" ? "trending" : "recent") : role,
    year: yearOf(release),
    freshness: fresh ? "current" : "catalog",
    rank: Number(t?.rank) || 0,
    reason: opts.reason,
  };
}

/** Albums released inside the freshness window, newest first. */
function freshAlbums(list: any[], max: number): any[] {
  return list
    .filter((a) => isFreshDate(a?.release_date))
    .sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)))
    .slice(0, max);
}

/**
 * Build a pool of real catalog candidates for the given seed.
 * Returns roughly `Math.max(120, count * 3)` unique songs.
 */
export async function getRecommendations(
  seed: { title: string; artist: string } | null,
  count = 100,
): Promise<CatalogCandidate[]> {
  const out: CatalogCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: CatalogCandidate | null) => {
    if (!c) return;
    const k = `${c.artist.toLowerCase()}::${c.title.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  /* ---------- wave 1: identify the seed and its neighbourhood ---------- */
  const seedQuery = seed ? `${seed.title} ${seed.artist}` : "";
  const [seedSearch, artistSearch, globalChart, editorial] = await Promise.all([
    seedQuery ? dz("searchTrack", { query: seedQuery, limit: 1 }) : null,
    seed ? dz("searchArtist", { name: seed.artist, limit: 1 }) : null,
    dz("getChart", { type: "tracks", limit: 40 }),
    dz("getGenreChartAlbums", { genreId: 0, limit: 40 }),
  ]);

  const seedTrack = rows(seedSearch)[0];
  console.log("[rec] wave1", { seedTrack: seedTrack?.title, chart: rows(globalChart).length, editorial: rows(editorial).length });
  const seedArtistId = seedTrack?.artist?.id ?? rows(artistSearch)[0]?.id;

  /* ---------- wave 2: radio, related artists, seed artist albums ---------- */
  const [radio, artistRadio, related, seedAlbums] = await Promise.all([
    seedTrack?.id ? dz("getTrackRadio", { trackId: seedTrack.id, limit: 30 }) : null,
    seedArtistId ? dz("getArtistRadio", { artistId: seedArtistId, limit: 25 }) : null,
    seedArtistId ? dz("getArtistRelated", { artistId: seedArtistId, limit: 14 }) : null,
    seedArtistId ? dz("getArtistAlbums", { artistId: seedArtistId, limit: 12 }) : null,
  ]);

  const relatedArtists = rows(related).slice(0, 10);
  console.log("[rec] wave2", { radio: rows(radio).length, artistRadio: rows(artistRadio).length, related: relatedArtists.length, seedAlbums: rows(seedAlbums).length });

  /* ---------- wave 3: per-artist albums + top tracks ---------- */
  const perArtist = await Promise.all(
    relatedArtists.map(async (a: any) => {
      const [albums, top] = await Promise.all([
        dz("getArtistAlbums", { artistId: a.id, limit: 10 }),
        dz("getArtistTopTracks", { artistId: a.id, limit: 5 }),
      ]);
      return { artist: a, albums: rows(albums), top: rows(top) };
    }),
  );

  // Every album released in the last 9 months, from the seed artist, related
  // artists and the editorial new-release feed.
  const newAlbums: any[] = [
    ...freshAlbums(rows(seedAlbums), 3),
    ...perArtist.flatMap((p) => freshAlbums(p.albums, 2)),
    ...freshAlbums(rows(editorial), 10),
  ].slice(0, 22);

  console.log("[rec] newAlbums", newAlbums.length);
  const albumTracks = await Promise.all(
    newAlbums.map(async (al) => ({ album: al, tracks: rows(await dz("getAlbumTracks", { albumId: al.id, limit: 12 })) })),
  );

  /* ---------- assemble ---------- */

  // Verified-fresh album tracks (singles AND strong album cuts).
  for (const { album, tracks } of albumTracks) {
    const picks = tracks
      .slice()
      .sort((a: any, b: any) => (Number(b?.rank) || 0) - (Number(a?.rank) || 0))
      .slice(0, 3);
    for (const t of picks) {
      push(
        toCandidate(t, "recent", {
          album,
          releaseDate: album?.release_date,
          reason: `New release — ${album?.title ?? ""}`.trim(),
        }),
      );
    }
  }

  // Songs that sit right next to the seed.
  for (const t of [...rows(radio), ...rows(artistRadio)])
    push(toCandidate(t, "related", { reason: "Close to the song you picked" }));

  // Current charts.
  for (const t of rows(globalChart)) push(toCandidate(t, "trending", { reason: "Charting right now" }));

  // Related-artist favourites and deeper cuts.
  perArtist.forEach((p, i) => {
    p.top.forEach((t: any, j: number) =>
      push(toCandidate(t, j === 0 ? "fanfav" : i % 2 ? "hidden" : "classic", { reason: `Because you're hearing ${p.artist?.name ?? ""}`.trim() })),
    );
  });

  // Sort so the strongest material leads; the queue builder reorders anyway.
  out.sort((a, b) => {
    if (a.freshness !== b.freshness) return a.freshness === "current" ? -1 : 1;
    return b.rank - a.rank;
  });

  return out.slice(0, Math.max(140, count * 3));
}
