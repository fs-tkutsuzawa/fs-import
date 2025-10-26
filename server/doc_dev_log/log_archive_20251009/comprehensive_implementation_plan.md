# 財務三表連動モデル BS計算ロジック 総合実装計画書

## A. はじめに

### 目的

本計画書は、財務モデリングアプリケーションのコアロジックにおいて、BS（貸借対照表）計算機能の実装を完了させるための、包括的かつ詳細なロードマップである。最終的な目標は、`attachCash`という単純な現金計算ロジックを完全に廃止し、会計原則に厳密に準拠した三表（PL, BS, CF）連動モデルを構築することにある。

### 最終目標とコア思想

このプロジェクトの根幹をなすのは、以下の「人間の思考フロー」をコードで再現することである。

1.  PLとBS（現金以外）の当期計画値を計算する。
2.  PLの非資金性項目と、BS科目の期首からの差分（デルタ）を捉え、キャッシュフロー計算書（CF）を生成する。
3.  算出された「純キャッシュフロー」を「期首の現金残高」に加算し、「期末の現金残高」を確定させる。この結果、BSの貸借は自動的に一致する。

この原則を遵守し、複雑な会計用語に頼らず、あくまで「PLの非資金性項目」と「BSのデルタ」という単純な構成要素でCFが計算される、という思想を貫く。

## B. これまでの経緯と反省点

### 1. テスト結果の趨勢 (Test Result Trend Analysis)

これまでの開発過程におけるテスト結果の主要な変遷を以下にまとめる。

- **初期安定状態 (2025/10/07 計画開始時):**
  - `bs.test.ts`内の`[G-01]`テストは`test.skip`で無効化。
  - その他すべてのテスト (`plOnlyAst.test.ts`, `fam.behavior.test.ts`, `balanceAndChange.test.ts`, `logicErrors.test.ts`, `idManagementByAccountId.test.ts`) は**パス**。

- **`[G-01]`有効化後:**
  - `bs.test.ts`内の`[G-01]`テストが**失敗** (RED状態)。
  - その他テストはパス。

- **`calculateCashByCF`導入、`attachCash`削除直後:**
  - `fam.ts`の現金計算ロジックを`attachCash`から`calculateCashByCF`に切り替えた直後、`fam.behavior.test.ts`, `plOnlyAst.test.ts`, `balanceAndChange.test.ts`など、多くのテストが**失敗**。
  - これは、古い`attachCash`の挙動を前提とした期待値が、新しいCFベースのロジックと合致しなくなったため。

- **`is_credit`導入、`applyBalanceChangeForFY`修正後:**
  - `balanceAndChange.test.ts`が**パス**。
  - `fam.behavior.test.ts`, `plOnlyAst.test.ts`は引き続き失敗。

- **`calculateCFs`二重計上問題修正 (bcTargetIds導入) 後:**
  - `balanceAndChange.test.ts`が**パス**を維持。
  - `fam.behavior.test.ts`, `plOnlyAst.test.ts`は引き続き失敗。

- **`fam.ts`の`cashAccountId`二重宣言による`SyntaxError`発生:**
  - 私の不注意により、`fam.ts`の修正中に`cashAccountId`の二重宣言が発生し、**すべてのテストが構文エラーで失敗**する最悪の状況に陥った。

- **`git restore .`による復帰後 (現在):**
  - `fam.behavior.test.ts`, `plOnlyAst.test.ts`, `balanceAndChange.test.ts`が失敗。
  - `bs.test.ts`, `logicErrors.test.ts`, `idManagementByAccountId.test.ts`はパス。
  - これは、`SyntaxError`発生前の状態、つまり`calculateCashByCF`導入直後の状態とほぼ同じである。

### 2. 私の出力内容の整理 (Summary of My Outputs)

これまでの議論で生成された主要なドキュメントは以下の通り。

- `server/doc_dev_log/bs_tdd_implementation_plan.md`: 初期に策定された総合実装計画。
- `server/doc_dev_log/dev_log_ticket_2_of_3.md`: チケット2/3に関する開発ログ。`is_credit`導入と`applyBalanceChangeForFY`修正の経緯を記録。
- `server/doc_dev_log/analysis_log_20251007_double_counting.md`: CF計算における「二重計上問題」の根本原因を特定した分析ログ。
- `server/doc_dev_log/prompt_for_next_agent.md`: 他のCLI Agentへの引き継ぎ用プロンプト。今回の計画のベースとなる。
- `server/doc_dev_log/analysis_log_20251007_final.md`: 直前のテスト失敗に関する最終分析ログ。

### 3. 反省点と今後のアプローチ

- **反省点:**
  - `git restore .`後の状態確認が不十分であり、`fam.ts`の修正が完全に元に戻っていなかった、あるいは私の記憶とコードの状態に乖離があった。
  - `SyntaxError`という基本的なミスを犯し、テストスイート全体を破壊してしまった。これは冷静さを欠いた結果である。
  - テストの期待値修正とロジック修正が並行して行われ、問題の切り分けが困難になった局面があった。
- **今後のアプローチ:**
  - **常に冷静に、Baby Stepを徹底する。** 一度に複数の変更を加えず、一つの変更ごとにテストを実行し、その影響を正確に把握する。
  - **ロジック修正を最優先する。** テストの期待値修正は、ロジックが完全に正しいと確信できた後に行う。
  - **デバッグツールを積極的に活用する。** `console.log`などを適切に挿入し、内部状態を可視化しながら問題を特定する。
  - **ユーザー様の指示を最上位の優先度とする。** 疑問点や不明点は、必ず確認する。

## C. 現在の課題と根本原因 (再確認)

現在のテスト失敗の根本原因は、以下の2点に集約される。

1.  **`fam.ts`のロジックの不完全性:**
    - `compute`メソッド内で`cashAccountId`が二重に宣言されている (`SyntaxError`の原因)。
    - `compute`メソッドの最後に、動的に生成された現金勘定が`orderAccountIds`に登録されていない (`fam.behavior.test.ts`の`cash prev missing`テスト失敗の原因)。
    - `calculateCFs`メソッドにおけるB&Cターゲットの二重計上問題は、`analysis_log_20251007_double_counting.md`で特定され、修正方針は立てられているが、完全に適用された状態での検証が不足している。

2.  **テスト期待値の不整合:**
    - `plOnlyAst.test.ts`, `fam.behavior.test.ts`, `balanceAndChange.test.ts`の多くのテストケースで、新しいCFベースの現金計算ロジックと整合しない期待値が設定されている。

## D. 修正箇所とテスト実装戦略 (詳細)

以下の手順で、コード修正とテスト期待値修正を段階的に進める。

### フェーズ1: `fam.ts` コアロジックの最終修正

このフェーズでは、`fam.ts`に、これまでの分析で特定されたロジックの修正を完全に適用し、コードベースを安定させる。

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

`fam.ts`のロジックが完全に修正され、すべてのテストがコンパイル可能になった後、各テストの期待値を新しいCFベースのロジックに合わせて修正します。このフェーズでは、各テストケースの前提条件（実績値、ルール）と、新しいCF計算ロジック（`前期末現金 + CFO + CFI + CFF + B&C現金影響`）に基づいて、期待値を手計算で導出し、テストコードを更新します。

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

## E. 実行手順

1.  **`fam.ts`の`cashAccountId`二重宣言の修正**を適用し、コンパイルエラーを解消する。
2.  **`fam.ts`の残りのロジック修正（`bcTargetIds`関連、`orderAccountIds`関連）を適用する。**
3.  **テストを実行し、`fam.ts`のロジック修正によってテスト失敗のパターンがどのように変化するかを冷静に確認する。**
4.  **フェーズ2のテスト期待値修正を、一つずつ適用し、テストがパスすることを確認する。**
5.  **すべてのテストがパスするまで、上記を繰り返す。**

## F. 最終確認

すべてのテストがパスした後、以下の項目を最終確認する。

- `bs.test.ts`の`[G-01]`テストがパスしていること。
- `fam.ts`のコードが、ユーザー様の「人間の思考フロー」を正確に反映していること。
- コードの可読性、保守性が損なわれていないこと。

---
