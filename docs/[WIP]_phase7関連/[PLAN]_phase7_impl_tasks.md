# Phase7 実装タスク計画（Draft）

## 1. 計画期(Projection)の可視化 ¥

- [ ] `POST /api/v1/calculations/results/:jobId` の payload を確認し、Forecast 期間の有無・値を記録する。
- [ ] `buildGridFromFinancialData` で `af_type` や `period_type` が Forecast の場合でも列生成できるよう調整（Actual と Forecast を区別する UI ラベル／スタイル検討）。
- [ ] Grid 表示の単体テストを追加し、Actual/Forecast の混在ケースをカバー。
- [ ] UI で計画期が正しく表示されたことをスクリーンショットまたは記録で確認。

## 2. 表示ロジック／データ整合の磨き込み

- [ ] API モード時の列生成条件を整理し、ダミーデータ（手入力）との共存ルールを明文化。
- [ ] `displayRows` などの分岐を見直し、API 結果表示時に余計な比率行・検証行が混在しないよう制御。
- [ ] 未解決ラベルのフォールバック戦略を決定（仮ID発行 or インポート時警告など）し、Issue を作成。

## 3. Lint／品質整備

- [ ] `server/src/routes/timelineAdmin.ts` など Prettier エラー箇所を修正。
- [ ] `calculationDataLoader.ts`/Factory などで残っている `no-non-null-assertion` や `no-unused-vars` の警告を段階的に解消。
- [ ] `npm run lint` が警告ゼロになることを目標に、難易度が高い箇所は TODO として記録。

## 4. テスト拡充

- [ ] Timeline Orchestrator／Loader／CSV Import のテストケースを補強し、再帰的な同期失敗や未解決ラベルの挙動を確認。
- [ ] Grid 表示のスナップショット／統合テストを追加（Actual/Forecast の切り替えなど）。
- [ ] `npm --prefix server test` および UI テスト（RTL/E2E）を CI に組み込む準備を行う。

## 5. ドキュメント整備

- [ ] `docs/[codex]_phase7_plan&strategy.md` に今回の変更点と残課題を追記。
- [ ] Timeline 同期の手順・CLI 利用方法を README または Runbook にまとめる。
- [ ] Forecast 表示の仕様が固まったら UI 側の操作ガイドも更新する。

> ⚠️ 進行管理メモ: 上記チェックボックスは次回セッション以降で進捗を記録できるようにしています。優先順位は「計画期の表示確認 → 表示ロジック改善 → Lint/テスト整備 → ドキュメント更新」の順がおすすめです。
