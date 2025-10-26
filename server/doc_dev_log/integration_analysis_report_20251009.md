# UI・API・コアロジック統合：詳細分析と実装仕様提案レポート

**日付**: 2025年10月9日
**目的**: UI、API、コアロジック間の「断絶」を解消するため、各層の現状実装をマイクロな視点で詳細に分析する。これにより、データ構造の不整合や潜在的なリスクを特定し、UI/API連携を成功に導くための、具体的な実装仕様を提案する。

---

### 1. 総括：現状は「高性能エンジン」と「車体」が別々に存在する状態

現状分析の結果、プロジェクトは以下の状態にあると結論付けられます。

- **コアエンジン (`@server/src`)**: 会計原則に忠実な三表連動計算を実行できる、極めて高性能かつ堅牢なエンジンが完成している。
- **UI (`@src`)**: モデル計算の「材料」となる実績値・勘定科目・計算ルールを入力するための画面群と、最終的な計算結果を表示するためのデータグリッド画面が、個別にコンポーネントとして存在する。
- **API (The Gap)**: 両者を繋ぐ「トランスミッション」と「ドライブシャフト」にあたるAPI層が決定的に欠落している。

したがって、次の開発フェーズの核心は、このAPI層を**単なる仲介役ではなく、データ変換とプロセス管理の責務を持つ「計算オーケストレーター」として設計・実装すること**にあります。

### 2. 詳細分析：各層の現状と「3つの不整合」

#### 2.1. UI層 (`@src`) の実装状況

- **データ入力フロー**: `UserAccountImport.tsx` → `AccountManagementPage.tsx` → `FinancialModelSetupPage.tsx` という一連の画面を通じて、ユーザーは計算に必要な「実績」「勘定科目」「ルール」をDBに永続化できます。
- **データ構造**: 各画面は、APIから取得したDBのテーブル構造に近いJSONオブジェクト（例: `user_accounts`テーブルの1レコード）を`useState`で管理し、それを画面上で編集してAPIに送り返す、という典型的なCRUDアプリケーションの挙動を示します。
- **結果表示画面 (`FinancialStatementPreview.tsx`)**:
  - `react-data-grid`コンポーネントを使用しており、`columns`（列定義）と`rows`（行データ配列）を`props`として受け取る設計です。
  - `rows`は、`[{'勘定科目': '売上', 'FY2024': 1000, 'FY2025': 1100}, ...]` のような、**1行が1勘定科目の全期間データを持つ**オブジェクトの配列を期待しています。

#### 2.2. コアエンジン層 (`@server/src`) のインターフェース

- **入力**: `FAM`クラスは、DBのテーブル構造とは全く異なる、計算に最適化されたメモリ上のデータ構造を直接受け取ります。
  - `importActuals(PREVS: Record<string, number>[], accountsMaster: Account[])`
  - `setRules(rules: Record<string, RuleInput>)`
- **出力**: `getTable()`メソッドは、UIが期待する形式とは異なる、**行列形式（Matrix）**でデータを返します。
  - `{ rows: any[], columns: string[], data: number[][] }`
  - `rows`は勘定科目リスト、`columns`は期間リスト、`data`は数値の二次元配列です。

#### 2.3. 顕在化した「3つの不整合（Impedance Mismatch）」

1.  **【入力】データ構造の不整合**:
    - **DB/UI**: 「勘定科目」や「計算ルール」を**レコードの配列**として扱います。
      - `[{ rule_id: 1, target_ua_id: 101, ... }, { rule_id: 2, ... }]`
    - **コアエンジン**: これらを`accountId`をキーとする**ハッシュマップ（`Record`）**として期待します。
      - `{ "101": { type: 'GROWTH_RATE', ... } }`
    - **ギャップ**: API層は、DBから取得した配列をループし、エンジンが要求するマップ構造に変換する必要があります。このとき最新DDL（`docs/[最新版]_DDL_1014.sql`）で追加された `ga_code`, `ga_type`, `parent_ga_type` などのメタ情報を一緒に保持しておかなければ、後続のアンピボット処理や UI 表示で欠落が生じる点に注意が必要です。

2.  **【出力】データ構造の不整合**:
    - **コアエンジン**: 計算結果を**行列（Matrix）**で出力します。
    - **UI**: `react-data-grid`は**オブジェクトの配列**を期待します。
    - **ギャップ**: API層は、エンジンの行列出力を「アンピボット」し、UI向けのJSONオブジェクト配列に変換する、比較的重い処理を担う必要があります。その際、`global_accounts` の `ga_code` や `is_credit`、`periods` の `period_type` / `period_val` / `display_order` など DDL 1014 で必須化された項目をマージする処理を追加で実装する必要があります。

3.  **【プロセス】状態管理の不整合**:
    - **UI/API**: Webの基本であるHTTPは、**ステートレス**なリクエスト/レスポンスモデルです。
    - **コアエンジン**: 財務モデル計算は、データ量によっては数秒〜数十秒かかる可能性のある、**ステートフル**で時間のかかる処理です。
    - **潜在的リスク**: 単純なHTTPリクエストで計算を実行すると、サーバーのタイムアウト（例: 30秒）に容易に到達し、ユーザーは結果を受け取れません。

### 3. 実装仕様提案：非同期型の「計算オーケストレーターAPI」

上記3つの不整合を解決し、堅牢な連携を実現するため、以下の非同期APIパターンを提案します。

#### 3.1. APIエンドポイント仕様

1.  **計算開始API**
    - **エンドポイント**: `POST /api/v1/calculations`
    - **リクエストボディ**: `{ "modelId": 1, "scenarioId": 1, "projectionYears": 5 }`
    - **処理**:
      1.  リクエストを受け付け、一意の`jobId`を生成する。
      2.  即座に`{ "jobId": "..." }`をUIに返す（**202 Accepted**）。
      3.  バックグラウンドで、`jobId`に紐づけて重い計算処理を開始する。
    - **目的**: UIを待たせることなく、重い処理を非同期で開始する。

2.  **ステータス確認API**
    - **エンドポイント**: `GET /api/v1/calculations/status/:jobId`
    - **処理**:
      1.  `jobId`に対応する計算ジョブの状態（`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`）を返す。
    - **目的**: UIが定期的に（例: 2秒ごとに）ポーリングし、計算の進捗を確認する。

3.  **結果取得API**
    - **エンドポイント**: `GET /api/v1/calculations/results/:jobId`
    - **処理**:
      1.  `jobId`に対応する計算が`COMPLETED`状態であれば、整形済みのJSONデータを返す。
      2.  計算結果は、一度整形したらDBやインメモリキャッシュに保存し、2回目以降のアクセスを高速化する。
    - **目的**: 計算完了後、UIが最終的なデータを取得する。

#### 3.2. 計算オーケストレーターの内部ロジック（`POST /api/v1/calculations`のバックグラウンド処理）

```typescript
// --- Pseudo-code for the calculation orchestrator ---

async function runCalculation(jobId, modelId, scenarioId, projectionYears) {
  try {
    // 1. データ収集 (DB Access)
    const accountsMaster = await db.fetchUserAccountsWithGA(modelId); // user_accounts JOIN global_accounts（ga_code, ga_type, parent_ga_type 含む）
    const dbActuals = await db.fetchImportData(modelId);
    const dbRules = await db.fetchCalculationRules(scenarioId);
    const periods = await db.fetchPeriods(scenarioId); // period_type / display_order / period_val を保持

    // 2. データ変換 (DB -> Engine) - 【ギャップ①の解消】
    const PREVS = transformActualsToPrevFormat(dbActuals); // accountId→value の年次配列。マスタ未登録IDはFAM側で合成される
    const { rules, cfis } = transformDbRulesToEngineFormat(dbRules, accountsMaster); // GAID 指定を primary accountId に解決

    // 3. コアエンジン実行
    const fam = new FAM();
    fam.importActuals(PREVS, accountsMaster);
    fam.setRules(rules);
    fam.setBalanceChange(cfis);
    fam.compute({ years: projectionYears, ... });

    // 4. 結果整形 (Engine -> UI) - 【ギャップ②の解消】
    const plMatrix = fam.getTable({ fs: 'PL' });
    const bsMatrix = fam.getTable({ fs: 'BS' });
    const cfMatrix = fam.getTable({ fs: 'CF' });
    const payload = unpivotMatrixToUiJson([plMatrix, bsMatrix, cfMatrix], accountsMaster, periods);
    // ↑ 行列→1セル単位JSON化。global_accountブロックに ga_code/ga_type/is_credit を埋め、period情報を periods 経由で補完

    // 5. 結果の永続化/キャッシュ
    await cacheOrStoreResult(jobId, payload); // Redis もしくは DB に TTL 付きで格納
    await db.updateJobStatus(jobId, 'COMPLETED');

  } catch (error) {
    await db.updateJobStatus(jobId, 'FAILED', error.message);
    await logJobError(jobId, error); // モニタリング用に詳細を残す
  }
}
```

### 4. 結論と推奨される次のステップ

コアエンジンとUIコンポーネントは、それぞれが十分に成熟しています。プロジェクトを次のレベルに進めるために、**API層を「単なるパイプ」ではなく、「賢いオーケストレーター兼トランスレーター」として設計・実装すること**が不可欠です。

**推奨される次の一手:**

1.  **非同期APIの導入**: 上記で提案した非同期ジョブ管理の仕組み（`POST /calculations`, `GET /status/:jobId`, `GET /results/:jobId`）をAPIの基本設計として採用する。
    - ジョブ管理用テーブル（`calculations_jobs` 等）とキャッシュ層（Redis など）の選定、TTL・再計算ポリシー、同一シナリオ多重実行時の排他方針を合わせて定義する。
2.  **データ変換ロジックの実装**: まずは`POST /calculations`エンドポイント内部で、DBから取得したデータを`FAM`エンジンが要求する形式に変換するロジックを実装する。
    - GAID を `primaryAccountIdOfGAID` に解決する前処理、`periods` テーブルとのマージ、未登録 accountId の扱いをドキュメントどおりに統一する。
3.  **UIの改修**: `FinancialStatementPreview.tsx`を改修し、計算ボタンを押したら`jobId`を取得し、ステータスのポーリングを開始し、計算完了後に結果を取得してデータグリッドを更新する、という非同期フローを実装する。
    - ジョブキャンセル・タイムアウト時のエラーハンドリング、前回結果との比較表示、`periods.display_order` に基づく列並び替えを実装する。

この実装により、当初の構想であった三表連動モデルの計算機能が、UI / API / コアロジック間で一貫したデータをやりとりできる形で完成します。
