const BASE = '/api';

/** FastAPI の HTTPException は {detail: "..."} で理由を返すので、あれば画面に出せるよう取り出す */
export const UNAUTHORIZED_EVENT = 'litkit:unauthorized';

async function errorFrom(res: Response): Promise<Error> {
  // ログインが切れた／必要になったら、画面全体をログイン画面に切り替える
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const detail = await res.json().then((d) => d?.detail, () => null);
  return new Error(typeof detail === 'string' ? detail : `API error: ${res.status}`);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await errorFrom(res);
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

/** PDFなど生のバイト列を本体にして送る。失敗時は理由を Error の message で返す */
async function postBytes<T>(path: string, file: File): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export interface AddOutcome {
  card_id: string;
  /** false なら既にカードがあった */
  created: boolean;
  depth: string;
  title: string;
  pdf_error: string | null;
}

export interface InboxProcessResult extends Partial<AddOutcome> {
  file: string;
  error?: string;
}

export interface AskHit {
  id: string;
  title: string;
  l1: string | null;
  depth: string;
  abstract_only: boolean;
}

export interface ReviewResult {
  found: boolean;
  text: string;
  path: string | null;
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

export interface StreamCallbacks {
  onMeta?: (data: { en_query: string }) => void;
  /** error があるときは、そのソースの取得に失敗している */
  onResults?: (data: { source: string; items: SearchResultItem[]; error?: string }) => void;
  onDone?: (data: { count: number; has_more: boolean; page: number }) => void;
  onError?: (error: Error) => void;
}

export interface SearchOptions {
  /** 検索対象の Source 値（例: ['jstage', 'cinii']）。空なら全ソース */
  sources?: string[];
  page?: number;
  yearFrom?: number;
  yearTo?: number;
}

function searchStream(q: string, limit: number, callbacks: StreamCallbacks, opts: SearchOptions = {}): () => void {
  const params = new URLSearchParams({ q, limit: String(limit), page: String(opts.page ?? 1) });
  if (opts.sources?.length) params.set('sources', opts.sources.join(','));
  if (opts.yearFrom) params.set('year_from', String(opts.yearFrom));
  if (opts.yearTo) params.set('year_to', String(opts.yearTo));
  const url = `${BASE}/search/stream?${params}`;
  const controller = new AbortController();

  (async () => {
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok || !resp.body) {
        if (resp.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        callbacks.onError?.(new Error(`API error: ${resp.status}`));
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (eventType === 'meta') callbacks.onMeta?.(parsed);
          else if (eventType === 'results') callbacks.onResults?.(parsed);
          else if (eventType === 'done') callbacks.onDone?.(parsed);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        callbacks.onError?.(e as Error);
      }
    }
  })();

  return () => controller.abort();
}

export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
}

export const auth = {
  status: async (): Promise<AuthStatus> => {
    const res = await fetch(`${BASE}/auth/status`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
  /** 失敗時は理由（パスワード違い・試行回数超過）を Error の message で返す */
  login: async (password: string): Promise<void> => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const detail = await res.json().then((d) => d?.detail, () => null);
      throw new Error(typeof detail === 'string' ? detail : `ログインに失敗しました (${res.status})`);
    }
  },
  logout: async (): Promise<void> => {
    await fetch(`${BASE}/auth/logout`, { method: 'POST' });
  },
};

export const api = {
  getStats: () => get<Stats>('/stats'),
  getCards: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return get<CardMeta[]>(`/cards${qs}`);
  },
  getCard: (id: string) => get<CardMeta>(`/cards/${id}`),
  updateMemo: (id: string, content: string) => put<{ ok: boolean }>(`/cards/${id}/memo`, { content }),
  search: (q: string, limit = 10) => get<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  searchStream,
  getClaims: () => get<Claim[]>('/claims'),
  checkClaims: () => get<unknown[]>('/claims/check'),
  check: () => get<Record<string, string[]>>('/check'),
  cite: (usedOnly = false) => get<{ text: string }>(`/cite?used_only=${usedOnly}`),
  weekly: () => get<{ text: string }>('/weekly'),
  getTags: () => get<TagCount[]>('/tags'),
  getTimeline: () => get<TimelineEntry[]>('/timeline'),
  reindex: () => post<{ indexed: number }>('/reindex'),

  // 取り込み（検索結果・DOI・URL・PDF）
  addPaper: (paper: SearchResultItem) => post<AddOutcome>('/add', { paper }),
  addIdentifier: (identifier: string) => post<AddOutcome>('/add', { identifier }),
  getInbox: () => get<{ files: { name: string; size: number }[] }>('/inbox'),
  uploadToInbox: (file: File) => postBytes<{ name: string }>(`/inbox/upload?filename=${encodeURIComponent(file.name)}`, file),
  processInbox: () => post<{ results: InboxProcessResult[] }>('/inbox/process'),
  upgradeCard: (id: string, file: File) => postBytes<{ ok: boolean; depth: string }>(`/cards/${encodeURIComponent(id)}/pdf`, file),

  // 蓄積文献への質問・小レビュー
  ask: (q: string) => get<{ results: AskHit[]; keywords: string[] }>(`/ask?q=${encodeURIComponent(q)}`),
  review: (theme: string) => post<ReviewResult>('/review', { theme }),

  // 検索結果のプレビュー補助（カード化前の参考情報）
  previewAbstract: (urls: string[]) =>
    post<{ abstract: string; abstract_source: string; pdf_url: string }>('/preview/abstract', { urls }),
  previewEnrich: (title: string, doi?: string | null) =>
    get<{ tldr: string | null; abstract: string | null }>(
      `/preview/enrich?title=${encodeURIComponent(title)}${doi ? `&doi=${encodeURIComponent(doi)}` : ''}`,
    ),
  previewSimilar: (title: string, doi?: string | null) =>
    get<{ results: SearchResultItem[] }>(
      `/preview/similar?title=${encodeURIComponent(title)}${doi ? `&doi=${encodeURIComponent(doi)}` : ''}`,
    ),
  previewSummarize: (title: string, abstract: string, urls: string[]) =>
    post<{ summary: string }>('/preview/summarize', { title, abstract, urls }),
  previewTranslate: (text: string) => post<{ text: string }>('/preview/translate', { text }),
};
