import { useEffect, useState } from 'react';
import { api, type Stats, type TagCount, type TimelineEntry } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const tick = { fontSize: 11, fill: 'var(--text-3)', fontWeight: 700 };
const tooltipStyle = { background: 'var(--surface)', border: '2px solid var(--text)', borderRadius: 0, fontSize: 12, fontWeight: 700 };

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
      <>
        <PageHead title="ダッシュボード" sub="Dashboard" />
        <div className="main page-body">
          <div className="stats">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={110} />)}
          </div>
        </div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <PageHead title="ダッシュボード" sub="Dashboard" />
        <div className="main"><EmptyState title="データなし" description="APIに接続できません" /></div>
      </>
    );
  }

  const suggestions: string[] = [];
  if (stats.unsupported_claims > 0) suggestions.push(`根拠なしの主張が ${stats.unsupported_claims} 件あります`);
  if (stats.unread_high_relevance > 0) suggestions.push(`高関連度の未読文献が ${stats.unread_high_relevance} 件あります`);
  if (stats.total_cards === 0) suggestions.push('まず「検索」で文献を探してみましょう');

  return (
    <>
      <PageHead title="ダッシュボード" sub="Dashboard" />
      <div className="main page-body">
        <div className="stats">
          <StatCard label="蓄積文献" value={stats.total_cards} sub={`精読 ${stats.full_text} / アブストのみ ${stats.abstract_only}`} />
          <StatCard label="今週追加" value={stats.added_this_week} />
          <StatCard
            label="根拠カバー率"
            value={`${stats.claim_coverage}%`}
            sub={stats.unsupported_claims > 0 ? `根拠なし ${stats.unsupported_claims} 件` : undefined}
          />
          <StatCard label="未読（高関連）" value={stats.unread_high_relevance} />
        </div>

        <div className="grid-2">
          <div className="block">
            <div className="d-section-title">文献蓄積推移</div>
            {timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={aggregateByDate(timeline)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={tick} />
                  <YAxis tick={tick} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="cumulative" stroke="var(--accent)" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">文献を追加すると推移が表示されます</div>
            )}
          </div>

          <div className="block">
            <div className="d-section-title">テーマ別分布</div>
            {tags.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tags.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={tick} />
                  <YAxis dataKey="tag" type="category" tick={tick} width={100} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="var(--accent)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">タグ付きの文献を追加すると分布が表示されます</div>
            )}
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="callout">
            <h3>次にやるとよいこと</h3>
            <ul>{suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}

        {timeline.length > 0 && (
          <div className="block">
            <div className="d-section-title">最近の活動</div>
            <ul className="kp" style={{ margin: 0 }}>
              {timeline.slice(0, 10).map((e) => (
                <li key={e.id}><span className="activity-date">{e.date}</span>{e.title}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
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
