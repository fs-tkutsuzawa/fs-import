// src/engine/ast.ts
//
// 目的:
// - 予測/集計用の「式グラフ（AST）」を構築・評価するエンジン。
// - FF（値を持つ終端ノード）とTT（2項演算ノード）で表現し、トポロジカルソートや再帰で評価可能。
//
// 前後関係:
// - 型定義は model/types.ts、ノード格納は model/registry.ts。
// - ルールは accountId をキーに定義され、FAM層（fam.ts）からFYごとに利用される。
// - 現金連動（cash(prev)+基点利益）はFAM層が担当。本モジュールでは汎用的な式評価のみ。
//
// API連携の勘所:
// - 外部APIでルールや前期値(prev)を投入して compileUnifiedAST → evalTopo/evalNodeRecursive で評価できる。
// - ただし実務ではFY（会計年度）軸との結合が必要なため、上位のFAMクラス経由を推奨。
import { NodeRegistry } from '@/model/registry.js';
import type {
  Account,
  Cell,
  NodeId,
  Op,
  Period,
  RefInput,
  RuleInput,
} from '@/model/types.js';

// accountId-first主義: Account風の入力から、正規の account.id を取り出す。
// - PL/ASTでの同一性は AccountName や GAID ではなく accountId で管理する。
export const ACC_ID = (a: Account): string => {
  const id = (a as any)?.id; // Account風オブジェクトからidを抽出
  if (typeof id !== 'string' || !id)
    // 空/非文字列は不正
    throw new Error('Account must have a non-empty id');
  return id; // 以後の同一性はこのidで担保
};
// 参照期間が「前期（Actual or offset<0）」かを判定
export const isPrevPeriod = (p: Period) =>
  p.AF_type === 'Actual' || (p.offset ?? 0) < 0;

/**
 * FFノード（値を持つ終端）を作成して登録
 * - label: 可視化やデバッグ用。DOT出力にも使う
 * - extra: account/period 等のセル情報を付与可
 */
export function makeFF(
  reg: NodeRegistry,
  v: number,
  label: string,
  extra?: Partial<Cell>
): NodeId {
  const id = reg.newId();
  reg.add({
    id,
    value: v,
    label: `FF:${label}`,
    kind: 'FF',
    paramType: null,
    ref1: null,
    ref2: null,
    operator: null,
    ...extra,
  });
  return id;
}
/**
 * TTノード（2項演算: ADD/SUB/MUL）を作成して登録
 * - left/right: 子ノード
 * - op: 演算子
 */
export function makeTT(
  reg: NodeRegistry,
  left: NodeId,
  right: NodeId,
  op: Op,
  label: string,
  extra?: Partial<Cell>
): NodeId {
  const id = reg.newId();
  reg.add({
    id,
    ref1: left,
    ref2: right,
    operator: op,
    label: `TT:${label}`,
    kind: 'TT',
    ...extra,
  });
  return id;
}

export interface CompileCtx {
  reg: NodeRegistry;
  // Keys are accountId strings
  prev: Record<string, number>;
  rules: Record<string, RuleInput>;
  roots: Record<string, NodeId>;
  visiting: Set<string>;
}

/**
 * 指定accountIdのルールをもとに、ASTノード（root）を構築
 * - 再帰的に依存先も構築。循環は visiting セットで検知
 * - ルール種別:
 *   - INPUT/FIXED_VALUE: FFノード生成
 *   - REFERENCE: 現期 or 前期（prev）を参照
 *   - GROWTH_RATE/PERCENTAGE: 参照×係数
 *   - PROPORTIONATE: 比率適用（簡易実装）
 *   - CALCULATION: 加減算の合成
 */
function buildAccountNode(ctx: CompileCtx, acctKey: string): NodeId {
  if (ctx.roots[acctKey]) return ctx.roots[acctKey];
  if (ctx.visiting.has(acctKey))
    throw new Error(`Cycle detected while building: ${acctKey}`);
  ctx.visiting.add(acctKey);

  const rule = ctx.rules[acctKey];
  if (!rule) throw new Error(`No rule for account: ${acctKey}`);

  let nodeId: NodeId;

  switch (rule.type) {
    case 'INPUT':
      nodeId = makeFF(ctx.reg, rule.value, `${acctKey}(input)`);
      break;

    case 'FIXED_VALUE':
      nodeId = makeFF(ctx.reg, rule.value, `${acctKey}(fixed)`);
      break;

    case 'REFERENCE': {
      const r = rule.ref;
      const id = ACC_ID(r.account);
      // 前期参照なら prev スナップショットからFF終端に固定、現期なら依存を再帰構築
      nodeId = isPrevPeriod(r.period)
        ? makeFF(ctx.reg, ctx.prev[id], `${id}(prev)`)
        : buildAccountNode(ctx, id);
      break;
    }

    case 'GROWTH_RATE': {
      const r = rule.refs[0];
      const id = ACC_ID(r.account);
      // base: 現期/前期のどちらか → factor: (1+成長率)
      const base = isPrevPeriod(r.period)
        ? makeFF(ctx.reg, ctx.prev[id], `${id}(prev)`)
        : buildAccountNode(ctx, id);
      const factor = makeFF(ctx.reg, 1 + rule.value, `1+growth(${rule.value})`);
      nodeId = makeTT(ctx.reg, base, factor, 'MUL', `${acctKey}=ref*factor`);
      break;
    }

    case 'PERCENTAGE': {
      // 参照×指定割合
      const id = ACC_ID(rule.ref.account);
      const ref = isPrevPeriod(rule.ref.period)
        ? makeFF(ctx.reg, ctx.prev[id], `${id}(prev)`)
        : buildAccountNode(ctx, id);
      const rate = makeFF(ctx.reg, rule.value, `pct(${rule.value})`);
      nodeId = makeTT(ctx.reg, ref, rate, 'MUL', `${acctKey}=ref*pct`);
      break;
    }

    case 'PROPORTIONATE': {
      // TODO: 除算ノードの正式実装（現状は簡略）。比率は外部付与前提のプレースホルダ
      const baseRef: RefInput = rule.base ?? {
        account: {
          id: acctKey,
          GlobalAccountID: null,
          AccountName: null,
        } as unknown as Account,
        period: {
          Period_type: null,
          AF_type: 'Actual',
          Period_val: null,
          offset: -1,
        },
      };
      const bId = ACC_ID(baseRef.account);
      const bNode = isPrevPeriod(baseRef.period)
        ? makeFF(ctx.reg, ctx.prev[bId], `${bId}(prev)`)
        : buildAccountNode(ctx, bId);
      const ratioPlaceholder = makeFF(ctx.reg, 1, 'ratio~placeholder');
      let node = makeTT(
        ctx.reg,
        bNode,
        ratioPlaceholder,
        'MUL',
        `${acctKey}=base*ratio`
      );
      if (rule.coeff != null) {
        const c = makeFF(ctx.reg, rule.coeff, `coeff(${rule.coeff})`);
        node = makeTT(ctx.reg, node, c, 'MUL', `${acctKey}*coeff`);
      }
      nodeId = node;
      break;
    }

    case 'CHILDREN_SUM':
      nodeId = makeFF(ctx.reg, 0, `${acctKey}(children_sum=0)`);
      break;

    case 'CALCULATION': {
      const terms: NodeId[] = [];
      for (const ref of rule.refs) {
        const s = ref.sign ?? 1;
        const id = ACC_ID(ref.account);
        let base = isPrevPeriod(ref.period)
          ? makeFF(ctx.reg, ctx.prev[id], `${id}(prev)`)
          : buildAccountNode(ctx, id);
        if (s === -1) {
          const m1 = makeFF(ctx.reg, -1, '-1');
          base = makeTT(ctx.reg, base, m1, 'MUL', `${id}*(-1)`);
        }
        terms.push(base);
      }
      if (terms.length === 0) nodeId = makeFF(ctx.reg, 0, '0');
      else if (terms.length === 1) nodeId = terms[0];
      else {
        // NOTE: TT×TT子の禁則は現状 Warning レベル（TODO: 正規化）
        let acc = makeTT(ctx.reg, terms[0], terms[1], 'ADD', `${acctKey}:acc`);
        for (let i = 2; i < terms.length; i++)
          acc = makeTT(ctx.reg, acc, terms[i], 'ADD', `${acctKey}:acc`);
        nodeId = acc;
      }
      break;
    }

    default: {
      const _exhaustive: never = rule;
      throw new Error(`Unsupported rule type: ${(rule as any).type}`);
    }
  }

  ctx.roots[acctKey] = nodeId;
  ctx.visiting.delete(acctKey);
  return nodeId;
}

export function compileUnifiedAST(
  prev: Record<string, number>,
  flatRules: Record<string, RuleInput>,
  cashAccount?: string,
  baseProfitAccount = '' // accountId
) {
  // GAID正規化はしない: rules/prev は accountId キー。現金連動はFAM層で処理（GAID→accountId解決あり）。
  const ctx: CompileCtx = {
    reg: new NodeRegistry(),
    prev,
    rules: flatRules,
    roots: {},
    visiting: new Set(),
  };

  for (const acct of Object.keys(flatRules)) buildAccountNode(ctx, acct);

  // 現金=現金(prev)+基点利益 はFAM層で合成する（ここでは扱わない）
  return ctx;
}

/**
 * 再帰評価: 与えられたrootノードの値を再帰的に計算
 * - メモ化で同一ノードの再評価を防止
 */
export function evalNodeRecursive(
  id: NodeId,
  reg: NodeRegistry,
  memo = new Map<NodeId, number>()
): number {
  if (memo.has(id)) return memo.get(id)!; // メモ化済みならreturn
  const n = reg.get(id); // ノード取得
  if (typeof n.value === 'number') {
    // FFなら値を返して終了
    memo.set(id, n.value);
    return n.value;
  }
  if (!n.ref1 || !n.ref2 || !n.operator)
    // TTの構造でないならエラーを投げる
    throw new Error(`Invalid TT node: ${id}`);
  // 先に左右の子を評価（必要なものだけ）
  const a = evalNodeRecursive(n.ref1, reg, memo);
  const b = evalNodeRecursive(n.ref2, reg, memo);
  // 二項演算（未知の演算子は即例外）
  const v =
    n.operator === 'ADD'
      ? a + b
      : n.operator === 'SUB'
        ? a - b
        : n.operator === 'MUL'
          ? a * b
          : (() => {
              throw new Error(`Unknown op: ${n.operator}`);
            })();
  memo.set(id, v); // メモ化
  return v;
}

function collectSubgraph(reg: NodeRegistry, roots: NodeId[]): Set<NodeId> {
  const seen = new Set<NodeId>();
  const visit = (id: NodeId) => {
    if (seen.has(id)) return; // すでに訪れたノードはスキップ
    seen.add(id);
    const n = reg.get(id);
    if (n.ref1) visit(n.ref1); // 左右の子を辿る
    if (n.ref2) visit(n.ref2);
  };
  for (const r of roots) visit(r); // すべてのrootから到達可能な部分グラフ
  return seen;
}

export function topoOrder(reg: NodeRegistry, roots: NodeId[]): NodeId[] {
  const nodes = Array.from(collectSubgraph(reg, roots));
  // 入次数表と隣接リストを初期化
  const indeg = new Map<NodeId, number>(nodes.map((id) => [id, 0]));
  const out: Record<string, NodeId[]> = {};
  for (const id of nodes) out[id] = [];

  // 参照（ref1/ref2）は「子→親」の有向辺として扱う（子の計算が先）
  for (const id of nodes) {
    const n = reg.get(id);
    if (n.ref1) {
      indeg.set(id, (indeg.get(id) || 0) + 1);
      out[n.ref1].push(id);
    }
    if (n.ref2) {
      indeg.set(id, (indeg.get(id) || 0) + 1);
      out[n.ref2].push(id);
    }
  }

  // 入次数0のノードからキューに積む（Kahn法）
  const q: NodeId[] = [];
  for (const id of nodes) if ((indeg.get(id) || 0) === 0) q.push(id);

  const order: NodeId[] = [];
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    for (const v of out[u]) {
      indeg.set(v, (indeg.get(v) || 0) - 1);
      if ((indeg.get(v) || 0) === 0) q.push(v);
    }
  }
  // 取り出せなかったノードがある＝循環（評価不能）
  if (order.length !== nodes.length)
    throw new Error('Cycle detected during topological sort');
  return order;
}

/**
 * トポ順で一括評価
 * - 依存解決済みの順序で順に計算するため、高速かつ例外の所在が追いやすい
 */
export function evalTopo(
  reg: NodeRegistry,
  roots: NodeId[]
): Map<NodeId, number> {
  const order = topoOrder(reg, roots);
  const val = new Map<NodeId, number>();
  for (const id of order) {
    const n = reg.get(id);
    if (typeof n.value === 'number') {
      val.set(id, n.value); // FF: 値をそのまま記録
    } else {
      const a = val.get(n.ref1!); // 左右の子は必ず先に評価済みのはず
      const b = val.get(n.ref2!);
      if (a == null || b == null)
        throw new Error('Missing child value during topo eval');
      val.set(
        id,
        n.operator === 'ADD'
          ? a + b
          : n.operator === 'SUB'
            ? a - b
            : n.operator === 'MUL'
              ? a * b
              : NaN
      );
    }
  }
  return val;
}

export function validateAST(reg: NodeRegistry, roots: NodeId[]) {
  for (const n of reg.all()) {
    const isFF = typeof n.value === 'number';
    const isTT = n.ref1 != null && n.ref2 != null && n.operator != null;
    if (isFF === isTT)
      return { ok: false, reason: `Node ${n.id} must be either FF or TT` };
    if (isTT) {
      try {
        reg.get(n.ref1!);
        reg.get(n.ref2!);
      } catch {
        return { ok: false, reason: `Node ${n.id} references undefined child` };
      }
    }
  }
  try {
    topoOrder(reg, roots);
  } catch {
    return { ok: false, reason: 'Cycle detected' };
  } // トポ順不可＝循環
  // NOTE: TT×TT子の禁則は今は警告のみ（TODO）
  return { ok: true as const };
}

/**
 * DOT(Graphviz)形式にエクスポート
 * - rootsを渡すと、起点ノード群をsource rankとして強調
 */
export function toDOT(reg: NodeRegistry, roots?: NodeId[]) {
  const q = (s: string) => s.replace(/"/g, '\\"');
  const out: string[] = [];
  out.push('digraph AST {');
  out.push('  rankdir=LR;');
  for (const n of reg.all()) {
    const shape = n.kind === 'FF' ? 'ellipse' : 'box';
    const label = q((n.label ?? '') + `\\n(${n.id})`);
    out.push(`  "${n.id}" [label="${label}", shape=${shape}];`);
  }
  for (const n of reg.all()) {
    if (n.ref1)
      out.push(`  "${n.id}" -> "${n.ref1}" [label="L:${n.operator}"];`);
    if (n.ref2)
      out.push(`  "${n.id}" -> "${n.ref2}" [label="R:${n.operator}"];`);
  }
  if (roots?.length) {
    const list = roots.map((r) => `"${r}"`).join(', ');
    out.push(`  { rank=source; ${list} }`);
  }
  out.push('}');
  return out.join('\n');
}
