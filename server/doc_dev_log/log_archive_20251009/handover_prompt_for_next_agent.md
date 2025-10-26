# CLI Agentへの引き継ぎプロンプト：BS計算ロジック実装の完了

## 1. タスクの目的と最終ゴール

あなたは、財務モデリングアプリケーションのコアロジックにおけるBS（貸借対照表）計算機能の実装を完了させる責任を負います。最終的なゴールは、`attachCash`という単純な現金計算ロジックを完全に廃止し、**会計原則に厳密に準拠した三表（PL, BS, CF）連動モデル**を構築し、**すべてのテストをパスさせること**です。

### コア思想：人間の思考フローの厳密な遵守

このプロジェクトの根幹をなすのは、以下の「人間の思考フロー」をコードで再現することです。この原則から逸脱するいかなる実装も許されません。

1.  **PLとBS（現金以外）の当期計画値を計算する。**
2.  **PLの非資金性項目と、BS科目の期首からの差分（デルタ）を捉え、キャッシュフロー計算書（CF）を生成する。**
3.  **算出された「純キャッシュフロー」を「期首の現金残高」に加算し、「期末の現金残高」を確定させる。** この結果、BSの貸借は自動的に一致する。

## 2. プロジェクトの現状とコンテキスト

### 2.1. コードベースの状況

- `git restore .`コマンドにより、直前の`SyntaxError`発生前の状態にコードベースは戻っています。
- `fam.ts`には、`attachCash`を置き換える`calculateCashByCF`および`calculateCFs`メソッドが導入されていますが、まだ完全ではありません。
- `is_credit`プロパティが`Account`型に追加され、`applyBalanceChangeForFY`で利用されています。

### 2.2. テストスイートの状況

現在のテスト結果の趨勢は以下の通りです。

- **パスしているテストスイート:**
  - `src/tests/bs.test.ts`
  - `src/tests/logicErrors.test.ts`
  - `src/tests/idManagementByAccountId.test.ts`
- **失敗しているテストスイート:**
  - `src/tests/fam.behavior.test.ts`
  - `src/tests/plOnlyAst.test.ts`
  - `src/tests/balanceAndChange.test.ts`

### 2.3. これまでの分析と教訓

- **CF計算における「二重計上問題」:**
  - `calculateCFs`メソッドが、B&Cルールによって既に変動が考慮されたBS科目（例: PPE）の差分を、再度CF計算に含めてしまう問題が特定されています。
  - これは、`applyBalanceChangeForFY`でB&Cの影響を`cashImpactFromBC`として抽出し、`calculateCFs`でBSデルタを計算する際に、B&Cの`target`となった勘定をスキップすることで解決されるべきです。
- **`orderAccountIds`への動的勘定追加の必要性:**
  - `compute`プロセスで動的に生成される勘定（特に現金）が`this.orderAccountIds`に登録されないため、`getTable`がそれらの勘定を返せず、テストが失敗するケースがありました。
- **テスト期待値の不整合:**
  - 多くのテストは、古い`attachCash`ロジックの挙動を前提に期待値が設定されており、新しいCFベースのロジックと整合していません。これらは、新しいロジックに基づいて正確に再計算される必要があります。
- **私の反省点:**
  - `SyntaxError`の発生は、`fam.ts`の修正中に`cashAccountId`の二重宣言を見落としたためです。これは、コード変更の適用とテスト検証のBaby Stepが不十分であったことを示しています。
  - `replace`ツールを使用する際は、常に`read_file`で現在のファイル内容を正確に把握し、`old_string`が完全に一致することを確認するべきでした。

### 2.4. 参照すべき主要ファイル

- **コア思想・計画:**
  - `@server/doc_dev_log/prompt_takuk_20251007.md`: 人間の思考フロー（最重要）
  - `@server/doc_dev_log/bs_tdd_implementation_plan.md`: 初期テスト実装計画
  - `@server/doc_dev_log/comprehensive_implementation_plan.md`: 今回の包括的な計画書（このドキュメント）
- **分析ログ:**
  - `@server/doc_dev_log/analysis_log_20251007_double_counting.md`: 二重計上問題の詳細分析
  - `@server/doc_dev_log/analysis_log_20251007_final.md`: 直前のテスト失敗に関する最終分析
- **修正対象コード:**
  - `@server/src/fam/fam.ts`: コアロジック
  - `@server/src/model/types.ts`: `Account`型定義（`is_credit`プロパティ）
- **失敗しているテストファイル:**
  - `@server/src/tests/plOnlyAst.test.ts`
  - `@server/src/tests/fam.behavior.test.ts`
  - `@server/src/tests/balanceAndChange.test.ts`

## 3. あなたへの指示：Baby Stepでの実装計画

上記のコンテキストと分析結果を完全に理解した上で、以下のBaby Stepに従って作業を進めてください。各ステップの完了後には必ずテストを実行し、結果を確認してください。

### フェーズ1: `fam.ts` コアロジックの最終修正

このフェーズでは、`fam.ts`に、これまでの分析で特定されたロジックの修正を完全に適用し、コードベースを安定させます。**各修正の前に必ず`read_file`で現在のファイル内容を確認し、`old_string`を正確に指定してください。**

1.  **`compute`メソッド内の`cashAccountId`二重宣言の修正**
    - **目的:** `SyntaxError`を解消し、コンパイル可能な状態にする。
    - **修正内容:** `compute`メソッド内で`cashAccountId`が2回宣言されている箇所を特定し、ループの外で一度だけ宣言するように修正する。

2.  **`compute`メソッド: `bcTargetIds`の生成と`calculateCashByCF`への引き渡し**
    - **目的:** B&Cルールによる二重計上を防ぐための準備。
    - **修正内容:** `compute`メソッド内で`bcTargetIds`を生成し、`calculateCashByCF`の呼び出し時に引数として渡す。

3.  **`calculateCashByCF`メソッド: `bcTargetIds`の受け取りと`calculateCFs`への引き渡し**
    - **目的:** `calculateCFs`がB&Cターゲットをスキップするために必要。
    - **修正内容:** `calculateCashByCF`のシグネチャに`bcTargetIds`を追加し、`calculateCFs`の呼び出し時に引数として渡す。

4.  **`calculateCFs`メソッド: `bcTargetIds`の受け取りとBSデルタ計算からの除外**
    - **目的:** B&Cルールによる二重計上を根本的に解決する。
    - **修正内容:** `calculateCFs`のシグネチャに`bcTargetIds`を追加し、運転資本の変動計算ループ内で`bcTargetIds.has(accId)`の場合に`continue`する条件を追加する。

5.  **`compute`メソッド: 動的生成勘定の`orderAccountIds`への追加**
    - **目的:** `fam.behavior.test.ts`の`cash prev missing`テストが失敗する原因を解消し、`getTable`が正しく現金の行を返せるようにする。
    - **修正内容:** `compute`メソッドのループの最後に、`cashAccountId`が`orderAccountIds`に含まれていなければ追加するロジックを配置する。

### フェーズ2: テスト期待値の厳密な再計算と修正

フェーズ1の`fam.ts`のロジック修正が完了し、すべてのテストがコンパイル可能になった後、各テストの期待値を新しいCFベースのロジックに合わせて修正します。**各テストケースの前提条件（実績値、ルール）と、新しいCF計算ロジック（`前期末現金 + CFO + CFI + CFF + B&C現金影響`）に基づいて、期待値を手計算で導出し、テストコードを更新してください。**

1.  **`plOnlyAst.test.ts`**
    - **修正内容:** `EXPECTS`配列内の`CASH_END`の値を、以下の通り修正します。
      - `FY+1` (2001): `CASH_END: 505` (`前期現金(50) + 純利益(455)`)。
      - `FY+2` (2002): `CASH_END: 1020` (`1年目末現金(505) + 純利益(515)`)。
    - **理由:** このテストケースでは運転資本の変動がないため、CFOは純利益と一致する。

2.  **`fam.behavior.test.ts`**
    - **`cash linkage: baseProfit=accountId, cash=GAID (正常系)`**
      - **修正内容:** `cash_jp`の期待値を`540`に修正 (`前期現金(100) + 純利益(440)`)。
    - **`cash prev missing -> seeded as 0 and compute succeeds`**
      - **修正内容:** `cash_jp`の期待値を`440`に修正 (`前期現金(0) + 純利益(440)`)。
    - **`B&C: GAIDターゲット/カウンタは primary accountId へ反映`**
      - **修正内容:** `cash_jp`の期待値を`490`に修正 (`前期現金(540) + B&C現金影響(-50)`)。
    - **`B&C: counter に accountId=現金 を指定しても逆符号になる`**
      - **修正内容:** `cash_jp`の期待値を`490`に修正 (`前期現金(540) + B&C現金影響(-50)`)。
    - **`getTable()/snapshotLatestActual are accountId-keyed`**
      - **修正内容:** `cash_jp`が`Object.keys(snap)`に含まれることを確認するアサーションを追加。
    - **`GAIDのprimary選定`**
      - **修正内容:** `cash_jp`の期待値を`100`に修正 (`前期現金(100) + 純利益(0)`)。

3.  **`balanceAndChange.test.ts`**
    - **`減価償却：PPE 減少 / 利益剰余金 減少 / 現金はB&Cで影響なし`**
      - **修正内容:** `現金`の期待値を`200`に修正 (`前期現金(100) + CFO(100)`)。
    - **`設備投資：PPE 増加 / 現金 減少（PL非経由）`**
      - **修正内容:** `現金`の期待値を`-100`に修正 (`前期現金(100) + CFO(0) + B&C現金影響(-200)`)。

## 4. 実行手順

1.  **`fam.ts`の`cashAccountId`二重宣言の修正**を適用し、コンパイルエラーを解消する。
2.  **`fam.ts`の残りのロジック修正（`bcTargetIds`関連、`orderAccountIds`関連）を適用する。**
3.  **テストを実行し、`fam.ts`のロジック修正によってテスト失敗のパターンがどのように変化するかを冷静に確認する。**
4.  **フェーズ2のテスト期待値修正を、一つずつ適用し、テストがパスすることを確認する。**
5.  **すべてのテストがパスするまで、上記を繰り返す。**

## 5. 最終確認

すべてのテストがパスした後、以下の項目を最終確認する。

- `bs.test.ts`の`[G-01]`テストがパスしていること。
- `fam.ts`のコードが、ユーザー様の「人間の思考フロー」を正確に反映していること。
- コードの可読性、保守性が損なわれていないこと。

---
