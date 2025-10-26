// src/util/hash.ts
//
// 目的:
// - ヒト向けの識別子（日本語/記号含む）から保存・比較用の短い安定ハッシュを生成する。
// - これにより、名前ではなく一意のidによるデータ管理が可能になる。
export function stableHash(input: string): string {
  let h = BigInt('1469598103934665603'); // FNV offset basis
  const p = BigInt('1099511628211'); // FNV prime
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h *= p;
    h &= (BigInt(1) << BigInt(64)) - BigInt(1);
  }
  const hex = h.toString(16).padStart(16, '0');
  return hex;
}
