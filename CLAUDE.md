# litkit 運用ルール

## 絶対に守ること
1. 文献カードに書かれていない情報を、論文の内容として記述してはならない。
2. 文献に基づく記述には必ず根拠カードIDを付す。
3. 根拠が見つからない場合は「蓄積文献中に該当なし」と明示する。推測で埋めない。
4. 著者名・年・掲載誌・DOIを推測で補完してはならない。取得できなければ null のままにする。
5. 原文の長文転記をしない。要約は自分の言葉に書き直す。
6. `literature/pdf/` と `literature/inbox/` の中身は絶対にGitにコミットしない。
7. **アブストラクトしか得られていない論文について、L3精読要約を生成してはならない。**
   `depth: abstract_only` のカードの内容を、あたかも本文を読んだかのように扱わない。
   `ask` や `review` で `abstract_only` のカードを根拠に使う場合は、
   「アブストのみに基づく」と但し書きを付す。

## 事実と考察の分離
カードの「要約／目的／手法／結果／限界」は出典に忠実な事実記述。
「自研究との関係／メモ・疑問」は自分の解釈。この境界を越えて混ぜない。

## 研究の文脈
テーマ：鎌倉市のコミュニティ通貨「まちのコイン鎌倉（クルッポ）」の利用促進・阻害要因の解明と改善策の設計
　　　　（目的：混雑緩和・マナー改善・個人店の活性化。手段としてコミュニティ通貨を扱う）
関連キーワード：コミュニティ通貨 / 地域通貨 / まちのコイン / 利用動機 / 継続利用要因 /
　　　　　　　　行動変容 / ナッジ / 地域活性化 / 個人店支援 / オーバーツーリズム / 観光地マネジメント
英語側：community currency / local currency / complementary currency / behavioral intention /
　　　　technology acceptance / overtourism / destination management

## 技術スタック
- Python 3.12 / uv / typer / FastAPI / httpx / beautifulsoup4 / pymupdf
- 文献カード: Markdown + YAML frontmatter（SQLite FTS5は再生成可能なキャッシュ）
- Web: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui + lucide-react + Recharts
- テーマ依存語彙はこのファイルの「研究の文脈」セクションに集約。コードにハードコードしない

## コマンド
- `uv run litkit` — CLI実行
- `uv run litkit ui` — Web UI起動（localhost:7777）
- `cd web && npm run dev` — フロントエンド開発サーバー
