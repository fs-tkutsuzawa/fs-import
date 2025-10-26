Calc*rule_JSONB_Balance_and_Change*関連議論.md

`BALANCE_AND_CHANGE`（前期末+変動）の`rule_definition`について、一切の省略をせず、厳密かつ分かりやすいスキーマ定義を以下に再提出します。

---

### **`rule_type = 'BALANCE_AND_CHANGE'` の場合のスキーマ (厳密版)**

UI上の「**前期末+変動**」という計算タイプに対応します。主にBS科目の期末残高を、「**期首残高 ＋ 増加要因 － 減少要因**」というロジックで計算するためのルールを定義します。

このルールは、`calculation_rules`テーブルの`rule_type`カラムが`'BALANCE_AND_CHANGE'`であるレコードの`rule_definition`に格納されます。

#### **4.1. スキーマ定義**

このJSONBには、**`instructions`** というキーを持つ配列が一つだけ含まれます。この配列の一つ一つの要素が、対象となるBS科目を増減させる個別の操作（Instruction）を定義します。

```json
{
  "description": "BALANCE_AND_CHANGE型の計算ルール定義。BS科目の期末残高を計算するための、複数の増減要因（instructions）をリスト形式で指定します。",
  "type": "object",
  "properties": {
    "instructions": {
      "description": "増減要因のリスト。この配列に定義された順序で、期首残高に対して加算・減算処理が実行されます。",
      "type": "array",
      "items": {
        "$ref": "#/definitions/Instruction"
      }
    }
  },
  "required": ["instructions"],
  "definitions": {
    "Instruction": {
      "description": "単一の増減操作を定義するオブジェクトです。",
      "type": "object",
      "properties": {
        "driver": {
          "description": "増減の源泉となるフロー科目（例: 設備投資額）を参照します。'value'プロパティとは排他的に使用します。",
          "$ref": "#/definitions/Ref"
        },
        "value": {
          "description": "固定値による増減を指定します（例: 500）。'driver'プロパティとは排他的に使用します。",
          "type": "number"
        },
        "counter": {
          "description": "この増減操作における、会計上の仕訳相手勘定を指定します。",
          "$ref": "#/definitions/Ref"
        },
        "effect": {
          "description": "この操作が、対象となるBS科目を増加させるか、減少させるかを示します。",
          "type": "string",
          "enum": ["INCREASE", "DECREASE"]
        }
      },
      "required": ["counter", "effect"]
    },
    "Ref": {
      "description": "勘定科目を参照するための共通オブジェクトです。",
      "type": "object",
      "properties": {
        "userAccountId": {
          "description": "参照する勘定科目のID (user_accounts.id)。システムが参照する主キーです。",
          "type": "integer"
        },
        "userAccountName": {
          "description": "参照する勘定科目の名称 (user_accounts.ua_name)。人間による検証性のための冗長データです。",
          "type": "string"
        }
      },
      "required": ["userAccountId", "userAccountName"]
    }
  }
}
```

#### **4.2. `Instruction`オブジェクトの詳細解説**

`instructions`配列の各要素は、以下のプロパティを持つオブジェクトです。

- **`driver` (Refオブジェクト, 任意):** この増減が、**他の勘定科目の値**によって引き起こされる場合に指定します。例えば、「設備投資額の分だけ有形固定資産を増やす」といったケースです。
- **`value` (number, 任意):** この増減が、**固定値**によって引き起こされる場合に指定します。例えば、「その他の要因で500だけ有形固定資産を減らす」といったケースです。`driver`と`value`は同時に指定できません。
- **`counter` (Refオブジェクト, 必須):** この増減操作における、**仕訳の相手勘定**を指定します。「設備投資額の分だけ有形固定資産が増える」場合、その相手勘定は通常「現金及び現金同等物」となります。
- **`effect` (string, 必須):** この操作が、対象となるBS科目（この`calculation_rules`レコードの`target_user_account_id`が指す科目）に対してどのような影響を与えるかを定義します。
  - **`'INCREASE'`**: 対象科目を増加させます。
  - **`'DECREASE'`**: 対象科目を減少させます。

#### **4.3. 具体例**

**【シナリオ】**
`target_user_account_id`が「**有形固定資産**（`id: 301`）」を指す`calculation_rules`レコードの`rule_definition`を定義します。

**【増減要因】**

1.  「**設備投資額**（`id: 801`）」の分だけ**増加**する。相手勘定は「**現金及び現金同等物**（`id: 101`）」。
2.  「**減価償却費**（`id: 755`）」の分だけ**減少**する。相手勘定は「**利益剰余金**（`id: 451`）」。

**【JSONBに格納されるデータ】**

```json
{
  "instructions": [
    {
      "driver": {
        "userAccountId": 801,
        "userAccountName": "設備投資額"
      },
      "counter": {
        "userAccountId": 101,
        "userAccountName": "現金及び現金同等物"
      },
      "effect": "INCREASE"
    },
    {
      "driver": {
        "userAccountId": 755,
        "userAccountName": "減価償却費"
      },
      "counter": {
        "userAccountId": 451,
        "userAccountName": "利益剰余金"
      },
      "effect": "DECREASE"
    }
  ]
}
```

この定義により、計算エンジンは「有形固定資産」の期末残高を、`期首残高 + 設備投資額 - 減価償却費`というロジックで正確に計算することができます。
