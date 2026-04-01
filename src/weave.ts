import type {
  XmlDeclaration,
  XmlDocument,
  XmlElement,
  XmlNode,
} from "./xml.ts";
import { el, stringify, text } from "./xml.ts";

import type { Document } from "./types.ts";
import { isReachable } from "./variants.ts";

// ── XML node builders ────────────────────────────────────────────────────────

function code(s: string): XmlElement {
  return el("code", {}, [text(s)]);
}

const decl: XmlDeclaration = {
  type: "declaration",
  version: "1.0",
  encoding: "UTF-8",
};

// ── weave ───────────────────────────────────────────────────────────────────

/** Weave a document into custom XML for a target variant. */
export function weave(doc: Document, target: string): string {
  const sections = doc.sections.flatMap((section): XmlElement[] => {
    if (section.kind === "prose") {
      const t = section.text.trim();
      return t ? [el("prose", {}, [text(t)])] : [];
    }
    const chunk = section;
    if (!isReachable(doc.variants, chunk.variant, target)) return [];

    const body: XmlNode[] = chunk.steps.length > 1
      ? chunk.steps.map((step) =>
        el("step", {
          reason: step.reason,
          final: step.isFinal ? "true" : undefined,
        }, [code(step.body)])
      )
      : [code(chunk.body)];

    return [el("chunk", {
      variant: chunk.variant,
      name: chunk.name,
      overrides: chunk.overrides.join(" ") || undefined,
    }, body)];
  });

  const document: XmlDocument = {
    declaration: decl,
    root: el("document", { variant: target }, [
      el(
        "variants",
        { order: doc.variants.names.join(" < ") },
        doc.variants.names.map((name) => el("variant", { name })),
      ),
      ...sections,
    ]),
  };

  return stringify(document, {
    declaration: true,
    indent: "  ",
  });
}
