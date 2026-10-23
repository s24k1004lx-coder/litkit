import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type CardMeta } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';

type Tab = 'l1' | 'l2' | 'l3' | 'memo';

const TAB_LABELS: Record<Tab, string> = { l1: 'L1 一行要約', l2: 'L2 判断用', l3: 'L3 精読', memo: 'メモ' };

export function PaperDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('l2');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api.getCard(id)
      .then(c => {
        setCard(c);
        const memoMatch = c.body?.match(/## メモ・疑問\n([\s\S]*?)(?=\n## |$)/);
        setMemo(memoMatch ? memoMatch[1].trim() : '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const saveMemo = async () => {
    if (!id) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateMemo(id, memo);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const upgrade = async (file: File) => {
    if (!id) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      await api.upgradeCard(id, file);
      setCard(await api.getCard(id));
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : '昇格に失敗しました');
    }
    setUpgrading(false);
  };

  const remove = async () => {
    if (!id || !card) return;
    if (!window.confirm(`「${card.title}」をライブラリから削除します。元に戻せません。よろしいですか？`)) return;
    const withPdf = !!card.pdf && window.confirm('保存してある本文PDFも削除しますか？（OK: 削除 / キャンセル: 残す）');
    try {
      await api.deleteCard(id, withPdf);
      navigate('/library', { replace: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '削除に失敗しました');
    }
  };

  const back = (
    <button className="back" onClick={() => navigate(-1)}>← 戻る</button>
  );

  if (loading) {
    return <div className="main">{back}<div style={{ marginTop: 20 }}><Skeleton height={300} /></div></div>;
  }

  if (!card) {
    return (
      <div className="main">
        {back}
        <div className="empty"><b>カードが見つかりません</b>ライブラリから選び直してください</div>
      </div>
    );
  }

  const body = card.body || '';
  const l2Match = body.match(/## L2：判断用要約\n([\s\S]*?)(?=\n## )/);
  const l3Match = body.match(/## L3：精読要約\n([\s\S]*?)(?=\n## )/);
  const l2 = l2Match ? l2Match[1].trim() : '';
  const l3 = l3Match ? l3Match[1].trim() : '';
  const isAbstractOnly = card.depth === 'abstract_only';

  return (
    <div className="main">
      {back}

      <div className="card-head">
        <h1>{card.title}</h1>
        <div className="d-authors">{card.authors.join(', ') || '著者不明'}</div>
        <div className="d-meta" style={{ marginBottom: 12 }}>
          {card.year && <span>{card.year}年</span>}
          {card.venue && <span>{card.venue}</span>}
          {card.doi && <span>DOI: {card.doi}</span>}
        </div>
        <div className="p-badges" style={{ marginBottom: 0 }}>
          <Badge variant={isAbstractOnly ? 'warn' : 'ok'}>{isAbstractOnly ? 'アブストのみ' : '精読済'}</Badge>
          <Badge>{card.source}</Badge>
          {card.relevance && <Badge variant={card.relevance === 'high' ? 'accent' : 'default'}>関連度 {{ high: '高', mid: '中', low: '低' }[card.relevance] ?? card.relevance}</Badge>}
          {card.tags.map(t => <Badge key={t}>{t}</Badge>)}
        </div>
        <div className="d-links">
          {card.url && <a className="d-link primary" href={card.url} target="_blank" rel="noopener noreferrer">論文ページを開く</a>}
          {card.doi && <button className="d-link" onClick={() => navigator.clipboard.writeText(card.doi!)}>DOIをコピー</button>}
          <button className="d-link danger" onClick={remove}>ライブラリから削除</button>
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 28 }}>
        {(['l1', 'l2', 'l3', 'memo'] as Tab[]).map(t => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>
        ))}
      </div>

      {tab === 'l1' && <div className="card-body">{card.l1 || '（L1未作成）'}</div>}

      {tab === 'l2' && <div className="card-body">{l2 || '（L2未作成）'}</div>}

      {tab === 'l3' && (
        isAbstractOnly ? (
          <div className="card-body plain">
            <div className="callout warn" style={{ marginBottom: 0 }}>
              <h3>本文未取得のため精読要約はありません</h3>
              本文PDFを追加すると、本文ありのカードに昇格できます。
            </div>
            <div className="d-links" style={{ marginTop: 16 }}>
              <button className="d-link primary" onClick={() => pdfRef.current?.click()} disabled={upgrading}>
                {upgrading ? '昇格中…' : 'PDFを選んで昇格'}
              </button>
              <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) upgrade(f); e.target.value = ''; }} />
            </div>
            {upgradeError && <div className="d-err">{upgradeError}</div>}
          </div>
        ) : (
          <div className="card-body">{l3 || '（L3未作成）'}</div>
        )
      )}

      {tab === 'memo' && (
        <div className="card-body plain">
          <div className="d-notes">
            <textarea
              value={memo}
              onChange={e => { setMemo(e.target.value); setSaved(false); }}
              placeholder="メモ・疑問を記入…"
              style={{ minHeight: 200 }}
            />
            <button className="save-note" onClick={saveMemo} disabled={saving}>{saved ? '保存しました' : '保存'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
