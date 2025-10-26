# 遊び方・解説書

## 概要

テストコードの値を変えたり、console.logを仕込んで動作を追ってみるのが良いと考えられる。

以下のテストコードがコアロジックの挙動を確認するのに適している(他はエラーハンドリングやユーティリティのテストである)。

- [plOnlyAst.test.ts](../server/src/tests/plOnlyAst.test.ts)
- [balanceAndChange.test.ts](../server/src/tests/balanceAndChange.test.ts)

### 各テストコードの役割と気持ち

`server/src/tests` 配下の各テストファイルが「何を検証しているか」「その目的は何か」を簡潔にまとめたものである。実装/仕様を把握する際の導入として利用可能である。

#### balanceAndChange.test.ts

- 概要: Balance & Change（B&C）仕訳の PoC。減価償却や設備投資を B&C 定義として与え、対象勘定と相手勘定の増減が期待通りになるかを検証。
- 主な観点:
  - 減価償却: PPE を driver=減価償却費で減算し、相手方=利益剰余金。現金は B&C では直接は動かないことを確認（基点利益を 0 固定にしてキャッシュ連動の影響を打ち消し）。
  - 設備投資: PPE を固定額で増加、相手方=現金（キャッシュアウト）。PPE 増/現金減、利益剰余金は不変であることを確認。
- 目的: B&C 定義（target/counter/driver/sign/value）が FAM に正しく適用され、PL 経由でないバランスシート勘定の動きも含めて数値が一貫することを保証。

### fam.behavior.test.ts

- 概要: FAM の基本挙動と B&C の ID/GAID 解決周りを広くカバー。テーブル/スナップショットのキー、キャッシュ連動、未知 accountId の取り扱い、B&C の target/counter/driver の指定解釈、GAID の primary 選定規則などを確認。
- 主な観点:
  - キャッシュ連動: `baseProfitAccount` を accountId、`cashAccount` を GAID で指定しても正しく現金が連動する。
  - 未知の accountId を含む実績の import（strict=false）では自動補完、strict=true ではエラーになる。
  - 実績に現金が無い場合は 0 でシードされ計算が進む。
  - B&C: target/counter を GAID で指定した場合でも primary accountId に解決され、逆符号で現金に反映される。counter を accountId 直接指定しても同じ結果になる。
  - `getTable()`/`snapshotLatestActual()` のキーは accountId 基準で返ることを明示。
  - B&C driver の参照名は GAID/accountId どちらで指定しても同値となることを確認。
  - accountsMaster 未指定で B&C を GAID 指定すると、GAID→accountId のマッピングが無く失敗する（期待通り）。
  - `validateBalanceChange`: driver も value も無い定義はエラー。
  - GAID の primary 選定: `is_primary` > `fs_type=PL` > 先勝ち の優先度で解決されること、かつ結果が表に反映されることを確認。
- 目的: ID（accountId）優先の内部表現と、GAID ベースの B&C 指定が矛盾なく共存し、周辺 API の契約（表/スナップショット/検証ロジック）が意図通り機能することを保証。

#### idManagementByAccountId.test.ts

- 概要: 参照や判定は GAID ではなく accountId で管理されることを確認。同一 GAID を共有する複数の PL 勘定（売上A/売上B）が、計算/表上で独立して扱われ続けることを検証。
- 主な観点:
  - 実績/ルール/計算はいずれも accountId をキーに扱い、同一 GAID を持つ別アカウントが混同されない。
  - 計算後の表で、売上A/売上B の行が別 ID として存在し数値も独立していることを確認。
  - B&C は引き続き GAID ベースで定義可能である前提を明示。
- 目的: 「表示や GAID 正規化は UI/概念上の都合であり、システム内部の ID は accountId が源泉」という設計意図を回帰テストで担保。

#### logicErrors.test.ts

- 概要: 代表的なエラーハンドリングの確認。ルール定義の妥当性、循環参照、前期参照の前提欠落、係数の不正値、必須パラメータ欠落、`compute` オプション不備、B&C 定義の不備などで適切に例外が投げられることを網羅。
- 主な観点:
  - 未定義 GAID の参照で throw。
  - ルールの循環依存（A→B、B→A）で throw。
  - PREV 参照だが実績ゼロ件で throw。
  - 係数が NaN で throw。
  - 必須パラメータ（例: GROWTH_RATE の refs）欠落で throw。
  - `cashAccount` 未指定/不整合で throw。
  - B&C: 不正 target、driver/value 両方欠落、`sign` 不正値で throw。
- 目的: 失敗時のメッセージ/ガードが想定通りに機能し、不正入力で静かに破綻しないことを保証。

#### plOnlyAst.test.ts

- 概要: PL 限定の E2E（FAM グローバル状態 → ルール → AST 生成/検証/評価 → 書き戻し → 表ビュー）。2 年分の予測計算を走らせて数値・キャッシュ連動・AST の整合性を確認。
- 主な観点:
  - 実績は GAID キーで与え、ルールは PL 勘定のみ。`baseProfitAccount` と `cashAccount` を与えて 2 年分を計算。
  - 表ビューの期待値（売上/売上原価/販管費/営業利益/経常利益/現金）を FY+1/FY+2 で検証。
  - AST: `compileUnifiedAST` → `validateAST`（トポ順/参照整合）→ `evalTopo` と `evalNodeRecursive` の一致性を確認。`toDOT` の出力に TT ラベルが含まれることを確認。
- 目的: AST ベースの評価と FAM の表現が整合し、逐次年次の再適用（前期の結果を次年の prev とみなす）でも期待通りの数値を再現できることを保証。

## まとめ図解（概念）

実績PREVS → **FAM.importActuals**\
RULES → **FAM.setRules**\
計算 → **FAM.compute**（AST構築・評価）\
結果書戻し → **FAM.table**\
UI → **FAM.getTable** で表の抽出

## 具体的な手順

### plOnlyAst.test.ts

#### どのようなastができているかを確認する

1. [plOnlyAst.test.ts](../server/src/tests/plOnlyAst.test.ts)の88行目`fam.vizAST();`のコメントアウトを外す
2. `npm run test`を/serverディレクトリ内で実行する
3. ブラウザで[GraphvizOnline](https://dreampuf.github.io/GraphvizOnline/)を開き、コンソールに出力されたdot形式の文字列を貼り付けて、どのようなastができているかを確認する

### balanceAndChange.test.ts

1. balanceAndChange科目は、CFIの配列として定義をし、famにsetBalanceChangeで渡す。

- CFIの型定義は[model/bc.ts](../server/src/model/bc.ts)
- 具体例は[balanceAndChange.test.ts](../server/src/tests/balanceAndChange.test.ts)の40行目を参照

2. [balanceAndChange.test.ts](../server/src/tests/balanceAndChange.test.ts)の56行目のコメントアウトを外す
3. `npm run test`を/serverディレクトリ内で実行する
   (ここで、どのような値が出力されるかを確認する)
4. [balanceAndChange.test.ts](../server/src/tests/balanceAndChange.test.ts)の48行目をコメントアウトする
   - こうすることで、setBalanceChangeが走らないので、balanceAndChange科目がない場合の挙動を確認できる
5. `npm run test`を/serverディレクトリ内で実行し、3で確認した値と比較することで、balanceAndChangeがある場合とない場合の挙動を比較できる
