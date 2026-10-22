const NAMES: Record<string, string> = {
  openalex: 'OpenAlex',
  jstage: 'J-STAGE',
  cinii: 'CiNii',
  crossref: 'Crossref',
  semantic_scholar: 'Semantic Scholar',
  arxiv: 'arXiv',
  ndl: 'NDL',
  web: 'Web',
  manual: '手動',
};

/** バッジの色クラス。paper-researcher の3色（oa/js/cn）に無いソースは中立色。 */
const CLASSES: Record<string, string> = { openalex: 'oa', jstage: 'js', cinii: 'cn' };

export function sourceName(source: string): string {
  return NAMES[source] ?? source;
}

export function sourceClass(source: string): string {
  return CLASSES[source] ?? '';
}
