/** Part of speech for the shift-reduce parser table. */
export type Pos =
  | "noun"
  | "verb"
  | "adv"
  | "conj";

export type PPos = Pos | "copula";

// Extended Pos
export type EPos =
  | PPos
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
 * Discriminated on `kind`;
 * each variant carries `pos` for the shift-reduce parser table.
 */
export type PrimToken =
  | { kind: "array"; pos: "noun"; text: string }
  | { kind: "number"; pos: "noun"; nk: NumKind; text: string }
  | { kind: "string"; pos: "noun"; text: string }
  | { kind: "prim"; pos: Pos; text: string }
  | { kind: "copula"; pos: "copula"; text: string }
  | { kind: "lpar"; pos: "lpar" }
  | { kind: "rpar"; pos: "rpar" }
  | { kind: "direct_noun"; pos: "noun"; body: string }
  | { kind: "name"; pos: "name"; text: string };

export type ValidToken =
  | PrimToken
  | { kind: "keyword"; pos: "mark"; text: string }
  | { kind: "direct"; pos: "mark"; defKind: DirectKind | null; body: Token[] };

export type Token =
  | ValidToken
  | { kind: "unknown"; pos: "mark"; text: string }
  | { kind: "error"; message: string };

/**
 * J abstract syntax tree node.
 *
 * Covers J's six parts of speech and the main syntactic constructs:
 * assignments, monadic/dyadic application, verb trains (hooks and forks),
 * adverb/conjunction derivation, and direct/explicit definitions.
 */
export type Name = { kind: "name"; id: string; pos: Pos };
type Prim = { kind: "prim"; token: string; pos: Pos | "copula" };
export type JNode =
  | { kind: "num"; nk: NumKind; text: string; pos: "noun" }
  | { kind: "arr"; text: string; pos: "noun" }
  | { kind: "str"; value: string; pos: "noun" }
  | Name
  | {
    kind: "assign";
    name: Name | (JNode & { pos: "noun" });
    global: boolean;
    expr: JNode;
    pos: Pos; // same POS as the RHS expression (J Dictionary §E Rule 8)
  }
  | { kind: "monad"; verb: JNode; arg: JNode; pos: "noun" }
  | { kind: "dyad"; verb: JNode; left: JNode; right: JNode; pos: "noun" }
  | { kind: "hook"; f: JNode; g: JNode; pos: Pos }
  | { kind: "fork"; f: JNode; g: JNode; h: JNode; pos: Pos }
  | { kind: "adv"; verb: JNode; adv: JNode; pos: Pos }
  | { kind: "conj"; left: JNode; con: JNode; right: JNode; pos: Pos }
  | Prim;
//  | { kind: "direct"; defKind: DirectKind | null; body: string } // {{ ... }}
//  | { kind: "explicit"; valence: 1 | 2; body: string } // 3 : 0 / verb define
