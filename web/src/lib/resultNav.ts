import type { SearchResultItem } from './api';

const KEY = 'litkit-result-paper';

/** 結果の詳細ページへ渡す論文。リロードしても開けるよう sessionStorage にも置く。 */
export function stashPaper(p: SearchResultItem): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 保存できなくても、画面遷移の state で渡せる */
  }
}

export function stashedPaper(): SearchResultItem | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
