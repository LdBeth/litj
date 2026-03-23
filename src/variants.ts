import type { Chunk, Document, ResolvedChunk, VariantOrder } from "./types.ts";

/**
 * Returns true if `a` is an ancestor of (less than) `b` in the variant order,
 * i.e. `a < b`.
 */
export function isAncestor(
  order: VariantOrder,
  a: string,
  b: string,
): boolean {
  if (a === b) return false;
  const succs = order.successors.get(a);
  if (!succs) return false;
  if (succs.includes(b)) return true;
  return succs.some((s) => isAncestor(order, s, b));
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
 */
export function resolveChunks(
  doc: Document,
  target: string,
): ResolvedChunk[] {
  const chunks = doc.sections.filter((s): s is Chunk => s.kind === "chunk");
  const order = doc.variants;

  // Collect all chunks reachable at the target variant
  const reachable = chunks.filter((c) => isReachable(order, c.variant, target));

  // Group by chunk name, pick the highest-priority variant for each
  const byName = new Map<string, Chunk[]>();
  for (const c of reachable) {
    const existing = byName.get(c.name) ?? [];
    existing.push(c);
    byName.set(c.name, existing);
  }

  // Build a set of overridden qualified names (e.g., "base.mkTyVar")
  const overridden = new Set(reachable.flatMap((c) => c.overrides));

  const resolved: ResolvedChunk[] = [];

  for (const [_name, candidates] of byName) {
    // Filter out overridden candidates
    const active = candidates.filter(
      (c) => !overridden.has(`${c.variant}.${c.name}`),
    );

    if (active.length === 0) continue;

    // Pick the one closest to target (most specific variant)
    active.sort((a, b) => {
      if (isAncestor(order, a.variant, b.variant)) return 1; // b is more specific
      if (isAncestor(order, b.variant, a.variant)) return -1;
      return 0;
    });

    const best = active[0];
    resolved.push({
      name: best.name,
      variant: best.variant,
      body: best.body,
      steps: best.steps,
    });
  }

  // Preserve source order: order by first appearance of each chunk name
  const nameOrder = new Map(
    [...new Set(chunks.map((c) => c.name))].map((name, i) => [name, i]),
  );
  resolved.sort((a, b) =>
    (nameOrder.get(a.name) ?? 0) - (nameOrder.get(b.name) ?? 0)
  );

  return resolved;
}
