# Bitter lesson learned

Read this thoroughly to understand the task. Ask questions to user for unclear
instructions. Reference type defined in `src/j/ast.ts` if necessary, and create
correct test first when implement a feature.

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
