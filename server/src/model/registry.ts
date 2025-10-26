// src/model/registry.ts
//
// 目的:
// - ASTノード（Cell/Node）をIDで管理する簡易レジストリ。
// 前後関係:
// - engine/ast.ts から利用され、makeFF/makeTT で登録、評価時に参照される。
// - 内部的にAST構造を保持するために使うので、外部APIから直接触る場面はほぼ無い。
import type { Cell, NodeId } from '@/model/types.js';

export class NodeRegistry {
  private seq = 0;
  private map = new Map<NodeId, Cell>();
  // 連番で内部IDを払い出す（外部には露出しない前提のため可変でOK）
  newId(): NodeId {
    return `n:${++this.seq}`;
  }
  // ノードを登録
  add(n: Cell) {
    this.map.set(n.id, n);
    return n.id;
  }
  // ノードを取得（無ければ例外）
  get(id: NodeId) {
    const n = this.map.get(id);
    if (!n) throw new Error(`Node not found: ${id}`);
    return n;
  }
  // 全ノードを配列で取得
  all(): Cell[] {
    return Array.from(this.map.values());
  }
}
