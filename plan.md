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

A sentence is evaluated by executing its phrases in a sequence determined by the
parsing rules of the language. In summary:

1. Execution proceeds from right to left, except that when a right parenthesis
   is encountered, the segment enclosed by it and its matching left parenthesis
   is executed, and its result replaces the entire segment and its enclosing
   parentheses.
2. Adverbs and conjunctions are executed before verbs; the phrase `,"2-a` is
   equivalent to `(,"2)-a` , not to `,"(2-a)` . Moreover, the left argument of
   an adverb or conjunction is the entire verb phrase that precedes it. Thus, in
   the phrase `+/ . */b` , the rightmost adverb `/` applies to the verb derived
   from the phrase `+/ . *` , not to the verb `*` .
3. A verb is applied dyadically if possible; that is, if preceded by a noun that
   is not itself the right argument of a conjunction.
4. Certain trains form verbs and adverbs.
5. To ensure that these summary parsing rules agree with the precise parsing
   rules prescribed below, it may be necessary to parenthesize an adverbial or
   conjunctival phrase that produces anything other than a noun or verb.

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
