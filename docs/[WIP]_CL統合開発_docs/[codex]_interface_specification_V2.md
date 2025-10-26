# インターフェース仕様書 V2（DDL 1014 準拠）

## 1. 目的

UI / API / コアロジック間のデータ授受を最新 DDL（`docs/[最新版]_DDL_1014.sql`）と整合させる。  
V2 では `global_accounts`, `user_accounts`, `periods` に新規追加・厳格化された属性をすべて受け渡し可能とし、API 層でのアンピボット処理を明確化する。

## 2. データソースと取得責務

| 取得対象                      | 参照テーブル                           | 主なフィールド                                                                                     | 利用箇所                               |
| ----------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 勘定マスタ (`accountsMaster`) | `user_accounts` JOIN `global_accounts` | `ua_*`, `fs_type`, `is_credit`, `parent_ga_id`, `parent_ga_type`, `ga_*`, `sort_num`, `indent_num` | `FAM.importActuals`, API の行メタ情報  |
| 実績 (`PREVS`)                | `import_df`                            | `df_json`（年度配列）                                                                              | `FAM.importActuals`                    |
| 期間メタ (`periods`)          | `periods`                              | `period_id`, `period_label`, `display_order`, `period_type`, `period_val`, `af_type`               | API アンピボット時の列整備             |
| ルール (`rules`, `cfis`)      | `calculation_rules`                    | `rule_type`, `rule_definition`, `target_user_account_id`, `period_id`                              | `FAM.setRules`, `FAM.setBalanceChange` |

## 3. データフロー

1. **実績・マスタの取り込み**
   - API は `user_accounts` と `global_accounts` を結合し、`accountsMaster` を構築して `FAM.importActuals(PREVS, accountsMaster)` に渡す。
   - `importActuals` は accountId → Account マッピングと GAID → primary accountId を確立し、PREVS の各年度を表/AST に常駐化する。マスタ未登録の accountId は軽量合成されるが GAID 連携は不可と注記する。

2. **ルール適用・計算**
   - `FAM.setRules` に `RuleInput` へ復元した `PARAMETER` ルールを投入。
   - `FAM.setBalanceChange` に `CFI[]` を投入。
   - `FAM.compute({ years, baseProfitAccount, cashAccount: GAID.CASH })` で予測を実行。

3. **結果整形**
   - `FAM.getTable({ fs })` が `{ rows, columns, data }` を返却。`rows` は `importActuals` 時に取り込んだ勘定メタを保持するよう FAM を拡張する。
   - API は `columns`×`rows` の行列をアンピボットし、`financialData` に 1レコード=1勘定×1期間の形式で整形する。
   - 期間情報は `columns` から FY を読みつつ、`periods` テーブルの `period_id`, `period_label`, `period_type`, `period_val`, `display_order`, `af_type` をマージする。

## 4. JSON ペイロード（UI 向け）

```json
{
  "metadata": {
    "modelId": 1,
    "scenarioId": 2,
    "calculationTimestamp": "2025-10-10T12:00:00Z",
    "currency": "JPY"
  },
  "financialData": [
    {
      "ua_id": 101,
      "ua_name": "売上高",
      "ua_code": "S-01",
      "fs_type": "PL",
      "is_credit": false,
      "is_kpi": true,
      "parent_ua_id": null,
      "parent_ga_id": "NET_SALES",
      "parent_ga_type": "aggregate",
      "period_id": 11,
      "period_label": "FY2024",
      "period_type": "Yearly",
      "period_val": "2024-12-31",
      "display_order": 1,
      "af_type": "Actual",
      "value": 1000,
      "global_account": {
        "id": "NET_SALES",
        "ga_name": "Net Sales",
        "ga_code": "GA-1001",
        "fs_type": "PL",
        "ga_type": "aggregate",
        "is_credit": true,
        "parent_ga_id": "SALES",
        "sort_num": 10,
        "indent_num": 1
      }
    }
  ]
}
```

## 5. JSON スキーマ（抜粋）

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Financial Model Calculation Result (V2)",
  "type": "object",
  "required": ["metadata", "financialData"],
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "modelId": { "type": "integer" },
        "scenarioId": { "type": "integer" },
        "calculationTimestamp": { "type": "string", "format": "date-time" },
        "currency": { "type": "string" }
      },
      "required": ["modelId", "scenarioId", "calculationTimestamp"]
    },
    "financialData": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "ua_id",
          "ua_name",
          "fs_type",
          "parent_ga_id",
          "parent_ga_type",
          "period_id",
          "period_label",
          "period_type",
          "display_order",
          "af_type",
          "value",
          "global_account"
        ],
        "properties": {
          "ua_id": { "type": "integer" },
          "ua_name": { "type": "string" },
          "ua_code": { "type": ["string", "null"] },
          "fs_type": { "type": "string", "enum": ["PL", "BS", "CF", "PPE"] },
          "is_credit": { "type": ["boolean", "null"] },
          "is_kpi": { "type": "boolean" },
          "parent_ua_id": { "type": ["integer", "null"] },
          "parent_ga_id": { "type": "string" },
          "parent_ga_type": {
            "type": "string",
            "enum": ["super_calc", "aggregate"]
          },
          "period_id": { "type": "integer" },
          "period_label": { "type": "string" },
          "period_type": {
            "type": "string",
            "enum": ["Yearly", "Monthly", "Event"]
          },
          "period_val": { "type": ["string", "null"], "format": "date" },
          "display_order": { "type": "integer" },
          "af_type": { "type": "string", "enum": ["Actual", "Forecast"] },
          "value": { "type": ["number", "null"] },
          "global_account": {
            "type": "object",
            "required": [
              "id",
              "ga_name",
              "ga_code",
              "fs_type",
              "ga_type",
              "parent_ga_id",
              "sort_num",
              "indent_num"
            ],
            "properties": {
              "id": { "type": "string" },
              "ga_name": { "type": "string" },
              "ga_code": { "type": "string" },
              "fs_type": {
                "type": "string",
                "enum": ["PL", "BS", "CF", "PPE"]
              },
              "ga_type": {
                "type": "string",
                "enum": ["super_calc", "aggregate"]
              },
              "is_credit": { "type": ["boolean", "null"] },
              "parent_ga_id": { "type": ["string", "null"] },
              "sort_num": { "type": "integer" },
              "indent_num": { "type": "integer" }
            }
          }
        }
      }
    }
  }
}
```

## 6. API アンピボット処理の手順

1. `fam.getTable({ fs })` を呼び出し、`rows`, `columns`, `data` を取得。
2. `rows[i]` に保持された `Account` メタと `columns[j]` の期間キー (`FY:XXXX`) を用いてループ。
3. `periods` テーブルから `columns[j]` に対応する `period_id` 等を JOIN。存在しない場合は API でエラーとする。
4. 1×1 セルごとに上記 JSON スキーマの構造へマッピングし、`financialData.push(cell)`。
5. 未知の accountId（GAID 未付与）については `global_account` を `null` にし、GAID ベースの機能が利用できない旨 UI に伝達する。

## 7. 留意事項

- GAID 経由の B&C・CF 計算を正しく行うには、`user_accounts.parent_ga_id` に有効な GAID を設定しておくことが前提。
- `is_credit` が `null` の場合は貸借性不明として扱う。CFO 調整では `null` をデフォルトで「資産側（減算）」扱いとしているため、必要に応じて UI 側で警告を出す。
- `period_val` は DDL 上 DATE 型。年度モデルでは期末日を想定するが、UI が年表示のみの場合でも将来の月次対応を想定して保持する。

以上。
