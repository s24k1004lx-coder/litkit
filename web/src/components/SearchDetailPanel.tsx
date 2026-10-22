import { useEffect, useState } from 'react';
import { X, BookOpen, Star, Copy, Sparkles, Loader2, Layers } from 'lucide-react';
import { api, type SearchResultItem } from '../lib/api';
import type { Bookmark } from '../lib/bookmarks';
import { citeAPA, citeBibTeX, citePlain, structuredSummary } from '../lib/paperUtils';
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
}

type CiteTab = 'apa' | 'bib' | 'plain';

const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 };
const section: React.CSSProperties = { marginBottom: 20 };
const smallNote: React.CSSProperties = { fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 };
const ctlButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
  borderRadius: 'var(--radius-ctl)', border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 12, cursor: 'pointer',
};

function candidateUrls(p: SearchResultItem): string[] {
  const doiUrl = p.doi ? (p.doi.startsWith('http') ? p.doi : `https://doi.org/${p.doi}`) : null;
  return [...new Set([p.pdf_url, p.url, doiUrl].filter((u): u is string => !!u))];
}

export function SearchDetailPanel({
  paper: p, bookmark, ja, onClose, onToggleBookmark, onSave, onSaveIfBookmarked, onSimilar,
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
      const urls = candidateUrls(p);
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
      const r = await api.previewSummarize(p.title, abstract ?? '', candidateUrls(p));
      setAiSummary(r.summary);
      onSaveIfBookmarked({ aiSummary: r.summary });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI要約に失敗しました');
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

  return (
    <div
      style={{
        width: 420, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface)',
        padding: 20, overflowY: 'auto', maxHeight: 'calc(100vh - 100px)', animation: 'slideIn 200ms ease-out',
      }}
    >
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
          <TranslatedText text={p.title} enabled={ja} />
        </h3>
        <button onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {p.authors.join(', ') || '著者不明'} ({p.year || '?'})
        {p.venue && <><br />{p.venue}</>}
        {p.doi && <><br />DOI: {p.doi}</>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <button onClick={onToggleBookmark} style={{ ...ctlButton, ...(bookmark ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}>
          <Star size={13} fill={bookmark ? 'currentColor' : 'none'} /> {bookmark ? '保存済み' : 'ブックマーク'}
        </button>
        <button onClick={onSimilar} style={ctlButton}><Layers size={13} /> 類似論文</button>
        {p.url && (
          <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ ...ctlButton, color: 'var(--accent)', textDecoration: 'none' }}>
            <BookOpen size={13} /> 論文ページ
          </a>
        )}
        {p.pdf_url && (
          <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" style={{ ...ctlButton, textDecoration: 'none' }}>PDF</a>
        )}
      </div>

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          {busy === 'enrich' ? 'Semantic Scholar から補足情報を取得中…' : '要旨が見つからないため、PDF本文から探しています…'}
        </div>
      )}
      {notice && !tldr && <div style={{ ...smallNote, color: 'var(--warn)', marginBottom: 16 }}>{notice}</div>}

      {tldr && (
        <div style={section}>
          <h4 style={sectionTitle}>ひとことで言うと</h4>
          <p style={{ fontSize: 13, lineHeight: 1.7 }}><TranslatedText text={tldr} enabled={ja} showOriginal /></p>
          <div style={smallNote}>出典: Semantic Scholar TLDR（AIによる1文要約）</div>
        </div>
      )}

      {sections.length > 0 && (
        <div style={section}>
          <h4 style={sectionTitle}>構造化要約（要旨の文を役割別に並べたもの）</h4>
          {sections.map((s) => (
            <div key={s.label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}><TranslatedText text={s.text} enabled={ja} showOriginal /></div>
            </div>
          ))}
        </div>
      )}

      <div style={section}>
        <h4 style={sectionTitle}>要旨</h4>
        {abstract ? (
          <>
            {/* 構造化要約が同じ文を訳して表示済みなら、翻訳APIの使用量を抑えるため要旨は原文のまま出す */}
            <p style={{ fontSize: 13, lineHeight: 1.7 }}><TranslatedText text={abstract} enabled={ja && sections.length === 0} showOriginal /></p>
            {extraAbstract && <div style={smallNote}>要旨の出典: {extraAbstract.source}</div>}
          </>
        ) : (
          !busy && <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>（要旨を取得できませんでした。論文ページで原文を確認してください）</p>
        )}
      </div>

      <div style={section}>
        <h4 style={sectionTitle}>AI要約</h4>
        {aiSummary && (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: 12, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-ctl)' }}>
              {aiSummary}
            </div>
            <div style={smallNote}>Claude による要約。原文を読み違えている可能性があるため、引用・記述の根拠にする前に原文で確認すること。</div>
          </>
        )}
        {aiLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Claude が要約を作成中…（数秒〜十数秒）
          </div>
        ) : (
          (abstract || candidateUrls(p).length > 0) && (
            <button onClick={runAiSummary} style={{ ...ctlButton, marginTop: aiSummary ? 8 : 0 }}>
              <Sparkles size={13} /> {aiSummary ? 'もう一度要約する' : 'AIで要約する'}
            </button>
          )
        )}
        {!aiSummary && !aiLoading && <div style={smallNote}>上の抜き出し要約で足りないときだけ使用。Claude Code の利用枠を消費します。</div>}
        {aiError && <div style={{ ...smallNote, color: 'var(--risk)' }}>{aiError}</div>}
      </div>

      <div style={section}>
        <h4 style={sectionTitle}>引用</h4>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {([['apa', 'APA'], ['bib', 'BibTeX'], ['plain', 'テキスト']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCiteTab(k)}
              style={{
                ...ctlButton, padding: '3px 10px',
                ...(citeTab === k ? { background: 'var(--accent-weak)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <pre style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-ctl)' }}>
          {citeText}
        </pre>
        <button onClick={copyCite} style={{ ...ctlButton, marginTop: 8 }}>
          <Copy size={13} /> {copied ? 'コピーしました' : 'クリップボードにコピー'}
        </button>
      </div>

      <div style={section}>
        <h4 style={sectionTitle}>メモ</h4>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="この論文についてのメモ（保存するとブックマークにも追加されます）"
          rows={4}
          style={{
            width: '100%', padding: 10, fontSize: 13, lineHeight: 1.6, resize: 'vertical',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-ctl)',
            background: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'inherit',
          }}
        />
        <button onClick={() => onSave({ note: note.trim() || undefined })} style={{ ...ctlButton, marginTop: 8 }}>メモを保存</button>
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-ctl)', fontSize: 11, color: 'var(--text-muted)' }}>
        情報の範囲: アブストラクト（または PDF 冒頭）に基づく参考情報。カード化（litkit add）するまで根拠IDはなく、論文の内容として記述する根拠にはできません。
      </div>
    </div>
  );
}
