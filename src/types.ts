/** A section of documentation prose. */
export interface Prose {
  kind: "prose";
  text: string;
}

/** One step in an inline refinement derivation. */
export interface RefinementStep {
  /** Law/theorem applied to arrive at this step; "" for the opening spec step. */
  reason: string;
  /** True when >> was present on the :: line — marks this as the tangled result. */
  isFinal: boolean;
  body: string;
}

/** A named code chunk tagged with a variant. */
export interface Chunk {
  kind: "chunk";
  variant: string;
  name: string;
  /** Chunk names this overrides (e.g. ["-base.mkTyVar"] → overrides base.mkTyVar). */
  overrides: string[];
  /** Final step's body (or full body for non-refinement chunks). Used by tangle. */
  body: string;
  /** Always length >= 1. Length > 1 means the chunk contains a << derivation. */
  steps: RefinementStep[];
}

export type Section = Prose | Chunk;

/**
 * Variant ordering as a DAG represented by adjacency list.
 * If variants has { base: ["poly"], poly: ["full"] },
 * it means base < poly < full.
 */
export interface VariantOrder {
  /** All variant names in declaration order. */
  names: string[];
  /** Maps each variant to all its successors (transitive closure of >). */
  successors: Map<string, string[]>;
}

/** Parsed literate source file. */
export interface Document {
  variants: VariantOrder;
  sections: Section[];
}

/** A resolved chunk after variant selection. */
export interface ResolvedChunk {
  name: string;
  variant: string;
  body: string;
  steps: RefinementStep[];
}
