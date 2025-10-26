# CL × UI 統合 予備調査レポート V1

## 1. スコープと目的

- UI・API とコアロジック（以下 CL：`FAM`）の接続に先立ち、必要な入出力・責務分担・既存コード状況を整理する。
- エンドポイントの入力/出力仕様、キャッシュやジョブ管理の扱い、フロント側のデータ受け渡し方法を明文化し、後続の実装タスク設計に活用する。

## 2. 参照スタック

- `docs/[codex]_interface_specification_V2.md`：最新 DDL 準拠の入出力スキーマを定義。
- `docs/[codex]_interface_alignment_analysis.md`：DDL と既存資料の差分、保持すべきメタ情報。
- `server/doc_dev_log/integration_analysis_report_20251009.md`：非同期ジョブ API 方針（本レポートで補足済）。
- DDL 原本 `docs/[最新版]_DDL_1014.sql`：`global_accounts`, `user_accounts`, `periods` の必須カラム。
- コアロジック：`server/src/fam/fam.ts:72-404`, `server/src/engine/ast.ts:1-360`, `server/src/model/types.ts:19-88`.
- 現行 API：`server/api/*.ts`, `server/src/index.ts`.
- フロント UI：`src/pages/FinancialStatementPreview.tsx`, `src/pages/GridPage.tsx`, `src/data/dummyFinancialData.ts`, 各種 hooks。

## 3. CL 側インターフェース整理

| メソッド                                                                               | 期待する入力                                                                                  | 補足                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `importActuals(PREVS, accountsMaster)` (`server/src/fam/fam.ts:72-147`)                | `PREVS`: `Record<string, number>[]`（年度順）、`accountsMaster`: `Account[]`                  | GAID → accountId の primary map を構築し、実績セルを AST/テーブルに常駐化。未知 accountId は軽量合成（GAID 非対応） |
| `setRules(rules)` (`server/src/fam/fam.ts:150-152`)                                    | `Record<string, RuleInput>`                                                                   | accountId キーでルールを保持。GAID 指定は API 側で accountId に解決しておく必要あり                                 |
| `setBalanceChange(cfis)` (`server/src/fam/fam.ts:154-156`)                             | `CFI[]`                                                                                       | target/counter/driver の GAID を primary accountId に解決済みで渡す                                                 |
| `compute({ years, baseProfitAccount, cashAccount })` (`server/src/fam/fam.ts:267-338`) | `years`: 予測年度数, `baseProfitAccount`: 当期純利益等（accountId）, `cashAccount`: GAID.CASH | 評価順序に従ってルール→BSロールフォワード→B&C→CF を実行                                                             |
| `getTable({ fs, years })` (`server/src/fam/fam.ts:372-404`)                            | `fs`: `'PL'                                                                                   | 'BS'                                                                                                                | 'CF'`, `years`: 任意 | `{ rows, columns, data }` を返却。`rows` に `Account` メタを保持するよう拡張が必要 |
| `getCFStatement(fy)` (`server/src/fam/fam.ts:406-408`)                                 | `fy`: 年度                                                                                    | CFO/CFI/CFF/total を返却（オプション）                                                                              |

### CL からの出力仕様

- `rows`: `Account` 情報（`id`, `AccountName`, `GlobalAccountID`, `fs_type`, `is_credit`, `parent_id` など）。`importActuals` に渡したマスタ情報をそのまま保持できるよう `FAM` のメンバに追加する改修が必要。
- `columns`: `FY:{year}`。
- `data`: 行列形式の数値。UI 用にアンピボットするのは API 層の責務。
- `getCFStatement` で CF サマリ取得可能。UI での表示要件次第で併用。

## 4. API 層の責務

1. **入力データ収集**
   - `user_accounts` × `global_accounts` JOIN で `accountsMaster` を作成（`ga_code`, `ga_type`, `parent_ga_type`, `is_credit`, `sort_num`, `indent_num` を含む）。
   - `import_df` から `df_json` を読み込み `PREVS` を構築。キーの accountId は `user_accounts.id` を文字列化。UI で扱う `ua_id` と一致させる。
   - `calculation_rules` を読み込み、`rule_type` ごとに `RuleInput` / `CFI` へ整形。GAID 指定はここで解決。
   - `periods` を取得し、`period_id`, `period_label`, `period_type`, `period_val`, `display_order`, `af_type` を保持。

2. **FAM 呼び出し**
   - `FAM.importActuals(PREVS, accountsMaster)` → `setRules` → `setBalanceChange` → `compute({ years, baseProfitAccount, cashAccount: GAID.CASH })`。
   - `baseProfitAccount` は UI 設定または `calculation_rules` 内の利益科目から決定する必要あり（課題：備忘参照）。

3. **結果整形（アンピボット）**
   - `getTable` から `PL/BS/CF` の行列を取得。
   - `periods` 情報と `rows` の `Account` メタを突合し、`docs/[codex]_interface_specification_V2.md` で定義された `financialData` 形式へ展開。
   - 未知 accountId（マスタ未登録）は `global_account` を `null` または簡易オブジェクトで返却し、UI での GAID 連動が不可である旨をステータスに含める。

4. **非同期ジョブ管理**
   - `POST /api/v1/calculations`: ジョブ作成 → すぐ `jobId` 返却。
   - バックグラウンドで上記処理を実行し、結果を Redis/DB の `results:{jobId}` に保存（TTL 設定）。
   - `GET /api/v1/calculations/status/:jobId`: 状態（`PENDING` / `RUNNING` / `COMPLETED` / `FAILED`）を返す。
   - `GET /api/v1/calculations/results/:jobId`: 完了済みなら `metadata + financialData` を返却。未完了時は 404/409 応答。
   - 多重実行ポリシー（同一 `modelId` × `scenarioId` の同時実行可否）を定義。

5. **キャッシュ vs 再計算**
   - `accountsMaster`, `PREVS`, `rules`, `periods` は DB の最新を毎回取得が原則。更新が頻繁にないデータ（`global_accounts` など）は API 層で短期キャッシュしても良い。
   - CL が返す `rows` には全勘定メタが含まれるため、UI 表示用に別キャッシュは不要。必要に応じて API レイヤで `financialData` を TTL 付きで保存。

## 5. UI 側の取り扱い

1. **非同期計算フロー**
   - `FinancialStatementPreview.tsx` に「計算実行」操作を追加。`POST /calculations` を叩いて `jobId` を受け取り、ポーリングでステータス確認。
   - `COMPLETED` 時に `GET /results/:jobId` で `financialData` を取得し、`react-data-grid` 用に行列へ再構成（年度列は `periods.display_order` 順にソート）。
   - `FAILED` 時はエラー表示、`PENDING/RUNNING` 時はスピナー表示。タイムアウト閾値も設定。

2. **ダミーデータからの置き換え**
   - `src/data/dummyFinancialData.ts` は初回ロード用フォールバックとして残し、API 取得成功後に実データへ差し替える。
   - `GridPage.tsx` / `FinancialStatementPreview.tsx` は `financialData` を受け取ったら `ua_id` と期間情報で `rows` / `columns` を組み直す。
   - `hooks/useFinancialAccounts` など既存 hooks との整合：UI は `accountsMaster` を別 API で取得済みのケースがあるため、計算結果とマスタ情報を同期させる仕組みが必要（例：`ua_id` で merge）。

3. **保管しておくべき情報**
   - `periods` (ラベル・順序・種別) は UI 側でも保持し、結果取得前にカラム構成を決められるようにする。
   - 最新 `jobId` とポーリング状態を `useState` で管理し、ユーザーが画面を離れた際にポーリングを解除。

## 6. 入出力フロー（文章版シーケンス）

1. UI → API：`POST /api/v1/calculations` (modelId, scenarioId, projectionYears, baseProfitAccountIdオプション)
2. API：ジョブ登録 → 202 Accepted + `jobId`
3. API（非同期）：DB から `accountsMaster` / `PREVS` / `rules` / `periods` 取得 → GAID/期間メタ解決 → FAM 計算 → V2 スキーマへ整形 → 結果保存
4. UI：`GET /status/:jobId` をポーリング
5. API：状態返却
6. 完了後 UI → API：`GET /results/:jobId`
7. API：`metadata + financialData` を返却
8. UI：結果をテーブル表示、必要なら CSV/Excel エクスポートも計画

## 7. 直感的 FAQ への回答

- **CL を叩くエンドポイントは何を渡すか？**  
  `modelId`, `scenarioId`, `projectionYears`, （必要なら）`baseProfitAccountId`。API 層が DB から材料を収集し、CL には `PREVS`, `accountsMaster`, `rules`, `cfis` を渡す。

- **CL 側で受け取るべき情報と API に留める情報は？**
  - CL：算出に必要な実績・勘定メタ・ルールのみ。UI 用ラベルや期間のソート順など表示系メタは API/フロントで保持。
  - API：`periods` 情報や GAID→accountId の解決結果をキャッシュし、CL が返す行列と突合。

- **CL の出力は JSON スキーマ通りか？**  
  CL は行列形式（`rows/columns/data`）を返す。API 層が `docs/[codex]_interface_specification_V2.md` に定義した JSON（`financialData` 配列）へ変換して UI に渡す。

- **CL に渡さない情報はどう扱うか？**  
  期間メタや UI 固有の並び順・表示設定は API 側で保持し、CL から戻ったデータと結合。未登録勘定（GAID なし）は API で補助フラグを立て UI に通知。

- **ダミーデータの実データ化**  
  `dummyFinancialData.ts` で定義されている構造をベースに、API から取得した `financialData` を `ua_id` 単位で集計し直し、`react-data-grid` へ供給。ダミーはフェイルバックまたはストーリーブック用途に限定。

## 8. 備忘チケット

- [ ] `calculation_rules` に GAID の `super_calc` を対象とした `PARAMETER` ルールを登録する運用方針を決める（ベース利益科目の決定方法含む）。
- [ ] DDL と JSON スキーマの整合最終確認（`period_val` のフォーマット、`is_credit` null 時の扱い）。
- [ ] `FAM.getTable()` が `accountsMaster` の追加属性（`ga_code`, `parent_ga_type` 等）を保持できるよう改修し、既存テストを更新。
- [ ] 非同期ジョブ管理用のテーブル設計（ジョブ状態、失敗ログ、TTL）とキャッシュ基盤の選定。
- [ ] UI での列ソート・比較表示・エラー処理 UI ガイドラインを決める。

## 9. 次のアクション

1. 上記備忘チケットを Issue 化し、優先度を付けてタスク化。
2. API 層に非同期ジョブ管理を実装し、モックレスポンスで UI → API → CL → API の疎通を検証。
3. フロント側で `financialData` V2 スキーマを受け取るエンドツーエンドテストを書き、ダミーデータ依存を排除。
4. CL 側でメタ付与・テストを整備し、`FAM` 計算結果の安定性を確認。
5. ガバナンス用に API/CL の仕様書（OpenAPI / internal doc）を更新し、経営サイドが参照できる形で共有。
