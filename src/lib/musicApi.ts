// =============================================================================
//  NightGram Web — Music API helpers
//  Free music search via iTunes Search API (30-second previews)
//  No API key required.
// =============================================================================

export interface RealTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover: string;
  preview: string; // 30-second preview URL
  source: "itunes";
}

/**
 * Search for real tracks via iTunes Search API.
 * Returns 30-second previews (free, no key needed).
 */
export async function searchTracks(query: string, limit = 25): Promise<RealTrack[]> {
  if (!query.trim()) return [];

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results
      .filter((r: { previewUrl?: string }) => r.previewUrl)
      .map((r: {
        trackId: number;
        trackName: string;
        artistName: string;
        previewUrl: string;
        artworkUrl100: string;
        trackTimeMillis: number;
      }) => ({
        id: String(r.trackId),
        title: r.trackName || "Unknown",
        artist: r.artistName || "Unknown",
        duration: Math.floor((r.trackTimeMillis || 30000) / 1000),
        cover: r.artworkUrl100?.replace("100x100", "300x300") || "",
        preview: r.previewUrl,
        source: "itunes" as const,
      }));
  } catch {
    return [];
  }
}

/**
 * Get recommended / trending tracks.
 */
export async function getTrendingTracks(): Promise<RealTrack[]> {
  const genres = ["synthwave", "lofi hip hop", "dark pop", "electronic"];
  const genre = genres[Math.floor(Math.random() * genres.length)];
  return searchTracks(genre, 15);
}
