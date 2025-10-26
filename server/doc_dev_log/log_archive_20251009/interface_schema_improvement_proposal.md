# UI向けJSONスキーマの改良提案

**日付**: 2025年10月8日
**目的**: 既存のUI向けJSONスキーマを分析し、DDL（データベース定義）の構造、特に勘定科目の親子関係をより忠実に、かつ明確に表現するための改良案を提示する。

---

## 1. 既存JSONスキーマの解説 (7.3 DDL準拠版)

現在`interface_specification_report.md`で定義されているスキーマは、コアロジックの計算結果をUIに渡すためのものです。以下の優れた設計思想に基づいています。

- **UIフレンドリーなフラット構造**:
  - 主要なデータは`financialData`という単一の配列に格納されています。配列の各要素は「1勘定・1期間・1数値」を表すオブジェクトであり、これはUIのデータグリッドライブラリで極めて扱いやすい形式です。
- **自己完結的なデータ**:
  - 各データオブジェクトは、それ自身を表示するために必要なすべての情報（勘定名、表示順、インデント、期間、値など）を含んでいます。これにより、UI側での複雑なデータ整形や再検索が不要になります。
- **DDL準拠の命名規則**:
  - `ua_id`, `parent_ga_id`といったキー名は、データベースのDDLのカラム名と一致しており、開発者のメンテナンス性を向上させます。

**総括**: 現行スキーマは、UIでのレンダリング効率と開発者のメンテナンス性を重視した、実践的な設計になっています。

## 2. スキーマの改良提案

現行スキーマは優れていますが、`global_accounts` (GA) と `user_accounts` (UA) の親子関係の表現については、さらなる改善の余地があります。現在のフラットなキー定義では、どの情報が自分自身のもの（UA）で、どの情報が親から継承したもの（GA）なのか、構造的に曖昧です。

そこで、DDLの親子関係をより明確に構造化し、`sort_num`の所在を明確にした改良版スキーマを以下に提案します。

### 改良版JSONスキーマ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Financial Model Calculation Result (v2 - Enriched Hierarchy)",
  "type": "object",
  "required": ["metadata", "financialData"],
  "properties": {
    "metadata": {
      "type": "object",
      "description": "計算全体に関するメタデータ",
      "properties": {
        "modelId": { "type": "integer" },
        "scenarioId": { "type": "integer" },
        "calculationTimestamp": { "type": "string", "format": "date-time" },
        "currency": { "type": "string", "default": "JPY" }
      }
    },
    "financialData": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "ua_id",
          "ua_name",
          "fs_type",
          "sort_num",
          "global_account",
          "period_id",
          "value"
        ],
        "properties": {
          "ua_id": {
            "type": "integer",
            "description": "この勘定科目の一意なID (user_accounts.id)"
          },
          "ua_name": {
            "type": "string",
            "description": "ユーザーが定義した勘定科目名 (user_accounts.ua_name)"
          },
          "ua_code": {
            "type": ["string", "null"],
            "description": "ユーザー定義の勘定科目コード (user_accounts.ua_code)"
          },
          "sort_num": {
            "type": "integer",
            "description": "表示順序。ユーザーによる上書きが可能 (user_accounts.sort_num)"
          },
          "fs_type": {
            "type": "string",
            "enum": ["PL", "BS", "CF"],
            "description": "財務諸表区分 (user_accounts.fs_type)"
          },
          "is_credit": {
            "type": ["boolean", "null"],
            "description": "貸方科目か否か (user_accounts.is_credit)"
          },
          "is_kpi": {
            "type": "boolean",
            "description": "KPI科目か否か (user_accounts.is_kpi)"
          },

          "global_account": {
            "type": "object",
            "description": "紐づくグローバル勘定科目の主要情報。性質や表示の基本骨格を定義する。",
            "properties": {
              "id": { "type": "string", "description": "global_accounts.id" },
              "name": {
                "type": "string",
                "description": "global_accounts.ga_name"
              },
              "indent_num": {
                "type": "integer",
                "description": "表示上のインデントレベル (global_accounts.indent_num)"
              }
            },
            "required": ["id", "name", "indent_num"]
          },

          "parent_user_account": {
            "type": ["object", "null"],
            "description": "ユーザー定義階層における親勘定の主要情報 (オプショナル)",
            "properties": {
              "id": { "type": "integer", "description": "user_accounts.id" },
              "name": {
                "type": "string",
                "description": "user_accounts.ua_name"
              }
            },
            "required": ["id", "name"]
          },

          "period_id": {
            "type": "integer",
            "description": "期間ID (periods.id)"
          },
          "period_label": {
            "type": "string",
            "description": "期間表示名 (periods.period_label)"
          },
          "af_type": {
            "type": "string",
            "description": "実績/予測区分 (periods.af_type)"
          },
          "value": { "type": ["number", "null"], "description": "計算値" }
        }
      }
    }
  }
}
```

### 3. 改良点サマリー

1.  **親子関係の構造化**:
    - `parent_ga_id`や`ga_name`のようなフラットなキーを廃止し、代わりに`global_account`オブジェクトと`parent_user_account`オブジェクトを導入しました。
    - これにより、「このユーザー勘定科目が、どのグローバル勘定科目の性質を継承しているか」という**is-aの関係**と、「どのユーザー勘定科目の子要素か」という**has-aの関係**が、JSONの構造レベルで明確に表現されます。

2.  **`sort_num`の明確化**:
    - `sort_num`が`user_accounts`テーブルに由来する、ユーザーが上書き可能な値であることをdescriptionで明記しました。これにより、UIは`global_accounts`の`sort_num`ではなく、この`user_accounts`の`sort_num`を正としてソート処理を行えばよいことが明確になります。

3.  **データリッチ化によるUI実装の簡素化**:
    - 各データオブジェクトに親の主要情報（ID、名前など）を埋め込むことで、UI側で親子関係を解決するための追加のルックアップ処理が不要になります。データはフラットな配列のままなので、グリッド表示の容易さは維持されます。

この改良により、スキーマはDDLの構造をより忠実に反映し、UIとバックエンド間の連携をさらにスムーズにすると考えます。
