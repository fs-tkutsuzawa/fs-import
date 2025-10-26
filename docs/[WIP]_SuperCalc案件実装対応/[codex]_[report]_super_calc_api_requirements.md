# Super Calc 注入機能 API 化要件メモ

## 1. 目的

CLI ベースで実装した Super Calc テンプレート注入処理を、将来的にアプリケーションから自動実行できるよう API 化する際の要件を整理する。

## 2. 前提と既存資産

- テンプレート定義は `server/src/templates/master_rules.json`（GA コード基準）。
- 注入ロジック本体は `scripts/cli/inject-super-calc.ts` に実装済み。`processScenario()` 相当をサービス層に切り出せば再利用可能。
- DB 接続モジュールは `server/api/db.ts`。

## 3. エンドポイント案

- **HTTP Method / Path**
  - `POST /api/v1/scenarios/:scenarioId/super-calc`
- **クエリ/Body パラメータ**
  - `dryRun`（boolean, optional, default=false）: 真の場合はデータベース更新せず差分のみ返す。
  - `overwrite`（boolean, optional, default=true）: `ON CONFLICT` による上書きを許可する。false の場合は既存ルールが存在すればスキップ。
  - `templateVersion`（string, optional）: 将来テンプレートが複数管理になった際の選択肢。
- **レスポンス例**
  ```json
  {
    "scenarioId": 42,
    "inserted": 10,
    "updated": 5,
    "skipped": 2,
    "dryRun": false,
    "template": "master_rules_v1"
  }
  ```
- **失敗時**
  - `404` : 指定シナリオが存在しない。
  - `409` : `overwrite=false` で既存ルールと衝突した場合。
  - `422` : 対応する `user_accounts` が見つからないなどテンプレートの整合性問題。
  - `500` : 内部エラー。

## 4. 権限/セキュリティ

- 認証済み管理者のみ操作可能（将来、role-based authorisation）。
- 監査ログにシナリオ ID / 実行ユーザー / 挿入件数等を記録。

## 5. トランザクション/スケーラビリティ

- 1 リクエストは単一トランザクションで完結（CLI と同様）。
- シナリオ数が多い場合、バッチ用の `POST /api/v1/super-calc/bulk` を検討。
- リトライ可能性：失敗時にロールバック済みであれば再実行可能。

## 6. UI 連携想定

- シナリオ作成完了後に自動呼び出し。
- 進行状況をトースト表示、dry run 結果を確認できる画面を提供。

## 7. TODO

- CLI ロジックを `server/src/services/superCalcInjector.ts` にモジュール化。
- OpenAPI 定義を追加して契約テストを実施。
- API エンドポイント実装後、`server/src/index.ts` へのルーティング追加および jest 統合テストを用意。
