import type { JNode } from "./ast.ts";

/**
 * Pattern language for matching JNode trees.
 * Wildcards bind a name; concrete JNode patterns match structurally.
 */
export type JPat =
  | { kind: "wild"; id: string } // matches any node
  | { kind: "wildV"; id: string } // matches verb nodes only
  | { kind: "wildN"; id: string } // matches noun nodes only
  | JNode;

export type Bindings = Map<string, JNode>;

export type Rule = { from: JPat; to: JPat };

/** Match pat against node, returning bindings on success or null on failure. */
export function match(_pat: JPat, _node: JNode): Bindings | null {
  throw new Error("not implemented");
}

/** Instantiate a pattern with the given bindings. */
export function substitute(_pat: JPat, _bindings: Bindings): JNode {
  throw new Error("not implemented");
}

/**
 * Apply rules bottom-up to node, rewriting until no rule matches.
 * Returns a new JNode (or the same reference if nothing changed).
 */
export function rewrite(_rules: Rule[], _node: JNode): JNode {
  throw new Error("not implemented");
}
