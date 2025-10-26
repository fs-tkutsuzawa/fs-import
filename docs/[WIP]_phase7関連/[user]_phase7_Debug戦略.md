`[20251015] pm9:56`

———

## 現状整理

- フロントとサーバは起動済み・API呼び出しは通っている。
- 計算実行ボタンを押すとジョブが RUNNING 状態のまま戻らず、サーバ側で importDf.df_json.map is not a function という例外が発生して FAILED に落ちる。
- fetchImportDf が返す df_json が想定（Record<string, number>[]）と異なり、文字列や別構造になっている可能性が高い。

———

## Phase7 でやるべきこと（棚卸し）

1. import_df データ整備 (最優先)
   - DB の import_df テーブルで df_json がどのフォーマットで格納されているか確認。
   - 必要に応じて JSON パースを追加 or DB データの整形を行い、convertImportDfToPrevs が期待どおり配列を受け取れるようにする。
   - 例：fetchImportDf 内で JSON.parse() する、もしくは df_json を配列形式へ変換して戻す。
2. FAM 実行パスの検証
   - accountsMaster / periods / rules / balanceChanges の値が最低限揃っているか確認。
   - deriveActualYears が periods から正しい年次を推定できるかチェック。
3. UI 検証
   - 計算成功後に GridPage へ結果が反映されるか、年次のみの表示で問題ないかを確認。
   - 失敗時のエラーメッセージが UI に表示されるかどうかも見ておく。

———

## デバッグ戦略

1. サーバで詳細ログを出す
   - fetchImportDf の戻り値（typeof / フィールド構造）を console.log などで確認。
   - createCalculationExecutor 内で inputs の中身を軽くログして、期待値と違う箇所を洗い出す。
   - 例外が起きた場合の error も現在ログで確認できるようにする。
2. DB中身の直接確認
   - SELECT df_json FROM import_df WHERE model_id = ...; を直接実行し、df_json カラムが文字列か JSONB か、配列として格納されているかを確認。
   - 必要ならサンプルデータを docs/[docs]\_master_data/[dummy]\_import_df_data.csv から変換して投入。
3. ユニットレベルでの再現
   - convertImportDfToPrevs 単体でテストし、文字列を渡した場合にどうなるか確認。
   - calculationExecutor を通さず calculationDataLoader → FAM → financialDataMapper のパイプラインを Node script 等で再現すると切り分けしやすい。

———

## 当面のアクション提案

- server/src/service/calculationRepositories.ts の fetchImportDf で取得した df_json を検査し、必要なら JSON.parse（文字列の場合）や Array.isArray チェックを入れて
  convertImportDfToPrevs に渡す。
- 併せて calculationDataLoader のテストを追加・調整し、想定フォーマット以外が入ってきたときの挙動をカバーする。
- データ整備が済んだら計算を再実行し、COMPLETED で戻るか確認 → グリッドでの年次表示を確認 → クリアが動作するか検証。

まずは import_df の扱いを正すことが最短ルートです。それが整えば、ジョブは COMPLETED になり UI に結果が反映されるはずなので、そこまで進めたうえで残タスク（warning 整理、月次列の扱いな
ど）に着手するのが良いでしょう。

ーーーーー

### Task ❷：パーサ更新の実装計画（Baby Steps）

目的：既存 df_json（rows＋periods）を、FAM が期待する Record<string, number>[] 形式へ変換できるようにする。

#### 仕様整理

- 現在 convertImportDfToPrevs は Array<Record<string, number>> を前提に map している。
- 旧形式 { rows: Array<{ type, label, values[] }>, periods: string[] } に対応し、年次ごとの数値マップに変換する必要がある。
- 最小差分で済ませるため、暫定的に 行ラベルをキー（accountId）として使用（FAM は未知アカウントを合成するので最低限動作する）。将来的に label -> user account のマッピングを行う余地を
  残す。
- rows のうち type === 'Account' のみを対象にする。values 配列の長さを periods に合わせ、数値であればそのまま格納、非数は 0 とする。
- periods に複数含まれている場合は index 順に対応する。EOL や空値など無効な期間はスキップする（暫定：label が 'EOL' のものは除外）。

#### 実装ステップ（Baby Steps / TDD）

1. テスト追加
   - server/src/tests/calculationDataTransforms.test.ts に convertImportDfToPrevs が旧形式 JSON を正しく変換できることを検証するテストを追加。
   - 例：rows 2行・periods 3列 → 3つの Record に変換されるか、キーがラベルになるかを確認。
2. 実装
   - convertImportDfToPrevs で Array.isArray(importDf.df_json) かどうかを判定。配列なら既存処理をそのまま適用。オブジェクトなら新ロジックを実行。
   - fetchImportDf で df_json が文字列のときは JSON.parse。返却時に { df_json: parsed } を返す。
3. 差分テスト
   - npm --prefix server test を回し、新テストが通ることを確認。
4. 実 API 確認
   - npm run dev + npm run start で計算実行。ジョブが COMPLETED になり、グリッドへ年次結果が反映されるかを確認。

この手順で最小差分のまま既存 df_json を変換できるようになります。
