# litkit — 卒業研究用 文献研究支援システム

論文・行政資料の **「探す → 取り込む → 要約する → 蓄える → 引ける → 書く」** を一本の流れでこなすローカルツール。

## 特徴

- **3層要約（L1/L2/L3）** — 浅い要約で候補を絞り、深い要約で読む段階的な文献管理
- **出典の追跡可能性** — すべての記述に根拠カードIDが紐づく
- **事実と考察の分離** — 論文の内容と自分の解釈がファイル構造で区別される
- **ハルシネーション排除** — 蓄積データに無いことをAIが書かない設計
- **7ソース横断検索** — CiNii / J-STAGE / CrossRef / OpenAlex / Semantic Scholar / arXiv / NDL

## セットアップ

```bash
# Python依存関係
uv sync

# 環境変数（任意）
cp .env.example .env
# .env を編集して API キーを設定

# Web UI の依存関係
cd web && npm install
```

## 使い方

### CLI

```bash
# 文献検索（L1一行要約つき一覧）
uv run litkit search "コミュニティ通貨 利用 要因"

# プレビュー（L2判断用要約）
uv run litkit preview 1

# 取り込み（L3精読要約つきカード生成）
uv run litkit add <DOI or URL or 番号>

# inbox一括処理
uv run litkit inbox

# 蓄積知識への質問
uv run litkit ask "地域通貨の継続利用要因は何か"

# 小レビュー生成
uv run litkit review "コミュニティ通貨の継続利用"

# 主張の根拠チェック
uv run litkit claims check

# 執筆支援
uv run litkit draft 2.3
uv run litkit check

# 引用出力
uv run litkit cite --used-only

# 週次レポート
uv run litkit weekly
```

### Web UI

```bash
uv run litkit ui
# → http://localhost:7777
```

### Claude Code スラッシュコマンド

| コマンド | 役割 |
|---|---|
| `/lit-search <クエリ>` | 横断検索 + L1一覧 |
| `/lit-add <指定>` | 取り込み + L3カード生成 |
| `/lit-inbox` | inbox一括処理 |
| `/lit-ask <質問>` | 蓄積文献に基づく回答 |
| `/lit-review <テーマ>` | 小レビュー生成 |
| `/thesis-draft <章節>` | 節の下書き |
| `/thesis-check` | 整合チェック |
| `/weekly` | 週次レポート |

## ディレクトリ構成

```
litkit/
├── src/litkit/          # Pythonコア
│   ├── sources/         # 外部ソースアダプタ（CiNii, J-STAGE等）
│   ├── cli.py           # CLIエントリポイント
│   ├── api.py           # FastAPI
│   └── ...
├── web/                 # Vite + React フロントエンド
├── literature/
│   ├── cards/           # 文献カード（Git管理）
│   ├── inbox/           # PDF受け口（Git除外）
│   └── pdf/             # PDF保管（Git除外）
├── thesis/              # 卒論原稿
├── notes/               # 研究ログ・用語集・疑問リスト
└── data/                # FTS索引・キャッシュ（Git除外）
```

## 要約の3層構造

| 層 | 情報源 | 分量 | 目的 |
|---|---|---|---|
| **L1** | 書誌＋アブスト | 1〜2行 | 一覧で候補を絞る |
| **L2** | アブスト＋取得できた範囲 | 300〜500字 | 読む価値があるか判断 |
| **L3** | 本文PDF全文 | 制限なし | 内容把握・引用（**本文取得時のみ**） |
