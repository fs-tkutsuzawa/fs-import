Calc*rule<>UI*項目転送仕様.md

> Reactコンポーネント（`UserAccountMappingCompletePage.tsx`）とDBスキーマ（`FS_DDL_commented_out_0926_V1.sql`）を詳細に分析し、**パラメータ設定ポップアップ**から`calculation_rules`テーブルへデータを連携するための仕様を整理しました。エンジニアの方が実装に着手できるよう、UI上のどの要素がDBのどの項目に、どのように変換されて格納されるべきかをまとめた「UI・DB項目転送表」を作成しました。

---

### UIコンポーネントの特定

ご指摘の「パラメータ設定ポップアップ」機能は、`ParameterSetupScreen`コンポーネント内で呼び出されている`ParameterSettingModal`コンポーネントが担当しています。このモーダルが、個々の勘定科目に対する計算ルールを定義し、DBに保存すべきデータを生成する核心部分です。

### データフローの概要

ユーザーがUIで行う操作と、データがDBに保存されるまでの流れは以下の通りです。

1.  **パラメータ設定ボタン押下**: ユーザーが`ParameterSetupScreen`上の特定の勘定科目の横にある「パラメータ設定」ボタンを押します。
2.  **モーダル表示**: `ParameterSettingModal`が表示されます。
3.  **ルールタイプ選択**: ユーザーは「成長率」「割合」「前期末+変動」などの計算ルールの**タイプ**を選択します（UI上のState: `selectedType`）。
4.  **ルール詳細設定**: 選択したタイプに応じて、具体的な数値（成長**率**など）や参照する他の勘定科目（**割合**の計算元など）を入力します（UI上のState: `config`）。
5.  **保存ボタン押下**: ユーザーが「保存」ボタンを押すと、`handleSave`関数が実行されます。
6.  **データ生成**: `handleSave`関数は、最終的に`onSave({ type: selectedType, config })`という形式で、設定された内容を親コンポーネントに渡します。
7.  **API経由でDB保存**: この`{ type, config }`オブジェクトが、APIリクエストのボディとしてバックエンドに送信され、バックエンド側で解釈されて`calculation_rules`テーブルの1レコードとして保存されます。

---

> Reactコンポーネント、DBスキーマ（DDL）、そして今回ご提示いただいたJSONスキーマ定義書(`Calc_rule_JSON_Schema.md`)の三点を精査し、エンジニア向けの\*\*「UI-DB連携 実装依頼書」\*\*として再整理しました。

---

## **【実装依頼書】パラメータ設定機能 UI-DB連携仕様**

### **1. 概要**

本タスクは、React UIコンポーネント `ParameterSettingModal` と、PostgreSQLの `calculation_rules` テーブルを連携させるためのAPIおよびデータ変換ロジックを実装するものである。ユーザーがUI上で設定した計算ルールを、指定されたDBスキーマおよびJSONB形式に則って永続化することを目的とする。

**主要コンポーネントとテーブル:**

- **UI**: `ParameterSettingModal.tsx` 内の `ParameterSettingModal` コンポーネント
- **DB**: `calculation_rules` テーブル

### **2. 対応要件 (CRUD)**

**最低限の要件として、`calculation_rules` テーブルに対する基本的なCRUD操作を可能にすること。**

- **Create (作成)**: ユーザーがモーダルで新しい計算ルールを設定し「保存」した際に、`calculation_rules`に新しいレコードを1件 `INSERT` する。
- **Read (読込)**: 画面表示時、特定の勘定科目（`user_accounts.id`）に紐づく計算ルールを `calculation_rules` から `SELECT` し、モーダルの初期表示に反映する。
- **Update (更新)**: 既存のルールを編集して「保存」した場合、対応するレコードを `UPDATE` する。
- **Delete (削除)**: ユーザーが設定を「インプット（手入力）」に戻す、または設定をクリアした場合、対応するレコードを `DELETE` する。（今回はUIに削除ボタンがないため、「インプット」に戻す操作を削除と同義とする）

### **3. データマッピング仕様**

フロントエンドから送信されるデータペイロードを、以下の仕様に従って `calculation_rules` テーブルの各カラムに格納すること。

| UI要素 (React State)   | `calculation_rules` カラム | データ変換・実装仕様                                                                                                                                                                            |
| :--------------------- | :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paramModal.targetId`  | `target_user_account_id`   | **[必須]** ルール対象の勘定科目ID。UIからのID `ua-123` を整数の `123` に変換して格納する。                                                                                                      |
| (コンテキスト情報)     | `scenario_id`              | **[必須]** 現在の操作対象シナリオのID。これはUIからではなく、APIリクエストのコンテキスト（URLパラメータやセッション情報など）から取得して付与する。                                             |
| (今回の仕様)           | `period_id`                | **常に `NULL` を設定。** 今回は期間別設定を考慮しないため、全期間に適用される基本ルールとして扱う。                                                                                             |
| `selectedType` (State) | `rule_type`                | **[重要]** 以下の通り、UI上の選択タイプに応じて固定の文字列を格納する。<br>・ **`prev_end_plus_change`** → **`'BALANCE_AND_CHANGE'`**<br>・上記以外 (growth_rate, ratio 等) → **`'PARAMETER'`** |
| `config` (State)       | `rule_definition` (JSONB)  | **[最重要]** UIの `selectedType` と `config` ステートを元に、後述の **JSONスキーマ** に従ってJSONオブジェクトを構築し、格納する。                                                               |

---

### **4. `rule_definition` (JSONB) 生成仕様**

`Calc_rule_JSON_Schema.md` の定義に基づき、UIの状態から以下のJSON構造を生成するロジックを実装すること。

#### **A) `rule_type = 'PARAMETER'` の場合**

##### **`growth_rate` (成長率)**

- UI State: `selectedType: 'growth_rate'`, `config: { rate: 5 }`
- **生成JSON**:

  ```json
  {
    "type": "growth_rate",
    "value": 0.05
  }
  ```

  - **Note**: UI上のパーセント表記（5）は、小数（0.05）に変換して格納すること。

##### **`ratio` (割合)**

- UI State: `selectedType: 'ratio'`, `config: { targetAccountId: 'ua-10', ratio: 50 }`
- **生成JSON**:

  ```json
  {
    "type": "ratio",
    "value": 0.5,
    "ref": { "userAccountId": 10, "userAccountName": "(取得した科目名)" }
  }
  ```

  - **Note**: `targetAccountId` は整数のIDに変換する。`userAccountName` はDBから取得して付与することが望ましい。

##### **`link` (連動)**

- UI State: `selectedType: 'link'`, `config: { targetAccountId: 'ua-10' }`
- **生成JSON**:
  ```json
  {
    "type": "link",
    "ref": { "userAccountId": 10, "userAccountName": "(取得した科目名)" }
  }
  ```

##### **`sum_children` (子科目合計)**

- UI State: `selectedType: 'sum_children'`
- **生成JSON**:
  ```json
  {
    "type": "sum_children"
  }
  ```

##### **`custom_calc` (個別計算)**

- UI State: `selectedType: 'custom_calc'`, `config: { operators: ['+', '-'] }`
- **生成JSON**:

  ```json
  {
    "type": "custom_calc",
    "formula": {
      "expression": "@11 - @12 + @13", // 例
      "references": [
        { "userAccountId": 11, "userAccountName": "子科目1" },
        { "userAccountId": 12, "userAccountName": "子科目2" },
        { "userAccountId": 13, "userAccountName": "子科目3" }
      ]
    }
  }
  ```

  - **Note**: バックエンド側で `target_user_account_id` を親に持つ子科目のIDリストを取得し、`expression` 文字列と `references` 配列を動的に構築する必要がある。

---

#### **B) `rule_type = 'BALANCE_AND_CHANGE'` の場合**

##### **`prev_end_plus_change` (前期末+変動)**

- UI State: `selectedType: 'prev_end_plus_change'`, `config: { flows: [{ flowAccountId: 'ua-25', sign: '+', counterAccountId: 'ua-5' }] }`
- **生成JSON**:

  ```json
  {
    "instructions": [
      {
        "flow_user_account_id": 25,
        "sign": "+",
        "counter_user_account_id": 5
      }
    ]
  }
  ```

  - **Note**: JSONのトップレベルキーは `instructions` とし、その中にフロー定義の配列を格納する。

---

### **5. 補足事項**

- **ID変換**: UI-DB間で `user_accounts.id` を受け渡す際は、フロントエンドは `ua-` プレフィックス付きの文字列、バックエンドはプレフィックスを除いた**整数**として扱うこと。このID変換はバックエンド側の責務とする。
- **期間別設定**: `onSetPeriodically` ボタン押下時の処理（`PeriodicParameterModal`）については、今回の実装範囲外とする。`calculation_rules.period_id` は常に `NULL` として扱う。
- **エラーハンドリング**: 参照先の勘定科目が存在しない場合など、データ不整合が発生しうるケースについては、適切なAPIエラーレスポンスを返すこと。
