# Context統合版

### プロジェクトの目的

- **実績の BS/PL** を起点に **計画 BS/PL** を算出し、**キャッシュフロー計算書（CF）を自動生成**する Web アプリケーションを作成する。
- 各 **勘定科目ごとに計算方法（ロジック）を定義**できるようにする（例：売上は成長率 5%、人件費は売上連動）。

### 前提

- 実装言語: **TypeScript（オブジェクト指向）**。
- **基点利益**（税前利益または当期純利益）から CF を導出する。
- 実績→計画の算出では、科目単位で **Param Type / Reference / Scalar** を設定可能にする。

### 全体イメージ

- 財務諸表におけるBS、PL、ひいてはPP&Eなどは、横軸にPeriod（Fiscal Year略してFY、またはFyscal Month略してFMのどちらか）、縦軸に勘定科目（Account）をもっている。
- 従って、FY(FM）とAccountをIndexとする連想配列として表現可能である。この連想配列をFY-Account Matrix、略してFAMモデルと呼ぶことにする。
- プレーンなBS,PLを考えればFAMモデルのCellオブジェクトは単なる数値オブジェクトである。しかし、BS、PLを実績値のみならず、予測値まで算出するProjection 財務モデルをFAMモデルで実装しようとする場合においては、FAMのセルは、単純なる数値では不十分であり、参照先Cell（二つ）の情報や、それら参照先Cell（二つ）に対して講じるべき演算子情報などを持つようなオブジェクトでなければならない。これをのちのClass Nodeクラスと、これを承継したClass Cell extends Nodeなどのインスタンスを、FAMのオブジェクトとして持つ必要がある。
- さて、FAMモデルの構成要素として重要なのは、FAMモデルそのものと、FAMモデルのCellを構成するNodeオブジェクトである。先に述べたように、Cellは数値だけをもっていればいいわけではなく、将来予測の計算などを実装するために、そのCellは、valueのみならず、参照Cell情報（二つ）や演算情報をもっている必要がある。

##### さて、Cell／Nodeオブジェクトと、FAMモデルを使った計算ロジック構築のために、いくつかの前提情報を定義していこう。

**Nodeオブジェクトについて：**

- Nodeクラスは、以下の要素を持つ
  - ParamType
  - value
  - Ref 1
  - Ref 2
  - Operator
- Nodeは、TTノードとFFノードの二つに分類できる。TTノードはRef 1／ 2がNonNullであり、必ず参照先をもっておりOperatorもNonNull、FFノードはRef 1／ 2とOperatorがNullである。すなわち、FFノードは末端ノードでありvalueをもっているだけ（OperatorもNull）。
- 要はTTノードは、小要素二つを必ずもっており、Ref 1／ 2にその参照（UUIDないしポインタ）をもっている。ただし、TTノードが持つのは、FFノード二つか、FFノード一つとTTノード一つかのどちらかのパターン。TTノードが二つのTTノードを持つことはなく、これは禁則とする。
- TTノードのvalueは、Ref 1／ 2による子ノードvalueにOperator演算を噛ませた結果の数値をセットする。
- FFノードは末端ノードだからvalueをもっているのみで、基本、TTノードの子ノードであり、Ref 1／ 2とOperatorはNullである。

**Cellオブジェクトについて：**

- Nodeクラスを承継したクラスである
- Class Cell
  - extends Node
  - Account typeをメンバーとしてもつ
  - Period typeをメンバーとしてもつ
    - Periodで、会計期関連の情報を持つことができる。
    - Accountで、会計科目を持つことができる。
    - Nodeオブジェクトは、何かしらのNodeオブジェクトをもっている。

**Period typeについて：**

- 要は、このデータを持つCellクラスインスタンスが、どんな会計期に紐づくのかを表現している。
- type Period
  - Period_type：YearlyかMonthlyか（Nullか）
  - AF_type：ActualかForecastか（実績値か計画値か）
  - Period_val：JSのDataTime型とかでPeriod値を持つ。Yearlyの時はYYYYだろう。Monthlyの時はYYYYとMMを持つなんらかの形式になる。ここの任意性はある程度許容する。

**Account typeについて：**

- 要はCellクラスインスタンスが持つNodeオブジェクトのバリューが会計上どういう意味を持ち、かつ会計計算上どういうロジック整理をなされるべきか、のパラメータを持つクラスになる。
- type Account
  - id：勘定科目ID
  - AccountName：読み込んだ勘定科目
  - GlobalAccountID：システムがグローバルで持ってる勘定科目のID
  - fs_type：BSなのかPLなのか、はたまたPP&Eなのか
  - parent_id：親科目がある場合、その科目のid
  - isCredit：この勘定科目が借方なのか、貸方なのかをBooleanで持つ。判定は、GlobalAccountが何なのかで割り当てるロジックを別途実装。
  - parameters：Parameters型なのかBalanceAndChange型なのか　（別途定義）
  - FlowAccountCF：BalanceAndChange型の場合に参照するフロー科目の参照
  - DisplayOrder_id：Global Accountに応じて決まる表示順位。行番号。

**FAM上のCellオブジェクトとNodeオブジェクトの取り回し：**

- 要は、シードデータは、BSPLの期ごとの数値データ。連想配列的に、縦キー（Row Key）は会計勘定科目、横キー（ColKey）はPeriodで、オブジェクトに数値をもった実績値の会計データがある。
- この実績データを読み込む処理をすると、まず、RowKeyを取り出し、ColKeyを取り出し、これに基づいて、この実績値BSPLを表現する、FAMインスタンスが生成される。
- このFAMインスタンスには、続いて、各Cellオブジェクトが生成されて、各Classに基づくInstance生成・初期化が走る。この時、Period ClassとAccount Classはセットできる情報のみセットされる、それ以外はNullで良い。で、実績の数値がNode ClassのValueにSetされる。
- また各NodeにUUIDが振られる。
- FAMの表層のCellが全て実績データでセットされ（Cell.node.valueがNonNull）、二項グラフは生成されていないが（Refは全てNullだからFFNodeだが）、単一のFFノードとしてはvalueを持った状態になっている。

**FAMモデルに求められる機能要件：**

- 行の追加（Accountの追加）
  - Accountは、初期値＝空。ユーザーが手打ちするか何かしないといけない。
- 列の追加（Period）
  - これは予測（計画期）の計算実行の時に必須になる。
  - 所与の年次・月次まで列を追加して、計画期は、所与の演算定義に倣ってCellオブジェクトの新設がなされる。

**実務上の要請：**

- サービス立ち上げ時のFAMインスタンス初期化、FAM内のCellオブジェクトの初期化
- その他

### 予測ロジックの定義

#### 概要

- FAM上にシードデータが全て投入された状態がスタート地点である
  - BS、PLなどの実績データがAccount・Periodが完備な状態でFAMが生成されており、さらに、
  - FAMの各セルがFFノードとしてバリューを持って完備な状態であること
- 実績値Period（Actual）に対して、
- BS・PLの実績値を用いて計画期Period（Forecast FY）の各勘定科目の予測値を計算してセットしてあげる必要がある。
- 予測値を計算するロジックは、大きく分けて二つあり、Parameters型とBalanceAndChange型である。
  - 基本的には、勘定科目ごとにこのロジックタイプは異なる（割り振られている）と考えて良い
  - 大半の勘定科目はParameters型で計画期（次期）の予測値が計算されるが一部の勘定科目（建物などの資産性科目）はBalanceAndChange型を割り当てられる
  - 割り当てるのはユーザーであり、BlanceAndChandeをUIで指定されない限りは基本全てParametersである。
- この辺の前提事情が、設計に正しく反映される必要がある。
- また、予測ロジックのセルへの反映は、別途詳述する、計算ロジック定義と定義オブジェクトの生成、定義オブジェクトの反映処理によってなされる。

#### Parameters

- 各勘定科目ごとに予測ロジックを定義する。
  - 予測ロジックは、別途UIで定義し、下記の通りその設定値はParametersとしてHoldされ、AST構築による演算を実現する
  - 予測ロジック定義のInterFaceとロジックは別途定義するとして、今回はテストのシード値を仮置きして行うこと。
- 予測ロジックの定義にはParametersを用いる
- このParametersの集合をもとにASTを構築して依存関係を定め、予測値計算ができるという流れである。
- Parametersには以下三つをメンバとして定める。
  - Ref(Period, Accountで特定可能)、
  - Op(add, sub, mulなど)、
  - Num(手打ちのスカラー値)
- Periodに関しては実績最終年を0としたoffsetを格納しておくことで、計画値を計算するときに相対的な参照を取ることが容易になる。
  - 例: growth_rate, 前期(-1), 同じ科目, 5% -> 計算しようとしている計画値のperiod offsetから1を減算して同じAccountを参照すれば良い。

→ 総論として、このParametersの目的を述べておくならば、ある勘定科目の予測値の計算には「当期の他科目を複数足し引き」したり、「当科目の前期値をスカラー倍」したり、「他科目の当期値と前期値の比率を、当科目の前期値に掛け合わせて計算」したりなど、いわば、PeriodやAccountsを横断的に参照して計算する必要があり、この参照先や計算をParametersとしてもち、ロジックとして反映できるようにすることが目的である。

以下に、想定しているParametersによる計算類型を定義しておく。

##### 定義

| ID   | Parameter_type | Return | 計算概要                                                                                                 | 引数                             | 注意点 |
| ---- | -------------- | ------ | -------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| PT01 | INPUT          | Val    | 手入力ないしOCRした単一の値をCell.valに反映                                                              | ・Input<br>・OCR                 |        |
| PT02 | CALCULATION    | Val    | ・Refと演算子を複数選択<br>・位置関係保存し再帰的にPrj.<br>・PT05の複合実装                              | ・Ref1/Ref2/Ref3/…<br>・Operator |        |
| PT03 | CHILDREN_SUM   | Val    | ・参照したRefsだけを足し合わせる<br>・PT03の制限運用用                                                   | ・Ref1/Ref2/Ref3/…               |        |
| PT04 | FIXED_VALUE    | Val    | ・前期当該科目（FY=FY-1, Acc=Acc）を参照する<br>・単一参照（PT05）を使えば実装可能                       | ・Ref1, あるいはINPUT            |        |
| PT05 | REFERENCE      | Val    | ・ある特定のCell（FY, Accで自己特定）を参照<br>・FY, Acc（さらにidはSheet.id）を投げればValueをGetできる | ・Ref1                           |        |
| PT06 | GROWTH_RATE    | Val    | ・前期当該科目（FY=FY-1, Acc=Acc）を参照する<br>・参照した前期当該CellにNUMを掛けた値をCell.valとする    | ・Ref1<br>・NUM                  |        |
| PT07 | PROPORTIONATE  | Val    | ・特定勘定の変動比率を算出<br>　→ r: X(Acc,FY)/X(Acc,FY-1)<br>　→ r \*（前期当該科目Refで計算）          | ・Ref1/Ref2<br>・Ref             |        |
| PT08 | PERCENTAGE     | Val    | ・同期別勘定の特定割合NUMをCell.valにする                                                                | ・Ref1<br>・NUM                  |        |

##### ユーザー入力型の定義

```typescript=
interface RefInput {
  period: Period;         // 'PREV' | 'CURR'
  account: Account;           // 参照先科目
  sign?: 1 | -1;             // CALCULATION の項で使用（省略時 +1）
}

type RuleInput =
  | { type: 'INPUT'; value: number }                                              // PT01
  | { type: 'CALCULATION'; refs: RefInput[] }                                     // PT02
  | { type: 'CHILDREN_SUM' }                                                      // PT03
  | { type: 'FIXED_VALUE'; value: number }                                        // PT04
  | { type: 'REFERENCE'; ref: RefInput }                                          // PT05
  | { type: 'GROWTH_RATE'; value: number; refs: [RefInput] }                      // PT06（互換：refs[0] を基準に成長）
  | {
      type: 'PROPORTIONATE';                                                      // PT07（連動 / 回転の簡素版）
      // ドライバーの現期と前期。典型：売上(curr) と 売上(prev)
      driverCurr: RefInput;       // period は通常 'CURR'
      driverPrev: RefInput;       // period は通常 'PREV'
      base?: RefInput;            // 省略時は「自科目の PREV」を使う（= 前期残高に r を掛ける）
      coeff?: number;             // 任意の係数（なければ 1）
    }
  | { type: 'PERCENTAGE'; value: number; ref: RefInput };                         // PT08

```

#### Balance & ChangeのBS科目の計算ロジック

##### 概要①

- ユーザー指定のロジックにより、計画値を他Node参照で計算する勘定科目はParametersで取り扱った。
- ここでは他の「フロー科目」と呼ばれる数値の足し引きによって変動が定まるBS科目が存在し、これをBalance & Change型と呼ぶ。
- 要は、BSの資産勘定である「建物・設備等」は、BS・PL以外のFAMである「PP&E」や「Financing」「償却計画」の数値を参照し、BS上の前期当該科目実績値に対してこれらを足し引きすることで、会計上、当期の当該科目実績値が定まる。
- Balance&Change型は、いわば、BS・PLの外側にある数値集合であるFAMをPeriodごとに参照し、これを前期BS実績値の反映（足し引き）して当期BS予測値を定めるという処理だ。
  - ここで足し引きと書いたが、それは、建物・設備等であれば、プラスに作用するのは「設備投資（PP&E）」の数値であり、マイナスに作用するのは「減価償却」の数値である。

##### 概要②

- 要は、Balance&Change型（B&C型）のBS科目の計画期の予測値計算は、BS・PLの他に定義されるFAM（PP&E、減価償却、Financingなど）を「フロー科目」参照して、会計の原則（＃）に従って足し引きしましょうね、ということ。
- ここで会計の原則（＃）というのは、複式簿記のことである。計算の要諦は三つあるので書き記しておくこれを［CFIロジック］と呼ぶ。：
  - B&C型を割り当てたBS科目がそもそも借方なのか、貸方なのかが把握され、
  - その上でそのBS科目を増加させるのか、減少させるのか、
  - その要因となるフロー科目はなんなのか、
- 基本的にB＆C型を割り当てる会計勘定はBS上の科目のみである。従って、最初の方の画面でユーザーに、どのBS科目にB＆Cを割り当てるか決めさせる。割り当てを決めさせた時には、CFIロジックを実現するために、下記の<CFIクラス>をオブジェクト化するための、ユーザー入力値をゲットするようにする
  - 【CFI Type】
    - 対象のBS科目Accounts(BS_accounts)
    - IsCredit（Accountsクラスから引っ張るとかでいい）
    - Plus
      - 原因勘定のAccount（例えば設備投資）
      - 原因勘定のvalue
      - 相手方科目（この場合は現預金）
    - Minus
      - 原因勘定のAccount（例えば減価償却）
      - 原因勘定のvalue
      - 相手方科目（この場合は利益剰余金）

##### 【処理と操作のステップ】

1. 対象となるBS科目を選択する
2. これを増減させるフロー科目を参照する(ex: PP&E, Dep)
3. 増/減を選ぶ
4. 相手科目を選ぶ
   　→これをCFIクラスで情報をホールドし、適切に、当該BS科目の前期→当期変動計算を実現するのが、B＆C型のロジックである。これはユーザーに初期的に定義させることが重要である。

　

##### 例1

- BS科目: 建物・機械等
- フロー科目: 減価償却費（PL）
- 増減方向: 減少
- 相手科目: 利益剰余金
- → PL経由、現金影響なし → 営業CFに加算

##### 例2

- BS科目: 建物・機械等
- フロー科目: 設備投資（NotPL）
- 増減方向: 増加
- 相手科目: 現預金
- → PL非経由、現金影響あり → 投資CFに減算

#### 実装上の諸注意（PJオーナーより）

- クラス定義において不明瞭なところはとりあえずNullフィルしておくこと
- 型定義が未完了なポイントはToDoとして明記すること
- 上記実装要件コンテキストについて不明点があれば仮定をおいて実装し、明記すること

# 次やること

- period, accountの厳密な型定義
- userInputの型定義

# memo

### poc実装におけるBalance&Change科目の扱い

各ユーザー入力の勘定科目が、システムが持っているGlobalAccountにマッピングされていることを前提としているが、GlobalAccountをどう持つかは未決定なので、とりあえずは以下のように実装を行う。

```
Type Account:
	id: 			XXXX000XXX
	account:		売上高
	global_account:	Null
	isCredit:		Null
	fs_type:		BS
	parent_id:		YYY00YYYYY
```

→ IsCreditはB&Cのロジック自動化の方便だったと
なくてもエイやで行けると
ユーザーに貸方借方を書かせる
CFIインスタンスの

- 【CFI Type】
- 対象のBS科目Accounts(BS_accounts)
- IsCredit（Accountsクラスから引っ張るとかでいい）
- Plus
  - 原因勘定のAccount（例えば設備投資）
  - 原意感情のvalue
  - 相手方科目（この場合は現預金）
- Minus
  - 原因勘定のAccount（例えば減価償却）
  - 原意感情のvalue
  - 相手方科目（この場合は利益剰余金）

→ GA/isCreditを各インスタンスに割り当てる処理を後から書けばいい
global_account: Null → 売上高
