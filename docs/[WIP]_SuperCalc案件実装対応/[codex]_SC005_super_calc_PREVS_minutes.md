# SC-005 Super Calc × PREVS 対応議事録 (2025-10-17 〜 2025-10-20)

## 1. 背景と問題提起

- `calculation:dump` 実行時に Super Calc 勘定が PREVS（import*df）へ含まれていないと、*「PREVS に未解決の勘定キーがあります」\_ で停止していた。
- Super Calc のルールを CLI (`inject:super-calc`) で注入すると、`global_accounts` 側の `ga_code` とテンプレート側の `ga_code` が一致していないため `[SKIP]` が頻発。
- 初期化手順が曖昧で、過去データが残った状態で UI から UA を再取り込みすると `user_accounts_ua_name_key` の一意制約に詰まるケースが多発。
- モデル／シナリオを TRUNCATE 後に再作成していない状態でルール注入を行い、`calculation_rules` の FK（scenario_id）違反が発生。

課題は「PREVS → UA → master_rules → FAM.compute」の全工程を再現性をもって成功させるフローがなかったことに尽きる。

## 2. 対応の全体像

### 2.1 GA/UA 整合の可視化と同期

- **integrated_accounts_view 作成** (`view:integrated:create`)
  - GA ↔ UA の突合をビュー化して `GLOBAL_ONLY` を検出可能にした。
  - ドキュメント: `docs/[WIP]_SuperCalc案件実装対応/[codex]_super_calc_ua_sync_impl_plan.md`
- **UA 同期 CLI** (`npm run sync:ua`)
  - ビューの `GLOBAL_ONLY` 行を埋め、シナリオで参照する UA を一括整備。
  - ドキュメント: `docs/[WIP]_SuperCalc案件実装対応/[codex]_super_calc_integrated_view.md`

### 2.2 PREVS 正規化と計算ローダーの強化

- **calculationDataLoader の更新**
  - PREVS キーを UA 名／UA コード／GA 名／GA コードで解決できるよう、正規化マップを拡張。
  - `integrated_accounts_view` を参照し、`GLOBAL_ONLY` が残っている場合はエラーで停止。
  - **Super Calc 自動補完**: PARAMETER ルールから欠落している Super Calc を算出し PREVS に埋める。
  - テスト: `server/src/tests/calculationDataLoader.test.ts`
- **calculation:dump のガード**
  - 実行前に `GLOBAL_ONLY` を検知し、`sync:ua` の再実行を促す。
  - 計算全体が失敗した際のエラーを詳細に表示。
  - E2E テスト: `server/src/tests/calculationCli.e2e.test.ts`

### 2.3 ルール注入と ga_code の整合性

- `master_rules.json` の `targetAccountCode`／`refAccountCode` を最新マスタ（`docs/[docs]_master_data/global_accounts_202510201755.csv`）に合わせる方針を確立。
- 合わせ込んだテンプレートを `master_rules.v2.json` として出力。
- 将来用 CLI の要件（`rules:sync-codes`）を明文化。

### 2.4 Import_df ダミーデータの再整備

- `docs/[docs]_master_data/[dummy]_import_df_data_v2.csv` を作成。
  - Super Calc の基底勘定（売上高／売上原価／販管費等）と Super Calc 勘定（営業利益／純資産等）を明示。
  - Asset 勘定は検証要件上省略。
- 検証ステップとチェックリストを `codex]_SC005_data_ingest_workflow.md` に追記。

### 2.5 ドキュメントの体系化

- `codex]_SC005_super_calc_actuals_strategy.md`
  - PREVS に Super Calc を含めるのが原則だが、欠落時は PARAMETER 補完に切り替える方針を書面化。
- `codex]_SC005_data_ingest_workflow.md`
  - テーブル初期化 → UA 同期 → PREVS 投入 → ルール注入 → 計算テストのフローを明記。
- `codex]_SC005_end_to_end_manual.md`
  - モデル／シナリオの再作成（UI or SQL）を含む、完全な E2E 手順をまとめた。

## 3. 主なエラーと対処

| 時期             | エラー内容                                  | 原因                                     | 対処                                                                     |
| ---------------- | ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| 追試初期         | `PREVS に未解決の勘定キー`                  | PREVS が Super Calc を含まない/名称ズレ  | `calculationDataLoader` 補完 + ラベル整合                                |
| 同期 CLI 初回    | `GLOBAL_ONLY` が大量発生                    | GA と UA の名称コードズレ                | `sync:ua` で補完／名称統一方針を文書化                                   |
| ルール注入       | `[SKIP] reference global account not found` | master_rules の `ga_code` が古い表記     | `master_rules.v2.json` で最新マスタに合わせ込み                          |
| テーブル初期化後 | `Key (ua_name) already exists`              | 旧 `ua_code` のまま再インポート          | TRUNCATE 後はモデル／シナリオ再作成、または `ua_code` を揃える運用へ移行 |
| TRUNCATE 後      | `scenario_id not present in scenarios`      | シナリオ再登録を失念                     | モデル／シナリオを再生成する手順をマニュアル化                           |
| UI ルール登録    | `custom_calc requires child accounts`       | 子勘定が未設定のまま Super Calc を手入力 | ルール注入は CLI を原則とし、参照が揃っていないと保存できないことを共有  |

## 4. 全体フローの位置づけ

下図のように、Import_df → UA → ルール → FAM.compute のパイプラインを安定化させるのが今回のゴール。

1. **データ受け取り (UI)**
   - CSV アップロード、UA ドラッグ & ドロップ。
   - → `user_accounts`／`import_df` に反映。
2. **CLI による整合チェック**
   - `view:integrated:create` でビュー生成。
   - `sync:ua` で Global Only を解消。
   - `inject:super-calc` でルールを注入。
   - `calculation:dump` で計算実行・ログ確認。
3. **DataGrid (UI)**
   - 結果を DataGrid.tsx 経由で表示。
   - → ユーザーに見せる最終成果物。

今回の SC-005 対応により、上記ステップを繰り返すだけで Super Calc と PREVS のズレが解消され、FAM.compute を確実に完走できる状態になった。

## 5. 次のステップ（SC-006 以降の方向性）

1. **`sync:ua` の名称同期機能**
   - `ga_name`/`ga_code` を `ua_name`/`ua_code` に同期するオプションを追加し、PREVS ラベルとのズレをさらに減らす。
2. **補完ログの可視化**
   - `calculation:dump` の補完結果を `[COMPLETE] Filled super_calc …` のように明示するログ出力を整備。
   - ダッシュボードや監視に連携できるようにする。
3. **master_rules テンプレート生成 CLI**
   - プロンプトに従って `master_rules.v2.json` を自動生成できる CLI (`rules:sync-codes`) を追加。
   - テンプレート作成時のヒューマンエラーを排除。
4. **UI 側のバリデーション強化**
   - CSV 取り込み時に `user_accounts` とラベル突合、ズレがあれば警告を出す。
   - モデル／シナリオ初期化時に最小ダミーデータを自動作成する仕組みも検討。

## 6. 引き継ぎメモ

- 作業用 CLI とテンプレート生成物:
  - `npm --prefix server run view:integrated:create`
  - `npm run sync:ua`
  - `npm run inject:super-calc -- --scenario-id=<id>`
  - `npm --prefix server run calculation:dump -- --model <id> --scenario <id> --projection <n>`
  - `server/src/templates/master_rules.v2.json` (最新 ga_code 整合版)
  - `docs/[docs]_master_data/[dummy]_import_df_data_v2.csv`
- ドキュメント群:
  - `codex]_super_calc_ua_sync_impl_plan.md`
  - `codex]_super_calc_integrated_view.md`
  - `codex]_SC005_super_calc_actuals_strategy.md`
  - `codex]_SC005_data_ingest_workflow.md`
  - `codex]_SC005_end_to_end_manual.md`
- トラブルシューティング:
  - `[SKIP] reference global account not found` → ga_code を CSV と一致させる。
  - `PREVS 未解決` → `sync:ua` → PREVS ラベル整合 → Super Calc 補完の順で確認。
  - `duplicate ua_name` → TRUNCATE 後にモデル／シナリオを必ず再作成。

これらを踏まえれば、同様のエラー（Super Calc × PREVS の整合性問題）は再発しない運用体制と実装基盤が整った。
