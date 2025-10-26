# テストスクリプト

このディレクトリには、APIと機能のテストスクリプトが含まれています。

## ディレクトリ構成

```
test/
├── setup/              # テストデータセットアップ
│   ├── setup-scenario.ts
│   ├── setup-test-accounts.ts
│   └── simple-setup.ts
├── test-calculation-rules-api.ts
├── test-all-parameters-no-delete.ts
├── full-integration-test.ts
├── verify-account-names.ts
├── test-mapping-logic.ts
├── check-schema.ts
└── check-columns.ts
```

## テストファイル

### セットアップ (setup/)

- `setup-scenario.ts` - テストシナリオの初期設定
- `setup-test-accounts.ts` - テスト用ユーザーアカウントの作成
- `simple-setup.ts` - 最小構成のテスト環境セットアップ

### API テスト

- `test-calculation-rules-api.ts` - 計算ルールAPIの基本テスト
- `test-all-parameters-no-delete.ts` - 全パラメータタイプのテスト（データ保持）
- `full-integration-test.ts` - 統合テスト（CRUD操作含む）

### データ検証

- `verify-account-names.ts` - 科目名の解決確認
- `test-mapping-logic.ts` - マッピングロジックのテスト
- `check-schema.ts` - DBスキーマ確認
- `check-columns.ts` - テーブルカラム確認

## 実行方法

```bash
cd /workspace/server

# テストデータセットアップ
npx tsx test/setup/setup-scenario.ts
npx tsx test/setup/setup-test-accounts.ts

# 個別テスト実行
npx tsx test/test-calculation-rules-api.ts

# 全パラメータテスト
npx tsx test/test-all-parameters-no-delete.ts

# 統合テスト
npx tsx test/full-integration-test.ts
```

## 注意事項

- サーバーが起動している必要があります（ポート3001）
- データベースへの接続が必要です
- テスト実行前にセットアップスクリプトの実行が必要な場合があります
