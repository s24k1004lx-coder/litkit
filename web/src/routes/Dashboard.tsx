import { useEffect, useState } from 'react';
import { BookOpen, Plus, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api, type Stats, type TagCount, type TimelineEntry } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getTags(), api.getTimeline()])
      .then(([s, t, tl]) => { setStats(s); setTags(t); setTimeline(tl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>ダッシュボード</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={100} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return <EmptyState icon={<BookOpen size={40} />} title="データなし" description="APIに接続できません" />;
  }

  const suggestions: string[] = [];
  if (stats.unsupported_claims > 0) suggestions.push(`根拠なしの主張が ${stats.unsupported_claims} 件あります`);
  if (stats.unread_high_relevance > 0) suggestions.push(`高関連度の未読文献が ${stats.unread_high_relevance} 件あります`);
  if (stats.total_cards === 0) suggestions.push('まず litkit search で文献を検索してみましょう');

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>ダッシュボード</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard
          label="蓄積文献"
          value={stats.total_cards}
          sub={`精読 ${stats.full_text} / アブストのみ ${stats.abstract_only}`}
          icon={<BookOpen size={14} />}
        />
        <StatCard
          label="今週追加"
          value={stats.added_this_week}
          icon={<Plus size={14} />}
        />
        <StatCard
          label="根拠カバー率"
          value={`${stats.claim_coverage}%`}
          sub={stats.unsupported_claims > 0 ? `根拠なし ${stats.unsupported_claims} 件` : undefined}
          icon={<ShieldCheck size={14} />}
        />
        <StatCard
          label="未読(高関連)"
          value={stats.unread_high_relevance}
          icon={<AlertTriangle size={14} />}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16 }}>文献蓄積推移</h3>
          {timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={aggregateByDate(timeline)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="cumulative" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
              文献を追加すると推移が表示されます
            </div>
          )}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', padding: 20, boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16 }}>テーマ別分布</h3>
          {tags.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tags.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} />
                <YAxis dataKey="tag" type="category" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} width={100} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
              タグ付きの文献を追加すると分布が表示されます
            </div>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div style={{ background: 'var(--accent-weak)', borderRadius: 'var(--radius-card)', padding: '16px 20px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>次にやるとよいこと</h3>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {timeline.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>最近の活動</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.slice(0, 10).map(e => (
              <div key={e.id} style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="tabular-nums" style={{ color: 'var(--text-subtle)', fontSize: 11, flexShrink: 0 }}>{e.date}</span>
                <span style={{ color: 'var(--text)' }}>{e.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function aggregateByDate(entries: TimelineEntry[]) {
  const byDate: Record<string, number> = {};
  for (const e of entries) {
    byDate[e.date] = (byDate[e.date] || 0) + 1;
  }
  const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  let cum = 0;
  return sorted.map(([date, count]) => {
    cum += count;
    return { date: date.slice(5), cumulative: cum };
  });
}
