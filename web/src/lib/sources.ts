const NAMES: Record<string, string> = {
  openalex: 'OpenAlex',
  jstage: 'J-STAGE',
  cinii: 'CiNii',
  ndl: '国立国会図書館サーチ',
  crossref: 'Crossref',
  semantic_scholar: 'Semantic Scholar',
  arxiv: 'arXiv',
  web: 'Web',
  manual: '手動',
};

/** 検索対象として選べるソース（表示順）。id は API の Source 値と同じ。 */
export const SEARCHABLE_SOURCES = [
  'openalex',
  'jstage',
  'cinii',
  'ndl',
  'crossref',
  'semantic_scholar',
  'arxiv',
] as const;

/** バッジの色クラス。paper-researcher の3色（oa/js/cn）に無いソースは中立色。 */
const CLASSES: Record<string, string> = { openalex: 'oa', jstage: 'js', cinii: 'cn' };

export function sourceName(source: string): string {
  return NAMES[source] ?? source;
}

export function sourceClass(source: string): string {
  return CLASSES[source] ?? '';
}
