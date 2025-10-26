// src/model/global-accounts.ja-gaap.ts
//
// 日本会計基準（会社計算規則・一般に公正妥当と認められる企業会計の基準／実務で一般的な表示区分）に沿った
// GAID の“網羅的”な定義セット(chatgpt生成: https://chatgpt.com/share/68b16043-9964-8013-bc72-e43b1f61c3aa)
//
// 注意：
// - 計算・保存は id（英数）で行い、表示は defaultNameJa/En を UI 側で任意に差し替えてください。
// - normalSide は「仕訳上の本来の増加方向」を表します（資産＝借方、負債・純資産＝貸方、収益＝貸方、費用＝借方）。
//   小計・集計項目やキャッシュフロー行は 'NONE' を採用しています。
// - sheet は表示先の区分を示します：'BS' | 'PL' | 'CF' | 'PP&E'（固定資産補助スケジュール）。

// 前後関係/使い方:
// - fam.ts: accountsMasterとして渡すAccount配列が持つGlobalAccountIDと突き合わせ、
//   GAID→accountId のマッピングを構築する。
// - B&C 指示では target/counter に GAID または accountId を指定できる。GAIDはここで定義された列挙値。
// - 表示は defaultNameJa/En をUI側で扱い、保存・計算のキーは accountId を使用する。
export type FsType = 'PL' | 'BS' | 'CF' | 'PP&E' | 'OTHER';
export type NormalSide = 'DEBIT' | 'CREDIT' | 'NONE';

export enum GAID {
  // ===== BS：資産（流動資産） =====
  ASSETS = 'ASSETS', // 資産（集計用の抽象ノード）
  LIABILITIES = 'LIABILITIES', // 負債（抽象）
  EQUITY = 'EQUITY', // 純資産（抽象）

  CASH = 'CASH', // 現金及び預金
  NOTES_RECEIVABLE_TRADE = 'NOTES_RECEIVABLE_TRADE', // 受取手形
  ACCOUNTS_RECEIVABLE_TRADE = 'ACCOUNTS_RECEIVABLE_TRADE', // 売掛金
  ACCOUNTS_RECEIVABLE = 'ACCOUNTS_RECEIVABLE_TRADE', // Alias for ACCOUNTS_RECEIVABLE_TRADE
  ERMC_OPERATING = 'ERMC_OPERATING', // 電子記録債権（営業）
  SECURITIES_SHORT_TERM = 'SECURITIES_SHORT_TERM', // 有価証券（流動）
  INVENTORIES = 'INVENTORIES', // 棚卸資産
  WORK_IN_PROCESS = 'WORK_IN_PROCESS', // 仕掛品
  RAW_MATERIALS = 'RAW_MATERIALS', // 原材料
  SUPPLIES = 'SUPPLIES', // 貯蔵品
  SHORT_TERM_LOANS_RECEIVABLE = 'SHORT_TERM_LOANS_RECEIVABLE', // 短期貸付金
  PREPAID_EXPENSES = 'PREPAID_EXPENSES', // 前払費用
  ADVANCE_PAYMENTS = 'ADVANCE_PAYMENTS', // 前渡金
  DEFERRED_TAX_ASSETS_CURRENT = 'DEFERRED_TAX_ASSETS_CURRENT', // 繰延税金資産（流動）
  ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_CA = 'ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_CA', // 貸倒引当金（流動控除）
  OTHER_CURRENT_ASSETS = 'OTHER_CURRENT_ASSETS', // その他流動資産

  // ===== BS：資産（固定資産：有形） =====
  PPE = 'PPE', // 有形固定資産（総称）
  BUILDINGS = 'BUILDINGS', // 建物
  STRUCTURES = 'STRUCTURES', // 構築物
  MACHINERY_AND_EQUIPMENT = 'MACHINERY_AND_EQUIPMENT', // 機械装置
  VEHICLES = 'VEHICLES', // 車両運搬具
  TOOLS_FURNITURE_FIXTURES = 'TOOLS_FURNITURE_FIXTURES', // 工具器具備品
  LAND = 'LAND', // 土地
  LEASE_ASSETS_TANGIBLE = 'LEASE_ASSETS_TANGIBLE', // リース資産（有形）
  CONSTRUCTION_IN_PROGRESS = 'CONSTRUCTION_IN_PROGRESS', // 建設仮勘定
  ACCUMULATED_DEPRECIATION = 'ACCUMULATED_DEPRECIATION', // 減価償却累計額（控除）

  // ===== BS：資産（固定資産：無形） =====
  INTANGIBLE = 'INTANGIBLE', // 無形固定資産（総称）
  GOODWILL = 'GOODWILL', // のれん
  SOFTWARE = 'SOFTWARE', // ソフトウェア
  SOFTWARE_IN_PROGRESS = 'SOFTWARE_IN_PROGRESS', // ソフトウェア仮勘定
  PATENT_RIGHTS = 'PATENT_RIGHTS', // 特許権
  TRADEMARK_RIGHTS = 'TRADEMARK_RIGHTS', // 商標権
  MINERAL_RIGHTS = 'MINERAL_RIGHTS', // 鉱業権
  LEASEHOLD_RIGHTS = 'LEASEHOLD_RIGHTS', // 借地権
  TELEPHONE_SUBSCRIPTION_RIGHTS = 'TELEPHONE_SUBSCRIPTION_RIGHTS', // 電話加入権
  INTANGIBLE_OTHER = 'INTANGIBLE_OTHER', // その他無形

  // ===== BS：資産（投資その他の資産） =====
  INVESTMENT_SECURITIES = 'INVESTMENT_SECURITIES', // 投資有価証券
  SHARES_OF_SUBSIDIARIES_AND_ASSOCIATES = 'SHARES_OF_SUBSIDIARIES_AND_ASSOCIATES', // 関連会社株式
  LONG_TERM_LOANS_RECEIVABLE = 'LONG_TERM_LOANS_RECEIVABLE', // 長期貸付金
  LONG_TERM_PREPAID_EXPENSES = 'LONG_TERM_PREPAID_EXPENSES', // 長期前払費用
  NET_DEFINED_BENEFIT_ASSET = 'NET_DEFINED_BENEFIT_ASSET', // 退職給付に係る資産
  DEFERRED_TAX_ASSETS_NONCURRENT = 'DEFERRED_TAX_ASSETS_NONCURRENT', // 繰延税金資産（固定）
  LONG_TERM_GUARANTEE_DEPOSITS = 'LONG_TERM_GUARANTEE_DEPOSITS', // 差入保証金・敷金（長期）
  OTHER_INVESTMENTS = 'OTHER_INVESTMENTS', // その他投資
  ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_NCA = 'ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_NCA', // 貸倒引当金（固定控除）

  // ===== BS：負債（流動負債） =====
  NOTES_PAYABLE_TRADE = 'NOTES_PAYABLE_TRADE', // 支払手形
  ACCOUNTS_PAYABLE_TRADE = 'ACCOUNTS_PAYABLE_TRADE', // 買掛金
  ACCOUNTS_PAYABLE = 'ACCOUNTS_PAYABLE_TRADE', // Alias for ACCOUNTS_PAYABLE_TRADE
  EROB_OPERATING = 'EROB_OPERATING', // 電子記録債務（営業）
  SHORT_TERM_BORROWINGS = 'SHORT_TERM_BORROWINGS', // 短期借入金
  CURRENT_PORTION_OF_LONG_TERM_BORROWINGS = 'CURRENT_PORTION_OF_LONG_TERM_BORROWINGS', // 1年内返済長期借入金
  ACCRUED_EXPENSES = 'ACCRUED_EXPENSES', // 未払費用
  INCOME_TAXES_PAYABLE = 'INCOME_TAXES_PAYABLE', // 未払法人税等
  ACCRUED_BONUSES = 'ACCRUED_BONUSES', // 未払賞与／賞与引当金（流動）
  PROVISION_FOR_PRODUCT_WARRANTIES = 'PROVISION_FOR_PRODUCT_WARRANTIES', // 製品保証引当金
  PROVISION_FOR_POINT_CARD = 'PROVISION_FOR_POINT_CARD', // ポイント引当金
  PROVISION_FOR_LOSS_ON_ORDERS = 'PROVISION_FOR_LOSS_ON_ORDERS', // 受注損失引当金
  ADVANCES_RECEIVED = 'ADVANCES_RECEIVED', // 前受金
  DEPOSITS_RECEIVED = 'DEPOSITS_RECEIVED', // 預り金
  LEASE_OBLIGATIONS_CURRENT = 'LEASE_OBLIGATIONS_CURRENT', // リース債務（流動）
  ASSET_RETIREMENT_OBLIGATIONS_CURRENT = 'ASSET_RETIREMENT_OBLIGATIONS_CURRENT', // 資産除去債務（流動）
  DEFERRED_TAX_LIABILITIES_CURRENT = 'DEFERRED_TAX_LIABILITIES_CURRENT', // 繰延税金負債（流動）
  OTHER_CURRENT_LIABILITIES = 'OTHER_CURRENT_LIABILITIES', // その他流動負債

  // ===== BS：負債（固定負債） =====
  BONDS_PAYABLE = 'BONDS_PAYABLE', // 社債
  LONG_TERM_BORROWINGS = 'LONG_TERM_BORROWINGS', // 長期借入金
  LONG_TERM_DEBT = 'LONG_TERM_BORROWINGS', // Alias for LONG_TERM_BORROWINGS
  LEASE_OBLIGATIONS_NONCURRENT = 'LEASE_OBLIGATIONS_NONCURRENT', // リース債務（固定）
  DEFERRED_TAX_LIABILITIES_NONCURRENT = 'DEFERRED_TAX_LIABILITIES_NONCURRENT', // 繰延税金負債（固定）
  RETIREMENT_BENEFIT_LIABILITY = 'RETIREMENT_BENEFIT_LIABILITY', // 退職給付に係る負債
  PROVISION_FOR_DIRECTORS_RETIREMENT = 'PROVISION_FOR_DIRECTORS_RETIREMENT', // 役員退職慰労引当金
  PROVISION_FOR_DISMANTLING_RESTORATION = 'PROVISION_FOR_DISMANTLING_RESTORATION', // 解体復元引当金 等
  ASSET_RETIREMENT_OBLIGATIONS_NONCURRENT = 'ASSET_RETIREMENT_OBLIGATIONS_NONCURRENT', // 資産除去債務（固定）
  LONG_TERM_DEPOSITS_RECEIVED = 'LONG_TERM_DEPOSITS_RECEIVED', // 長期預り金
  OTHER_NONCURRENT_LIABILITIES = 'OTHER_NONCURRENT_LIABILITIES', // その他固定負債

  // ===== BS：純資産（株主資本・その他） =====
  CAPITAL_STOCK = 'CAPITAL_STOCK', // 資本金
  CAPITAL_SURPLUS = 'CAPITAL_SURPLUS', // 資本剰余金
  ADDITIONAL_PAID_IN_CAPITAL = 'ADDITIONAL_PAID_IN_CAPITAL', // 追加払込資本（資本剰余金の内訳に使う場合）
  LEGAL_RETAINED_EARNINGS = 'LEGAL_RETAINED_EARNINGS', // 利益準備金（法定）
  RETAINED_EARNINGS = 'RETAINED_EARNINGS', // 利益剰余金
  RETAINED_EARNINGS_BROUGHT_FORWARD = 'RETAINED_EARNINGS_BROUGHT_FORWARD', // 繰越利益剰余金
  TREASURY_STOCK = 'TREASURY_STOCK', // 自己株式（控除）
  AOCI = 'AOCI', // その他の包括利益累計額（総称）
  VALUATION_DIFFERENCE_AVAILABLE_FOR_SALE = 'VALUATION_DIFFERENCE_AVAILABLE_FOR_SALE', // その他有価証券評価差額金
  DEFERRED_HEDGE_GAINS_LOSSES = 'DEFERRED_HEDGE_GAINS_LOSSES', // 繰延ヘッジ損益
  FOREIGN_CURRENCY_TRANSLATION_ADJUSTMENT = 'FOREIGN_CURRENCY_TRANSLATION_ADJUSTMENT', // 為替換算調整勘定
  REMEASUREMENTS_DEFINED_BENEFIT_PLANS = 'REMEASUREMENTS_DEFINED_BENEFIT_PLANS', // 退職給付に係る調整累計額
  SHARE_SUBSCRIPTION_RIGHTS = 'SHARE_SUBSCRIPTION_RIGHTS', // 新株予約権
  NON_CONTROLLING_INTERESTS = 'NON_CONTROLLING_INTERESTS', // 非支配株主持分

  // ===== PL：売上高～営業利益 =====
  NET_SALES = 'NET_SALES', // 売上高
  SALES = 'SALES', // （別名ID：互換用／必要な方を使用）
  COST_OF_SALES = 'COST_OF_SALES', // 売上原価
  COGS = 'COGS', // （別名ID：互換用）
  GROSS_PROFIT = 'GROSS_PROFIT', // 売上総利益（集計）
  SGA = 'SGA', // 販売費及び一般管理費
  DEPRECIATION = 'DEPRECIATION', // 減価償却費（PL）
  R_AND_D_EXPENSES = 'R_AND_D_EXPENSES', // 研究開発費
  PERSONNEL_EXPENSES_SGA = 'PERSONNEL_EXPENSES_SGA', // 人件費（販管費）
  OTHER_SGA = 'OTHER_SGA', // その他販管費
  OPERATING_INCOME = 'OPERATING_INCOME', // 営業利益
  OP_INCOME = 'OP_INCOME', // （別名ID：互換用）

  // ===== PL：営業外・経常・特別・税金・当期利益 =====
  NON_OPERATING_INCOME = 'NON_OPERATING_INCOME', // 営業外収益
  INTEREST_INCOME = 'INTEREST_INCOME', // 受取利息
  DIVIDEND_INCOME = 'DIVIDEND_INCOME', // 受取配当金
  EQUITY_IN_EARNINGS = 'EQUITY_IN_EARNINGS', // 持分法による投資利益
  FOREIGN_EXCHANGE_GAINS = 'FOREIGN_EXCHANGE_GAINS', // 為替差益
  OTHER_NON_OPERATING_INCOME = 'OTHER_NON_OPERATING_INCOME', // その他営業外収益

  NON_OPERATING_EXPENSES = 'NON_OPERATING_EXPENSES', // 営業外費用
  INTEREST_EXPENSES = 'INTEREST_EXPENSES', // 支払利息
  EQUITY_IN_LOSSES = 'EQUITY_IN_LOSSES', // 持分法による投資損失
  FOREIGN_EXCHANGE_LOSSES = 'FOREIGN_EXCHANGE_LOSSES', // 為替差損
  OTHER_NON_OPERATING_EXPENSES = 'OTHER_NON_OPERATING_EXPENSES', // その他営業外費用

  ORDINARY_INCOME = 'ORDINARY_INCOME', // 経常利益
  EXTRAORDINARY_INCOME = 'EXTRAORDINARY_INCOME', // 特別利益
  GAIN_ON_SALES_OF_NCA = 'GAIN_ON_SALES_OF_NCA', // 固定資産売却益
  GAIN_ON_SALES_OF_INVESTMENT_SECURITIES = 'GAIN_ON_SALES_OF_INVESTMENT_SECURITIES', // 投資有価証券売却益
  GAIN_ON_REVERSAL_OF_PROVISION = 'GAIN_ON_REVERSAL_OF_PROVISION', // 引当金戻入益
  GAIN_ON_BARGAIN_PURCHASE = 'GAIN_ON_BARGAIN_PURCHASE', // 負ののれん発生益

  EXTRAORDINARY_LOSSES = 'EXTRAORDINARY_LOSSES', // 特別損失
  LOSS_ON_SALES_RETIREMENT_OF_NCA = 'LOSS_ON_SALES_RETIREMENT_OF_NCA', // 固定資産売却損・除却損
  IMPAIRMENT_LOSS = 'IMPAIRMENT_LOSS', // 減損損失
  LOSS_ON_DISASTER = 'LOSS_ON_DISASTER', // 災害損失
  LOSS_ON_VALUATION_OF_INVESTMENT_SECURITIES = 'LOSS_ON_VALUATION_OF_INVESTMENT_SECURITIES', // 投資有価証券評価損
  PROVISION_FOR_LITIGATION = 'PROVISION_FOR_LITIGATION', // 訴訟引当金繰入

  INCOME_BEFORE_INCOME_TAXES = 'INCOME_BEFORE_INCOME_TAXES', // 税金等調整前当期純利益
  INCOME_TAXES_CURRENT = 'INCOME_TAXES_CURRENT', // 法人税等（当期）
  INCOME_TAXES_DEFERRED = 'INCOME_TAXES_DEFERRED', // 法人税等（繰延）
  PROFIT = 'PROFIT', // 当期純利益（損失）
  PROFIT_ATTRIBUTABLE_TO_OWNERS = 'PROFIT_ATTRIBUTABLE_TO_OWNERS', // 親会社株主に帰属する当期純利益
  PROFIT_ATTRIBUTABLE_TO_NCI = 'PROFIT_ATTRIBUTABLE_TO_NCI', // 非支配株主に帰属する当期純利益

  // ===== CF：キャッシュ・フロー（見出し・主要行） =====
  CCE_BEGINNING = 'CCE_BEGINNING', // 期首現金及び現金同等物
  CFO = 'CFO', // 営業活動によるキャッシュ・フロー
  CFI = 'CFI', // 投資活動によるキャッシュ・フロー
  CFF = 'CFF', // 財務活動によるキャッシュ・フロー
  EFFECT_OF_EXCHANGE_RATE_ON_CCE = 'EFFECT_OF_EXCHANGE_RATE_ON_CCE', // 為替換算による現金及び現金同等物の影響
  NET_INCREASE_DECREASE_IN_CCE = 'NET_INCREASE_DECREASE_IN_CCE', // 現金及び現金同等物の増減額
  CCE_ENDING = 'CCE_ENDING', // 期末現金及び現金同等物

  // ===== CF：典型明細（必要に応じて使用） =====
  CF_DEPRECIATION_AMORTIZATION = 'CF_DEPRECIATION_AMORTIZATION', // 減価償却費・償却
  CF_IMPAIRMENT_LOSS = 'CF_IMPAIRMENT_LOSS', // 減損損失
  CF_INCR_DECR_TRADE_RECEIVABLES = 'CF_INCR_DECR_TRADE_RECEIVABLES', // 受取債権の増減
  CF_INCR_DECR_INVENTORIES = 'CF_INCR_DECR_INVENTORIES', // 棚卸資産の増減
  CF_INCR_DECR_TRADE_PAYABLES = 'CF_INCR_DECR_TRADE_PAYABLES', // 仕入債務の増減
  CF_INTEREST_DIVIDENDS_RECEIVED = 'CF_INTEREST_DIVIDENDS_RECEIVED', // 受取利息・配当金
  CF_INTEREST_PAID = 'CF_INTEREST_PAID', // 支払利息
  CF_INCOME_TAXES_PAID = 'CF_INCOME_TAXES_PAID', // 法人税等の支払額
  CF_PURCHASE_OF_PPE = 'CF_PURCHASE_OF_PPE', // 有形固定資産の取得（CAPEX）
  CF_PROCEEDS_FROM_SALES_OF_PPE = 'CF_PROCEEDS_FROM_SALES_OF_PPE', // 有形固定資産の売却
  CF_PURCHASE_OF_INTANGIBLES = 'CF_PURCHASE_OF_INTANGIBLES', // 無形固定資産の取得
  CF_PURCHASE_OF_INVESTMENT_SECURITIES = 'CF_PURCHASE_OF_INVESTMENT_SECURITIES', // 投資有価証券の取得
  CF_SALE_OF_INVESTMENT_SECURITIES = 'CF_SALE_OF_INVESTMENT_SECURITIES', // 投資有価証券の売却
  CF_PROCEEDS_LONG_TERM_DEBT = 'CF_PROCEEDS_LONG_TERM_DEBT', // 長期借入による収入
  CF_REPAYMENTS_LONG_TERM_DEBT = 'CF_REPAYMENTS_LONG_TERM_DEBT', // 長期借入金の返済
  CF_PROCEEDS_ISSUANCE_BONDS = 'CF_PROCEEDS_ISSUANCE_BONDS', // 社債の発行による収入
  CF_REDEMPTION_OF_BONDS = 'CF_REDEMPTION_OF_BONDS', // 社債の償還による支出
  CF_DIVIDENDS_PAID = 'CF_DIVIDENDS_PAID', // 配当金の支払額
  CF_PURCHASE_OF_TREASURY_STOCK = 'CF_PURCHASE_OF_TREASURY_STOCK', // 自己株式の取得
  CF_PROCEEDS_DISPOSAL_TREASURY_STOCK = 'CF_PROCEEDS_DISPOSAL_TREASURY_STOCK', // 自己株式の処分
  CF_PROCEEDS_ISSUANCE_SHARES = 'CF_PROCEEDS_ISSUANCE_SHARES', // 株式の発行による収入
  CF_PAYMENTS_FOR_ACQ_SUBSIDIARIES = 'CF_PAYMENTS_FOR_ACQ_SUBSIDIARIES', // 子会社取得による支出
  CF_PROCEEDS_DISPOSAL_SUBSIDIARIES = 'CF_PROCEEDS_DISPOSAL_SUBSIDIARIES', // 子会社売却による収入

  // ===== PP&E 補助スケジュール（固定資産ロールフォワード） =====
  PPE_OPENING_BALANCE_GROSS = 'PPE_OPENING_BALANCE_GROSS', // 期首帳簿価額（総額）
  PPE_ADDITIONS = 'PPE_ADDITIONS', // 取得（増加）
  PPE_DISPOSALS = 'PPE_DISPOSALS', // 売却・除却（減少）
  PPE_IMPAIRMENT = 'PPE_IMPAIRMENT', // 減損（減少）
  PPE_DEPRECIATION_SCH = 'PPE_DEPRECIATION_SCH', // 減価償却（スケジュール行）
  PPE_OTHER_CHANGES = 'PPE_OTHER_CHANGES', // その他増減
  PPE_CLOSING_BALANCE_GROSS = 'PPE_CLOSING_BALANCE_GROSS', // 期末帳簿価額（総額）

  ACCUM_DEPR_OPENING = 'ACCUM_DEPR_OPENING', // 期首減価償却累計額
  ACCUM_DEPR_INCREASE = 'ACCUM_DEPR_INCREASE', // 減価償却累計額の増加
  ACCUM_DEPR_DECREASE = 'ACCUM_DEPR_DECREASE', // 減価償却累計額の減少（除却 等）
  ACCUM_DEPR_CLOSING = 'ACCUM_DEPR_CLOSING', // 期末減価償却累計額

  PPE_NET_OPENING = 'PPE_NET_OPENING', // 期首帳簿価額（純額）
  PPE_NET_CLOSING = 'PPE_NET_CLOSING', // 期末帳簿価額（純額）
}

export interface GlobalAccountDef {
  id: GAID;
  defaultNameJa: string;
  defaultNameEn: string;
  sheet: FsType[];
  normalSide: NormalSide;
  parentId?: GAID; // 階層表示や集計のための任意の親ID
}

// ヘルパ
const A = (
  id: GAID,
  ja: string,
  en: string,
  sheet: FsType | FsType[],
  side: NormalSide,
  parentId?: GAID
): GlobalAccountDef => ({
  id,
  defaultNameJa: ja,
  defaultNameEn: en,
  sheet: Array.isArray(sheet) ? sheet : [sheet],
  normalSide: side,
  parentId,
});

// 仕訳上の基本方向
const D: NormalSide = 'DEBIT';
const C: NormalSide = 'CREDIT';
const N: NormalSide = 'NONE';

// 主要な親ノード（表示用の論理グループ）
const P_BS_ASSETS = GAID.ASSETS;
const P_BS_LIAB = GAID.LIABILITIES;
const P_BS_EQUITY = GAID.EQUITY;
const P_PL_OP = GAID.OPERATING_INCOME;
const P_PL_ORD = GAID.ORDINARY_INCOME;
const P_CF = GAID.CFO;
const P_PPE = GAID.PPE_OPENING_BALANCE_GROSS;

// 定義本体
export const GLOBAL_ACCOUNTS: Readonly<Record<GAID, GlobalAccountDef>> =
  Object.freeze({
    // BS：資産（流動）
    [GAID.ASSETS]: A(GAID.ASSETS, '資産', 'Assets', 'BS', N),
    [GAID.LIABILITIES]: A(GAID.LIABILITIES, '負債', 'Liabilities', 'BS', N),
    [GAID.EQUITY]: A(GAID.EQUITY, '純資産', 'Equity', 'BS', N),

    [GAID.CASH]: A(
      GAID.CASH,
      '現金及び預金',
      'Cash and deposits',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.NOTES_RECEIVABLE_TRADE]: A(
      GAID.NOTES_RECEIVABLE_TRADE,
      '受取手形',
      'Notes receivable - trade',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.ACCOUNTS_RECEIVABLE_TRADE]: A(
      GAID.ACCOUNTS_RECEIVABLE_TRADE,
      '売掛金',
      'Accounts receivable - trade',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.ERMC_OPERATING]: A(
      GAID.ERMC_OPERATING,
      '電子記録債権（営業）',
      'Electronically recorded monetary claims (operating)',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.SECURITIES_SHORT_TERM]: A(
      GAID.SECURITIES_SHORT_TERM,
      '有価証券（流動）',
      'Short-term securities',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.INVENTORIES]: A(
      GAID.INVENTORIES,
      '棚卸資産',
      'Inventories',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.WORK_IN_PROCESS]: A(
      GAID.WORK_IN_PROCESS,
      '仕掛品',
      'Work in process',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.RAW_MATERIALS]: A(
      GAID.RAW_MATERIALS,
      '原材料',
      'Raw materials',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.SUPPLIES]: A(
      GAID.SUPPLIES,
      '貯蔵品',
      'Supplies',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.SHORT_TERM_LOANS_RECEIVABLE]: A(
      GAID.SHORT_TERM_LOANS_RECEIVABLE,
      '短期貸付金',
      'Short-term loans receivable',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.PREPAID_EXPENSES]: A(
      GAID.PREPAID_EXPENSES,
      '前払費用',
      'Prepaid expenses',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.ADVANCE_PAYMENTS]: A(
      GAID.ADVANCE_PAYMENTS,
      '前渡金',
      'Advance payments',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.DEFERRED_TAX_ASSETS_CURRENT]: A(
      GAID.DEFERRED_TAX_ASSETS_CURRENT,
      '繰延税金資産（流動）',
      'Deferred tax assets (current)',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_CA]: A(
      GAID.ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_CA,
      '貸倒引当金（流動控除）',
      'Allowance for doubtful accounts (current - contra)',
      'BS',
      C,
      P_BS_ASSETS
    ),
    [GAID.OTHER_CURRENT_ASSETS]: A(
      GAID.OTHER_CURRENT_ASSETS,
      'その他流動資産',
      'Other current assets',
      'BS',
      D,
      P_BS_ASSETS
    ),

    // BS：資産（固定・有形）
    [GAID.PPE]: A(
      GAID.PPE,
      '有形固定資産',
      'Property, plant and equipment',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.BUILDINGS]: A(GAID.BUILDINGS, '建物', 'Buildings', 'BS', D, GAID.PPE),
    [GAID.STRUCTURES]: A(
      GAID.STRUCTURES,
      '構築物',
      'Structures',
      'BS',
      D,
      GAID.PPE
    ),
    [GAID.MACHINERY_AND_EQUIPMENT]: A(
      GAID.MACHINERY_AND_EQUIPMENT,
      '機械装置',
      'Machinery and equipment',
      'BS',
      D,
      GAID.PPE
    ),
    [GAID.VEHICLES]: A(
      GAID.VEHICLES,
      '車両運搬具',
      'Vehicles',
      'BS',
      D,
      GAID.PPE
    ),
    [GAID.TOOLS_FURNITURE_FIXTURES]: A(
      GAID.TOOLS_FURNITURE_FIXTURES,
      '工具器具備品',
      'Tools, furniture and fixtures',
      'BS',
      D,
      GAID.PPE
    ),
    [GAID.LAND]: A(GAID.LAND, '土地', 'Land', 'BS', D, GAID.PPE),
    [GAID.LEASE_ASSETS_TANGIBLE]: A(
      GAID.LEASE_ASSETS_TANGIBLE,
      'リース資産（有形）',
      'Lease assets (tangible)',
      'BS',
      D,
      GAID.PPE
    ),
    [GAID.CONSTRUCTION_IN_PROGRESS]: A(
      GAID.CONSTRUCTION_IN_PROGRESS,
      '建設仮勘定',
      'Construction in progress',
      'BS',
      D,
      GAID.PPE
    ),
    [GAID.ACCUMULATED_DEPRECIATION]: A(
      GAID.ACCUMULATED_DEPRECIATION,
      '減価償却累計額',
      'Accumulated depreciation (contra)',
      'BS',
      C,
      GAID.PPE
    ),

    // BS：資産（固定・無形）
    [GAID.INTANGIBLE]: A(
      GAID.INTANGIBLE,
      '無形固定資産',
      'Intangible assets',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.GOODWILL]: A(
      GAID.GOODWILL,
      'のれん',
      'Goodwill',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.SOFTWARE]: A(
      GAID.SOFTWARE,
      'ソフトウェア',
      'Software',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.SOFTWARE_IN_PROGRESS]: A(
      GAID.SOFTWARE_IN_PROGRESS,
      'ソフトウェア仮勘定',
      'Software in progress',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.PATENT_RIGHTS]: A(
      GAID.PATENT_RIGHTS,
      '特許権',
      'Patent rights',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.TRADEMARK_RIGHTS]: A(
      GAID.TRADEMARK_RIGHTS,
      '商標権',
      'Trademark rights',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.MINERAL_RIGHTS]: A(
      GAID.MINERAL_RIGHTS,
      '鉱業権',
      'Mineral rights',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.LEASEHOLD_RIGHTS]: A(
      GAID.LEASEHOLD_RIGHTS,
      '借地権',
      'Leasehold rights',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.TELEPHONE_SUBSCRIPTION_RIGHTS]: A(
      GAID.TELEPHONE_SUBSCRIPTION_RIGHTS,
      '電話加入権',
      'Telephone subscription rights',
      'BS',
      D,
      GAID.INTANGIBLE
    ),
    [GAID.INTANGIBLE_OTHER]: A(
      GAID.INTANGIBLE_OTHER,
      'その他無形',
      'Other intangible',
      'BS',
      D,
      GAID.INTANGIBLE
    ),

    // BS：資産（投資その他）
    [GAID.INVESTMENT_SECURITIES]: A(
      GAID.INVESTMENT_SECURITIES,
      '投資有価証券',
      'Investment securities',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.SHARES_OF_SUBSIDIARIES_AND_ASSOCIATES]: A(
      GAID.SHARES_OF_SUBSIDIARIES_AND_ASSOCIATES,
      '関係会社株式',
      'Shares of subsidiaries and associates',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.LONG_TERM_LOANS_RECEIVABLE]: A(
      GAID.LONG_TERM_LOANS_RECEIVABLE,
      '長期貸付金',
      'Long-term loans receivable',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.LONG_TERM_PREPAID_EXPENSES]: A(
      GAID.LONG_TERM_PREPAID_EXPENSES,
      '長期前払費用',
      'Long-term prepaid expenses',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.NET_DEFINED_BENEFIT_ASSET]: A(
      GAID.NET_DEFINED_BENEFIT_ASSET,
      '退職給付に係る資産',
      'Net defined benefit asset',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.DEFERRED_TAX_ASSETS_NONCURRENT]: A(
      GAID.DEFERRED_TAX_ASSETS_NONCURRENT,
      '繰延税金資産（固定）',
      'Deferred tax assets (noncurrent)',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.LONG_TERM_GUARANTEE_DEPOSITS]: A(
      GAID.LONG_TERM_GUARANTEE_DEPOSITS,
      '長期差入保証金',
      'Long-term guarantee deposits',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.OTHER_INVESTMENTS]: A(
      GAID.OTHER_INVESTMENTS,
      'その他投資',
      'Other investments and assets',
      'BS',
      D,
      P_BS_ASSETS
    ),
    [GAID.ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_NCA]: A(
      GAID.ALLOWANCE_FOR_DOUBTFUL_ACCOUNTS_NCA,
      '貸倒引当金（固定控除）',
      'Allowance for doubtful accounts (noncurrent - contra)',
      'BS',
      C,
      P_BS_ASSETS
    ),

    // BS：負債（流動）
    [GAID.NOTES_PAYABLE_TRADE]: A(
      GAID.NOTES_PAYABLE_TRADE,
      '支払手形',
      'Notes payable - trade',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.ACCOUNTS_PAYABLE_TRADE]: A(
      GAID.ACCOUNTS_PAYABLE_TRADE,
      '買掛金',
      'Accounts payable - trade',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.EROB_OPERATING]: A(
      GAID.EROB_OPERATING,
      '電子記録債務（営業）',
      'Electronically recorded obligations (operating)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.SHORT_TERM_BORROWINGS]: A(
      GAID.SHORT_TERM_BORROWINGS,
      '短期借入金',
      'Short-term borrowings',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.CURRENT_PORTION_OF_LONG_TERM_BORROWINGS]: A(
      GAID.CURRENT_PORTION_OF_LONG_TERM_BORROWINGS,
      '1年内返済長期借入金',
      'Current portion of long-term borrowings',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.ACCRUED_EXPENSES]: A(
      GAID.ACCRUED_EXPENSES,
      '未払費用',
      'Accrued expenses',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.INCOME_TAXES_PAYABLE]: A(
      GAID.INCOME_TAXES_PAYABLE,
      '未払法人税等',
      'Income taxes payable',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.ACCRUED_BONUSES]: A(
      GAID.ACCRUED_BONUSES,
      '未払賞与／賞与引当金（流動）',
      'Accrued bonuses / provision for bonuses (current)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.PROVISION_FOR_PRODUCT_WARRANTIES]: A(
      GAID.PROVISION_FOR_PRODUCT_WARRANTIES,
      '製品保証引当金',
      'Provision for product warranties',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.PROVISION_FOR_POINT_CARD]: A(
      GAID.PROVISION_FOR_POINT_CARD,
      'ポイント引当金',
      'Provision for point card certificates',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.PROVISION_FOR_LOSS_ON_ORDERS]: A(
      GAID.PROVISION_FOR_LOSS_ON_ORDERS,
      '受注損失引当金',
      'Provision for loss on orders',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.ADVANCES_RECEIVED]: A(
      GAID.ADVANCES_RECEIVED,
      '前受金',
      'Advances received',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.DEPOSITS_RECEIVED]: A(
      GAID.DEPOSITS_RECEIVED,
      '預り金',
      'Deposits received',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.LEASE_OBLIGATIONS_CURRENT]: A(
      GAID.LEASE_OBLIGATIONS_CURRENT,
      'リース債務（流動）',
      'Lease obligations (current)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.ASSET_RETIREMENT_OBLIGATIONS_CURRENT]: A(
      GAID.ASSET_RETIREMENT_OBLIGATIONS_CURRENT,
      '資産除去債務（流動）',
      'Asset retirement obligations (current)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.DEFERRED_TAX_LIABILITIES_CURRENT]: A(
      GAID.DEFERRED_TAX_LIABILITIES_CURRENT,
      '繰延税金負債（流動）',
      'Deferred tax liabilities (current)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.OTHER_CURRENT_LIABILITIES]: A(
      GAID.OTHER_CURRENT_LIABILITIES,
      'その他流動負債',
      'Other current liabilities',
      'BS',
      C,
      P_BS_LIAB
    ),

    // BS：負債（固定）
    [GAID.BONDS_PAYABLE]: A(
      GAID.BONDS_PAYABLE,
      '社債',
      'Bonds payable',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.LONG_TERM_BORROWINGS]: A(
      GAID.LONG_TERM_BORROWINGS,
      '長期借入金',
      'Long-term borrowings',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.LEASE_OBLIGATIONS_NONCURRENT]: A(
      GAID.LEASE_OBLIGATIONS_NONCURRENT,
      'リース債務（固定）',
      'Lease obligations (noncurrent)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.DEFERRED_TAX_LIABILITIES_NONCURRENT]: A(
      GAID.DEFERRED_TAX_LIABILITIES_NONCURRENT,
      '繰延税金負債（固定）',
      'Deferred tax liabilities (noncurrent)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.RETIREMENT_BENEFIT_LIABILITY]: A(
      GAID.RETIREMENT_BENEFIT_LIABILITY,
      '退職給付に係る負債',
      'Retirement benefit liability',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.PROVISION_FOR_DIRECTORS_RETIREMENT]: A(
      GAID.PROVISION_FOR_DIRECTORS_RETIREMENT,
      '役員退職慰労引当金',
      'Provision for directors’ retirement benefits',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.PROVISION_FOR_DISMANTLING_RESTORATION]: A(
      GAID.PROVISION_FOR_DISMANTLING_RESTORATION,
      '解体復元引当金 等',
      'Provision for dismantling/restoration',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.ASSET_RETIREMENT_OBLIGATIONS_NONCURRENT]: A(
      GAID.ASSET_RETIREMENT_OBLIGATIONS_NONCURRENT,
      '資産除去債務（固定）',
      'Asset retirement obligations (noncurrent)',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.LONG_TERM_DEPOSITS_RECEIVED]: A(
      GAID.LONG_TERM_DEPOSITS_RECEIVED,
      '長期預り金',
      'Long-term deposits received',
      'BS',
      C,
      P_BS_LIAB
    ),
    [GAID.OTHER_NONCURRENT_LIABILITIES]: A(
      GAID.OTHER_NONCURRENT_LIABILITIES,
      'その他固定負債',
      'Other noncurrent liabilities',
      'BS',
      C,
      P_BS_LIAB
    ),

    // BS：純資産
    [GAID.CAPITAL_STOCK]: A(
      GAID.CAPITAL_STOCK,
      '資本金',
      'Capital stock',
      'BS',
      C,
      P_BS_EQUITY
    ),
    [GAID.CAPITAL_SURPLUS]: A(
      GAID.CAPITAL_SURPLUS,
      '資本剰余金',
      'Capital surplus',
      'BS',
      C,
      P_BS_EQUITY
    ),
    [GAID.ADDITIONAL_PAID_IN_CAPITAL]: A(
      GAID.ADDITIONAL_PAID_IN_CAPITAL,
      '追加払込資本',
      'Additional paid-in capital',
      'BS',
      C,
      GAID.CAPITAL_SURPLUS
    ),
    [GAID.LEGAL_RETAINED_EARNINGS]: A(
      GAID.LEGAL_RETAINED_EARNINGS,
      '利益準備金',
      'Legal retained earnings',
      'BS',
      C,
      GAID.RETAINED_EARNINGS
    ),
    [GAID.RETAINED_EARNINGS]: A(
      GAID.RETAINED_EARNINGS,
      '利益剰余金',
      'Retained earnings',
      'BS',
      C,
      P_BS_EQUITY
    ),
    [GAID.RETAINED_EARNINGS_BROUGHT_FORWARD]: A(
      GAID.RETAINED_EARNINGS_BROUGHT_FORWARD,
      '繰越利益剰余金',
      'Retained earnings brought forward',
      'BS',
      C,
      GAID.RETAINED_EARNINGS
    ),
    [GAID.TREASURY_STOCK]: A(
      GAID.TREASURY_STOCK,
      '自己株式（控除）',
      'Treasury stock (contra)',
      'BS',
      D,
      P_BS_EQUITY
    ),
    [GAID.AOCI]: A(
      GAID.AOCI,
      'その他の包括利益累計額',
      'Accumulated other comprehensive income',
      'BS',
      C,
      P_BS_EQUITY
    ),
    [GAID.VALUATION_DIFFERENCE_AVAILABLE_FOR_SALE]: A(
      GAID.VALUATION_DIFFERENCE_AVAILABLE_FOR_SALE,
      'その他有価証券評価差額金',
      'Valuation difference on AFS securities',
      'BS',
      C,
      GAID.AOCI
    ),
    [GAID.DEFERRED_HEDGE_GAINS_LOSSES]: A(
      GAID.DEFERRED_HEDGE_GAINS_LOSSES,
      '繰延ヘッジ損益',
      'Deferred hedge gains (losses)',
      'BS',
      C,
      GAID.AOCI
    ),
    [GAID.FOREIGN_CURRENCY_TRANSLATION_ADJUSTMENT]: A(
      GAID.FOREIGN_CURRENCY_TRANSLATION_ADJUSTMENT,
      '為替換算調整勘定',
      'Foreign currency translation adjustment',
      'BS',
      C,
      GAID.AOCI
    ),
    [GAID.REMEASUREMENTS_DEFINED_BENEFIT_PLANS]: A(
      GAID.REMEASUREMENTS_DEFINED_BENEFIT_PLANS,
      '退職給付に係る調整累計額',
      'Remeasurements of defined benefit plans',
      'BS',
      C,
      GAID.AOCI
    ),
    [GAID.SHARE_SUBSCRIPTION_RIGHTS]: A(
      GAID.SHARE_SUBSCRIPTION_RIGHTS,
      '新株予約権',
      'Share subscription rights',
      'BS',
      C,
      P_BS_EQUITY
    ),
    [GAID.NON_CONTROLLING_INTERESTS]: A(
      GAID.NON_CONTROLLING_INTERESTS,
      '非支配株主持分',
      'Non-controlling interests',
      'BS',
      C,
      P_BS_EQUITY
    ),

    // PL：売上～営業
    [GAID.NET_SALES]: A(
      GAID.NET_SALES,
      '売上高',
      'Net sales',
      'PL',
      C,
      GAID.GROSS_PROFIT
    ),
    [GAID.SALES]: A(
      GAID.SALES,
      '売上高（互換ID）',
      'Sales (alias)',
      'PL',
      C,
      GAID.GROSS_PROFIT
    ),
    [GAID.COST_OF_SALES]: A(
      GAID.COST_OF_SALES,
      '売上原価',
      'Cost of sales',
      'PL',
      D,
      GAID.GROSS_PROFIT
    ),
    [GAID.COGS]: A(
      GAID.COGS,
      '売上原価（互換ID）',
      'COGS (alias)',
      'PL',
      D,
      GAID.GROSS_PROFIT
    ),
    [GAID.GROSS_PROFIT]: A(
      GAID.GROSS_PROFIT,
      '売上総利益',
      'Gross profit',
      'PL',
      N,
      P_PL_OP
    ),
    [GAID.SGA]: A(
      GAID.SGA,
      '販売費及び一般管理費',
      'Selling, general and administrative expenses',
      'PL',
      D,
      P_PL_OP
    ),
    [GAID.DEPRECIATION]: A(
      GAID.DEPRECIATION,
      '減価償却費（PL）',
      'Depreciation (PL)',
      'PL',
      D,
      P_PL_OP
    ),
    [GAID.R_AND_D_EXPENSES]: A(
      GAID.R_AND_D_EXPENSES,
      '研究開発費',
      'R&D expenses',
      'PL',
      D,
      P_PL_OP
    ),
    [GAID.PERSONNEL_EXPENSES_SGA]: A(
      GAID.PERSONNEL_EXPENSES_SGA,
      '人件費（販管費）',
      'Personnel expenses (SG&A)',
      'PL',
      D,
      P_PL_OP
    ),
    [GAID.OTHER_SGA]: A(
      GAID.OTHER_SGA,
      'その他販管費',
      'Other SG&A',
      'PL',
      D,
      P_PL_OP
    ),
    [GAID.OPERATING_INCOME]: A(
      GAID.OPERATING_INCOME,
      '営業利益',
      'Operating income',
      'PL',
      N
    ),
    [GAID.OP_INCOME]: A(
      GAID.OP_INCOME,
      '営業利益（互換ID）',
      'Operating income (alias)',
      'PL',
      N
    ),

    // PL：営業外～特別～税金～純利益
    [GAID.NON_OPERATING_INCOME]: A(
      GAID.NON_OPERATING_INCOME,
      '営業外収益',
      'Non-operating income',
      'PL',
      C,
      P_PL_ORD
    ),
    [GAID.INTEREST_INCOME]: A(
      GAID.INTEREST_INCOME,
      '受取利息',
      'Interest income',
      'PL',
      C,
      GAID.NON_OPERATING_INCOME
    ),
    [GAID.DIVIDEND_INCOME]: A(
      GAID.DIVIDEND_INCOME,
      '受取配当金',
      'Dividend income',
      'PL',
      C,
      GAID.NON_OPERATING_INCOME
    ),
    [GAID.EQUITY_IN_EARNINGS]: A(
      GAID.EQUITY_IN_EARNINGS,
      '持分法による投資利益',
      'Share of profit of entities accounted for using equity method',
      'PL',
      C,
      GAID.NON_OPERATING_INCOME
    ),
    [GAID.FOREIGN_EXCHANGE_GAINS]: A(
      GAID.FOREIGN_EXCHANGE_GAINS,
      '為替差益',
      'Foreign exchange gains',
      'PL',
      C,
      GAID.NON_OPERATING_INCOME
    ),
    [GAID.OTHER_NON_OPERATING_INCOME]: A(
      GAID.OTHER_NON_OPERATING_INCOME,
      'その他営業外収益',
      'Other non-operating income',
      'PL',
      C,
      GAID.NON_OPERATING_INCOME
    ),

    [GAID.NON_OPERATING_EXPENSES]: A(
      GAID.NON_OPERATING_EXPENSES,
      '営業外費用',
      'Non-operating expenses',
      'PL',
      D,
      P_PL_ORD
    ),
    [GAID.INTEREST_EXPENSES]: A(
      GAID.INTEREST_EXPENSES,
      '支払利息',
      'Interest expenses',
      'PL',
      D,
      GAID.NON_OPERATING_EXPENSES
    ),
    [GAID.EQUITY_IN_LOSSES]: A(
      GAID.EQUITY_IN_LOSSES,
      '持分法による投資損失',
      'Share of loss of entities accounted for using equity method',
      'PL',
      D,
      GAID.NON_OPERATING_EXPENSES
    ),
    [GAID.FOREIGN_EXCHANGE_LOSSES]: A(
      GAID.FOREIGN_EXCHANGE_LOSSES,
      '為替差損',
      'Foreign exchange losses',
      'PL',
      D,
      GAID.NON_OPERATING_EXPENSES
    ),
    [GAID.OTHER_NON_OPERATING_EXPENSES]: A(
      GAID.OTHER_NON_OPERATING_EXPENSES,
      'その他営業外費用',
      'Other non-operating expenses',
      'PL',
      D,
      GAID.NON_OPERATING_EXPENSES
    ),

    [GAID.ORDINARY_INCOME]: A(
      GAID.ORDINARY_INCOME,
      '経常利益',
      'Ordinary income',
      'PL',
      N
    ),

    [GAID.EXTRAORDINARY_INCOME]: A(
      GAID.EXTRAORDINARY_INCOME,
      '特別利益',
      'Extraordinary income',
      'PL',
      C
    ),
    [GAID.GAIN_ON_SALES_OF_NCA]: A(
      GAID.GAIN_ON_SALES_OF_NCA,
      '固定資産売却益',
      'Gain on sales of noncurrent assets',
      'PL',
      C,
      GAID.EXTRAORDINARY_INCOME
    ),
    [GAID.GAIN_ON_SALES_OF_INVESTMENT_SECURITIES]: A(
      GAID.GAIN_ON_SALES_OF_INVESTMENT_SECURITIES,
      '投資有価証券売却益',
      'Gain on sales of investment securities',
      'PL',
      C,
      GAID.EXTRAORDINARY_INCOME
    ),
    [GAID.GAIN_ON_REVERSAL_OF_PROVISION]: A(
      GAID.GAIN_ON_REVERSAL_OF_PROVISION,
      '引当金戻入益',
      'Reversal of provision',
      'PL',
      C,
      GAID.EXTRAORDINARY_INCOME
    ),
    [GAID.GAIN_ON_BARGAIN_PURCHASE]: A(
      GAID.GAIN_ON_BARGAIN_PURCHASE,
      '負ののれん発生益',
      'Gain on bargain purchase',
      'PL',
      C,
      GAID.EXTRAORDINARY_INCOME
    ),

    [GAID.EXTRAORDINARY_LOSSES]: A(
      GAID.EXTRAORDINARY_LOSSES,
      '特別損失',
      'Extraordinary losses',
      'PL',
      D
    ),
    [GAID.LOSS_ON_SALES_RETIREMENT_OF_NCA]: A(
      GAID.LOSS_ON_SALES_RETIREMENT_OF_NCA,
      '固定資産売却・除却損',
      'Loss on sales/retirement of noncurrent assets',
      'PL',
      D,
      GAID.EXTRAORDINARY_LOSSES
    ),
    [GAID.IMPAIRMENT_LOSS]: A(
      GAID.IMPAIRMENT_LOSS,
      '減損損失',
      'Impairment loss',
      'PL',
      D,
      GAID.EXTRAORDINARY_LOSSES
    ),
    [GAID.LOSS_ON_DISASTER]: A(
      GAID.LOSS_ON_DISASTER,
      '災害損失',
      'Loss on disaster',
      'PL',
      D,
      GAID.EXTRAORDINARY_LOSSES
    ),
    [GAID.LOSS_ON_VALUATION_OF_INVESTMENT_SECURITIES]: A(
      GAID.LOSS_ON_VALUATION_OF_INVESTMENT_SECURITIES,
      '投資有価証券評価損',
      'Loss on valuation of investment securities',
      'PL',
      D,
      GAID.EXTRAORDINARY_LOSSES
    ),
    [GAID.PROVISION_FOR_LITIGATION]: A(
      GAID.PROVISION_FOR_LITIGATION,
      '訴訟引当金繰入',
      'Provision for litigation',
      'PL',
      D,
      GAID.EXTRAORDINARY_LOSSES
    ),

    [GAID.INCOME_BEFORE_INCOME_TAXES]: A(
      GAID.INCOME_BEFORE_INCOME_TAXES,
      '税金等調整前当期純利益',
      'Income before income taxes',
      'PL',
      N
    ),
    [GAID.INCOME_TAXES_CURRENT]: A(
      GAID.INCOME_TAXES_CURRENT,
      '法人税等（当期）',
      'Income taxes - current',
      'PL',
      D
    ),
    [GAID.INCOME_TAXES_DEFERRED]: A(
      GAID.INCOME_TAXES_DEFERRED,
      '法人税等（繰延）',
      'Income taxes - deferred',
      'PL',
      D
    ),
    [GAID.PROFIT]: A(
      GAID.PROFIT,
      '当期純利益（損失）',
      'Profit (loss)',
      'PL',
      N
    ),
    [GAID.PROFIT_ATTRIBUTABLE_TO_OWNERS]: A(
      GAID.PROFIT_ATTRIBUTABLE_TO_OWNERS,
      '親会社株主に帰属する当期純利益',
      'Profit attributable to owners of parent',
      'PL',
      N
    ),
    [GAID.PROFIT_ATTRIBUTABLE_TO_NCI]: A(
      GAID.PROFIT_ATTRIBUTABLE_TO_NCI,
      '非支配株主に帰属する当期純利益',
      'Profit attributable to non-controlling interests',
      'PL',
      N
    ),

    // CF：ヘッダ・主要行
    [GAID.CCE_BEGINNING]: A(
      GAID.CCE_BEGINNING,
      '期首現金及び現金同等物',
      'Cash and cash equivalents at beginning',
      'CF',
      N,
      P_CF
    ),
    [GAID.CFO]: A(
      GAID.CFO,
      '営業活動によるキャッシュ・フロー',
      'Cash flows from operating activities',
      'CF',
      N
    ),
    [GAID.CFI]: A(
      GAID.CFI,
      '投資活動によるキャッシュ・フロー',
      'Cash flows from investing activities',
      'CF',
      N
    ),
    [GAID.CFF]: A(
      GAID.CFF,
      '財務活動によるキャッシュ・フロー',
      'Cash flows from financing activities',
      'CF',
      N
    ),
    [GAID.EFFECT_OF_EXCHANGE_RATE_ON_CCE]: A(
      GAID.EFFECT_OF_EXCHANGE_RATE_ON_CCE,
      '為替換算による現金及び現金同等物の影響',
      'Effect of exchange rate changes on cash and cash equivalents',
      'CF',
      N,
      P_CF
    ),
    [GAID.NET_INCREASE_DECREASE_IN_CCE]: A(
      GAID.NET_INCREASE_DECREASE_IN_CCE,
      '現金及び現金同等物の増減額',
      'Net increase (decrease) in cash and cash equivalents',
      'CF',
      N,
      P_CF
    ),
    [GAID.CCE_ENDING]: A(
      GAID.CCE_ENDING,
      '期末現金及び現金同等物',
      'Cash and cash equivalents at end',
      'CF',
      N,
      P_CF
    ),

    // CF：典型明細
    [GAID.CF_DEPRECIATION_AMORTIZATION]: A(
      GAID.CF_DEPRECIATION_AMORTIZATION,
      '減価償却費等',
      'Depreciation and amortization',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_IMPAIRMENT_LOSS]: A(
      GAID.CF_IMPAIRMENT_LOSS,
      '減損損失',
      'Impairment loss',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_INCR_DECR_TRADE_RECEIVABLES]: A(
      GAID.CF_INCR_DECR_TRADE_RECEIVABLES,
      '受取債権の増減',
      'Increase (decrease) in trade receivables',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_INCR_DECR_INVENTORIES]: A(
      GAID.CF_INCR_DECR_INVENTORIES,
      '棚卸資産の増減',
      'Increase (decrease) in inventories',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_INCR_DECR_TRADE_PAYABLES]: A(
      GAID.CF_INCR_DECR_TRADE_PAYABLES,
      '仕入債務の増減',
      'Increase (decrease) in trade payables',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_INTEREST_DIVIDENDS_RECEIVED]: A(
      GAID.CF_INTEREST_DIVIDENDS_RECEIVED,
      '受取利息・配当金',
      'Interest and dividends received',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_INTEREST_PAID]: A(
      GAID.CF_INTEREST_PAID,
      '支払利息',
      'Interest paid',
      'CF',
      N,
      GAID.CFO
    ),
    [GAID.CF_INCOME_TAXES_PAID]: A(
      GAID.CF_INCOME_TAXES_PAID,
      '法人税等の支払額',
      'Income taxes paid',
      'CF',
      N,
      GAID.CFO
    ),

    [GAID.CF_PURCHASE_OF_PPE]: A(
      GAID.CF_PURCHASE_OF_PPE,
      '有形固定資産の取得',
      'Purchase of property, plant and equipment',
      'CF',
      N,
      GAID.CFI
    ),
    [GAID.CF_PROCEEDS_FROM_SALES_OF_PPE]: A(
      GAID.CF_PROCEEDS_FROM_SALES_OF_PPE,
      '有形固定資産の売却',
      'Proceeds from sales of property, plant and equipment',
      'CF',
      N,
      GAID.CFI
    ),
    [GAID.CF_PURCHASE_OF_INTANGIBLES]: A(
      GAID.CF_PURCHASE_OF_INTANGIBLES,
      '無形固定資産の取得',
      'Purchase of intangible assets',
      'CF',
      N,
      GAID.CFI
    ),
    [GAID.CF_PURCHASE_OF_INVESTMENT_SECURITIES]: A(
      GAID.CF_PURCHASE_OF_INVESTMENT_SECURITIES,
      '投資有価証券の取得',
      'Purchase of investment securities',
      'CF',
      N,
      GAID.CFI
    ),
    [GAID.CF_SALE_OF_INVESTMENT_SECURITIES]: A(
      GAID.CF_SALE_OF_INVESTMENT_SECURITIES,
      '投資有価証券の売却',
      'Proceeds from sales of investment securities',
      'CF',
      N,
      GAID.CFI
    ),

    [GAID.CF_PROCEEDS_LONG_TERM_DEBT]: A(
      GAID.CF_PROCEEDS_LONG_TERM_DEBT,
      '長期借入による収入',
      'Proceeds from long-term debt',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_REPAYMENTS_LONG_TERM_DEBT]: A(
      GAID.CF_REPAYMENTS_LONG_TERM_DEBT,
      '長期借入金の返済',
      'Repayments of long-term debt',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_PROCEEDS_ISSUANCE_BONDS]: A(
      GAID.CF_PROCEEDS_ISSUANCE_BONDS,
      '社債の発行による収入',
      'Proceeds from issuance of bonds',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_REDEMPTION_OF_BONDS]: A(
      GAID.CF_REDEMPTION_OF_BONDS,
      '社債の償還による支出',
      'Redemption of bonds',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_DIVIDENDS_PAID]: A(
      GAID.CF_DIVIDENDS_PAID,
      '配当金の支払額',
      'Dividends paid',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_PURCHASE_OF_TREASURY_STOCK]: A(
      GAID.CF_PURCHASE_OF_TREASURY_STOCK,
      '自己株式の取得',
      'Purchase of treasury stock',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_PROCEEDS_DISPOSAL_TREASURY_STOCK]: A(
      GAID.CF_PROCEEDS_DISPOSAL_TREASURY_STOCK,
      '自己株式の処分',
      'Proceeds from disposal of treasury stock',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_PROCEEDS_ISSUANCE_SHARES]: A(
      GAID.CF_PROCEEDS_ISSUANCE_SHARES,
      '株式の発行による収入',
      'Proceeds from issuance of shares',
      'CF',
      N,
      GAID.CFF
    ),
    [GAID.CF_PAYMENTS_FOR_ACQ_SUBSIDIARIES]: A(
      GAID.CF_PAYMENTS_FOR_ACQ_SUBSIDIARIES,
      '子会社取得による支出',
      'Payments for acquisition of subsidiaries',
      'CF',
      N,
      GAID.CFI
    ),
    [GAID.CF_PROCEEDS_DISPOSAL_SUBSIDIARIES]: A(
      GAID.CF_PROCEEDS_DISPOSAL_SUBSIDIARIES,
      '子会社売却による収入',
      'Proceeds from disposal of subsidiaries',
      'CF',
      N,
      GAID.CFI
    ),

    // PP&E 補助スケジュール
    [GAID.PPE_OPENING_BALANCE_GROSS]: A(
      GAID.PPE_OPENING_BALANCE_GROSS,
      '期首帳簿価額（総額）',
      'Opening balance (gross)',
      'PP&E',
      N,
      P_PPE
    ),
    [GAID.PPE_ADDITIONS]: A(
      GAID.PPE_ADDITIONS,
      '取得（増加）',
      'Additions (acquisitions)',
      'PP&E',
      D,
      P_PPE
    ),
    [GAID.PPE_DISPOSALS]: A(
      GAID.PPE_DISPOSALS,
      '売却・除却（減少）',
      'Disposals',
      'PP&E',
      C,
      P_PPE
    ),
    [GAID.PPE_IMPAIRMENT]: A(
      GAID.PPE_IMPAIRMENT,
      '減損（減少）',
      'Impairment (decrease)',
      'PP&E',
      C,
      P_PPE
    ),
    [GAID.PPE_DEPRECIATION_SCH]: A(
      GAID.PPE_DEPRECIATION_SCH,
      '減価償却（スケジュール）',
      'Depreciation (schedule)',
      'PP&E',
      C,
      P_PPE
    ),
    [GAID.PPE_OTHER_CHANGES]: A(
      GAID.PPE_OTHER_CHANGES,
      'その他増減',
      'Other changes',
      'PP&E',
      N,
      P_PPE
    ),
    [GAID.PPE_CLOSING_BALANCE_GROSS]: A(
      GAID.PPE_CLOSING_BALANCE_GROSS,
      '期末帳簿価額（総額）',
      'Closing balance (gross)',
      'PP&E',
      N,
      P_PPE
    ),

    [GAID.ACCUM_DEPR_OPENING]: A(
      GAID.ACCUM_DEPR_OPENING,
      '期首減価償却累計額',
      'Accumulated depreciation - opening',
      'PP&E',
      C,
      P_PPE
    ),
    [GAID.ACCUM_DEPR_INCREASE]: A(
      GAID.ACCUM_DEPR_INCREASE,
      '減価償却累計額の増加',
      'Accumulated depreciation - increase',
      'PP&E',
      C,
      P_PPE
    ),
    [GAID.ACCUM_DEPR_DECREASE]: A(
      GAID.ACCUM_DEPR_DECREASE,
      '減価償却累計額の減少',
      'Accumulated depreciation - decrease',
      'PP&E',
      D,
      P_PPE
    ),
    [GAID.ACCUM_DEPR_CLOSING]: A(
      GAID.ACCUM_DEPR_CLOSING,
      '期末減価償却累計額',
      'Accumulated depreciation - closing',
      'PP&E',
      C,
      P_PPE
    ),

    [GAID.PPE_NET_OPENING]: A(
      GAID.PPE_NET_OPENING,
      '期首帳簿価額（純額）',
      'Opening balance (net)',
      'PP&E',
      N,
      P_PPE
    ),
    [GAID.PPE_NET_CLOSING]: A(
      GAID.PPE_NET_CLOSING,
      '期末帳簿価額（純額）',
      'Closing balance (net)',
      'PP&E',
      N,
      P_PPE
    ),
  });

// BS/PL/CF/PP&E 各シートで使用するID集合
export const IDS_BY_SHEET: Readonly<Record<FsType, GAID[]>> = Object.freeze({
  BS: Object.values(GLOBAL_ACCOUNTS)
    .filter((v) => v.sheet.includes('BS'))
    .map((v) => v.id),
  PL: Object.values(GLOBAL_ACCOUNTS)
    .filter((v) => v.sheet.includes('PL'))
    .map((v) => v.id),
  CF: Object.values(GLOBAL_ACCOUNTS)
    .filter((v) => v.sheet.includes('CF'))
    .map((v) => v.id),
  'PP&E': Object.values(GLOBAL_ACCOUNTS)
    .filter((v) => v.sheet.includes('PP&E'))
    .map((v) => v.id),
  OTHER: Object.values(GLOBAL_ACCOUNTS)
    .filter((v) => v.sheet.includes('OTHER'))
    .map((v) => v.id),
});

// 正規の貸借方向を返す
export const normalSideOf = (id: GAID): NormalSide =>
  GLOBAL_ACCOUNTS[id].normalSide;

// 表示名（デフォルト）を返す（必要ならローカライズ差し替え）
export const defaultNameJaOf = (id: GAID): string =>
  GLOBAL_ACCOUNTS[id].defaultNameJa;
export const defaultNameEnOf = (id: GAID): string =>
  GLOBAL_ACCOUNTS[id].defaultNameEn;
