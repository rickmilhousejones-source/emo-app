import type { Dimension } from "@/db/schema";

/** 用户在纠正/删除已记内容 */
export function isCorrectionIntent(content: string): boolean {
  return /(别记|不要记|删掉|改成|记错了|记错|不要写|去掉|更正)/.test(
    content.trim(),
  );
}

/** 元问题 / 无记账信息：禁止抽维 */
export function isMetaOrEmptyLogIntent(content: string): boolean {
  const t = content.trim();
  if (!t) return true;
  if (
    /^(你)?听得(到|见)|在吗|你好呀?$|能听见|还在吗|测试一下|hello$/i.test(t)
  ) {
    return true;
  }
  if (
    /(昨天|前天|以前).{0,8}(能|可以|能不能|可不可以).{0,6}记/.test(t) ||
    /能(不能)?记(昨天|前天|以前)/.test(t)
  ) {
    return true;
  }
  if (/^[？?]+$/.test(t)) return true;
  if (
    t.length <= 16 &&
    /[？?]$/.test(t) &&
    !/(咖啡|咖啡因|睡|焦虑|心情|累|烦|开心|难过|亲友|家人|爸|妈|杯)/.test(t)
  ) {
    return true;
  }
  return false;
}

/** phrase 是否能从本轮用户话里落地（防历史污染乱记账） */
export function isExtractGrounded(phrase: string, userContent: string): boolean {
  const p = phrase.replace(/\s+/g, "").toLowerCase();
  const u = userContent.replace(/\s+/g, "").toLowerCase();
  if (!p || !u) return false;
  if (u.includes(p) || p.includes(u)) return true;
  // 至少共享 2 个连续汉字/数字，或用户点了很短芯片（≤12）整句当答案
  if (u.length <= 12) return true;
  for (let i = 0; i < p.length - 1; i++) {
    const gram = p.slice(i, i + 2);
    if (/[\u4e00-\u9fff0-9]{2}/.test(gram) && u.includes(gram)) return true;
  }
  return false;
}

/** 「对亲友看法·还好」类芯片 / 口语句，敏感维也可本地直记 */
export function parseDimensionChip(
  content: string,
  dims: Pick<Dimension, "id" | "name">[],
): { dimensionId: string; phrase: string } | null {
  const t = content.trim();
  for (const d of dims) {
    const escaped = d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = t.match(
      new RegExp(`^${escaped}\\s*[·•\\-—:]\\s*(.+)$`),
    );
    if (m?.[1]?.trim()) {
      return { dimensionId: d.id, phrase: m[1].trim().slice(0, 120) };
    }
  }
  return null;
}

export function sensitiveLogChips(
  dims: Pick<Dimension, "id" | "name" | "sensitive" | "enabled">[],
): string[] {
  const chips: string[] = [];
  for (const d of dims.filter((x) => x.enabled && x.sensitive)) {
    chips.push(`${d.name}·还好`, `${d.name}·一般`, `${d.name}·有点烦`);
  }
  return chips.slice(0, 6);
}
