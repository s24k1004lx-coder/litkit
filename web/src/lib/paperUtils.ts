import type { SearchResultItem } from './api';

export function paperKey(p: Pick<SearchResultItem, 'doi' | 'title' | 'year'>): string {
  return p.doi || `${p.title.slice(0, 50)}_${p.year}`;
}

/** かなが一定割合あれば日本語。漢字だけの文は中国語として翻訳対象にする。 */
export function isJa(t: string | null | undefined): boolean {
  const s = (t || '').replace(/\s/g, '');
  const m = s.match(/[ぁ-ヿｦ-ﾟ]/g);
  return !!m && m.length >= Math.min(3, s.length) && m.length > s.length * 0.08;
}

function splitSentences(t: string): string[] {
  return t.split(/(?<=[。.!?！？])\s*/).filter((s) => s.trim().length > 12);
}

type Role = 'purpose' | 'method' | 'findings' | 'conclusion' | 'background';

function classify(s: string, i: number, total: number): Role {
  const lo = s.toLowerCase();
  if (/\b(aim|purpose|goal|objective|investigat|examin|explor|this (study|paper|research|article)|we (examin|investigat|explor|aim|propos))\b/.test(lo) || /目的|検討|明らかに|調べ|本研究|本稿/.test(lo)) return 'purpose';
  if (/\b(method|survey|sample|participant|respondent|data|analy[sz]|experiment|measure|questionnaire|interview|regression|collected|administered|conducted|design)\b/.test(lo) || /方法|調査|分析|対象|実験|測定|アンケート|回答|収集/.test(lo)) return 'method';
  if (/\b(result|found|show|reveal|significant|indicat|demonstrat|correlat|predict|effect|impact|positiv|negativ|associat|increas|decreas)\b/.test(lo) || /結果|示し|明らか|有意|影響|効果|関連|相関|予測/.test(lo)) return 'findings';
  if (/\b(conclud|suggest|impl|recommend|future|contribut|practical|highlight|discuss|limitat|direction)\b/.test(lo) || /結論|示唆|提言|今後|貢献|実践|議論|限界/.test(lo)) return 'conclusion';
  if (i === 0 || i === 1) return 'purpose';
  if (i >= total - 2) return 'conclusion';
  return 'background';
}

/** 要旨から重要そうな文を最大3つ抜き出す（キーワードマッチによる機械的な抽出）。 */
export function bulletPoints(abstract: string | null | undefined, title: string): string[] {
  if (!abstract || abstract.length < 50) return [];
  const sents = splitSentences(abstract);
  if (sents.length <= 2) return sents.map((s) => s.trim());
  const titleWords = new Set(title.toLowerCase().split(/[\s,.\-:;]+/).filter((w) => w.length > 3));
  const scored = sents.map((text, i) => {
    let sc = 0;
    if (i === 0) sc += 3;
    if (i === sents.length - 1) sc += 2;
    if (i === 1) sc += 1;
    const lo = text.toLowerCase();
    for (const w of titleWords) if (lo.includes(w)) sc++;
    if (/result|found|show|significant|suggest|conclude|結果|示し|明らか|示唆/.test(lo)) sc += 2;
    if (text.length > 25 && text.length < 300) sc++;
    return { text: text.trim(), sc, i };
  });
  scored.sort((a, b) => b.sc - a.sc);
  return scored.slice(0, 3).sort((a, b) => a.i - b.i).map((s) => s.text);
}

const ROLE_LABELS: Record<Role, string> = {
  purpose: '研究の目的',
  method: '手法',
  findings: '主な結果',
  conclusion: '結論・示唆',
  background: '背景',
};

export interface SummarySection {
  label: string;
  text: string;
}

/** 要旨の文を役割（目的/手法/結果/結論/背景）に振り分ける。原文の文をそのまま並べ替えるだけ。 */
export function structuredSummary(abstract: string | null | undefined): SummarySection[] {
  if (!abstract || abstract.length < 50) return [];
  const sents = splitSentences(abstract);
  const roles: Record<Role, string[]> = { purpose: [], method: [], findings: [], conclusion: [], background: [] };
  sents.forEach((s, i) => roles[classify(s, i, sents.length)].push(s.trim()));
  return (Object.keys(ROLE_LABELS) as Role[])
    .filter((k) => roles[k].length)
    .map((k) => ({ label: ROLE_LABELS[k], text: roles[k].join(' ') }));
}

// ---- 引用 ----

type CiteInput = Pick<SearchResultItem, 'title' | 'authors' | 'year' | 'venue' | 'doi'>;

function doiUrl(doi: string | null): string {
  if (!doi) return '';
  return doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
}

export function citeAPA(p: CiteInput): string {
  const au = p.authors.length ? p.authors.join(', ') : 'Unknown';
  const venue = p.venue ? ` ${p.venue}.` : '';
  const doi = p.doi ? ` ${doiUrl(p.doi)}` : '';
  return `${au} (${p.year ?? 'n.d.'}). ${p.title}.${venue}${doi}`.trim();
}

export function citeBibTeX(p: CiteInput): string {
  const key = (p.authors[0] || 'unknown').split(/\s+/).pop()!.toLowerCase() + (p.year ?? '');
  const doi = p.doi ? `,\n  doi = {${p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}}` : '';
  return `@article{${key},\n  title = {${p.title}},\n  author = {${p.authors.join(' and ') || 'Unknown'}},\n  year = {${p.year ?? ''}},\n  journal = {${p.venue || ''}}${doi}\n}`;
}

export function citePlain(p: CiteInput): string {
  return `${p.authors.join(', ') || 'Unknown'} (${p.year ?? 'n.d.'}) "${p.title}" ${p.venue || ''}`.trim();
}
