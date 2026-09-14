export interface NguoncEpisode {
  name: string;
  slug: string;
  embed: string;
}

export interface NguoncServer {
  server_name: string;
  items: NguoncEpisode[];
}

export interface NguoncCategoryGroup {
  group: { name: string };
  list: Array<{ name: string }>;
}

export interface NguoncMovie {
  id: string;
  name: string;
  slug: string;
  original_name: string | null;
  poster_url: string | null;
  thumb_url: string | null;
  description: string | null;
  total_episodes: number | null;
  current_episode: string | null;
  time: string | null;
  quality: string | null;
  language: string | null;
  director: string | null;
  casts: string | null;
  category: Record<string, NguoncCategoryGroup>;
  episodes: NguoncServer[];
}

export interface NguoncListItem {
  name: string;
  slug: string;
  original_name: string | null;
  thumb_url: string | null;
  poster_url: string | null;
  description: string | null;
  total_episodes: number | null;
  current_episode: string | null;
  quality: string | null;
  language: string | null;
  year: string | null;
}

export interface NguoncListResponse {
  items: NguoncListItem[];
  paginate: { current_page: number; total_page?: number; total_items?: number };
}

export interface StremioVideo {
  id: string;
  title: string;
  season: number;
  episode: number;
}

export interface StremioMeta {
  id: string;
  type: 'movie' | 'series';
  name: string;
  poster?: string;
  background?: string;
  description?: string;
  year?: number;
  genres?: string[];
  director?: string[];
  cast?: string[];
  videos?: StremioVideo[];
}
