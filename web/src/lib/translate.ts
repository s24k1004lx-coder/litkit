import { api } from './api';

const CACHE_KEY = 'litkit-translations';
const MAX_ENTRIES = 400;

function hash(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return h.toString(36) + t.length.toString(36);
}

function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

const cache = loadCache();
const inflight = new Map<string, Promise<string>>();

function saveCache() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete cache[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* 保存できなくても翻訳結果はメモリ上に残る */
  }
}

/** 英→日翻訳（結果はブラウザにキャッシュ）。失敗時は reject。 */
export function translateToJa(text: string): Promise<string> {
  const k = hash(text);
  if (cache[k]) return Promise.resolve(cache[k]);
  const pending = inflight.get(k);
  if (pending) return pending;
  const p = api
    .previewTranslate(text)
    .then((r) => {
      cache[k] = r.text;
      saveCache();
      return r.text;
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

export function cachedTranslation(text: string): string | undefined {
  return cache[hash(text)];
}
