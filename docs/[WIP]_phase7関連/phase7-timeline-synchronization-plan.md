# Phase7 Timeline Synchronization Implementation Plan

## 背景

- `import_df` から PREVS を生成する経路は整備されているが、シナリオの期間メタ (`periods` テーブル) を同期する仕組みが存在しない。
- その結果、`calculate` 実行時に FAM が出力する列 (`FY:2025` など) と `periods` の期間ラベルが不整合となり、`transformToFinancialData` で `期間情報が不足しています` エラーが発生している。
- 今後も UI/バックオフィスから新しい実績やシナリオを投入するたびに同問題が再発するため、タイムライン同期を中核に据えた包括的な仕組みが必要。

## ゴール

- シナリオごとの期間タイムラインを自動生成・更新する「Timeline Orchestrator」を導入し、常に `periods` テーブルを最新状態に保つ。
- 計算オーケストレーター (`createCalculationExecutor`) が常に完全な期間メタデータを取得できる状態を作る。
- 実績取り込み・CLI・UI など複数経路から同じ同期ロジックを再利用できる拡張性を確保する。

## スコープ

- サーバーサイドでのタイムライン同期モジュール新設と、`import_df` 取り込みフローへの組み込み。
- シナリオ単位でのタイムライン自動補完、既存期間との突き合わせ、欠損時の警告を実装。
- 計算実行時のフォールバック改善と、期間未設定時の検出・エラーメッセージ整備。
- CLI/管理用エンドポイントの追加による再同期バッチの準備。

## アウトオブスコープ

- 月次列の UI 表示やダミーデータ編集フローの刷新。
- FAM 側の期間推定ロジックの大幅な変更（必要最低限の調整のみ）。
- 既存 DB データの本番移行（ツール提供まで）。

## 成果物

- `server/src/service/timeline/`（仮）配下に、抽出・突き合わせ・永続化を担う Timeline Orchestrator モジュール。
- `import_df` 取り込みハンドラ・CLI から呼び出せる `ensureScenarioTimeline` API。
- `npm --prefix server run timeline:sync --scenario <id>`（仮称）の再同期 CLI。
- 計算ルートにおける期間未設定検知と、整備されたエラーハンドリング。
- 上記に対する単体・結合テスト、および docs への手順追記。

## アーキテクチャ概要

1. **Timeline Extractor**: `import_df` の列ラベルや JSON 内 `periods` 配列から、`{ label, period_type, af_type, period_val }` を抽出。
2. **Timeline Reconciler**: 既存 `periods` レコードを取得し、抽出結果と比較して upsert・削除判定を行う。`display_order` や `scenario_id` を担保。
3. **Timeline Registry**: 計算実行などランタイム処理から呼び出し、必要なら Extractor/Reconciler を起動して `OrderedPeriod[]` を返す。同期済みかどうかのキャッシュを保持可能。
4. **Integration Hooks**: インポート API、CLI、将来的な UI 操作など、複数チャネルから Timeline Orchestrator を利用できるようエントリポイントを設ける。

## 実装ステップ

1. **タイムラインモジュールの土台作成**
   - `TimelineExtractor` と `TimelineReconciler` のインターフェース設計。
   - `periods` テーブルへの upsert 用リポジトリ（既存 `calculationRepositories` を拡張）。
2. **import_df 取り込みフローとの連携**
   - 既存インポート処理完了後に `ensureScenarioTimeline` を呼び、期間データを同期。
   - 期間が不足している場合は警告ログを残し、UI へ明示的なメッセージを返却。
3. **再同期 CLI/管理 API の追加**
   - 過去データの修復用に `timeline:sync` CLI を実装。
   - 必要なら管理者用 HTTP エンドポイントを用意（認証要件は別途検討）。
4. **計算フローの堅牢化**
   - `createCalculationExecutor` で `TimelineRegistry` を経由して期間を取得し、未設定の場合は同期を試みてからユーザー向けエラーを返す。
   - ログに PREVS/periods の件数差分を出し、運用時のトラブルシュートを容易にする。
5. **UI/ドキュメント整備**
   - タイムライン同期の前提条件を `docs` に追記。
   - UI 上で期間未設定エラーを受け取った際の対処フローを記載。

## TDD 方針

- **ユニットテスト**
  - Extractor: レガシー形式・新形式双方から期待どおりの期間セットが得られるか。
  - Reconciler: 追加・更新・削除（保持）パターンを網羅し、`display_order` の再計算を検証。
  - Registry: 同期済みシナリオに対して DB 呼び出しを避けるキャッシュ制御をテスト。
- **結合テスト**
  - `createCalculationDataLoader` 経由で PREVS 取り込み→タイムライン同期→ `OrderedPeriod` 取得までを通しで検証。
  - 計算実行時に期間未設定→同期→再実行で成功するフローを確認する擬似 E2E テストを追加。
- **CLI テスト**
  - timeline:sync コマンドに対し、モック DB を用いた振る舞いテストを実施。

## データ移行と運用

- CLI を用いた一括同期スクリプトで既存シナリオの `periods` を補完し、ログに結果を残す。
- 定期的な同期チェック（例: CI で PREVS/periods の件数差分を監視）を追加検討。

## リスクと対策

- **インポートデータのラベル揺れ**: 正規化ルールを Extractor 内に実装し、異常値は警告と共に UI へ返却。
- **既存期間との衝突**: Reconciler で衝突時に上書き/スキップ方針を明示し、オプション化する。
- **大規模シナリオでの処理コスト**: TimelineRegistry にキャッシュ層を設け、同一リクエストでの再計算を避ける。

## オープン課題

- 月次/四半期など複数粒度を扱う際の `period_type`/`af_type` の定義詳細。
- タイムライン編集 UI の提供要否と、その際の権限設計。
- 期間データのバージョニングや履歴管理の必要性。

## 次のアクション

1. 上記プランをチームと共有し、命名規約・モジュール構成を確定。
2. TDD で Extractor/Reconcilor から着手し、順次 Registry → import フロー統合へ進める。
3. 移行 CLI を作成して既存シナリオの `periods` を同期し、計算ジョブでエラーが解消されることを確認する。
