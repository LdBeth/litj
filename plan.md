# Plan for create the J parser.

Read this thoroughly to understand the task. Ask questions to user for unclear
instructions.

## Parser algorithm

### Problem in current parser implementation

The parser table used is a bit outdated, the new table that supports modifier
train is

| a (top)         | b       | c       | d        | action                    |
| --------------- | ------- | ------- | -------- | ------------------------- |
| § =. =: (       | V       | N       | anything | 0 Monad                   |
| § =. =: ( A V N | V       | V       | N        | 1 Monad                   |
| § =. =: ( A V N | N       | V       | N        | 2 Dyad                    |
| § =. =: ( A V N | V N     | A       | anything | 3 Adverb                  |
| § =. =: ( A V N | V N     | C       | V N      | 4 Conj                    |
| § =. =: ( A V N | V N     | V       | V        | 5 Fork                    |
| § =. =: (       | C A V N | C A V N | C A V N  | 6 Modifier trident        |
| § =. =: (       | C A V N | C A V N | anything | 7 Hook or Modifier bident |
| name N          | =. =:   | C A V N | anything | 8 Is                      |
| (               | C A V N | )       | anything | 9 Paren                   |

The modifier trident or bident table is:

| Sequence | Part of speech | Interpretation               | Quick Search |
| -------- | -------------- | ---------------------------- | ------------ |
| V0 V1 C2 | conj           | V0 V1 (u C2 v)               | VVC          |
| N0 V1 C2 | conj           | N0 V1 (u C2 v)               | NVC          |
| N0 C1 A2 | adv            | N0 C1 (u A2)                 | NCA          |
| N0 C1 C2 | conj           | N0 C1 (u C2 v)               | NCC          |
| V0 C1 A2 | adv            | V0 C1 (u A2)                 | VCA          |
| C0 V1 C2 | conj           | (u C0 v) V1 (u C2 v)         | CVC          |
| V0 C1 C2 | conj           | V0 C1 (u C2 v)               | VCC          |
| A0 C1 A2 | conj           | (u A0) C1 (v A2)             | ACA          |
| A0 C1 C2 | conj           | (u A0) C1 (u C2 v)           | ACC          |
| C0 C1 A2 | conj           | (u C0 v) C1 (v A2)           | CCA          |
| C0 C1 C2 | conj           | (u C0 v) C1 (u C2 v)         | CCC          |
| V0 N1 C2 | adv            | (... V0 N1) C2               | VNC          |
| A0 V1 V2 | adv            | (u A0) V1 V2                 | AVV          |
| C0 V1 V2 | conj           | (u C0 v) V1 V2               | CVV          |
| A0 A1 V2 | conj           | (u A0) (v A1) V2             | AAV          |
| A0 A1 A2 | adv            | ((u A0) A1) A2               | AAA          |
| C0 A1 A2 | conj           | ((u C0 v) A1) A2             | CAA          |
| A0 C1 N2 | adv            | (u A0) C1 N2                 | ACN          |
| A0 C1 V2 | adv            | (u A0) C1 V2                 | ACV          |
| C0 C1 N2 | conj           | (u C0 v) C1 N2               | CCN          |
| C0 C1 V2 | conj           | (u C0 v) C1 V2               | CCV          |
| N0 C1    | adv            | N0 C1 u                      | NC           |
| V0 C1    | adv            | V0 C1 u                      | VC           |
| A0 V1    | adv            | (u A0) V1                    | AV           |
| A0 A1    | adv            | (u A0) A1                    | AA           |
| A0 C1    | adv            | (u A0) C1 u (adverbial hook) | AC           |
| C0 N1    | adv            | u C0 N1                      | CN           |
| C0 V1    | adv            | u C0 V1                      | CV           |
| C0 A1    | conj           | (u C0 v) A1                  | CA           |
| C0 C1    | conj           | (u C0 v) (u C1 v)            | CC           |

Use the table to complete `modTrident` and `modBident`, then complete
`tryReduce`.

PrimToken now allow names, so enable the `8 Is` rule.

## Help

When you encounter difficulty, you should reference J itself for parsing
behavior.

The command for jconsole is `jc`. The `trace` utility can be used to provide
insights on parsing behavior. The `;:` verb can be used for check tokenization.

An invalid J sentence can still be tokenized as long as it does not contain open
quote or unclosed direct definition. An invalid J sentence or a sentence with
free variable would trigger error during parser tracing.

```bash
# tokenize
echo ";:'+/...:;'" | jc -js
# parser trace
jc -js "require'trace'" 'trace {{)n (2+1)+(2+#) }}' < /dev/null
```

```J
   trace'(+/ % #) i. 5'
 --------------- 3 Adverb -----
 +
 /
 +/
 --------------- 5 Trident ----
 +/
 %
 #
 +/ % #
 --------------- 8 Paren ------
 (
 +/ % #
 )
 +/ % #
 --------------- 1 Monad ------
 i.
 5
 0 1 2 3 4
 --------------- 0 Monad ------
 +/ % #
 0 1 2 3 4
 2
 ==============================
2
```
