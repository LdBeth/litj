# Bitter lesson learned

Read this thoroughly to understand the task. Amend the test and data types to
reflect the correct implementation first, then ask for approval, then start
writing the code.

It is difficult to parse J correctly without an interpreter implementation
(lookup the class of a variable definition), because J executes the expression
as it is parsing, and the class of the result after dynamic execution affects
the parsing behavior. Unless when the expression is fully composed of known
primitives, which could make the inference of result type easier.

Creating just the tokenizer is the easier approach. However the current
tokenizer implementation still has several flaws.

## Errors in the current Lexer implementation.

### The core tokenization algorithm is still not right!

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

## Help

When you encounter difficulty, you should reference J itself for parsing
behavior.

The command for jconsole is `jc`. The `trace` utility can be used to provide
insights on parsing behavior. The `;:` verb can be used for check parsing.

```bash
echo ";:'+/...:;'" | jc -js
jc -js "require'trace'" 'trace {{)n (2+1)+(2+#) }}' < /dev/null
```
