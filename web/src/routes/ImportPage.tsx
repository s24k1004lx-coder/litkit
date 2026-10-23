import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AddOutcome, type InboxProcessResult } from '../lib/api';
import { PageHead } from '../components/PageHead';

const MAX_MB = 50;

interface Line {
  ok: boolean;
  text: string;
  cardId?: string;
}

const describe = (o: AddOutcome): Line => ({
  ok: true,
  cardId: o.card_id,
  text: !o.created
    ? `「${o.title}」は既にライブラリにあります`
    : `「${o.title}」を追加しました（${o.depth === 'full_text' ? '本文あり' : 'アブストのみ'}${o.pdf_error ? '・本文PDFは取得できませんでした' : ''}）`,
});

/** 文献をライブラリに取り込む画面。CLI の add / inbox 相当。 */
export function ImportPage() {
  const [identifier, setIdentifier] = useState('');
  const [adding, setAdding] = useState(false);
  const [inbox, setInbox] = useState<{ name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [log, setLog] = useState<Line[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const push = (...lines: Line[]) => setLog((prev) => [...lines, ...prev]);
  const message = (e: unknown) => (e instanceof Error ? e.message : '失敗しました');

  const loadInbox = useCallback(() => {
    api.getInbox().then((r) => setInbox(r.files)).catch(() => {});
  }, []);
  useEffect(loadInbox, [loadInbox]);

  const addByIdentifier = async () => {
    const id = identifier.trim();
    if (!id) return;
    setAdding(true);
    try {
      push(describe(await api.addIdentifier(id)));
      setIdentifier('');
    } catch (e) {
      push({ ok: false, text: `「${id}」を追加できませんでした: ${message(e)}` });
    }
    setAdding(false);
  };

  const upload = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    const skipped = files.length - pdfs.length;
    if (skipped > 0) push({ ok: false, text: `PDF以外の ${skipped} 件は無視しました` });
    if (pdfs.length === 0) return;
    setUploading(true);
    const lines: Line[] = [];
    for (const f of pdfs) {
      if (f.size > MAX_MB * 1024 * 1024) {
        lines.push({ ok: false, text: `${f.name}: ${MAX_MB}MBを超えています` });
        continue;
      }
      try {
        await api.uploadToInbox(f);
      } catch (e) {
        lines.push({ ok: false, text: `${f.name}: ${message(e)}` });
      }
    }
    if (lines.length) push(...lines);
    setUploading(false);
    loadInbox();
  };

  const processInbox = async () => {
    setProcessing(true);
    try {
      const { results } = await api.processInbox();
      push(...results.map((r: InboxProcessResult): Line =>
        r.error
          ? { ok: false, text: `${r.file}: ${r.error}` }
          : r.created === false
            ? { ok: true, cardId: r.card_id, text: `${r.file}: 既にライブラリにあります（inbox に残しました）` }
            : { ok: true, cardId: r.card_id, text: `${r.file} → 「${r.title}」を追加しました` }));
    } catch (e) {
      push({ ok: false, text: `取り込みに失敗しました: ${message(e)}` });
    }
    setProcessing(false);
    loadInbox();
  };

  return (
    <>
      <PageHead title="取り込み" sub="Import" />
      <div className="main">
        <div className="callout">
          <h3>文献をライブラリに追加する方法</h3>
          <ul>
            <li>検索結果から追加: 「検索」で見つけた論文の「＋ ライブラリに追加」</li>
            <li>DOI・URLから追加: 下の入力欄</li>
            <li>PDFから追加: 下の枠にPDFを置く（本文ありのカードになります）</li>
          </ul>
        </div>

        <div className="d-section">
          <div className="d-section-title">DOI・URLで追加</div>
          <div className="search-wrap" style={{ margin: 0 }}>
            <input
              type="text"
              placeholder="10.xxxx/xxxxx または https://…"
              autoComplete="off"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addByIdentifier()}
            />
            <button className="btn-search" onClick={addByIdentifier} disabled={adding || !identifier.trim()}
              style={{ opacity: adding || !identifier.trim() ? 0.6 : 1 }}>
              {adding ? '取得中…' : '追加'}
            </button>
          </div>
          <div className="d-src">書誌情報が取得できなかった項目は空欄（null）のままになります。推測では補完しません。</div>
        </div>

        <div className="d-section">
          <div className="d-section-title">PDFで追加</div>
          <div
            className={`dropzone${dragging ? ' on' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          >
            {uploading ? 'アップロード中…' : 'ここにPDFをドロップ、またはクリックして選択（複数可・1件' + MAX_MB + 'MBまで）'}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }}
            />
          </div>

          <div className="toolbar">
            <span className="info">取り込み待ちのPDF: {inbox.length}件</span>
            <button className="btn-export" onClick={processInbox} disabled={processing || inbox.length === 0}
              style={{ opacity: processing || inbox.length === 0 ? 0.6 : 1 }}>
              {processing ? '処理中…' : 'まとめてカード化'}
            </button>
          </div>
          {inbox.length > 0 && (
            <ul className="inbox-list">
              {inbox.map((f) => (
                <li key={f.name}>{f.name}<span className="sub"> {(f.size / 1024 / 1024).toFixed(1)}MB</span></li>
              ))}
            </ul>
          )}
          <div className="d-src">
            題名や著者がPDFから読み取れない場合は、ファイル名がタイトルになります。カード化の後で内容を確認してください。
          </div>
        </div>

        {log.length > 0 && (
          <div className="d-section">
            <div className="d-section-title">結果</div>
            {log.map((l, i) =>
              l.ok ? (
                <div key={i} className="import-line">
                  {l.text}
                  {l.cardId && <> <Link to={`/paper/${l.cardId}`}>カードを開く</Link></>}
                </div>
              ) : (
                <div key={i} className="src-err">{l.text}</div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
