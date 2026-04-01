# J Parser Implementation

## Entry Point

`parseJ(source)` tokenizes the source via the lexer, validates the token stream
(no errors, no keywords or direct definitions), then delegates to
`parsePrimTokens`.

## Algorithm: Queue-to-Stack Shift-Reduce

The parser implements J's parsing rules from Dictionary §E.

The sentence is processed **right-to-left**: tokens are shifted from the
rightmost end onto the top of the stack. After each shift, reduction rules are
tried repeatedly until none apply, then the next token is shifted.

**Stack layout:** index 0 = bottom (oldest), top = most recent. Four `mark`
sentinels are pre-loaded at the bottom. The working window is always the top
four items, named:

```
d = stack[len-4]   (deepest)
c = stack[len-3]
b = stack[len-2]
a = stack[len-1]   (top, most recently pushed)
```

**Queue termination:** After all tokens are shifted right-to-left, a final `§`
mark is pushed. This mark, sitting on top as `a`, acts as an EDGE trigger that
fires the remaining reductions.

**Final stack:** `[mark mark mark mark result §]` — 6 items. `stack[4]` is the
result node.

## Part-of-Speech Classification

| Predicate   | Matches                    | Role                                 |
| ----------- | -------------------------- | ------------------------------------ |
| `isEdge`    | mark, copula, lpar         | Strict edge (§ =. =: ()              |
| `isEdgeAVN` | anything except rpar, conj | Broad edge: EDGE + adv + verb + noun |
| `isCAVN`    | conj, adv, verb, noun      | Any content part of speech           |
| `isVN`      | verb, noun                 | Verb or noun                         |

## Reduction Rules

Rules are tried top-to-bottom; first match wins.

| # | a (top)  | b    | c    | d    | Consumes | Produces   | AST node                        |
| - | -------- | ---- | ---- | ---- | -------- | ---------- | ------------------------------- |
| 0 | EDGE     | V    | N    | any  | b, c     | noun       | `monad(verb=b, arg=c)`          |
| 1 | EDGE+AVN | V    | V    | N    | c, d     | noun       | `monad(verb=c, arg=d)`          |
| 2 | EDGE+AVN | N    | V    | N    | b, c, d  | noun       | `dyad(verb=c, left=b, right=d)` |
| 3 | EDGE+AVN | V\|N | A    | any  | b, c     | verb       | `adv(verb=b, adv=c)`            |
| 4 | EDGE+AVN | V\|N | C    | V\|N | b, c, d  | verb       | `conj(left=b, con=c, right=d)`  |
| 5 | EDGE+AVN | V\|N | V    | V    | b, c, d  | verb       | `fork(f=b, g=c, h=d)`           |
| 6 | EDGE     | CAVN | CAVN | CAVN | b, c, d  | modTrident | `fork(f=b, g=c, h=d)`           |
| 7 | EDGE     | CAVN | CAVN | any  | b, c     | modBident  | `hook(f=b, g=c)`                |
| 8 | name\|N  | cop  | CAVN | any  | a, b, c  | copula     | `assign(name=a, expr=c)`        |
| 9 | lpar     | CAVN | rpar | any  | a, b, c  | pos of b   | (unwrap parens, keep b)         |

Rules 0–5 use the broad `isEdgeAVN` or strict `isEdge` for `a`. Rules 6–7
require strict `isEdge` for `a`, which is why VVV (a regular fork) is caught by
Rule 5 before Rule 6.

## Modifier Train Rules (modTrident / modBident)

The result part-of-speech for modifier trains is determined by lookup tables
keyed on the first letter of each position's pos string (`v`=verb, `n`=noun,
`a`=adv, `c`=conj). Unlisted combinations fall back to `"verb"`.

**modTrident(b, c, d)** — 21 entries:

| Key | Result | Key | Result | Key | Result |
| --- | ------ | --- | ------ | --- | ------ |
| vvc | conj   | nvc | conj   | nca | adv    |
| ncc | conj   | vca | adv    | cvc | conj   |
| vcc | conj   | aca | conj   | acc | conj   |
| cca | conj   | ccc | conj   | vnc | adv    |
| avv | adv    | cvv | conj   | aav | conj   |
| aaa | adv    | caa | conj   | acn | adv    |
| acv | adv    | ccn | conj   | ccv | conj   |

**modBident(b, c)** — 9 entries:

| Key | Result | Key | Result | Key | Result |
| --- | ------ | --- | ------ | --- | ------ |
| nc  | adv    | vc  | adv    | av  | adv    |
| aa  | adv    | ac  | adv    | cn  | adv    |
| cv  | adv    | ca  | conj   | cc  | conj   |

## Token-to-Stack Mapping

| Token kind    | Stack item                                 |
| ------------- | ------------------------------------------ |
| `number`      | `{kind:"num", nk, text, pos:"noun"}`       |
| `string`      | `{kind:"str", value:text, pos:"noun"}`     |
| `array`       | `{kind:"arr", text, pos:"noun"}`           |
| `direct_noun` | `{kind:"str", value:body, pos:"noun"}`     |
| `prim`        | `{kind:"prim", token:text, pos:token.pos}` |
| `copula`      | `{kind:"prim", token:text, pos:"copula"}`  |
| `name`        | `{kind:"name", id:text, pos:"name"}`       |
| `lpar`        | `{kind:"tmp", pos:"lpar"}`                 |
| `rpar`        | `{kind:"tmp", pos:"rpar"}`                 |

`lpar` and `rpar` are temporary stack markers; they never appear in the final
AST.
