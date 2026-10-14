literature/inbox/ に置かれたPDFを一括で取り込む。

手順:
1. `uv run litkit inbox` を実行する
2. 各PDFからメタデータ（タイトル・DOI）を抽出し、書誌情報をCrossRef等で補完
3. 本文を解析してカードを生成する
4. 処理済みPDFは literature/pdf/ へ移動
5. 処理結果を一覧表示する
