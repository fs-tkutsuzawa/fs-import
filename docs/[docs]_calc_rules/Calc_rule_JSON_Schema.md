Calc_rule_JSON_Schema.md

承知いたしました。新しい計算タイプの要件、そしてUIが追いついていない状況でも仕様をFIXさせたいという実務的な要請、すべてを承知いたしました。

これまでの議論の集大成として、ご提示いただいた7つの計算タイプを完全に網羅し、かつ将来的な拡張にも耐えうる、**最終確定版のJSONスキーマ定義書**を作成します。

この資料は、他の開発担当LLMが実装に着手できるよう、コンテキスト、目的、詳細な仕様、具体例を網羅しています。

---

### **JSONスキーマ定義書: `calculation_rules.rule_definition` (最終拡張版)**

#### **1. はじめに**

##### **1.1. 本資料の目的と対象読者**

この資料は、`calculation_rules`テーブルの`rule_definition`カラム（JSONB型）に格納されるJSONオブジェクトの厳密なスキーマを定義するものです。

対象読者は、本システムのバックエンド開発を担当するLLMまたはエンジニアです。今回、**7つの新しい計算タイプ**が要件として追加されたため、それらを完全に表現できるよう既存のスキーマを拡張・再定義しました。このスキーマ定義に基づき、データのバリデーション、UIからのデータPOST、そしてコア計算エンジンへのデータ受け渡しを実装することを目的とします。

##### **1.2. 設計思想とコンテキスト**

- **完全な網羅性:** `input`, `growth_rate`, `ratio`, `link`, `sum_children`, `custom_calc`, `prev_end_plus_change` の7タイプ全てのロジックを表現可能です。
- **実装の段階的進行への配慮:** UIが未実装のルールタイプについては、ルール定義（JSONB）のプロパティをオプショナル（必須ではない）に設定しています。これにより、UI開発の進捗に関わらず、**暫定的なデータ（Null Fill）をPOSTできる**ようになり、バックエンド開発を先行させることが可能です。
- **リポジトリとの整合性:** このスキーマは、リポジトリ内のTypeScriptの型定義（`server/src/model/types.ts`, `bc.ts`）を拡張し、新しい計算タイプに対応するものです。
- **参照の厳密性と検証性:** 従来通り、勘定科目の参照は`userAccountId`（ID）を**正**とし、人間による検証性のために`userAccountName`を冗長的に保持します。

---

#### **2. `calculation_rules.rule_type` との対応関係**

まず、`calculation_rules`テーブル本体の`rule_type`カラムと、JSON内部の`type`プロパティの関係を以下のように整理します。

| UI上のルール名  | `calculation_rules.rule_type` | `rule_definition.type`         |
| :-------------- | :---------------------------- | :----------------------------- |
| インプット      | `PARAMETER`                   | `input`                        |
| 成長率          | `PARAMETER`                   | `growth_rate`                  |
| 割合            | `PARAMETER`                   | `ratio`                        |
| 連動            | `PARAMETER`                   | `link`                         |
| 子科目合計      | `PARAMETER`                   | `sum_children`                 |
| 個別計算        | `PARAMETER`                   | `custom_calc`                  |
| **前期末+変動** | **`BALANCE_AND_CHANGE`**      | (JSON内に`type`プロパティなし) |

---

#### **3. `rule_type = 'PARAMETER'` の場合のスキーマ**

##### **3.1. 共通コンポーネント: `Ref` オブジェクト**

勘定科目を参照する際の共通オブジェクトです（変更なし）。

```json
{
  "userAccountId": 123,
  "userAccountName": "売上高",
  "period": "PREV"
}
```

##### **3.2. スキーマ定義**

`rule_definition.type`の値によって、必須となるプロパティが変化します。

```json
{
  "description": "PARAMETER型の計算ルール定義。7つのサブタイプを包括的に表現する。",
  "type": "object",
  "properties": {
    "type": {
      "description": "計算の具体的な種類。この値によって他のプロパティの要件が変化する。",
      "type": "string",
      "enum": [
        "input",
        "growth_rate",
        "ratio",
        "link",
        "sum_children",
        "custom_calc"
      ]
    },
    "value": {
      "description": "成長率や割合の計算に使用する固定値。",
      "type": "number"
    },
    "ref": {
      "description": "単一の勘定科目を参照する場合（割合、連動）に使用する。",
      "$ref": "#/definitions/Ref"
    },
    "formula": {
      "description": "個別計算（custom_calc）の多項式を定義する。",
      "type": "object",
      "properties": {
        "expression": { "type": "string", "example": "@123 + @456" },
        "references": {
          "type": "array",
          "items": { "$ref": "#/definitions/Ref" }
        }
      }
    }
  },
  "required": ["type"],
  "definitions": {
    "Ref": {
      // ...
    }
  }
}
```

##### **3.3. 各`type`ごとの具体例と仕様**

- **`input` (インプット)**
  - **仕様:** ユーザーによる直接手打ち入力を示す。計算ロジックは存在しない。
  - **JSON例:**
    ```json
    {
      "type": "input"
    }
    ```

- **`growth_rate` (成長率)**
  - **仕様:** 対象科目の前期末の値に対し、`value`で指定された成長率を乗算する。
  - **JSON例 (前期比5%成長):**
    ```json
    {
      "type": "growth_rate",
      "value": 0.05
    }
    ```

- **`ratio` (割合)**
  - **仕様:** `ref`で参照した科目の値に対し、`value`で指定された割合を乗算する。
  - **JSON例 (売上高(id:123)の30%):**
    ```json
    {
      "type": "ratio",
      "value": 0.3,
      "ref": { "userAccountId": 123, "userAccountName": "売上高" }
    }
    ```

- **`link` (連動)**
  - **仕様:** `ref`で参照した科目の**成長率**を計算し、その成長率を対象科目の前期末の値に乗算する。
  - **JSON例 (売上高(id:123)の成長率に連動):**
    ```json
    {
      "type": "link",
      "ref": { "userAccountId": 123, "userAccountName": "売上高" }
    }
    ```

- **`sum_children` (子科目合計)**
  - **仕様:** このルールが設定された科目を親 (`parent_ua_id`) として持つ全ての子科目の値を合計する。
  - **JSON例:**
    ```json
    {
      "type": "sum_children"
    }
    ```

- **`custom_calc` (個別計算)**
  - **仕様:** ユーザーが定義した多項式（四則演算）で計算する。
  - **JSON例 (営業利益 = 売上(id:123) - 原価(id:155) - 販管費(id:160)):**

    ```json
    {
      "type": "custom_calc",
      "formula": {
        "expression": "@123 - @155 - @160",
        "references": [
          { "userAccountId": 123, "userAccountName": "売上高" },
          { "userAccountId": 155, "userAccountName": "売上原価" },
          { "userAccountId": 160, "userAccountName": "販管費" }
        ]
      }
    }
    ```

    - **`expression`:** `@` + `userAccountId` の形式で計算式を文字列で表現。コアロジック側でのパースを前提とする。
    - **`references`:** 式内で使用されている勘定科目の`Ref`オブジェクトリスト。検証性向上のため。

---

#### **4. `rule_type = 'BALANCE_AND_CHANGE'` の場合のスキーマ**

UI上の「前期末+変動」に対応します。**こちらのスキーマには変更ありません。**

```json
{
  "description": "BALANCE_AND_CHANGE型の計算ルール。BS科目の増減要因をリストで指定する。",
  "type": "object",
  "properties": {
    "instructions": {
      "type": "array",
      "items": {
        /* ... (前回の定義と同じ) ... */
      }
    }
  },
  "required": ["instructions"]
}
```

- **注意:** こちらのJSONには`type`プロパティは**不要**です。`calculation_rules`テーブルの`rule_type`カラムが`'BALANCE_AND_CHANGE'`であることが、この構造であることを示します。
