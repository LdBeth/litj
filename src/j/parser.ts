import type { JNode, PrimToken, Token } from "./ast.ts";
import { isPrimTokens, isValidTokens, tokenize } from "./lexer.ts";

/**
 * Parse a J source string into a JNode AST.
 *
 * Tmplements J's parsing rules,
 * applied right-to-left on a stack of (part-of-speech, node) pairs.
 */
export function parseJ(source: string): JNode {
  const tokens = tokenize(source);
  if (!isValidTokens(tokens)) {
    throw Error("Tokenizing error");
  }
  if (!isPrimTokens(tokens)) {
    throw Error("Only primtives are allowed");
  }
  return parsePrimTokens(tokens);
}

function parsePrimTokens(tokens: PrimToken[]): JNode {
  // TODO
  throw Error("not implemented!");
}

/*
function parseTokens(tokens: Token[]): JNode {
  throw Error("not implemented!");
}
 */
