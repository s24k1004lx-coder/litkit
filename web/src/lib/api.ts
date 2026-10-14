const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface Stats {
  total_cards: number;
  full_text: number;
  abstract_only: number;
  added_this_week: number;
  claim_coverage: number;
  unsupported_claims: number;
  unread_high_relevance: number;
}

export interface CardMeta {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  source: string;
  lang: string;
  pdf: string | null;
  status: string;
  depth: string;
  rating: number | null;
  tags: string[];
  relevance: string | null;
  l1: string | null;
  added: string;
  updated: string;
  body?: string;
}

export interface SearchResultItem {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  source: string;
  lang: string;
  abstract: string | null;
  pdf_url: string | null;
  is_open_access: boolean | null;
  availability: string;
  relevance: string;
  has_card: boolean;
  l1: string | null;
}

export interface SearchResponse {
  results: SearchResultItem[];
  en_query: string | null;
  count: number;
}

export interface Claim {
  id: string;
  text: string;
  evidence_ids: string[];
  section: string;
  status: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TimelineEntry {
  id: string;
  title: string;
  date: string;
  type: string;
}

export const api = {
  getStats: () => get<Stats>('/stats'),
  getCards: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return get<CardMeta[]>(`/cards${qs}`);
  },
  getCard: (id: string) => get<CardMeta>(`/cards/${id}`),
  updateMemo: (id: string, content: string) => put<{ ok: boolean }>(`/cards/${id}/memo`, { content }),
  search: (q: string, limit = 10) => get<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getClaims: () => get<Claim[]>('/claims'),
  checkClaims: () => get<unknown[]>('/claims/check'),
  check: () => get<Record<string, string[]>>('/check'),
  cite: (usedOnly = false) => get<{ text: string }>(`/cite?used_only=${usedOnly}`),
  weekly: () => get<{ text: string }>('/weekly'),
  getTags: () => get<TagCount[]>('/tags'),
  getTimeline: () => get<TimelineEntry[]>('/timeline'),
  reindex: () => post<{ indexed: number }>('/reindex'),
};
