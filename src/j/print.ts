import type { XmlDocument, XmlElement } from "../xml.ts";
import { decl, el, stringify, text } from "../xml.ts";

import type { JNode } from "./ast.ts";

// ── XmlDocument with optional declaration (same workaround as weave.ts) ──────

// ── Parenthesisation helpers ──────────────────────────────────────────────────

/**
 * Returns true for nodes that can appear as children without parentheses.
 *
 * Atoms are always simple.  Adv/conj with simple operands are also simple
 * (they bind tighter than anything else in J — e.g. `+/`, `9&o.`).
 * Everything else (hook, fork, monad, dyad, assign) requires parens.
 */
function isSimple(n: JNode): boolean {
  switch (n.kind) {
    case "prim":
    case "num":
    case "arr":
    case "str":
    case "name":
      return true;
    case "adv":
      return isSimple(n.verb);
    case "conj":
      return isSimple(n.left) && isSimple(n.right);
    default:
      return false;
  }
}

function paren(s: string, n: JNode): string {
  return isSimple(n) ? s : `(${s})`;
}

// ── Plain J printer ───────────────────────────────────────────────────────────

/**
 * Reconstruct syntactically valid J source from a JNode.
 *
 * Uses conservative parenthesisation: any non-simple sub-expression is
 * wrapped so that `parseJ(printJ(node))` yields an equal AST.
 */
export function printJ(node: JNode): string {
  switch (node.kind) {
    case "num":
      return node.text;
    case "arr":
      return node.text;
    case "str":
      return `'${node.value.replace(/'/g, "''")}'`;
    case "name":
      return node.id;
    case "prim":
      return node.token;
    case "assign": {
      const op = node.global ? "=:" : "=.";
      const name = printJ(node.name);
      const rhs = printJ(node.expr);
      return `${paren(name, node.name)} ${op} ${paren(rhs, node.expr)}`;
    }
    case "adv": {
      // No space: `+/`, `+\`, `(f g)/`
      const v = printJ(node.verb);
      const a = printJ(node.adv);
      return `${paren(v, node.verb)}${paren(a, node.adv)}`;
    }
    case "conj": {
      // No space: `9&o.`, `f@:g`
      const l = printJ(node.left);
      const c = printJ(node.con);
      const r = printJ(node.right);
      return `${paren(l, node.left)}${paren(c, node.con)}${
        paren(r, node.right)
      }`;
    }
    case "hook": {
      const f = printJ(node.f);
      const g = printJ(node.g);
      return `${paren(f, node.f)} ${paren(g, node.g)}`;
    }
    case "fork": {
      const f = printJ(node.f);
      const g = printJ(node.g);
      const h = printJ(node.h);
      return `${paren(f, node.f)} ${paren(g, node.g)} ${h}`;
    }
    case "monad": {
      const v = printJ(node.verb);
      const a = printJ(node.arg);
      return `${paren(v, node.verb)} ${paren(a, node.arg)}`;
    }
    case "dyad": {
      const l = printJ(node.left);
      const v = printJ(node.verb);
      const r = printJ(node.right);
      return `${paren(l, node.left)} ${paren(v, node.verb)} ${
        paren(r, node.right)
      }`;
    }
  }
}

// ── Annotated XML builder ─────────────────────────────────────────────────────

/**
 * Convert a JNode to an XmlElement tree.
 *
 * Every element carries:
 *   pos="…"  — part of speech from node.pos
 *   j="…"    — reconstructed J code for this subtree
 */
export function nodeToXml(node: JNode): XmlElement {
  const pos = node.pos;
  const base = { pos };

  switch (node.kind) {
    case "num":
      return el("num", { ...base, nk: node.nk }, [text(printJ(node))]);
    case "arr":
      return el("arr", base, [text(printJ(node))]);
    case "str":
      return el("str", base, [text(printJ(node))]);
    case "name":
      return el("name", base, [text(printJ(node))]);
    case "prim":
      return el("prim", base, [text(printJ(node))]);
    case "assign":
      return el("assign", base, [
        text((typeof node.name == "string") ? node.name : printJ(node)),
        text(node.global ? "=:" : "=."),
        nodeToXml(node.expr),
      ]);
    case "monad":
      return el("monad", base, [
        nodeToXml(node.verb),
        nodeToXml(node.arg),
      ]);
    case "dyad":
      return el("dyad", base, [
        nodeToXml(node.verb),
        nodeToXml(node.left),
        nodeToXml(node.right),
      ]);
    case "hook":
      return el("hook", base, [nodeToXml(node.f), nodeToXml(node.g)]);
    case "fork":
      return el("fork", base, [
        nodeToXml(node.f),
        nodeToXml(node.g),
        nodeToXml(node.h),
      ]);
    case "adv":
      return el("adv", base, [nodeToXml(node.verb), nodeToXml(node.adv)]);
    case "conj":
      return el("conj", base, [
        nodeToXml(node.left),
        nodeToXml(node.con),
        nodeToXml(node.right),
      ]);
  }
}

/**
 * Serialise a JNode as an annotated XML document.
 *
 * The root element is `<j>` and each sub-element carries `pos` and `j`
 * attributes.  Validate the output with `src/j/j-ast.xsd`.
 */
export function printJXml(node: JNode): string {
  const doc: XmlDocument = {
    declaration: decl,
    root: el("j", {}, [nodeToXml(node)]),
  };
  return stringify(doc, { declaration: true, indent: "  " });
}
