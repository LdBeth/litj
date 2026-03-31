# J Lexer Algorithm

## Overview

The lexer converts a J source string into a flat array of classified tokens. It
operates in a single left-to-right pass, consuming one token per iteration.

## Character Classes

- **Alpha**: `a-z`, `A-Z`
- **Digit**: `0-9`
- **Graphic**: ``=<>+*-%$~|,;#!/\[]`@&?^"{}``
- **Whitespace**: space, tab, newline, carriage return

## Token Formation Rules

Three core rules determine how raw token text is formed. After forming the text,
a classification step maps it to a part of speech.

### Rule 1 — Graphic start

One graphic character (or standalone `.` / `:`), then consume any trailing `.`
and `:` characters. The result is looked up in the primitive tables.

```
+    → "+"  (verb)
+.   → "+." (verb)
/..  → "/.." (adv)
+.:. → unknown
```

### Rule 2 — Alpha start

One alpha character, then `[a-zA-Z0-9_]*`, then any trailing `.` and `:`.

- With dot/colon suffix: classify as primitive, control keyword, or unknown.
- Without suffix: it is a **name**. Names may carry locale suffixes
  (`_locale_`, `__locale`).

```
if.     → keyword
o.      → verb
abc.:   → unknown
myVar   → name
x_loc_  → name (locative)
```

### Rule 3 — Digit/underscore start

One digit or `_`, then `[a-zA-Z0-9_.]*`, then any trailing `.` and `:`.

- With dot/colon suffix (`suffixEnd > bodyEnd`): classify as primitive or
  unknown. These tokens do **not** participate in array merging.
- Without suffix: attempt number classification, then array merging (see below).

```
42    → number (integer)
2j3   → number (complex)
0:    → verb (has : suffix)
_32:  → unknown (has : suffix)
3p    → unknown (no suffix, but not a valid number)
```

## Array Merging

Consecutive rule-3 tokens **without dot/colon suffix**, separated only by spaces
or tabs, are merged into a single `array` token. The merged text preserves
original whitespace.

The merging criterion is purely structural: whether the token has a dot/colon
suffix. Valid numbers, invalid number-like tokens (e.g. `3p`), and primitive
nouns (`_`, `__`) all merge equally.

```
1 2 3        → array "1 2 3"
_ 3          → array "_ 3"
21p2  3p 3   → array "21p2  3p 3"
3 _32:       → number "3", unknown "_32:" (colon breaks chain)
0: 3         → verb "0:", number "3"  (colon breaks chain)
```

A single rule-3 token without suffix is classified normally (not as an array).

## Number Literal Grammar

Number classification uses parser combinators. The grammar:

```
number    = uptofloat suffix?
          | uptofloat 'x'           (extended integer, only after pure integer)
          | uptofloat 'j' uptofloat suffix?  (complex)

uptofloat = digits ('.' digits?)? ('e' '_'? digits)?
          | '_' '_'?                (infinity / negative infinity)

digits    = '_'? [0-9]+

suffix    = ('r'|'p'|'x') uptocomplex radix?   (power)
          | ('ar'|'ad') uptofloat radix?        (radian)
          | radix                               (radix only)

radix     = 'b' [0-9a-z]+

uptocomplex = uptofloat ('j' uptofloat)?
```

The `isInt` flag from `lexUptofloat` tracks whether the result is a pure integer
(no `.` or `e`), avoiding a re-scan of the parsed text.

## Special Forms

### Strings

`'...'` with `''` as escaped quote. Unclosed quotes produce an error token.

### Direct Definitions

`{{ ... }}` with nesting support. After `{{`:

- `{{)n ...}}` — noun: body is raw text.
- `{{)k: ...}}` — other kinds (`m`, `d`, `v`, `a`, `c`, `*`): colon required,
  body is recursively tokenized.
- `{{ ...}}` — no kind marker: body is recursively tokenized.

### Comments

`NB.` (not followed by alpha) stops tokenization for the rest of the input.

### Parentheses

`(` and `)` are standalone tokens with parts of speech `lpar` and `rpar`.

## Classification Priority

For tokens matched by rules 1-3, classification checks tables in this order:

1. Copula (`=.`, `=:`)
2. Noun primitive (`_`, `__`, `_.`, `a.`, `a:`)
3. Adverb
4. Conjunction
5. Verb
6. (Rule 2 only) Control keyword
7. Unknown
