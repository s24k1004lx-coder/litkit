import { useEffect, useState } from 'react';
import { isJa } from '../lib/paperUtils';
import { cachedTranslation, translateToJa } from '../lib/translate';

interface Props {
  text: string;
  enabled: boolean;
  /** 翻訳した場合に「原文を見る」を添える（本文向け） */
  showOriginal?: boolean;
}

interface Outcome {
  src: string;
  ja?: string;
  failed?: boolean;
}

/** enabled かつ日本語でない文を日本語訳で表示する。翻訳中・失敗時は原文のまま出す。 */
export function TranslatedText({ text, enabled, showOriginal = false }: Props) {
  const needs = enabled && text.trim() !== '' && !isJa(text);
  const [outcome, setOutcome] = useState<Outcome>({ src: '' });

  useEffect(() => {
    if (!needs || cachedTranslation(text)) return;
    let alive = true;
    translateToJa(text).then(
      (ja) => alive && setOutcome({ src: text, ja }),
      () => alive && setOutcome({ src: text, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [text, needs]);

  if (!needs) return <>{text}</>;

  const current = outcome.src === text ? outcome : undefined;
  const ja = cachedTranslation(text) ?? current?.ja;
  const failed = !ja && current?.failed;
  return (
    <>
      <span style={{ opacity: ja ? 1 : 0.6 }}>{ja ?? text}</span>
      {!ja && !failed && <span className="tr-note"> 翻訳中…</span>}
      {failed && <span className="tr-note fail">（翻訳できませんでした）</span>}
      {showOriginal && ja && (
        <details className="d-orig">
          <summary>原文を見る</summary>
          <p>{text}</p>
        </details>
      )}
    </>
  );
}
