# Bitter lesson learned

Read this thoroughly to understand the task. Amend the test and data types to
reflect the correct implementation first, then ask for approval, then start
writing the code.

I spent more than $10 worth token just to learn the fact that it is difficult to
parse J correctly without an interpreter implementation (lookup the class of a
variable definition), because J executes the expression as it is parsing, and
the class of the result after dynamic execution affects the parsing behavior.
Unless when the expression is fully composed of known primitives, which could
make the inference of result type easier.

Creating just the tokenizer is the easier approach. However the current
tokenizer implementation still has several flaws.

## Errors in the current Lexer implementation.

### Need to report error for open quote or direct definition

```typescript
> tokenize("'That''")
[ { kind: "string", pos: "noun", text: "That'" } ]
```

The above result is correct.

```typescript
> tokenize("'''")
[ { kind: "string", pos: "noun", text: "'" } ]
```

This should report error.

```typescript
tokenize("{{)n: 1+2");
```

This should also report an error.

### The direct definition syntax for J has been changed

> The very first character after the `)` indicates what part of speech you want:

| char | part of speech generated                      |
| ---- | --------------------------------------------- |
| `m`  | monadic verb                                  |
| `d`  | dyadic verb                                   |
| `v`  | verb with valence depending on the names used |
| `a`  | adverb                                        |
| `c`  | conjunction                                   |
| `n`  | noun. See below for details.                  |
| `*`  | (default) depends on the names used           |

> After `{{)`, all following text up to the first colon (`:`) or comment (`NB.`)
> is reserved for control information for the definition. Currently no such
> control information has been defined, so no other words are allowed there.

Specifically, `{{)m 123+y}}` is now syntax error in latest J, it needs to be
`{{)m: 123+y}}`. or `{{)m : 123+y}}`

```typescript
> tokenize("{{)m: 1+2}}")
[ { kind: "direct", pos: "mark", defKind: "m", body: ": 1+2" } ]
```

The above result is for the outdated behavior.

Note that for noun, `{{)n12321}}` is still valid.

### Recursively parse into the direct definition

Unless it is a noun (`{{)n...}}`).

And report any unclosed quote or braces.

### Misc errors

- `1:` `2:` ... `0:` are verbs. There are not noun.

J evolves pretty fast and the primitives and syntax may change. You shall
provide a full list of know J primitives for approval to make sure there are no
inconsistency against the latest J version.

## Parser

Create the parser for tacit function is feasible and should not be difficult.

When you encounter difficulty, you should reference J itself for parsing
behavior.

The command for jconsole is `jc`. The `trace` utility can be used to provide
insights on parsing behavior.

```bash
jc -js "require'trace'" 'trace {{)n (2+1)+(2+#) }}' < /dev/null
```
