===
OperatorによるCLI（あなた）への厳密注意：

- このDocumentは、本Projectのコアロジックである財務三表連動モデルの大原理原則を示すものである。
- このDocumentを参照して、設計仕様検討・開発にあたるときは、十分にProjectディレクトリ全体との整合、特に@server/src の内容物との整合を落ち着いて検証し、正確な実装に努めてください。
- 不明点・懸念点は、特にUI側との連携で注意すべき点は、Operatorに判断を仰ぐこと。
  以上。
  ===

---

doc_type: cli_context_markdown
doc_name: ultimate_principles_for_financial_statement_modeling
version: 6.0
author: Gemini

---

# 財務三表連動モデル 設計原理 V6.0 (CLI Agent 読込用)

## 0. EXECUTIVE_SUMMARY_AND_CORE_PHILOSOPHY

- **PURPOSE:** 本ドキュメントは、CLI Agentが**会計公準 (Accounting Postulates)** に準拠した、論理的に矛盾のない財務三表（BS/PL/CF）連動モデルを、自律的に構築・検証・運用するための、**第一原理（First Principles）に基づく厳格な実装仕様書**である。

- **FOUNDATION:** モデルの論理的健全性は、**複式簿記 (Double-Entry Bookkeeping)** の原理に根ざす。これは、全ての経済事象が「原因（資金の源泉）」と「結果（資金の使途）」という二面性を持ち、それらが必ず同額で記録されるという、閉鎖系（Closed-Loop System）における質量保存の法則に似た会計世界の基本法則である。

- **CORE_PHILOSOPHY:** モデルの数学的整合性と永続性は、2つの基本哲学によって保証される。
  1.  **INVARIANTS (不変条件 / 黄金律):** 会計公準から導かれる、いかなる操作後も**絶対に**満たされるべき一連の数学的・論理的制約群。これらはモデルの正しさを証明する**形式的検証 (Formal Verification)** のためのアサーション (`ASSERT`) の核となる。
  2.  **SINGLE_SOURCE_OF_TRUTH (SSoT / 単一情報源):** ひとつの経済事象（例：減価償却）は、必ず単一のマスターデータソース（`Schedule`オブジェクト）で一度だけ定義される。財務三表の各項目は、このマスターからの**射影 (Projection)** もしくは**参照 (Reference)** でなければならない。これにより、データ冗長性と内部矛盾を構造的に根絶する。

---

## 1. INVARIANTS (不変条件 / 黄金律)

モデルが常に遵守すべき、検証可能な絶対法則。これらのいずれか一つでも破綻した場合、モデルは会計的に無意味となる。

### 1.1. `bs_integrity_principle` (貸借一致の原理)

- **LOGIC:** 企業の特定時点における経済資源（資産）の総額は、その資源に対する請求権（負債と純資産）の総額と常に恒等的に一致する。これは会計方程式 `資産 = 負債 + 純資産` として表される、静的な状態における絶対的均衡である。
- **ASSERTION_LOGIC:** `ASSERT ABS(SUM(Assets) - (SUM(Liabilities) + SUM(Equity))) <= epsilon`。ここで `epsilon` は許容される浮動小数点演算の丸め誤差。

### 1.2. `cash_reconciliation_principle` (現金整合の原理)

- **LOGIC:** 期間中の全ての活動（営業・投資・財務）による現金の純増減額（フロー情報）は、期首と期末の現金残高（ストック情報）の差額と完全に一致しなければならない。これは、フローがストックの変動を完全に説明するという動的な関係性の証明である。
- **ASSERTION_LOGIC:** `ASSERT ABS(BS.Cash[end] - (BS.Cash[begin] + CF.TotalCashFlow)) <= epsilon`。`TotalCashFlow` は `CFO + CFI + CFF` である。

### 1.3. `flow_to_stock_linkage_principle` (フロー/ストック整合の原理)

- **LOGIC:** 企業が期間中に生み出した価値（当期純利益）のうち、株主に還元されなかった部分は、企業の内部に留保され、純資産を増加させる。これは企業の価値創造活動が貸借対照表に蓄積されていくプロセスを示す、最も重要な連動の一つである。
- **ASSERTION_LOGIC:** `ASSERT ABS(BS.RetainedEarnings[end] - (BS.RetainedEarnings[begin] + PL.NetIncome - Policy.DividendsPaid)) <= epsilon`。その他包括利益（OCI）を考慮する場合は、`PL.ComprehensiveIncome` を使用する。

### 1.4. `non_cash_duality_principle` (非資金性取引の二重性原理)

- **LOGIC:** 会計上の費用・収益（発生主義）と現金の動き（現金主義）の差（ズレ）を生む非資金性取引は、必ず二つの側面を持つ。PL上で利益を調整する効果と、BS上で対応資産・負債の価値を変動させる効果である。CF計算書は、このズレを定量的に調整する役割を担う。
- **ASSERTION_LOGIC:** `BalanceAndChange`型から発生した全てのPL項目（例：`PL.Depreciation`）について、`CF.CFO_Adjustments`内に同額の逆符号項目が存在し、かつ`BS`上の対応科目の変動が`Schedule`の定義と一致することを検証する。

### 1.5. `source_integrity_principle` (原簿整合の原理)

- **LOGIC:** 財務諸表は、企業の経済活動を記録した原簿（このモデルでは`Schedule`オブジェクト群）の要約報告書である。したがって、報告書上の数値が原簿の記録と異なることは許されない。PLやCFが`Schedule`の値を独自に再計算する行為は、SSoT哲学に反する重大な違反である。
- **ASSERTION_LOGIC:** `ASSERT PL.Depreciation == Schedule.PPE.Depreciation` AND `BS.PPE[end] == Schedule.PPE.ClosingBalance` AND `CF.CFI_Capex == -Schedule.PPE.Additions` など、全ての派生項目について検証する。

---

## 2. DATA_MODEL_AND_TYPE_SYSTEM

勘定科目をその計算特性に基づき厳格に型定義することで、ロジックの一般化と堅牢性を実現する。

### 2.1. Type: `BalanceAndChange` (イベント駆動型ストック)

- **PURPOSE:** 残高が、期中の個別イベント（取得、償却、返済、発行等）の発生によって離散的に変動するストック科目。**PL上の全ての非資金性取引の源泉**であり、CF計算書のCFI、CFF、およびCFOの主要な調整項目を生成する。
- **TARGET_ACCOUNTS:** 有形固定資産(PP&E)、のれん、無形資産、リース資産(ROU)、引当金、長期借入金、資本金・剰余金など。
- **DATA_SOURCE:** 対応する `Schedule` オブジェクト。これは、期首残高、期中イベントのリスト、そして期末残高への `roll-forward` ロジックを内包する補助簿である。
- **CANONICAL_EXAMPLE (PP&E Schedule Identity):**
  - **Equation:** `期末簿価 = 期首簿価 + 取得(CapEx) - 減価償却費 - 減損損失 - 除売却簿価`
  - **SSoT Mapping (情報の射影):**
    - `PL` へ: `減価償却費`, `減損損失`, `除売却損益` を費用・収益として射影。
    - `CF` へ: `取得(CapEx)` をCFIの現金流出、`除売却による現金収入`をCFIの現金流入として射影。`減価償却費`, `減損損失`, `除売却損益`をCFOの調整項目として射影。
    - `BS` へ: `期末簿価` を資産残高として射影。

### 2.2. Type: `ParameterDriven` (状態依存型ストック)

- **PURPOSE:** 残高が、PLの活動レベル（売上高など）と経営効率パラメータ（回転日数など）の組み合わせによって連続的に決定される科目。その期首からの**差分(Δ)**が、主に営業CF（運転資本の増減）に影響を与える。
- **TARGET_ACCOUNTS:** 売上債権(AR)、棚卸資産(INV)、仕入債務(AP)などの運転資本項目、およびその他流動資産・負債。
- **DATA_SOURCE:** `Driver`オブジェクト（DSO, DIO, DPO等）と`PL`オブジェクトの関連数値（売上高、売上原価）から導出される。
  - **Equation Example:** `AR[end] = PL.Revenue * (Driver.DSO / 365)`

---

## 3. CORE_CALCULATION_LOGIC_AND_ORDER_OF_OPERATIONS

計算順序の厳守は、モデルの**決定論的動作 (Deterministic Behavior)** と**参照透過性 (Referential Transparency)** を保証するための絶対要件である。

- **STEP 1: INITIALIZE_DRIVERS (前提条件の確定)**
  - **INPUT:** `Policy`オブジェクト, `Driver`オブジェクト。
  - **PROCESS:** 当期の計算に使用する全ての外生変数（売上成長率、マージン、税率、回転日数、CapEx計画、配当方針等）を確定させる。これはモデルのシナリオを定義する行為に等しい。
  - **OUTPUT:** 計算コンテキストが完全に定義された状態。

- **STEP 2: UPDATE_SCHEDULES (原簿の更新)**
  - **INPUT:** 全ての`BalanceAndChange`型の期首残高、関連`Driver` (CapEx計画、返済計画等)。
  - **PROCESS:** 全ての`BalanceAndChange`型科目について、`Driver`に基づき当期イベント（減価償却計算、設備投資実行、借入返済等）を発生させ、`roll-forward`テーブルを計算する。**このステップで、全ての非資金性取引と、投資・財務活動のキャッシュフロー額が確定する。**
  - **OUTPUT:** 全ての経済イベントが記録され、期末残高が確定した`Schedule`群 (SSoTの源泉)。

- **STEP 3: DERIVE_PROFIT_AND_LOSS_STATEMENT (PL) (経営成績の算定)**
  - **INPUT:** `Driver`, `Schedule`群。
  - **PROCESS:** 売上から始まり、各種費用を差し引いて当期純利益を算出する。減価償却費や支払利息などの費用は、**STEP 2で生成された`Schedule`から参照する (SSoT)。** これによりPLとBS/CFの整合性が保証される。
  - **OUTPUT:** 完成した`PL`オブジェクト。

- **STEP 4: DRAFT_BALANCE_SHEET (BS) (期末財政状態の仮組)**
  - **INPUT:** 期首`BS`, `Driver`, `Schedule`群, `PL`。
  - **PROCESS:**
    1.  `ParameterDriven`型科目の期末残高を`Driver`と`PL`から計算 (例：期末売掛金)。
    2.  `BalanceAndChange`型科目の期末残高を対応する`Schedule`から転記 (例：期末固定資産)。
    3.  利益剰余金を`flow_to_stock_linkage_principle`に従い更新。
    4.  **プラグ項目 (Plug Item):** この時点では、現金(`BS.Cash`)は期首残高のまま、あるいは計算上の未定義値として保持する。貸借はまだ一致しない。
  - **OUTPUT:** 現金勘定以外が確定し、貸借が不均衡な状態の`BS`草案。

- **STEP 5: DERIVE_CASH_FLOW_STATEMENT (CF) (現金収支の算定)**
  - **INPUT:** `PL`, 期首`BS`, `BS`草案。
  - **PROCESS:** 間接法に基づき、`PL.NetIncome`からスタートし、`Schedule`由来の非資金性項目と投資・財務活動、そして`ParameterDriven`科目のΔ（期首BSとBS草案の差）を用いてCFO, CFI, CFFを計算する。
  - **OUTPUT:** `TotalCashFlow`が確定した`CF`オブジェクト。

- **STEP 6: FINALIZE_BALANCE_SHEET (BS) (貸借の最終均衡)**
  - **INPUT:** 期首`BS.Cash`, `CF`オブジェクト。
  - **PROCESS:** `cash_reconciliation_principle`に基づき期末現金を `BS.Cash[begin] + CF.TotalCashFlow` として計算し、`BS`草案の現金勘定をこの確定値で上書きする。**この操作により、貸借は完全に一致するはずである。**
  - **OUTPUT:** 全ての勘定が確定し、貸借が均衡した期末`BS`。

- **STEP 7: VERIFY_ALL_INVARIANTS (形式的検証)**
  - **INPUT:** 完成した`PL`, `BS`, `CF`。
  - **PROCESS:** セクション1で定義した全ての`Invariant`が、許容誤差内で満たされているか最終検証を行う。特に、`bs_integrity_principle`の検証は、STEP 6の操作が成功したことの最終確認となる。
  - **OUTPUT:** 検証結果（`SUCCESS` or `ERROR with detailed breakdown`）。

---

## 4. ALGORITHM_DETAIL (CF_CALCULATION_INDIRECT_METHOD)

- **営業CF (CFO) の計算ロジック:**
  1.  **[START]** 当期純利益を取得する。 (Source: `PL.NetIncome`)
  2.  **[ADJUST]** 非現金性損益を調整する。
      - **[ADD]** 非資金性**費用**を加算する。（例: 減価償却費、引当金繰入額） (Source: `BalanceAndChange Schedules`)
      - **[SUBTRACT]** 非資金性**収益**を減算する。 (Source: `BalanceAndChange Schedules`)
  3.  **[ADJUST]** 運転資本の変動を調整する。
      - `ParameterDriven`型**資産**の増加額(Δ)を**減算**する。 (例: Δ売上債権)
      - `ParameterDriven`型**負債**の増加額(Δ)を**加算**する。 (例: Δ仕入債務)
  4.  **[RECLASSIFY]** 投資・財務活動項目の損益影響を純化する。
      - 投資・財務活動に分類されるキャッシュフローに関連する**損失**（例: 固定資産売却損）を**加算**する。
      - 投資・財務活動に分類されるキャッシュフローに関連する**利益**（例: 固定資産売却益）を**減算**する。 (Source: `BalanceAndChange Schedules`)

- **投資CF (CFI) の計算ロジック:**
  - `Schedule`から、有形・無形固定資産の取得 (CapEx) や売却、投資有価証券の取得・売却など、将来の利益獲得を目的とした資産への投下および回収活動によるキャッシュフローを抽出する。

- **財務CF (CFF) の計算ロジック:**
  - `Schedule`から、負債および純資産に関わる資金調達および株主還元活動（借入・返済、増資、自己株式取得、配当支払など）によるキャッシュフローを抽出する。

---

## 5. TDD_SCENARIOS (MINIMUM & ADVANCED REQUIREMENTS)

- **SCENARIO_A to E:** (V5.0と同様の基本シナリオ)
- **SCENARIO_F: `PIK_Interest_Test` (Payment-In-Kind Interest)**
  - **GIVEN:** 企業がPIK債を発行しており、利息の一部が現金ではなく元本への追加で支払われる。
  - **WHEN:** 支払利息100のうち、30がPIK利息として処理される。
  - **THEN:** `ASSERT` `PL.InterestExpense` == 100, `BS.Debt`の増加額 > 現金での借入額, CFOの支払利息調整は70で行われ、非資金性費用として30が別途調整される。
- **SCENARIO_G: `Impairment_and_Write-off_Test`**
  - **GIVEN:** のれん1000が存在する。
  - **WHEN:** 減損テストの結果、400の減損損失を計上。
  - **THEN:** `ASSERT` `PL.NetIncome`が400減少し、CFOで同額の非資金性費用として400が加算調整される。`BS.Goodwill`が400減少する。
- **SCENARIO_H: `Circular_Reference_Debt_Test`**
  - **GIVEN:** 期末の現金残高に応じてリボルビングクレジットラインからの借入額が変動する契約がある。
  - **WHEN:** モデル計算の結果、現金が不足する。
  - **THEN:** `ASSERT` モデルが循環参照を解決し（反復計算または代数解）、不足額を自動的に借入れ、`BS.Cash`が最低要求水準を満たし、`BS.Debt`が増加し、`CFF`にその借入が計上され、かつ全ての`Invariant`が満たされる。

---

## 6. CONFIGURATION_AND_POLICY_SPECIFICATION (OPERATOR_QUERIES)

(V5.0と同様の内容ですが、モデルの拡張性を示唆する項目を追加)

- **`CIRCULARITY_POLICY`:** 循環参照（例：余剰現金と有利子負債の相互依存）の解決方法（反復計算回数、許容収束誤差）を定義する。
- **`FX_POLICY`:** 機能通貨、換算レートの定義、為替換算調整勘定（CTA）の扱い。

---

## 7. OPERATIONAL_CONSTRAINTS_AND_IMPLEMENTATION_DIRECTIVES

(V5.0と同様の内容ですが、より厳格な表現に修正)

- **`IDEMPOTENCY`:** モデルは冪等（べきとう）であるべき。すなわち、同じ入力に対しては、何回実行しても常に同じ出力を生成しなければならない。
- **`TRACEABILITY`:** 全ての出力数値は、その計算根拠となった入力`Driver`または`Schedule`イベントまで遡って追跡可能でなければならない。
- **`NO_MAGIC_NUMBERS`:** モデル内に、その出所が不明なハードコードされた数値を存在させてはならない。全ての数値は`Policy`または`Driver`から供給されるべきである。

---
