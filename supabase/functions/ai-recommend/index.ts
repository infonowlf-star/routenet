// AI recommendation engine — returns ~50 song suggestions given a seed track
// and recent user taste signals. Model output is title/artist pairs that the
// client resolves via the existing `deezer` edge function.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { chatJson, LlmUnavailableError } from "../_shared/llm.ts";


interface Signal { type: string; title?: string; artist?: string; genre?: string; weight?: number }
interface Body {
  seed?: { title: string; artist: string; genre?: string } | null;
  signals?: Signal[];
  followedArtists?: string[];
  likedSongs?: string[];
  recentlyPlayed?: string[];
  playlistSongs?: string[];
  savedAlbums?: string[];
  recentArtists?: string[];
  excludeTitles?: string[];
  distribution?: Record<string, number>;
  variety?: string;
  count?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const count = Math.max(10, Math.min(60, body.count ?? 50));
    const seed = body.seed;
    const signals = (body.signals ?? []).slice(0, 40);
    const followed = (body.followedArtists ?? []).slice(0, 30);
    const liked = (body.likedSongs ?? []).slice(0, 30);
    const recent = (body.recentlyPlayed ?? []).slice(0, 20);
    const playlistSongs = (body.playlistSongs ?? []).slice(0, 25);
    const albums = (body.savedAlbums ?? []).slice(0, 20);
    const recentArtists = (body.recentArtists ?? []).slice(0, 20);
    const exclude = (body.excludeTitles ?? []).slice(0, 120);
    const variety = String(body.variety ?? Math.random().toString(36).slice(2, 8));

    const signalSummary = signals
      .map((s) => `- ${s.type}: ${s.artist ?? ""}${s.title ? ` — ${s.title}` : ""}${s.genre ? ` [${s.genre}]` : ""}${s.weight ? ` (w=${s.weight})` : ""}`)
      .join("\n");

    const now = new Date();
    const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });
    const cutoff = new Date(now.getTime() - 275 * 24 * 60 * 60 * 1000);
    const cutoffName = cutoff.toLocaleString("en-US", { month: "long", year: "numeric" });
    const minRecent = Math.ceil(count * 0.57);

    const system = `You are a world-class human music curator building a live listening queue, not a "similar songs" list.
Today is ${monthName}. Answer the question: "If I liked this song, what would I want to hear next — including what is happening in this scene RIGHT NOW?"

Return exactly ${count} real, existing songs as JSON. Each item MUST have:
  "title"     – the exact released song title
  "artist"    – the exact primary artist name
  "year"      – release year (number)
  "freshness" – "current" if released on/after ${cutoffName} (the last 9 months), otherwise "catalog"
  "role"      – one of: related | trending | recent | fanfav | classic | hidden
  "reason"    – max 12 words explaining why it follows the previous vibe

## 1. Read the seed properly
Infer from the seed song and taste profile: genre, subgenre, scene/city, artist + featured artists, production style, BPM/energy, mood, era, popularity and momentum, and related artists. Build the queue around that CONTEXT, not around the seed's artist. Never let one artist dominate.

## 2. Freshness is mandatory
- At least ${minRecent} of the ${count} songs (57%) MUST be released within the last 9 months (on/after ${cutoffName}).
- The recent pool must include BOTH new singles AND strong, relevant tracks from albums released in the last 9 months. An album cut does not need to be the lead single — judge it on popularity, streaming momentum, relevance to the seed, and genre fit.
- If there is a strong supply of relevant new music, go higher (60-70%). Never force a weak new song over a highly relevant older one, and never force old songs in just to hit a number.

## 3. Balance four lanes
  NEW DISCOVERY — recent releases, rising artists, new album cuts, current underground
  CURRENT HITS — songs gaining attention now, major recent releases
  FAMILIAR FAVOURITES — established, proven songs that fit the context
  CATALOG DISCOVERY — older deep cuts and genre classics the listener may have missed

## 4. Diversity (hard rules)
- Max 2 songs per artist, max 2 from the same album, at least ${Math.max(12, Math.floor(count * 0.6))} DIFFERENT artists.
- At least half must be artists NOT in FOLLOWED ARTISTS, LIKED SONGS or RECENTLY HEARD ARTISTS.
- Avoid repeating the same featured artists or the same producer sound over and over.
- Never return a song that appears in the taste profile lists — those lists teach you the taste, they are not a song source.

## 5. Flow and distribution
- Order the list like a DJ set: alternate current releases with familiar and catalog picks so new songs are NEVER grouped together. Never more than 2 songs in a row from the same freshness lane, and never two songs in a row from the same artist.
- Transitions should make musical sense (energy, mood, subgenre), not be sorted by release date.

## 6. Other hard rules
- Real songs only, on streaming services. No mixes, edits, karaoke, covers, sped-up, live or AI versions.
- Never repeat the seed or any excluded title. Do not build a generic chart playlist.
- Vary picks between runs. Variety token: ${variety}.
- Return ONLY valid JSON, no prose.`;

    const user = `SEED: ${seed ? `${seed.title} — ${seed.artist}${seed.genre ? ` (${seed.genre})` : ""}` : "(none — use signals)"}

--- TASTE PROFILE (understand it; never echo these songs back) ---

FOLLOWED ARTISTS:
${followed.map((a) => `- ${a}`).join("\n") || "(none)"}

LIKED SONGS:
${liked.map((a) => `- ${a}`).join("\n") || "(none)"}

SAVED ALBUMS:
${albums.map((a) => `- ${a}`).join("\n") || "(none)"}

SONGS IN THEIR PLAYLISTS:
${playlistSongs.map((a) => `- ${a}`).join("\n") || "(none)"}

RECENTLY PLAYED:
${recent.map((a) => `- ${a}`).join("\n") || "(none)"}

RECENTLY HEARD ARTISTS (avoid where possible):
${recentArtists.map((a) => `- ${a}`).join("\n") || "(none)"}

RECENT SIGNALS:
${signalSummary || "(none)"}

--- END TASTE PROFILE ---

EXCLUDE (already recommended or played — never return these):
${exclude.map((t) => `- ${t}`).join("\n") || "(none)"}

Return a JSON object: { "tracks": [{ "title": string, "artist": string, "year": number, "freshness": "current"|"catalog", "role": string, "reason": string }] } with exactly ${count} items, at least ${minRecent} of them "current".`;



    // Large lists are split into parallel model calls so a 50-song queue comes
    // back in roughly the time one 25-song call takes.
    const chunkCount = Math.min(4, Math.max(1, Math.ceil(count / 14)));
    const perChunk = Math.ceil(count / chunkCount);

    const askOnce = (n: number, seedNote: string) =>
      chatJson<any>({
        system: system.replace(`exactly ${count} real`, `exactly ${n} real`),
        user: `${user}\n\n${seedNote}\nReturn exactly ${n} items.`,
        json: true,
        temperature: 0.9,
        // Keep recommendations on the fast OpenRouter path only. This avoids
        // provider hops and keeps the queue response inside the UI latency budget.
        prefer: "openrouter",
        openRouterSingleAttempt: true,
        openRouterModel: "google/gemini-2.5-flash-lite",
        openRouterTimeoutMs: 3500,
        // Fast built-in fallback so a low-credit or slow OpenRouter route never
        // leaves the queue empty.
        gatewayModel: "google/gemini-3.1-flash-lite",
        gatewayTimeoutMs: 6000,
        maxOutputTokens: 1500,
      });

    let provider = "openrouter";
    const collected: any[] = [];
    try {
      const results = await Promise.allSettled(
        Array.from({ length: chunkCount }, (_, i) =>
          askOnce(
            perChunk,
            `Batch ${i + 1} of ${chunkCount} — make this batch distinct from the others. At least ${Math.ceil(perChunk * 0.57)} items in this batch must be "current" (released in the last 9 months), mixing new singles with strong tracks from albums released in that window.`,
          ),
        ),
      );

      let anyOk = false;
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        anyOk = true;
        provider = r.value.provider;
        const d: any = r.value.data;
        const rows = Array.isArray(d?.tracks) ? d.tracks : Array.isArray(d) ? d : [];
        collected.push(...rows);
      }
      if (!anyOk) {
        const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        throw first?.reason ?? new Error("no completion");
      }
    } catch (e) {
      if (e instanceof LlmUnavailableError) {
        console.error("[ai-recommend] all providers failed", e.details);
        return json({ tracks: [], unavailable: true, reason: e.reason, details: e.details });
      }
      throw e;
    }

    const tracks = collected;
    const seen = new Set<string>();
    const currentYear = new Date().getFullYear();
    const cleaned = tracks
      .map((t: any) => {
        const year = Number(t?.year) || 0;
        const declared = String(t?.freshness ?? "").trim().toLowerCase();
        const fresh = declared === "current" || (!declared && year >= currentYear);
        return {
          title: String(t?.title ?? "").trim(),
          artist: String(t?.artist ?? "").trim(),
          year,
          freshness: fresh ? "current" : "catalog",
          role: String(t?.role ?? "related").trim().toLowerCase().slice(0, 20),
          reason: String(t?.reason ?? "").trim().slice(0, 140),
        };
      })

      .filter((t: any) => {
        if (!t.title || !t.artist) return false;
        const k = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    return json({ tracks: cleaned, provider });

  } catch (e) {
    console.error(e);
    return json({ error: "internal", message: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
