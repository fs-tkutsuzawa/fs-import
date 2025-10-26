Calc*rules_JSONB_PARAMETERS*関連議論.md

`PARAMETER`型の計算ルールは、本システムの柔軟性を支える多様な計算方法を内包しており、その仕様を厳密に定義することは極めて重要です。

これまでの議論のすべてを反映し、初めてこの仕様に触れるエンジニアやLLMが、その全体像と詳細を完全に把握できるよう、レポート形式でJSONスキーマを整理しました。

---

### **JSONスキーマ定義レポート: `PARAMETER`型ルール**

#### **1. はじめに**

##### **1.1. 本資料の目的と対象読者**

この資料は、`calculation_rules`テーブルの`rule_type`カラムが\*\*`'PARAMETER'`\*\*である場合に、同テーブルの`rule_definition`カラム（JSONB型）に格納されるJSONオブジェクトの厳密なスキーマを定義するものです。

本資料の読者は、本システムのバックエンド開発を担当するエンジニアまたはLLMです。読者は、この資料を読むことで`PARAMETER`型ルールが持つ**6つの計算タイプ**の仕様を完全に理解し、関連するロジKック（バリデーション、データ永続化、コア計算エンジンへのデータ連携）を正確に実装できる状態になることを目指します。

##### **1.2. `PARAMETER`型ルールの位置付けと全体構造**

`PARAMETER`型は、主に損益計算書（PL）の科目やKPIなど、他の科目の値や特定の前提条件に基づいて計算される、**`BALANCE_AND_CHANGE`型以外のすべての計算ルール**を包括するカテゴリです。

その具体的な計算方法は、`rule_definition`JSONのトップレベルに存在する\*\*`type`プロパティ\*\*の値によって決定されます。この`type`プロパティは、どの計算ロジック（成長率、割合など）が適用されるかを示す「**識別子**」として機能します。

#### **2. `PARAMETER`型 `rule_definition` のJSONスキーマ**

##### **2.1. トップレベルスキーマ**

以下は、`PARAMETER`型ルールの`rule_definition`が準拠すべき、トップレベルのJSONスキーマです。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PARAMETER Type Rule Definition",
  "description": "PARAMETER型の計算ルール定義。'type'プロパティの値によって、他のプロパティの要件が動的に変化します。",
  "type": "object",
  "properties": {
    "type": {
      "description": "計算の具体的な種類を決定する識別子です。",
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
      "description": "成長率や割合の計算に使用する固定値（例: 0.05）。'growth_rate'や'ratio'タイプで使用されます。",
      "type": "number"
    },
    "ref": {
      "description": "単一の勘定科目を参照する場合（'ratio'や'link'）に使用します。",
      "$ref": "#/definitions/Ref"
    },
    "formula": {
      "description": "個別計算（'custom_calc'）の多項式を定義します。",
      "type": "object",
      "properties": {
        "expression": {
          "description": "勘定科目IDをプレースホルダーとして使用した計算式（例: '@123 + @456'）。",
          "type": "string"
        },
        "references": {
          "description": "計算式内で使用されている全ての勘定科目のRefオブジェクトのリスト。",
          "type": "array",
          "items": { "$ref": "#/definitions/Ref" }
        }
      },
      "required": ["expression", "references"]
    }
  },
  "required": ["type"],
  "definitions": {
    "Ref": {
      "description": "他の勘定科目を参照するための、標準化された共通オブジェクトです。詳細は別途『JSONスキーマ定義レポート: Refオブジェクト』を参照してください。",
      "type": "object",
      "properties": {
        "userAccountId": { "type": "integer" },
        "userAccountName": { "type": "string" },
        "period": { "type": "string", "enum": ["PREV", "SAME"] }
      },
      "required": ["userAccountId", "userAccountName"]
    }
  }
}
```

##### **2.2. 実装上の注意点：段階的開発への配慮**

UIが先行して全ての計算タイプをサポートしていない場合でも、バックエンド開発を円滑に進めるため、以下の点に留意してください。

- `type`プロパティは必須ですが、それ以外のプロパティ（`value`, `ref`, `formula`）は、**それぞれの`type`で要求されない限りオプショナル**です。
- UIが未実装のルールタイプについては、アプリケーションは`type`のみを持つ暫定的なJSON（例: `{"type": "link"}`）のPOSTを許容し、バリデーションエラーとしないように実装する必要があります。

#### **3. 各計算タイプ (`type`) の詳細仕様と具体例**

以下に、`type`プロパティの値ごとに、その目的、仕様、およびJSONの具体例を詳述します。

##### **3.1. `input` (インプット)**

- **目的:** ユーザーが数値を直接手入力する科目であることを示します。このルール自体は計算を行いません。
- **仕様:** `type`以外のプロパティは持ちません。
- **JSON例:**
  ```json
  {
    "type": "input"
  }
  ```

##### **3.2. `growth_rate` (成長率)**

- **目的:** 対象科目の前期の値に対し、指定された成長率を乗じて当期の値を算出します。
- **仕様:** `value`プロパティに成長率（例: 5%なら`0.05`）を数値で指定します。参照先は常に自分自身の前期の値であるため、`ref`は不要です。
- **JSON例 (前期比5%成長):**
  ```json
  {
    "type": "growth_rate",
    "value": 0.05
  }
  ```

##### **3.3. `ratio` (割合)**

- **目的:** 別の特定科目の値に対し、指定された割合を乗じて当期の値を算出します。
- **仕様:** `value`プロパティに割合（例: 30%なら`0.3`）を、`ref`プロパティに計算元となる科目の`Ref`オブジェクトを指定します。
- **JSON例 (売上高(id:123)の30%を計算):**
  ```json
  {
    "type": "ratio",
    "value": 0.3,
    "ref": {
      "userAccountId": 123,
      "userAccountName": "売上高",
      "period": "SAME"
    }
  }
  ```

##### **3.4. `link` (連動)**

- **目的:** 別の特定科目の**成長率**を算出し、その成長率を対象科目の前期の値に乗じることで、連動した成長を実現します。
- **仕様:** `ref`プロパティに連動元となる科目の`Ref`オブジェクトを指定します。`value`は不要です。
- **JSON例 (売上高(id:123)の成長率に連動):**
  ```json
  {
    "type": "link",
    "ref": {
      "userAccountId": 123,
      "userAccountName": "売上高"
    }
  }
  ```

##### **3.5. `sum_children` (子科目合計)**

- **目的:** このルールが設定された科目を親（`user_accounts.parent_ua_id`）として持つ、全ての子科目の値を合計します。
- **仕様:** `type`以外のプロパティは持ちません。計算エンジンは、このルールを持つ科目のIDを`parent_ua_id`として持つ科目を`user_accounts`テーブルから検索し、それらの値を合計するロジックを実装します。
- **JSON例:**
  ```json
  {
    "type": "sum_children"
  }
  ```

##### **3.6. `custom_calc` (個別計算)**

- **目的:** 上記のどのパターンにも当てはまらない、ユーザー定義の自由な四則演算を実現します。
- **仕様:** `formula`オブジェクトに計算式と参照科目のリストを定義します。
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

  - **`expression`:** `@`記号と`userAccountId`を組み合わせたプレースホルダーを用いた計算式を文字列で表現します。コアロジック側でこの文字列をパースし、計算可能な形式（例: 逆ポーランド記法など）に変換することを前提とします。
  - **`references`:** `expression`内で使用されている全ての勘定科目の`Ref`オブジェクトを配列で保持します。これにより、計算エンジンは事前に必要な値を取得でき、また式の妥当性検証も容易になります。
