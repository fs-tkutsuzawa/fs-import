# Super Calc End-to-End 検証マニュアル (from scratch)

## 0. ゴール

UI (CSV インポート→UA ドラッグ＆ドロップ→パラメータ定義→DataGrid 表示) と CLI を組み合わせ、**空の環境から FAM.compute を完走できる状態**を再現する。

## 1. 初期化 (GA 以外のテーブルをリセット)

以下の SQL を実行し、`global_accounts` 以外を削除する。

```sql
TRUNCATE TABLE calculation_results CASCADE;
TRUNCATE TABLE calculation_rules CASCADE;
TRUNCATE TABLE import_df CASCADE;
TRUNCATE TABLE periods CASCADE;
TRUNCATE TABLE scenarios CASCADE;
TRUNCATE TABLE models CASCADE;
TRUNCATE TABLE user_accounts CASCADE;
TRUNCATE TABLE user_account_mappings CASCADE;
TRUNCATE TABLE timeline_snapshots CASCADE;
```

- **目的**: 検証用にクリーンな状態を用意する (GA マスターは維持)。
- **背景**: 既存データが残っていると PREVS ↔ UA ↔ ルール整合が崩れ、再現性ある検証ができない。

## 2. GA マスターの再確認

```
npm --prefix server run view:integrated:create
SELECT COUNT(*) FROM global_accounts;
```

- **目的**: GA マスターが存在することを確認。
- **チェック**: GA カウントが期待値 (PL/BS/CF) になっている。

## 3. UI 操作フロー

1. **CSV アップロード (Import_df)**
   - サンプル: `docs/[docs]_master_data/[dummy]_import_df_data_v2.csv`
   - UI の Import 画面で取り込み。
2. **UA 紐付け (ドラッグ＆ドロップ)**
   - 取り込んだ勘定を GA 階層に紐付け、`save`。
   - 階層構造が正しいか DataGrid 等で確認。
3. **パラメータ定義 (必要に応じて)**
   - UI のルール定義画面で追加/編集があれば実施。
   - 今回は CLI テンプレート (master_rules.json) を注入するため、ここでは最小限でも ok。

## 4. CLI による整合処理

操作は UI 処理直後に行う。

1. **UA 同期 (不足勘定の自動生成)**

   ```bash
   npm run sync:ua -- --dry-run
   npm run sync:ua
   ```

   - **目的**: GA ↔ UA のズレ (GLOBAL_ONLY) を解消。
   - **背景**: UI で登録し忘れた勘定があっても CLI で補完できるようにする。

2. **ルール注入 (Super Calc / B&C)**

   ```bash
   npm run inject:super-calc -- --scenario-id=<SCENARIO_ID>
   ```

   - **目的**: `master_rules.json` を指定シナリオへ UPSERT。
   - `[SKIP]` が出た場合は該当 GA の UA が存在するか再確認。

3. **計算実行 (FAM.compute の検証)**

   ```bash
   npm --prefix server run calculation:dump -- --model <MODEL_ID> --scenario <SCENARIO_ID> --projection 3
   ```

   - **目的**: PREVS→UA→PARAMETER の流れで FAM を実行。
   - **ログ確認**:
     - `GLOBAL_ONLY` が出れば UA が不足。
     - `PREVS に未解決の勘定キー` → PREVS ラベル調整または UA 追加。
     - `補完成功` のログが出た場合、Super Calc が PARAMETER で埋まったことを示す。

4. **DataGrid 表示**
   - フロントエンドで DataGrid.tsx を開き、計算結果が描画されるか確認。
   - **背景**: UI 側の算出ロジック (React + FAM API) が正しく連携していることを担保。

## 5. 商用化時の自動化論点

| ステップ        | 自動化案                                                                | 論点                                                       |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| 初期化          | テスト環境で TRUNCATE スクリプトを自動実行 (本番では不可).              | 誤操作防止、複数環境でのデータ隔離。                       |
| GA/UA 整合      | パイプラインに `view:integrated:create` → `sync:ua` を組み込み。        | ビュー更新時の `DROP VIEW`、名称揃えの仕組み。             |
| Import_df       | API 経由で投入し、CLI 前にバリデーション。                              | ラベル/期間チェックを REST 上で行う。                      |
| ルール注入      | デプロイ後に自動で `inject:super-calc` を実行。                         | ルールテンプレートのバージョン管理、シナリオ選択の自動化。 |
| 計算 & ログ監視 | `calculation:dump` をバッチ化し、結果と補完ログをダッシュボードに連携。 | リトライ戦略、補完失敗時の自動エスカレーション。           |

以上で「空の DB → UI & CLI → FAM.compute 完走」が再現できる。
