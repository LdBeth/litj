/** Part of speech for the shift-reduce parser table. */
export type Pos =
  | "noun"
  | "verb"
  | "adv"
  | "conj"
  | "copula"
  | "name"
  | "lpar"
  | "rpar"
  | "mark";

/** Number literal sub-kind per jlin.ixml grammar. */
export type NumKind =
  | "integer"
  | "float"
  | "complex"
  | "extend"
  | "power"
  | "radian"
  | "radix";

/** Direct definition kind marker: )m )d )v )a )c )n )* */
export type DirectKind = "m" | "d" | "v" | "a" | "c" | "n" | "*";

/**
 * A classified J token produced by the lexer.
 *
 * Discriminated on `kind` (lexical category from jlin.ixml);
 * each variant carries `pos` for the shift-reduce parser table.
 */
export type Token =
  | { kind: "number"; pos: "noun"; nk: NumKind; text: string }
  | { kind: "string"; pos: "noun"; text: string }
  | { kind: "name"; pos: "name"; text: string }
  | { kind: "prim"; pos: "verb" | "adv" | "conj"; text: string }
  | { kind: "copula"; pos: "copula"; text: string }
  | { kind: "keyword"; pos: "mark"; text: string }
  | { kind: "lpar"; pos: "lpar" }
  | { kind: "rpar"; pos: "rpar" }
  | { kind: "direct"; pos: "mark"; defKind: DirectKind | null; body: string };

/**
 * J abstract syntax tree node.
 *
 * Covers J's six parts of speech and the main syntactic constructs:
 * assignments, monadic/dyadic application, verb trains (hooks and forks),
 * adverb/conjunction derivation, and direct/explicit definitions.
 */
export type JNode =
  | { kind: "num"; nk: NumKind; text: string }
  | { kind: "str"; value: string }
  | { kind: "name"; id: string }
  | { kind: "seq"; stmts: JNode[] }
  | { kind: "assign"; name: string; global: boolean; expr: JNode }
  | { kind: "monad"; verb: JNode; arg: JNode }
  | { kind: "dyad"; verb: JNode; left: JNode; right: JNode }
  | { kind: "hook"; f: JNode; g: JNode } // (f g) y = y f (g y)
  | { kind: "fork"; f: JNode; g: JNode; h: JNode } // (f g h) y = (f y) g (h y)
  | { kind: "adv"; verb: JNode; adv: JNode }
  | { kind: "conj"; left: JNode; con: JNode; right: JNode }
  | { kind: "prim"; token: string; pos: "verb" | "adv" | "conj" }
  | { kind: "direct"; defKind: DirectKind | null; body: string } // {{ ... }}
  | { kind: "explicit"; valence: 1 | 2; body: string }; // 3 : 0 / verb define
