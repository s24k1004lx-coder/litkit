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

Web UI 全体が paper-researcher 由来のデザイン（黒帯のナビ、マーカー風タイトル、太枠カード）。スタイルは `web/src/styles/paper.css` に集約（`.pr` 配下）。

### 常に使えるようにする（Tailscale ＋ 自動起動）

PC にログインしたら自動で litkit が立ち上がり、スマホから**固定のURL**で開けるようにする。

1. PC とスマホに [Tailscale](https://tailscale.com/) を入れ、同じアカウントでログインする。
2. PC で自動起動を登録する（管理者権限は不要）。
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
   ```
   以後、Windows にログインするたびに `litkit ui --tailscale` が裏で起動する（ログは `data/ui.log`）。解除は `-Remove` を付けて同じコマンド。
3. スマホで `http://PCのTailscale名:7777` を開く。名前は Tailscale アプリの PC の欄、または `tailscale status` に出る（IP `100.x.y.z` でも開ける。どちらも変わらない）。

- 開けるのは同じ Tailscale アカウントの端末だけ。`.env` の `LITKIT_PASSWORD` を設定してあれば、画面でのログインも必要。
- PC の電源が入っていて、**スリープしていない**間だけ使える。スリープさせない設定は自分で行う（電源オプションで「スリープなし」、または `powercfg /change standby-timeout-ac 0`）。
- 初回は Windows ファイアウォールの許可ダイアログが出ることがある（プライベートネットワークで許可）。

### 外出先から使う（Cloudflare Tunnel ＋ パスワード）

アカウントやドメインなしで、スマホから開けるURLを作れる。**パスワード認証が必須**（未設定だと起動を拒否する）。

1. `.env` にパスワードを書く（12文字以上を推奨。`.env` は Git に入らない）。
   ```
   LITKIT_PASSWORD=ここに長めのパスワード
   ```
2. `cloudflared` を入れる（初回のみ）。
   ```bash
   winget install --id Cloudflare.cloudflared
   ```
3. 起動する。
   ```bash
   uv run litkit ui --tunnel
   ```
4. 表示された `https://xxxx.trycloudflare.com` をスマホで開き、パスワードでログインする。

- このURLは起動のたびに変わる。固定したい場合は、Cloudflare に登録した自分のドメインで named tunnel を作る（`cloudflared tunnel login` → `cloudflared tunnel create`）。
- ログインは30日間有効（Cookie）。パスワードを変えると全端末がログアウトされる。画面右上の「ログアウト」でも抜けられる。
- ログイン失敗が続くと一時的にロックされる（5回/5分）。
- `LITKIT_PASSWORD` が未設定のまま Cloudflare 経由のアクセスが来た場合は、公開状態を避けるため拒否する。
- AI要約は PC の Claude Code の利用枠を消費する。ログインできる人は誰でも押せるので、パスワードは共有しないこと。
- PC が起動していてスリープしていない間だけ使える。

### スマホから使う

画面はスマホ幅に対応している。PC側でUIを起動しておき、スマホのブラウザから開く（PCが起動している間だけ使える）。

| 場所 | PCでの起動 | スマホで開くURL |
|---|---|---|
| 同じWi-Fi内 | `uv run litkit ui --lan` | 起動時に表示される `http://PCのIP:7777` |
| 外出先から | `uv run litkit ui --tailscale` | `http://PCのTailscale IP:7777`（または MagicDNS 名） |

外出先から使うには [Tailscale](https://tailscale.com/) を PC とスマホの両方に入れ、同じアカウントでログインしておく。`--tailscale` は Tailscale のアドレスだけで待ち受けるため、同じ tailnet の端末以外からは開けない（`--lan` は同じネットワークの全端末から開ける）。

- **認証はない。** 信頼できるネットワーク（自分のTailscale・自宅Wi-Fi）でだけ使い、ルーターのポート開放などでインターネットへ直接公開しないこと。
- AI要約を押すと、PC の Claude Code の利用枠を消費する。
- 初回は Windows ファイアウォールの許可ダイアログが出ることがある（プライベートネットワークで許可）。
- ホーム画面に追加すると、アプリのように開ける（iOS: 共有 → ホーム画面に追加）。

**文献検索画面**（カード化前の候補を絞るための機能。ここで得た要約・訳は文献カードには保存されない）

- 検索対象ソースの選択（OpenAlex / J-STAGE / CiNii / 国立国会図書館サーチ / Crossref / Semantic Scholar / arXiv。「全て」で横断）、年範囲（ソース側でも絞り込み）、ページ送り、ソースごとの取得失敗の表示
- 並べ替え（取得順／研究関連度／年）
- 詳細パネル: Semantic Scholar の TLDR、構造化要約（要旨の文を目的／手法／結果／結論に振り分け）、
  要旨がない論文は PDF 本文から要旨を抽出、日本語訳トグル、AI要約（`claude -p` を使用）、APA/BibTeX の引用コピー、メモ
- 類似論文（OpenAlex の related works）
- ブックマーク（ブラウザの localStorage に保存）と Markdown エクスポート

AI要約には Claude Code のログイン済み環境（`claude` コマンド）が必要で、押したときだけ利用枠を消費する。
`abstract_only` の扱い（CLAUDE.md の運用ルール7）は変わらない。検索画面の内容は根拠IDを持たないため、論文の内容として記述する際は `litkit add` でカード化すること。

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
