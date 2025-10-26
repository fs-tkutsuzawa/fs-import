# セットアップスクリプト

このディレクトリには、開発・テスト環境のセットアップスクリプトが含まれています。

## セットアップファイル

- `setup-scenario.ts` - テストシナリオの初期設定
- `setup-test-accounts.ts` - テスト用ユーザーアカウントの作成
- `simple-setup.ts` - 最小構成のテスト環境セットアップ

## 実行方法

```bash
# テストシナリオ作成
cd /workspace/server
npx tsx scripts/setup/setup-scenario.ts

# テスト用アカウント作成
npx tsx scripts/setup/setup-test-accounts.ts

# シンプルセットアップ
npx tsx scripts/setup/simple-setup.ts
```

## 注意事項

- データベースへの書き込み権限が必要です
- 既存データを上書きする可能性があります
- 本番環境では実行しないでください
