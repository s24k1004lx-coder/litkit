import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type SearchResultItem } from '../lib/api';
import { useBookmarks } from '../lib/bookmarks';
import { paperKey } from '../lib/paperUtils';
import { stashedPaper } from '../lib/resultNav';
import { SearchDetailPanel } from '../components/SearchDetailPanel';

const JA_KEY = 'litkit-search-ja';

function loadJa(): boolean {
  try {
    return localStorage.getItem(JA_KEY) === '1';
  } catch {
    return false;
  }
}

/** 検索結果1件の詳細ページ。要約・補足情報・原文サイトへのリンク・ライブラリへの追加をまとめて行う。 */
export function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const paper = (location.state as { paper?: SearchResultItem } | null)?.paper ?? stashedPaper();
  const bm = useBookmarks();
  const [ja, setJa] = useState(loadJa);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // 検索結果の途中でスクロールしていても、詳細ページは先頭から見せる
  useEffect(() => window.scrollTo(0, 0), []);

  if (!paper) {
    return (
      <div className="main">
        <button className="back" onClick={() => navigate('/search')}>← 検索へ</button>
        <div className="empty"><b>論文が選ばれていません</b>検索結果から論文のタイトルを選んでください</div>
      </div>
    );
  }

  const toggleJa = (v: boolean) => {
    setJa(v);
    try {
      localStorage.setItem(JA_KEY, v ? '1' : '0');
    } catch {
      /* 保存できなくても今回の表示には反映される */
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      const o = await api.addPaper(paper);
      setAdded(true);
      showToast(!o.created ? '既にライブラリにあります'
        : o.depth === 'full_text' ? 'ライブラリに追加しました（本文あり）' : 'ライブラリに追加しました（アブストのみ）');
    } catch (e) {
      showToast(e instanceof Error ? `追加に失敗しました: ${e.message}` : '追加に失敗しました');
    }
    setAdding(false);
  };

  const bookmark = bm.items.find((b) => paperKey(b) === paperKey(paper));

  return (
    <>
      <div className="main" style={{ paddingBottom: 0 }}>
        <label className="ja-toggle" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <input type="checkbox" checked={ja} onChange={(e) => toggleJa(e.target.checked)} /> 詳細を日本語訳
        </label>
      </div>
      <SearchDetailPanel
        page
        paper={paper}
        bookmark={bookmark}
        ja={ja}
        onClose={() => navigate(-1)}
        onToggleBookmark={() => bm.toggle(paper)}
        onSave={(fields) => { bm.patch(paper, fields); showToast('メモを保存しました'); }}
        onSaveIfBookmarked={(fields) => bm.patchIfSaved(paper, fields)}
        onSimilar={() => navigate('/search', { state: { similarOf: paper } })}
        inLibrary={added || paper.has_card}
        adding={adding}
        onAdd={add}
      />
      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </>
  );
}
