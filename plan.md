# Plan for create the J parser.

Read this thoroughly to understand the task. Ask questions to user for unclear
instructions.

## Parser algorithm

Do not attempt to implement parsing sequence that contains variable names. Focus
on get parsing expression that are only of known variables. In other words, only
attempt to complete `parsePrimTokens`.

You need to consider first how to handle parentheses, which is very important.
When the top

You DON'T need to check the testing files, you should follow the parsing
algorithm to implement the parser, rather than guess the behavior from tests
you'd better test directly with J.

Read @dicte.htm for parsing algorithm.

### Error in current parser implementation

Currently, the parser completely missing the moving successive
elements from the tail end of a queue to the top of a stack part.

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
