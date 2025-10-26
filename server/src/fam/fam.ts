// src/fam/fam.ts
//
// 目的:
// - FAMのグローバル状態を保持し、
//   実績の取り込み → ルール（accountIdキー）設定 → AST構築/評価 → 表ビューへの書き戻し
//   までのフローを1つのインターフェイスとして提供する。
//
// 前後の文脈:
// - ASTエンジン（engine/ast.ts）はあくまで式評価。年度や現金連動はFAM層で扱う。
// - GAIDは表示やB&C指定の便宜上使うが、同一性は accountId で管理する。
// - Balance & Change（B&C）は、コア計算の後にFYレイヤで加減する。
//
// API連携の勘所:
// - importActuals(PREVS, accountsMaster): 実績スナップショットを取り込み、必要に応じて最小Accountを合成。
// - setRules(rules): accountIdキーのRuleInput群（予測式）を設定。
// - compute({ years, baseProfitAccount, cashAccount }): 指定年数先までFYを積み上げて表データを生成。
//   - baseProfitAccount: 現金連動の基点となる「利益」などのaccountId。
//   - cashAccount: GAIDで必須（例: GAID.CASH）。GAID→primary accountIdへ解決される。
// - getTable({ years }): 表示用の行(row: accountId/GAID/名称)と列(FY)と値の2次元配列を返す。
// - 外部から叩く際は、必ず accountsMaster を渡して GAID→accountId のprimaryマッピングを構築しておくこと。
import {
  ACC_ID,
  evalTopo,
  isPrevPeriod,
  makeFF,
  makeTT,
  toDOT,
} from '@/engine/ast.js';
import type { CFI } from '@/model/bc.js';
import { GAID, GLOBAL_ACCOUNTS } from '@/model/globalAccount.ja.js';
import { cellId, periodKey } from '@/model/ids.js';
import { NodeRegistry } from '@/model/registry.js';
import type { Account, Period, RuleInput } from '@/model/types.js';

// 表の実体: key = cellId(fs, FY, accountId) → 値
type Grid = Map<string, number>; // accountId -> value

const CF_WORKING_CAPITAL_MAP: Record<string, GAID> = {
  [GAID.NOTES_RECEIVABLE_TRADE]: GAID.CF_INCR_DECR_TRADE_RECEIVABLES,
  [GAID.ACCOUNTS_RECEIVABLE_TRADE]: GAID.CF_INCR_DECR_TRADE_RECEIVABLES,
  [GAID.ACCOUNTS_RECEIVABLE]: GAID.CF_INCR_DECR_TRADE_RECEIVABLES,
  [GAID.ERMC_OPERATING]: GAID.CF_INCR_DECR_TRADE_RECEIVABLES,
  [GAID.INVENTORIES]: GAID.CF_INCR_DECR_INVENTORIES,
  [GAID.WORK_IN_PROCESS]: GAID.CF_INCR_DECR_INVENTORIES,
  [GAID.RAW_MATERIALS]: GAID.CF_INCR_DECR_INVENTORIES,
  [GAID.SUPPLIES]: GAID.CF_INCR_DECR_INVENTORIES,
  [GAID.NOTES_PAYABLE_TRADE]: GAID.CF_INCR_DECR_TRADE_PAYABLES,
  [GAID.ACCOUNTS_PAYABLE_TRADE]: GAID.CF_INCR_DECR_TRADE_PAYABLES,
  [GAID.ACCOUNTS_PAYABLE]: GAID.CF_INCR_DECR_TRADE_PAYABLES,
  [GAID.ACCRUED_EXPENSES]: GAID.CF_INCR_DECR_TRADE_PAYABLES,
};

const CF_NON_CASH_DRIVER_MAP: Record<string, GAID> = {
  [GAID.DEPRECIATION]: GAID.CF_DEPRECIATION_AMORTIZATION,
  [GAID.IMPAIRMENT_LOSS]: GAID.CF_IMPAIRMENT_LOSS,
};

export interface ComputeOptions {
  years?: number; // 何年先まで（デフォルト 5）
  baseProfitAccount?: string; // 現金連動の基点（accountId）
  cashAccount?: string; // 現金科目（GAID）
}

export interface ImportOptions {
  strict?: boolean;
  startYear?: number;
  actualYears?: number[];
}

export class FAM {
  private fs = 'PL' as const; // MVP: PLのみ
  private accountsById: Record<string, Account> = {};
  private accountsByGAID: Record<string, Account[]> = {};
  private primaryAccountIdOfGAID: Map<string, string> = new Map();
  private actualYears: Array<number> = [];
  private rules: Record<string, RuleInput> = {};
  private table: Grid = new Map(); // key: cellId(fs, FY, accountId) -> value
  private orderAccountIds: string[] = []; // 表示順（accountIdベース）
  private bc: CFI[] = []; // Balance & Change 指示（PoC）
  private cfStatements: Map<
    number,
    { cfo: number; cfi: number; cff: number; total: number }
  > = new Map();
  // === AST（常駐） ===
  private reg: NodeRegistry = new NodeRegistry();
  private cellRoots = new Map<string, string>(); // key = `${fy}::${accountId}` -> NodeId
  private visiting = new Set<string>(); // build時の循環検出

  vizAST() {
    console.log(toDOT(this.reg));
  }

  // ---- Public API ----
  importActuals(
    PREVS: Array<Record<string, number>>,
    accountsMaster?: Account[],
    opts?: ImportOptions
  ) {
    const strict = !!opts?.strict;
    // マスタからアカウント辞書を構築（GAID→accountId のprimary選定もここで）
    if (accountsMaster) {
      for (const acc of accountsMaster) {
        this.accountsById[acc.id] = {
          ...acc,
          parent_ga_id: acc.parent_ga_id ?? null,
          parent_ga_type: acc.parent_ga_type ?? null,
          ga_name: acc.ga_name ?? null,
          ga_code: acc.ga_code ?? null,
          ga_type: acc.ga_type ?? null,
          sort_num: acc.sort_num ?? null,
          indent_num: acc.indent_num ?? null,
          ua_code: acc.ua_code ?? null,
          is_kpi: acc.is_kpi ?? false,
          parent_ua_id: acc.parent_ua_id ?? null,
        }; // id→Account を保持
        const gaid = acc.GlobalAccountID ?? null;
        if (gaid) {
          if (!this.accountsByGAID[gaid]) this.accountsByGAID[gaid] = [];
          this.accountsByGAID[gaid].push(acc); // GAID→複数のAccount候補
          // Pick primary deterministically: explicit is_primary, then PL, then first
          const list = this.accountsByGAID[gaid];
          const pick =
            (list as any as Array<Account & { is_primary?: boolean }>).find(
              (a) => a.is_primary
            ) ??
            list.find((a) => a.fs_type === 'PL') ??
            list[0];
          this.primaryAccountIdOfGAID.set(gaid, pick.id); // GAIDのprimary=どのaccountIdに寄せるか
        }
      }
    }

    // 実績に現れたaccountId集合を行順に採用。マスタ未登録IDは必要に応じて合成。
    const idsSeen = new Set<string>(); // 取り込んだ実績に出現したaccountIdの順を保持
    for (const snap of PREVS)
      for (const accountId of Object.keys(snap)) {
        idsSeen.add(accountId);
        if (!this.accountsById[accountId]) {
          if (strict)
            throw new Error(`Unknown accountId in snapshot: ${accountId}`);
          // Synthesize lightweight Account when master lacks it
          this.accountsById[accountId] = {
            id: accountId,
            AccountName: accountId,
            GlobalAccountID: null,
            fs_type: 'PL',
            is_credit: null,
            parent_id: null,
            parent_ua_id: null,
            parent_ga_id: null,
            parent_ga_type: null,
            ga_name: null,
            ga_code: null,
            ga_type: null,
            sort_num: null,
            indent_num: null,
            ua_code: null,
            is_kpi: false,
          } as Account; // 最小合成
        }
      }
    this.orderAccountIds = Array.from(idsSeen);

    // FY推定（簡易実装）: 2000から順に採番。
    // TODO: 引数としてstartYearを受け取るようにする。
    if (opts?.actualYears) {
      if (opts.actualYears.length !== PREVS.length) {
        throw new Error(
          'actualYears の長さは PREVS の長さと一致している必要があります'
        );
      }
      this.actualYears = [...opts.actualYears];
    } else if (typeof opts?.startYear === 'number') {
      this.actualYears = PREVS.map((_, i) => opts.startYear! + i);
    } else {
      const startYear = 2000;
      this.actualYears = PREVS.map((_, i) => startYear + i);
    }

    // 実績を表とASTへ流し込む（FY×accountId のFFセルを常駐化）
    for (let i = 0; i < PREVS.length; i++) {
      const fy = this.actualYears[i];
      const snapshot = PREVS[i];
      for (const accountId of Object.keys(snapshot)) {
        const acc = this.accountsById[accountId]!; // 表示名なども保持
        const cid = cellId(acc.fs_type, periodKey(fy), accountId); // 表セルID
        const v = snapshot[accountId];
        this.table.set(cid, v); // 表へ値を保存

        const p: Period = {
          Period_type: 'Yearly',
          AF_type: 'Actual',
          Period_val: fy,
          offset: 0,
        };
        const labelName = acc.AccountName ?? accountId;
        // 実績セルもASTに常駐させ、FY×accountIdでrootを持っておく
        const nodeId = makeFF(this.reg, v, `${labelName}(FY${fy})[Actual]`, {
          account: acc,
          period: p,
        });
        this.setCellRoot(fy, accountId, nodeId);
      }
    }
  }

  setRules(rules: Record<string, RuleInput>) {
    this.rules = { ...rules }; // accountId-keyed
  }

  // Balance & Change 指示をセット（compute内のFY毎後段処理で適用）
  setBalanceChange(cfis: CFI[]) {
    this.bc = Array.isArray(cfis) ? [...cfis] : [];
  }

  // ルールの妥当性検証（存在チェック、数値チェック、PREV参照の有無など）
  private validateRules() {
    for (const [accountId, rule] of Object.entries(this.rules)) {
      const ensureNumber = (v: unknown, ctx: string) => {
        // NaN/非数は明確にエラー
        if (typeof v !== 'number' || Number.isNaN(v))
          throw new Error(`Invalid ${ctx}: NaN or not a number`);
      };
      const existsByRulesOrAccounts = (id: string) =>
        !!this.accountsById[id] || this.rules[id] != null; // 参照先存在確認
      switch (rule.type) {
        case 'INPUT':
        case 'FIXED_VALUE':
          ensureNumber(rule.value, 'value');
          break;
        case 'REFERENCE': {
          const refId = ACC_ID(rule.ref.account);
          if (!existsByRulesOrAccounts(refId))
            throw new Error(`Reference target not found: ${refId}`); // 未定義参照
          break;
        }
        case 'GROWTH_RATE': {
          ensureNumber(rule.value, 'growth value');
          if (!Array.isArray(rule.refs) || !rule.refs[0])
            throw new Error('refs is required for GROWTH_RATE');
          const refId = ACC_ID(rule.refs[0].account);
          if (!existsByRulesOrAccounts(refId))
            throw new Error(`Reference target not found: ${refId}`);
          break;
        }
        case 'PERCENTAGE': {
          ensureNumber(rule.value, 'percentage value');
          const refId = ACC_ID(rule.ref.account);
          if (!existsByRulesOrAccounts(refId))
            throw new Error(`Reference target not found: ${refId}`);
          break;
        }
        case 'CALCULATION': {
          for (const r of rule.refs) {
            const refId = ACC_ID(r.account);
            if (!existsByRulesOrAccounts(refId))
              throw new Error(`Reference target not found: ${refId}`);
          }
          break;
        }
        case 'PROPORTIONATE': {
          if (rule.coeff != null) ensureNumber(rule.coeff, 'coeff'); // 係数は任意だが数値性は確認
          break;
        }
        default:
          break;
      }
    }

    // PREV参照が存在する場合は、少なくとも1期以上の実績が必要
    if (!this.actualYears.length) {
      const usesPrev = Object.values(this.rules).some((rule) => {
        switch (rule.type) {
          case 'REFERENCE':
            return isPrevPeriod(rule.ref.period);
          case 'GROWTH_RATE':
            return isPrevPeriod(rule.refs[0]?.period as Period);
          case 'PERCENTAGE':
            return isPrevPeriod(rule.ref.period);
          case 'CALCULATION':
            return rule.refs.some((r) => isPrevPeriod(r.period));
          case 'PROPORTIONATE':
            return rule.base ? isPrevPeriod(rule.base.period) : true;
          default:
            return false;
        }
      });
      if (usesPrev)
        throw new Error('Previous actuals required for prev references');
    }
  }

  // B&C指示の妥当性検証（ターゲット/カウンタ解決可否、量の決定ロジックなど）
  private validateBalanceChange(cashGAID: string) {
    if (!this.bc || this.bc.length === 0) return;
    const canResolve = (name: string) => {
      // Accept GAID or accountId; GAID requires primary mapping; accountId requires known id or rule
      if ((GLOBAL_ACCOUNTS as any)[name])
        return this.primaryAccountIdOfGAID.has(name);
      return !!this.accountsById[name] || !!this.rules[name];
    };
    for (const inst of this.bc) {
      if (inst.sign !== 'PLUS' && inst.sign !== 'MINUS')
        throw new Error('invalid sign for Balance & Change');
      if (!canResolve(inst.target))
        throw new Error(`target not found: ${inst.target}`);
      if (inst.counter && !canResolve(inst.counter))
        throw new Error(`counter not found: ${inst.counter}`);
      if (inst.value == null && !inst.driver?.name)
        throw new Error('driver or value is required');
    }
  }

  updateRule(accountId: string, rule: RuleInput) {
    this.ensureAccountById(accountId);
    this.rules[accountId] = rule;
  }

  /**
   * 予測の実行:
   * - 指定年数分FYを積み上げ、各FYでセル(AST root)を構築し評価して表に書き戻す。
   * - 現金は baseProfitAccount と cashAccount(GAID) からFYレイヤで合成。
   */
  compute(opts?: ComputeOptions) {
    const years = opts?.years ?? 5;
    if (opts?.cashAccount == null) throw new Error('cashAccount is required');
    const baseProfit = opts?.baseProfitAccount ?? '';
    const cashGAID = opts.cashAccount;
    if (cashGAID !== GAID.CASH) {
      if ((GLOBAL_ACCOUNTS as any)[cashGAID])
        throw new Error('cashAccount must be GAID of CASH');
      throw new Error('cashAccount must be GAID of CASH');
    }

    this.validateRules();
    this.validateBalanceChange(cashGAID);
    if (!this.actualYears.length)
      throw new Error('No previous actuals imported');

    const cashAccountId = this.resolvePrimaryAccountIdForGAID(cashGAID);
    const bcTargetIds = new Set(
      this.bc.map((it) => {
        const isGaid = !!(GLOBAL_ACCOUNTS as any)[it.target];
        return isGaid
          ? this.resolvePrimaryAccountIdForGAID(it.target)
          : it.target;
      })
    );

    const latestFY = this.actualYears[this.actualYears.length - 1];
    for (let k = 1; k <= years; k++) {
      const fy = latestFY + k;
      const targets = new Set<string>([...Object.keys(this.rules)]);
      for (const id of targets) this.ensureCell(fy, id); // ルール対象セルをFY単位で構築（依存は再帰）

      const roots: string[] = []; // 評価対象rootノードを集める
      for (const id of targets) {
        const root = this.getCellRoot(fy, id);
        if (root) roots.push(root);
      }
      const vals = evalTopo(this.reg, roots); // トポ順評価

      for (const id of targets) {
        const rootId = this.getCellRoot(fy, id);
        if (!rootId) continue;
        const v = vals.get(rootId);
        if (v == null) continue; // 評価できなかった（依存欠落など）はスキップ
        const acc = this.accountsById[id];
        if (!acc) continue;
        const cid = cellId(acc.fs_type, periodKey(fy), id);
        this.table.set(cid, v); // 表へ書き戻し
      }

      // BS勘定の繰越処理
      this.rollForwardBsAccounts(fy, baseProfit, cashGAID);

      // B&Cを適用し、CFI/CFFへの現金影響を抽出
      const { cfi, cff } = this.applyBalanceChangeForFY(fy, cashGAID);

      // CF計算と最終的な現金の確定
      this.calculateAndStoreCashFlow(
        fy,
        baseProfit,
        cashAccountId,
        bcTargetIds,
        {
          cfi,
          cff,
        }
      );

      if (!this.orderAccountIds.includes(cashAccountId)) {
        this.orderAccountIds.push(cashAccountId);
      }
    }
  }

  private rollForwardBsAccounts(
    fy: number,
    baseProfit: string,
    cashGAID: string
  ) {
    const prevFy = fy - 1;
    const cashAccountId = this.resolvePrimaryAccountIdForGAID(cashGAID);

    for (const accountId of Object.keys(this.accountsById)) {
      if (accountId === cashAccountId) continue;
      const account = this.accountsById[accountId];
      // Skip non-BS accounts or accounts with rules
      if (account?.fs_type !== 'BS' || this.rules[accountId]) continue;

      const prevBalanceKey = cellId('BS', periodKey(prevFy), accountId);
      const prevBalance = this.table.get(prevBalanceKey) ?? 0;

      let newBalance = prevBalance;

      // Special handling for Retained Earnings
      if (account.GlobalAccountID === GAID.RETAINED_EARNINGS) {
        const netIncomeKey = cellId('PL', periodKey(fy), baseProfit);
        const netIncome = this.table.get(netIncomeKey) ?? 0;
        newBalance += netIncome;
      }

      const newBalanceKey = cellId('BS', periodKey(fy), accountId);
      this.table.set(newBalanceKey, newBalance);
    }
  }

  // 表ビューの抽出: 行=accountId順、列=FY、data=数値（欠損は直近FYへフォールバック）
  getTable(params: { fs?: 'PL' | 'BS'; years?: Array<number> }) {
    const fs = params.fs ?? 'PL';
    const colYears = params.years ?? this.allYears();
    const columns = colYears.map((y) => periodKey(y));

    const rows = this.orderAccountIds.map((accountId) => {
      const acc = this.accountsById[accountId]!;
      const ga = acc.GlobalAccountID
        ? {
            id: acc.GlobalAccountID,
            ga_name: acc.ga_name ?? acc.AccountName ?? null,
            ga_code: acc.ga_code ?? null,
            fs_type: acc.fs_type,
            ga_type: acc.ga_type ?? null,
            is_credit: acc.is_credit ?? null,
            parent_ga_id: acc.parent_ga_id ?? null,
            sort_num: acc.sort_num ?? null,
            indent_num: acc.indent_num ?? null,
          }
        : null;
      return {
        accountId,
        globalAccountId: acc.GlobalAccountID ?? null,
        name: acc.AccountName ?? accountId,
        parentId: acc.parent_id ?? null,
        ua_code: acc.ua_code ?? null,
        fs_type: acc.fs_type,
        is_credit: acc.is_credit ?? null,
        is_kpi: acc.is_kpi ?? false,
        parent_ga_id: acc.parent_ga_id ?? null,
        parent_ga_type: acc.parent_ga_type ?? null,
        parent_ua_id: acc.parent_ua_id ?? null,
        ga,
      };
    });

    const minFY = Math.min(...this.actualYears);
    const data: number[][] = rows.map((r) => {
      return colYears.map((y) => {
        let yy = y;
        let v: number | undefined;
        while (yy >= minFY) {
          const cid = cellId(fs, periodKey(yy), r.accountId);
          v = this.table.get(cid);
          if (v != null) break;
          yy--;
        }
        return v != null ? Math.round(v) : 0;
      });
    });

    return { rows, columns, data };
  }

  getCFStatement(fy: number) {
    return this.cfStatements.get(fy) ?? { cfo: 0, cfi: 0, cff: 0, total: 0 };
  }

  // 最新実績FYのスナップショットを accountId→値 のマップで返す
  snapshotLatestActual(params?: { fs?: 'PL' | 'BS' }): Record<string, number> {
    const fs = params?.fs ?? this.fs; // Default to this.fs for backward compatibility
    const latestYear = this.actualYears[this.actualYears.length - 1];
    const result: Record<string, number> = {};
    for (const id of this.orderAccountIds) {
      const acc = this.accountsById[id];
      if (acc?.fs_type !== fs) continue; // Filter accounts by fs_type
      const cid = cellId(fs, periodKey(latestYear), id);
      const v = this.table.get(cid);
      if (v != null) result[id] = v;
    }
    return result;
  }

  // 管理しているFYの一覧（実績の最小FY〜最新実績+5年）
  allYears(): number[] {
    const last = this.actualYears[this.actualYears.length - 1] ?? 2000;
    const maxFY = Math.max(...this.actualYears, last + 5);
    const minFY = Math.min(...this.actualYears);
    const out: number[] = [];
    for (let y = minFY; y <= maxFY; y++) out.push(y);
    return out;
  }

  // ---- AST 常駐ビルド（FY×科目の Cell を再利用/追加） ----
  private ensureCell(fy: number, accountId: string): string {
    const key = this.key(fy, accountId);
    const existing = this.cellRoots.get(key);
    if (existing) return existing; // 既存なら再利用
    if (this.visiting.has(key))
      throw new Error(`Cycle while building: ${accountId} FY${fy}`); // 再帰循環検知
    this.visiting.add(key);

    if (this.actualYears.includes(fy)) {
      // 実績FYはFFがある前提
      const id = this.getCellRoot(fy, accountId);
      if (!id) throw new Error(`Actual cell missing: ${accountId} FY${fy}`);
      this.visiting.delete(key);
      return id;
    }

    if (!this.rules[accountId]) {
      this.visiting.delete(key);
      throw new Error(`Rule not found for ${accountId} (FY${fy})`);
    }

    const rule = this.rules[accountId];
    const acc = this.ensureAccountById(accountId);
    const p: Period = {
      Period_type: 'Yearly',
      AF_type: 'Forecast',
      Period_val: fy,
      offset: 0,
    };

    let id: string;
    switch (rule.type) {
      case 'INPUT':
        id = makeFF(this.reg, rule.value, `${accountId}(FY${fy})[Input]`, {
          account: acc,
          period: p,
        });
        break; // 値をそのまま
      case 'FIXED_VALUE':
        id = makeFF(this.reg, rule.value, `${accountId}(FY${fy})[Fixed]`, {
          account: acc,
          period: p,
        });
        break; // 固定値
      case 'REFERENCE': {
        const r = rule.ref;
        const refId = ACC_ID(r.account);
        const fyRef = isPrevPeriod(r.period) ? fy - 1 : fy;
        const base = this.ensureCell(fyRef, refId); // 前期ならFY-1のセルを構築
        id = base;
        break;
      }
      case 'GROWTH_RATE': {
        const r = rule.refs[0];
        const refId = ACC_ID(r.account);
        const fyRef = isPrevPeriod(r.period) ? fy - 1 : fy;
        const base = this.ensureCell(fyRef, refId);
        const factor = makeFF(
          this.reg,
          1 + rule.value,
          `1+growth(${rule.value})`
        );
        id = makeTT(
          this.reg,
          base,
          factor,
          'MUL',
          `${accountId}=ref*factor(FY${fy})`,
          { account: acc, period: p }
        ); // base×(1+g)
        break;
      }
      case 'PERCENTAGE': {
        const refId = ACC_ID(rule.ref.account);
        const fyRef = isPrevPeriod(rule.ref.period) ? fy - 1 : fy;
        const ref = this.ensureCell(fyRef, refId);
        const rate = makeFF(this.reg, rule.value, `pct(${rule.value})`);
        id = makeTT(
          this.reg,
          ref,
          rate,
          'MUL',
          `${accountId}=ref*pct(FY${fy})`,
          { account: acc, period: p }
        ); // ref×率
        break;
      }
      case 'PROPORTIONATE': {
        const baseRef = rule.base ?? {
          account: {
            id: accountId,
            GlobalAccountID: null,
            AccountName: null,
          } as unknown as Account,
          period: {
            Period_type: 'Yearly',
            AF_type: 'Actual',
            Period_val: fy - 1,
            offset: -1,
          },
        };
        const bId = ACC_ID(baseRef.account);
        const bNode = this.ensureCell(
          isPrevPeriod(baseRef.period) ? fy - 1 : fy,
          bId
        );
        let node = makeTT(
          this.reg,
          bNode,
          makeFF(this.reg, 1, 'ratio~placeholder'),
          'MUL',
          `${accountId}=base*ratio(FY${fy})`,
          { account: acc, period: p }
        ); // base×比率
        if (rule.coeff != null)
          node = makeTT(
            this.reg,
            node,
            makeFF(this.reg, rule.coeff, `coeff(${rule.coeff})`),
            'MUL',
            `${accountId}*coeff(FY${fy})`,
            { account: acc, period: p }
          );
        id = node;
        break;
      }
      case 'CHILDREN_SUM': {
        const children = Object.values(this.accountsById).filter(
          (child) => child.parent_id === accountId
        );

        if (!children.length) {
          id = makeFF(this.reg, 0, `${accountId}(FY${fy})[children_sum=0]`, {
            account: acc,
            period: p,
          });
          break;
        }

        const childNodes = children.map((child) =>
          this.ensureCell(fy, child.id)
        );

        let sumNode = childNodes[0];
        for (let i = 1; i < childNodes.length; i += 1) {
          sumNode = makeTT(
            this.reg,
            sumNode,
            childNodes[i],
            'ADD',
            `${accountId}:children_sum(FY${fy})`,
            { account: acc, period: p }
          );
        }

        id = sumNode;
        break;
      }
      case 'CALCULATION': {
        const terms: string[] = [];
        for (const ref of rule.refs) {
          const s = ref.sign ?? 1;
          const refId = ACC_ID(ref.account);
          const fyRef = isPrevPeriod(ref.period) ? fy - 1 : fy;
          let base = this.ensureCell(fyRef, refId);
          if (s === -1)
            base = makeTT(
              this.reg,
              base,
              makeFF(this.reg, -1, '-1'),
              'MUL',
              `${refId}*(-1)(FY${fy})`
            ); // マイナス項は -1 を掛ける
          terms.push(base);
        }
        if (terms.length === 0)
          id = makeFF(this.reg, 0, `${accountId}(FY${fy})[0]`, {
            account: acc,
            period: p,
          });
        else if (terms.length === 1) id = terms[0];
        else {
          let accNode = makeTT(
            this.reg,
            terms[0],
            terms[1],
            'ADD',
            `${accountId}:acc(FY${fy})`,
            { account: acc, period: p }
          ); // 左から順に足し込み
          for (let i = 2; i < terms.length; i++)
            accNode = makeTT(
              this.reg,
              accNode,
              terms[i],
              'ADD',
              `${accountId}:acc(FY${fy})`,
              { account: acc, period: p }
            );
          id = accNode;
        }
        break;
      }
      default: {
        const _exhaustive: never = rule;
        throw new Error(`Unsupported rule type: ${(rule as any).type}`);
      }
    }

    this.setCellRoot(fy, accountId, id);
    this.visiting.delete(key);
    return id;
  }

  private calculateAndStoreCashFlow(
    fy: number,
    baseProfit: string,
    cashAccountId: string,
    bcTargetIds: Set<string>,
    impacts: { cfi: number; cff: number }
  ) {
    const cfo = this.calculateCFO(fy, baseProfit, bcTargetIds);
    const { cfi, cff } = impacts;
    const total = cfo + cfi + cff;

    this.cfStatements.set(fy, { cfo, cfi, cff, total });

    const prevFy = fy - 1;
    const prevCash =
      this.table.get(cellId('BS', periodKey(prevFy), cashAccountId)) ?? 0;
    const newCash = prevCash + total;

    this.table.set(cellId('BS', periodKey(fy), cashAccountId), newCash);

    const cfTotals: Array<[GAID, number]> = [
      [GAID.CFO, cfo],
      [GAID.CFI, cfi],
      [GAID.CFF, cff],
      [GAID.NET_INCREASE_DECREASE_IN_CCE, total],
      [GAID.CCE_BEGINNING, prevCash],
      [GAID.CCE_ENDING, newCash],
    ];

    for (const [gaid, value] of cfTotals) {
      this.setCashFlowTableValue(fy, gaid, value);
    }
  }

  private calculateCFO(
    fy: number,
    baseProfit: string,
    bcTargetIds: Set<string>
  ): number {
    const prevFy = fy - 1;
    const get = (y: number, accId: string) => {
      const acc = this.accountsById[accId];
      if (!acc) return 0;
      const val = this.table.get(cellId(acc.fs_type, periodKey(y), accId));
      if (val != null) return val;
      // For BS accounts in forecast years, if no value is set, it implies it's rolled forward.
      if (
        acc.fs_type === 'BS' &&
        y > this.actualYears[this.actualYears.length - 1]
      ) {
        const prevVal = this.table.get(
          cellId(acc.fs_type, periodKey(y - 1), accId)
        );
        return prevVal ?? 0;
      }
      return 0;
    };

    const netIncome = get(fy, baseProfit);
    let cfo = netIncome;

    // Adjust for non-cash charges from B&C drivers (e.g., depreciation)
    for (const inst of this.bc) {
      if (inst.driver?.name) {
        const driverName = inst.driver.name;
        const isGaid = !!(GLOBAL_ACCOUNTS as any)[driverName];
        const driverAccId = isGaid
          ? this.resolvePrimaryAccountIdForGAID(driverName)
          : driverName;
        const driverInfo = this.accountsById[driverAccId];
        if (driverInfo?.fs_type === 'PL') {
          // PL科目ドライバーは非資金性費用とみなす
          const amount = get(fy, driverAccId);
          cfo += amount;
          const driverGaid = driverInfo.GlobalAccountID ?? undefined;
          if (driverGaid) {
            const cfDetail = CF_NON_CASH_DRIVER_MAP[driverGaid];
            if (cfDetail) {
              this.addCashFlowTableValue(fy, cfDetail, amount);
            }
          }
        }
      }
    }

    // Adjust for non-cash gains/losses on PL
    const gainOnSaleOfNCA = get(fy, GAID.GAIN_ON_SALES_OF_NCA);
    if (gainOnSaleOfNCA) {
      cfo -= gainOnSaleOfNCA; // Subtract non-cash gains
    }

    // 運転資本の変動
    for (const accId of Object.keys(this.accountsById)) {
      const acc = this.accountsById[accId];
      if (acc.fs_type === 'BS' && acc.GlobalAccountID !== GAID.CASH) {
        if (
          acc.GlobalAccountID === GAID.RETAINED_EARNINGS ||
          acc.GlobalAccountID === GAID.CAPITAL_STOCK
        )
          continue;
        if (bcTargetIds.has(accId)) continue; // Skip accounts affected by B&C

        const prev = get(prevFy, accId);
        const curr = get(fy, accId);
        const delta = curr - prev;
        if (delta !== 0) {
          const contribution = acc.is_credit ? delta : -delta;
          cfo += contribution;
          const detailGaid =
            acc.GlobalAccountID &&
            CF_WORKING_CAPITAL_MAP[acc.GlobalAccountID];
          if (detailGaid) {
            this.addCashFlowTableValue(fy, detailGaid, contribution);
          }
        }
      }
    }

    return cfo;
  }

  // ---- Balance & Change 適用 ----
  // fam.ts
  private applyBalanceChangeForFY(
    fy: number,
    cashGAID: string
  ): { cfi: number; cff: number } {
    if (!this.bc?.length) return { cfi: 0, cff: 0 };

    const impacts = { cfi: 0, cff: 0 };
    const cashAccountId = this.resolvePrimaryAccountIdForGAID(cashGAID);

    const resolveAccount = (name: string): Account => {
      const accountId = (GLOBAL_ACCOUNTS as any)[name]
        ? this.resolvePrimaryAccountIdForGAID(name)
        : name;
      return this.ensureAccountById(accountId);
    };

    const getOrPrev = (y: number, acc: Account): number => {
      const curr = this.table.get(cellId(acc.fs_type, periodKey(y), acc.id));
      if (curr != null) return curr;
      const prev = this.table.get(
        cellId(acc.fs_type, periodKey(y - 1), acc.id)
      );
      return prev != null ? prev : 0;
    };

    const setVal = (y: number, acc: Account, v: number) => {
      this.table.set(cellId(acc.fs_type, periodKey(y), acc.id), v);
    };

    for (const inst of this.bc) {
      let amount = 0;
      if (inst.value != null) {
        amount = inst.value;
      } else if (inst.driver?.name) {
        const driverAcc = resolveAccount(inst.driver.name);
        amount = getOrPrev(fy, driverAcc);
      }

      const s = inst.sign === 'PLUS' ? 1 : -1;

      const targetAcc = resolveAccount(inst.target);
      const tPrev = getOrPrev(fy, targetAcc);
      setVal(fy, targetAcc, tPrev + s * amount);

      if (inst.counter) {
        const counterAcc = resolveAccount(inst.counter);

        const targetIsCredit = targetAcc.is_credit ?? false;
        const counterIsCredit = counterAcc.is_credit ?? false;
        const cSign = targetIsCredit === counterIsCredit ? -s : s;
        const change = cSign * amount;

        if (counterAcc.id === cashAccountId) {
          if (inst.cf_category === 'CFI') {
            // Asset purchase (e.g., Capex)
            if (inst.sign === 'PLUS') {
              impacts.cfi += change; // change is negative
            }
            // Asset sale
            else if (inst.sign === 'MINUS') {
              const gainOnSale = getOrPrev(
                fy,
                resolveAccount(GAID.GAIN_ON_SALES_OF_NCA)
              );
              const proceeds = amount + gainOnSale;
              impacts.cfi += proceeds; // Cash inflow is positive
            }
          } else if (inst.cf_category === 'CFF') {
            impacts.cff += change;
          }
        } else {
          const cPrev = getOrPrev(fy, counterAcc);
          setVal(fy, counterAcc, cPrev + change);
        }
      }
    }
    return impacts;
  }
  // ---- helpers ----
  private key(fy: number, name: string) {
    return `${fy}::${name}`;
  }
  private getCellRoot(fy: number, name: string) {
    return this.cellRoots.get(this.key(fy, name));
  }
  private setCellRoot(fy: number, name: string, id: string) {
    this.cellRoots.set(this.key(fy, name), id);
  }

  // accountIdに対応するAccountを必ず用意（無ければ最小構成で合成）
  private ensureAccountById(accountId: string): Account {
    let acc = this.accountsById[accountId];
    if (!acc) {
      // Synthesize a minimal Account for rule-defined ids not present in master
      acc = {
        id: accountId,
        AccountName: accountId,
        GlobalAccountID: null,
        fs_type: 'PL',
      } as Account;
      this.accountsById[accountId] = acc;
    }
    if (!this.orderAccountIds.includes(accountId))
      this.orderAccountIds.push(accountId);
    return acc;
  }

  private getCfAccountId(gaid: GAID): string | null {
    const accountId = this.primaryAccountIdOfGAID.get(gaid);
    if (!accountId) return null;
    const account = this.accountsById[accountId];
    if (!account || account.fs_type !== 'CF') return null;
    if (!this.orderAccountIds.includes(accountId)) {
      this.orderAccountIds.push(accountId);
    }
    return accountId;
  }

  private setCashFlowTableValue(fy: number, gaid: GAID, value: number) {
    const accountId = this.getCfAccountId(gaid);
    if (!accountId) return;
    this.table.set(cellId('CF', periodKey(fy), accountId), value);
  }

  private addCashFlowTableValue(fy: number, gaid: GAID, delta: number) {
    if (delta === 0) return;
    const accountId = this.getCfAccountId(gaid);
    if (!accountId) return;
    const key = cellId('CF', periodKey(fy), accountId);
    const prev = this.table.get(key) ?? 0;
    this.table.set(key, prev + delta);
  }

  // GAIDからprimaryなaccountIdを解決（無ければエラー）
  private resolvePrimaryAccountIdForGAID(gaid: string): string {
    const id = this.primaryAccountIdOfGAID.get(gaid);
    if (!id) throw new Error(`No mapped account for GAID: ${gaid}`);
    return id;
  }
}
