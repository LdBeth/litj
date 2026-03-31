# Bitter lesson learned

Read this thoroughly to understand the task. Ask questions to user for unclear
instructions. Reference type defined in `src/j/ast.ts` if necessary, and create
correct test first when implement a feature.

## Lexer algorithm

A J token that is neither string nor direct definition must follow the accepting
rules, no matter its class:

- A _single_ GRAPHICS char or `:` or `.`, optionally followed by _any_ number of
  `:` or `.`.
- A sequence begins with alphabet, then any number of alphanum and `_`,
  optionally followed by _any_ number of `:` or `.`. These could be primitives
  like `T:`, keyword like `end.` or identifier `foo_namespace_`.
- A sequence begins with number or `_`, then any number of alphanum and `_` and
  `.`, optionally followed by any number of `:` or `.`. These are could be
  primitives like `0:` `1:` `__:` or number like `1.2p_3e2`.

The class of such token is determined by comparing it to a know list of builtins
and keywords, if no matched then classed as identifier rule (if starts with
alphabet) or number rule (if starts with digit or `_`).

Even something like `a:::.....::` is not a valid J primitive, the tokenizer
should accept it according to the above rules, and assign it an `unkown` class.

### Miss in the current lexing algorithm

One additional rule to implement is J treats consecutive number tokens as a
single token represent an array.

```J
   ;:'123+  21p2  3p 3 31 a:p2 _32:'
┌───┬─┬─────────────┬──┬──┬────┐
│123│+│21p2  3p 3 31│a:│p2│_32:│
└───┴─┴─────────────┴──┴──┴────┘
```

Choose appropriate strategy for implement this rule.

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
