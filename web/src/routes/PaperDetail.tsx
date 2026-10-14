import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Copy, AlertTriangle, Save } from 'lucide-react';
import { api, type CardMeta } from '../lib/api';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';

type Tab = 'l1' | 'l2' | 'l3' | 'memo';

export function PaperDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('l2');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

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
    try {
      await api.updateMemo(id, memo);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton height={300} />;
  }

  if (!card) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>カードが見つかりません</div>;
  }

  const body = card.body || '';
  const l2Match = body.match(/## L2：判断用要約\n([\s\S]*?)(?=\n## )/);
  const l3Match = body.match(/## L3：精読要約\n([\s\S]*?)(?=\n## )/);
  const l2 = l2Match ? l2Match[1].trim() : '';
  const l3 = l3Match ? l3Match[1].trim() : '';
  const isAbstractOnly = card.depth === 'abstract_only';

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, marginBottom: 16, padding: 0,
        }}
      >
        <ArrowLeft size={14} /> 戻る
      </button>

      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        border: '1px solid var(--border)', padding: 24, marginBottom: 20,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{card.title}</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              {card.authors.join(', ') || '著者不明'} ({card.year || '?'})
              {card.venue && <> · {card.venue}</>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge variant={isAbstractOnly ? 'warn' : 'ok'}>
                {isAbstractOnly ? 'アブストのみ' : '精読済'}
              </Badge>
              <Badge>{card.source}</Badge>
              {card.relevance && <Badge variant={card.relevance === 'high' ? 'accent' : 'default'}>{card.relevance}</Badge>}
              {card.tags.map(t => <Badge key={t}>{t}</Badge>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {card.url && (
              <a href={card.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 'var(--radius-ctl)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                <ExternalLink size={12} /> 開く
              </a>
            )}
            {card.doi && (
              <button
                onClick={() => navigator.clipboard.writeText(card.doi!)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 'var(--radius-ctl)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', background: 'none', cursor: 'pointer' }}>
                <Copy size={12} /> DOI
              </button>
            )}
          </div>
        </div>

        {card.doi && (
          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>DOI: {card.doi}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {(['l1', 'l2', 'l3', 'memo'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -2,
            }}
          >
            {{ l1: 'L1 一行要約', l2: 'L2 判断用', l3: 'L3 精読', memo: 'メモ' }[t]}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: 24, boxShadow: 'var(--shadow-card)' }}>
        {tab === 'l1' && (
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
            {card.l1 || '（L1未作成）'}
          </div>
        )}

        {tab === 'l2' && (
          <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {l2 || '（L2未作成）'}
          </div>
        )}

        {tab === 'l3' && (
          isAbstractOnly ? (
            <div style={{ padding: '16px 20px', background: 'var(--warn-weak)', borderRadius: 'var(--radius-ctl)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)', marginBottom: 4 }}>本文未取得のため精読要約はありません</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDFを literature/inbox/ に置いて litkit upgrade {card.id} で昇格できます</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {l3 || '（L3未作成）'}
            </div>
          )
        )}

        {tab === 'memo' && (
          <div>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="メモ・疑問を記入…"
              style={{
                width: '100%',
                minHeight: 200,
                padding: 12,
                borderRadius: 'var(--radius-ctl)',
                border: '1px solid var(--border)',
                background: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontSize: 13,
                lineHeight: 1.7,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={saveMemo}
              disabled={saving}
              style={{
                marginTop: 8,
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 16px',
                borderRadius: 'var(--radius-ctl)',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              <Save size={14} /> 保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
