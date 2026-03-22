/** A section of documentation prose. */
export interface Prose {
  kind: "prose";
  text: string;
}

/** A named code chunk tagged with a variant. */
export interface Chunk {
  kind: "chunk";
  variant: string;
  name: string;
  /** Chunk names this overrides (e.g. ["-base.mkTyVar"] → overrides base.mkTyVar). */
  overrides: string[];
  body: string;
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
  /** Maps each variant to its immediate successors (greater variants). */
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
}
