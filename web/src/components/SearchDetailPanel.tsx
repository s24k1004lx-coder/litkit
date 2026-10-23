import { useEffect, useState } from 'react';
import { api, type SearchResultItem } from '../lib/api';
import type { Bookmark } from '../lib/bookmarks';
import { citeAPA, citeBibTeX, citePlain, structuredSummary } from '../lib/paperUtils';
import { sourceClass, sourceName } from '../lib/sources';
import { TranslatedText } from './TranslatedText';

interface Props {
  paper: SearchResultItem;
  bookmark?: Bookmark;
  ja: boolean;
  onClose: () => void;
  onToggleBookmark: () => void;
  /** メモ・AI要約など、ユーザーが明示的に残したものを保存する（未保存ならブックマークも作る） */
  onSave: (fields: Partial<Bookmark>) => void;
  /** 取得した補足情報の保存。ブックマーク済みのときだけ書き込む */
  onSaveIfBookmarked: (fields: Partial<Bookmark>) => void;
  onSimilar: () => void;
  inLibrary: boolean;
  adding: boolean;
  onAdd: () => void;
  /** true なら右からのパネルではなく、ページとして表示する（onClose は「戻る」） */
  page?: boolean;
}

type CiteTab = 'apa' | 'bib' | 'plain';

function candidateUrls(p: SearchResultItem): string[] {
  const doiUrl = p.doi ? (p.doi.startsWith('http') ? p.doi : `https://doi.org/${p.doi}`) : null;
  return [...new Set([p.pdf_url, p.url, doiUrl].filter((u): u is string => !!u))];
}

/** 画面右からスライドインする詳細パネル（paper-researcher のレイアウト）。 */
export function SearchDetailPanel({
  paper: p, bookmark, ja, onClose, onToggleBookmark, onSave, onSaveIfBookmarked, onSimilar,
  inLibrary, adding, onAdd, page = false,
}: Props) {
  const [tldr, setTldr] = useState<string | null>(bookmark?.tldr ?? null);
  const [extraAbstract, setExtraAbstract] = useState<{ text: string; source: string } | null>(null);
  const [busy, setBusy] = useState<'enrich' | 'pdf' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | undefined>(bookmark?.aiSummary);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [citeTab, setCiteTab] = useState<CiteTab>('apa');
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(bookmark?.note ?? '');

  const abstract = p.abstract || extraAbstract?.text || null;
  const sections = structuredSummary(abstract);
  const urls = candidateUrls(p);

  // 要旨・TLDRが足りなければ Semantic Scholar → PDF本文 の順で補う
  useEffect(() => {
    let alive = true;
    (async () => {
      let found = p.abstract;
      if (!p.abstract || !tldr) {
        setBusy('enrich');
        try {
          const e = await api.previewEnrich(p.title, p.doi);
          if (!alive) return;
          if (e.tldr) {
            setTldr(e.tldr);
            onSaveIfBookmarked({ tldr: e.tldr });
          }
          if (!found && e.abstract) {
            found = e.abstract;
            setExtraAbstract({ text: e.abstract, source: 'Semantic Scholar' });
            onSaveIfBookmarked({ abstract: e.abstract });
          }
        } catch (err) {
          if (alive) setNotice(err instanceof Error ? err.message : '補足情報の取得に失敗しました');
        }
      }
      if (!found && urls.length) {
        setBusy('pdf');
        try {
          const r = await api.previewAbstract(urls);
          if (!alive) return;
          setExtraAbstract({ text: r.abstract, source: r.abstract_source });
          onSaveIfBookmarked({ abstract: r.abstract });
        } catch {
          /* 取得できなければ「要旨なし」のまま表示する */
        }
      }
      if (alive) setBusy(null);
    })();
    return () => {
      alive = false;
    };
    // 論文ごとに親が key で作り直すため、マウント時の1回だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await api.previewSummarize(p.title, abstract ?? '', urls);
      setAiSummary(r.summary);
      onSaveIfBookmarked({ aiSummary: r.summary });
    } catch (e) {
      setAiError('AI要約に失敗しました: ' + (e instanceof Error ? e.message : ''));
    }
    setAiLoading(false);
  };

  const citeText = citeTab === 'apa' ? citeAPA(p) : citeTab === 'bib' ? citeBibTeX(p) : citePlain(p);
  const copyCite = async () => {
    try {
      await navigator.clipboard.writeText(citeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボードが使えない環境では何もしない */
    }
  };

  const content = (
        <div className={page ? 'result-page' : 'panel-inner'}>
          <h2 className="d-title"><TranslatedText text={p.title} enabled={ja} /></h2>
          <div className="d-authors">{p.authors.join(', ') || '著者不明'}</div>
          <div className="d-meta">
            {p.year && <span>{p.year}年</span>}
            {p.venue && <span>{p.venue}</span>}
            <span className={`bdg bdg-api ${sourceClass(p.source)}`}>{sourceName(p.source)}</span>
            <span className={`bdg bdg-api rel-${p.relevance}`}>関連度 {{ high: '高', mid: '中', low: '低' }[p.relevance] ?? p.relevance}</span>
          </div>

          <div className="d-links">
            <button className={`d-link ${inLibrary ? '' : 'primary'}`} onClick={onAdd} disabled={inLibrary || adding}>
              {inLibrary ? '✓ ライブラリに追加済' : adding ? '追加中…' : '＋ ライブラリに追加'}
            </button>
            <button className={`d-link ${bookmark ? 'primary' : ''}`} onClick={onToggleBookmark}>
              {bookmark ? '★ ブックマーク済' : '☆ ブックマークに追加'}
            </button>
            {p.pdf_url && <a className="d-link primary" href={p.pdf_url} target="_blank" rel="noopener noreferrer">PDF を開く</a>}
            {p.doi && <a className="d-link" href={p.doi.startsWith('http') ? p.doi : `https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer">DOI</a>}
            {p.url && <a className="d-link" href={p.url} target="_blank" rel="noopener noreferrer">{sourceName(p.source)}</a>}
            <button className="d-link" onClick={() => { onSimilar(); if (!page) onClose(); }}>類似論文を探す</button>
          </div>

          {busy === 'enrich' && <div className="d-loading"><div className="spinner sm" />Semantic Scholar から補足情報を取得中…</div>}
          {busy === 'pdf' && <div className="d-loading"><div className="spinner sm" />要旨が見つからないため、PDF本文を読み込んでいます…</div>}
          {notice && !tldr && <div className="err soft">{notice}</div>}

          {tldr && (
            <div className="d-section">
              <div className="d-section-title">ひとことで言うと</div>
              <p className="d-tldr"><TranslatedText text={tldr} enabled={ja} showOriginal /></p>
              <div className="d-src">出典: Semantic Scholar TLDR（AIによる1文要約）</div>
            </div>
          )}

          {sections.length > 0 && (
            <div className="d-section">
              <div className="d-section-title">構造化要約</div>
              {sections.map((s) => (
                <div className="d-summary-block" key={s.label}>
                  <div className="d-summary-label">{s.label}</div>
                  <div className="d-summary-text"><TranslatedText text={s.text} enabled={ja} showOriginal /></div>
                </div>
              ))}
              <div className="d-src">要旨の文を役割別に並べ替えたもの（内容は原文のまま）</div>
            </div>
          )}

          <div className="d-section">
            <div className="d-section-title">要旨</div>
            {abstract ? (
              <>
                {/* 構造化要約が同じ文を訳して表示済みなら、翻訳APIの使用量を抑えるため要旨は原文のまま出す */}
                <p className="d-abstract"><TranslatedText text={abstract} enabled={ja && sections.length === 0} showOriginal /></p>
                {extraAbstract && <div className="d-src">要旨の出典: {extraAbstract.source}</div>}
              </>
            ) : (
              !busy && <p className="d-hint">要旨を取得できませんでした（PDFが非公開、またはスキャン画像の可能性があります）。DOI またはリンクから原文をご確認ください。</p>
            )}
          </div>

          {(abstract || urls.length > 0) && (
            <div className="d-section">
              <div className="d-section-title">AI要約</div>
              {aiSummary && (
                <>
                  <div className="d-ai">{aiSummary}</div>
                  <div className="d-src">Claude による要約（原文を読み違えている可能性があります。引用・記述の根拠にする前に原文で確認してください）</div>
                </>
              )}
              {aiLoading ? (
                <div className="d-loading"><div className="spinner sm" />Claude が要約を作成中…（数秒〜十数秒）</div>
              ) : (
                <>
                  <button className="d-link primary" onClick={runAiSummary} style={aiSummary ? { marginTop: 10 } : undefined}>
                    {aiSummary ? 'もう一度要約する' : 'AIで要約する'}
                  </button>
                  {!aiSummary && <div className="d-src">上の抜き出し要約で足りないときだけ使ってください。Claude Code の利用枠を消費します。</div>}
                </>
              )}
              {aiError && <div className="d-err">{aiError}</div>}
            </div>
          )}

          <div className="d-section">
            <div className="d-section-title">引用</div>
            <div className="d-cite-tabs">
              {([['apa', 'APA'], ['bib', 'BibTeX'], ['plain', 'テキスト']] as const).map(([k, label]) => (
                <button key={k} className={`d-cite-tab ${citeTab === k ? 'on' : ''}`} onClick={() => setCiteTab(k)}>{label}</button>
              ))}
            </div>
            <div className="d-cite-box">{citeText}</div>
            <button className="btn-copy" onClick={copyCite}>{copied ? 'コピーしました' : 'クリップボードにコピー'}</button>
          </div>

          <div className="d-section">
            <div className="d-section-title">メモ</div>
            <div className="d-notes">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="この論文についてのメモを記入…（保存するとブックマークにも追加されます）"
              />
              <button className="save-note" onClick={() => onSave({ note: note.trim() || undefined })}>メモを保存</button>
            </div>
          </div>

          <div className="d-scope">
            情報の範囲: アブストラクト（または PDF 冒頭）に基づく参考情報です。「ライブラリに追加」してカード化するまで根拠IDはなく、論文の内容として記述する根拠にはできません。
          </div>
        </div>
  );

  if (page) {
    return (
      <div className="main">
        <button className="back" onClick={onClose}>← 検索結果に戻る</button>
        {content}
      </div>
    );
  }
  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <aside className="panel open" role="dialog" aria-label="論文の詳細">
        <div className="panel-close">
          <button className="btn-close" onClick={onClose}>閉じる</button>
        </div>
        {content}
      </aside>
    </>
  );
}
