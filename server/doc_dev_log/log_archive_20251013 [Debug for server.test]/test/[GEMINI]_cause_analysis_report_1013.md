### 原因分析レポート.md

**1. 根因**

APIエンドポイント(`/api/calculation-rules`)の実装が更新され、レスポンスとして返されるJSONオブジェクトのスキーマが変更されました。しかし、2つの主要なテストファイル (`server/test/full-integration-test.ts` と `server/test/test-calculation-rules-api.ts`) 内の期待値が古いスキーマのままであったため、テストが失敗していました。

主な変更点:

- `rate`や`ratio`といったプロパティ名が`value`に統一されました。
- `reference_id`のようなIDのみを保持していたプロパティが、アカウント名などを含む詳細な`ref`オブジェクトになりました。
- `custom_calc`および`prev_end_plus_change`のルール定義の構造が、より表現力の高い形式に更新されました。
- `test-calculation-rules-api.ts`の`custom_calc`テストは、DBに存在する子勘定に依存していたため、不安定になっていました。

**2. 再現手順**

1.  `fs-model`リポジトリのルートで`docker-compose up -d`を実行し、DBとサーバーを起動します。
2.  `server`ディレクトリに移動します。
3.  `npx tsx test/full-integration-test.ts` または `npx tsx test/test-calculation-rules-api.ts` を実行すると、複数のテストが失敗します。

**3. 影響範囲**

- `server/test/full-integration-test.ts`
- `server/test/test-calculation-rules-api.ts`

**4. 契約差分**

| パラメータタイプ       | 変更前の期待値 (テスト側)                                     | 変更後の実体 (API側)                                                                                                          |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `growth_rate`          | `{ "type": "growth_rate", "rate": 0.05 }`                     | `{ "type": "growth_rate", "value": 0.05 }`                                                                                    |
| `ratio`                | `{ "type": "ratio", "reference_id": 1, "ratio": 0.2 }`        | `{ "ref": { "accountName": "...", "userAccountId": 1 }, "type": "ratio", "value": 0.2 }`                                      |
| `link`                 | `{ "type": "link", "reference_id": 2 }`                       | `{ "ref": { "accountName": "...", "userAccountId": 2 }, "type": "link" }`                                                     |
| `custom_calc`          | `{ "type": "formula", "formula": "11 + 12" }`                 | `{ "type": "custom_calc", "formula": { "expression": "@11 - @12", "references": [...] } }`                                    |
| `prev_end_plus_change` | `{ "instructions": [{ "type": "add_flow", "flow_id": 21 }] }` | `{ "instructions": [{ "driver": { "accountName": "...", "userAccountId": 21 }, "effect": "INCREASE", "counter": { ... } }] }` |
