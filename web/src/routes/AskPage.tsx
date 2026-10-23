import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AskHit, type ReviewResult } from '../lib/api';
import { Badge } from '../components/Badge';
import { PageHead } from '../components/PageHead';

type Mode = 'ask' | 'review';

/** 蓄積文献への質問と小レビュー。CLI の ask / review 相当。根拠はカードIDで示す。 */
export function AskPage() {
  const [mode, setMode] = useState<Mode>('ask');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [hits, setHits] = useState<AskHit[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewResult | null>(null);

  const run = async () => {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'ask') {
        const r = await api.ask(text);
        setHits(r.results);
        setKeywords(r.keywords);
        setAsked(text);
      } else {
        setReview(await api.review(text));
        setAsked(text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '失敗しました');
    }
    setLoading(false);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setAsked(null);
    setError(null);
  };

  return (
    <>
      <PageHead title="質問・レビュー" sub="Ask / Review" />
      <div className="main">
        <div className="tabs" style={{ marginTop: 8 }}>
          <button className={`tab ${mode === 'ask' ? 'on' : ''}`} onClick={() => switchMode('ask')}>蓄積文献に質問</button>
          <button className={`tab ${mode === 'review' ? 'on' : ''}`} onClick={() => switchMode('review')}>小レビュー生成</button>
        </div>

        <div className="search-wrap" style={{ margin: '24px 0 8px' }}>
          <input
            type="text"
            placeholder={mode === 'ask' ? '質問やキーワード（例: 利用動機）' : 'レビューのテーマ（例: 継続利用要因）'}
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <button className="btn-search" onClick={run} disabled={loading || !input.trim()}
            style={{ opacity: loading || !input.trim() ? 0.6 : 1 }}>
            {mode === 'ask' ? '質問' : '生成'}
          </button>
        </div>
        <div className="d-src">
          {mode === 'ask'
            ? 'ライブラリのカードだけを探します。カードにない内容は答えず、「蓄積文献中に該当なし」と示します。'
            : '関連するカードの一覧から notes/reviews/ にレビューの雛形を保存します。論点の整理は手で書き足してください。'}
        </div>

        {error && <div className="err">{error}</div>}
        {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

        {!loading && asked && mode === 'ask' && (
          hits.length === 0 ? (
            <div className="callout warn" style={{ marginTop: 24 }}>
              <h3>蓄積文献中に該当なし</h3>
              ライブラリに根拠となるカードがありません。「検索」で文献を探して追加してください。
              {keywords.length > 0 && <> 検索語の例: {keywords.join(' / ')}</>}
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <div className="toolbar"><span className="info">「{asked}」に関連するカード {hits.length}件</span></div>
              {hits.map((h) => (
                <div className="paper" key={h.id}>
                  <h3 className="p-title"><Link to={`/paper/${h.id}`}>{h.title}</Link></h3>
                  <div className="p-badges">
                    <Badge variant="info">{h.id}</Badge>
                    <Badge variant={h.abstract_only ? 'warn' : 'ok'}>{h.abstract_only ? 'アブストのみに基づく' : '本文あり'}</Badge>
                  </div>
                  {h.l1 && <ul className="kp"><li>{h.l1}</li></ul>}
                </div>
              ))}
            </div>
          )
        )}

        {!loading && asked && mode === 'review' && review && (
          review.found ? (
            <>
              <div className="toolbar">
                <span className="info">保存先: {review.path}</span>
                <button className="btn-export" onClick={() => navigator.clipboard.writeText(review.text).catch(() => {})}>コピー</button>
              </div>
              <div className="report">{review.text}</div>
            </>
          ) : (
            <div className="callout warn" style={{ marginTop: 24 }}>
              <h3>関連文献が見つかりません</h3>
              ライブラリにこのテーマのカードがありません。
            </div>
          )
        )}
      </div>
    </>
  );
}
