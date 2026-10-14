卒論原稿の整合チェックを一式実行する。

手順:
1. `uv run litkit check` を実行する
2. `uv run litkit claims --check` を実行する
3. 以下をチェックし結果を報告する:
   - 根拠なし主張の検出
   - 本文中の引用IDが実在するカードを指しているかの検証
   - 用語の表記ゆれ検出（notes/glossary.md と突合）
   - 図表番号の連番チェック
