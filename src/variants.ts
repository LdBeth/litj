import type { Chunk, Document, ResolvedChunk, VariantOrder } from "./types.ts";

/**
 * Returns true if `a` is an ancestor of (less than) `b` in the variant order,
 * i.e. `a < b`.
 *
 * The successors map is already a transitive closure (each variant maps to all
 * later variants), so a single `includes` suffices — no recursion needed.
 */
export function isAncestor(
  order: VariantOrder,
  a: string,
  b: string,
): boolean {
  return order.successors.get(a)?.includes(b) ?? false;
}

/**
 * Returns true if variant `v` is reachable at target variant `target`,
 * meaning v <= target in the partial order.
 */
export function isReachable(
  order: VariantOrder,
  v: string,
  target: string,
): boolean {
  return v === target || isAncestor(order, v, target);
}

/**
 * Resolve chunks for a target variant.
 * For each chunk name, selects the highest-priority (closest to target)
 * variant that is <= target. Handles explicit overrides.
 *
 * Single-pass fold over sections builds all three structures at once:
 *   (byName, overridden, nameOrder) = foldl step (Map, Set, Map) sections
 */
export function resolveChunks(
  doc: Document,
  target: string,
): ResolvedChunk[] {
  const order = doc.variants;

  // Single fold: filter chunks, filter reachable, group by name,
  // collect overrides, and record source order — all in one pass.
  const byName = new Map<string, Chunk[]>();
  const overridden = new Set<string>();
  const nameOrder = new Map<string, number>();

  for (const s of doc.sections) {
    if (s.kind !== "chunk") continue;
    if (!nameOrder.has(s.name)) nameOrder.set(s.name, nameOrder.size);
    if (!isReachable(order, s.variant, target)) continue;
    const existing = byName.get(s.name) ?? [];
    existing.push(s);
    byName.set(s.name, existing);
    for (const o of s.overrides) overridden.add(o);
  }

  const resolved: ResolvedChunk[] = [];

  for (const [_name, candidates] of byName) {
    // Filter out overridden candidates
    const active = candidates.filter(
      (c) => !overridden.has(`${c.variant}.${c.name}`),
    );

    if (active.length === 0) continue;

    // Pick the one closest to target (most specific variant) — O(n) reduce
    const best = active.reduce((a, b) =>
      isAncestor(order, a.variant, b.variant) ? b : a
    );
    resolved.push({
      name: best.name,
      variant: best.variant,
      body: best.body,
      steps: best.steps,
    });
  }

  // Preserve source order
  resolved.sort((a, b) =>
    (nameOrder.get(a.name) ?? 0) - (nameOrder.get(b.name) ?? 0)
  );

  return resolved;
}
