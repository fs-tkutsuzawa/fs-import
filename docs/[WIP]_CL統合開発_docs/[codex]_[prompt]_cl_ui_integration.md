# Prompt: UI × Core Logic 統合タスク

## 1. 指令

UI とコアロジック（FAM）を結びつける機能開発に着手せよ。

- まず、現状のコードベースと資料から「何が既にできているか」「どこが未接続か」を把握する。
- 続いて、UI と CL をどう繋ぐかの構想と実装戦略をまとめ、ユーザーに提案できる素案を作成する。
- 最終的には実装着手に必要なタスクリストや落とし穴を明文化する。

## 2. 参照資料（Reference Stack）

- `docs/[codex]_interface_specification_V2.md`
- `docs/[codex]_interface_alignment_analysis.md`
- `docs/[codex]_interface_specification_report.md`（旧版）
- `docs/[codex]_[report]_cl_ui_integration_recon.md`（予備調査ログ）
- `docs/[codex]_[report]_super_calcテンプレート適用概要.md`（Super Calc との関係）
- `docs/[codex]_[report]_super_calcテンプレート適用課題.md`（Super Calc 整合性の課題）
- `docs/[codex]_[report]_super_calc_api_requirements.md`（将来 API 化）
- DDL: `docs/[最新版]_DDL_1014.sql`
- コアロジック: `server/src/fam/fam.ts`, `server/src/engine/ast.ts`, `server/src/model/types.ts`
- サーバ API: `server/api/*.ts`, `server/src/index.ts`
- フロント: `src/pages/FinancialStatementPreview.tsx`, `src/hooks/*`, `src/components/*`, `src/data/dummyFinancialData.ts`

## 3. 実行フロー

1. **現状理解**
   - 参照資料とコードを読み、既存の UI→API→CL の連携状況を整理。
   - `cl_ui_integration_recon.md` に記載されたギャップ（行列→アンピボット、非同期ジョブ、期間情報の扱いなど）を確認。
   - `interface_specification_V2.md` の入出力仕様を理解し、欠けている実装部位を特定。
2. **見通し策定**
   - 非同期ジョブ設計（POST/Status/Result）とデータ変換の責務分担を具体化。
   - FAM 側で必要な改修（`getTable` のメタ充実など）と API 層での整形処理を整理。
   - フロント側でやるべき改修（ポーリング、列並び替え、dummy からの置き換え）を洗い出す。
3. **実装戦略・計画の素案作成**
   - モジュール単位のタスクリスト（ファイル名・機能・目的）を作成。
   - スケジュール感や優先度が分かるよう簡潔にまとめ、ユーザーへ提案できる形で提示。
   - リスク/懸念点、Super Calc 連携の影響、テスト方針も記載。

## 4. 出力フォーマット

- `現状理解`: 箇条書きで把握内容を整理（UI / API / CL / DDL）。
- `見通し`: 実装上の主論点とアプローチ案。
- `実装素案`: タスクリスト（ファイル単位）、非同期 API 設計、フロント改修概要、テスト計画。
- 最後に「次のステップ」を明示。
