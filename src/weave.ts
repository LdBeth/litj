import { stringify } from "@std/xml";
import type {
  XmlDocument as _XmlDocument,
  XmlElement,
  XmlNode,
  XmlTextNode,
} from "@std/xml";

type XmlDeclaration = {
  type: "declaration";
  version: string;
  standalone?: "yes" | "no";
  encoding?: string;
};

type XmlDocument = Omit<_XmlDocument, "declaration"> & {
  declaration?: XmlDeclaration;
};
import type { Document } from "./types.ts";
import { isReachable } from "./variants.ts";

// ── XML node builders ────────────────────────────────────────────────────────

function el(
  tag: string,
  attrs: Record<string, string | undefined>,
  children: XmlNode[] = [],
): XmlElement {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) clean[k] = v;
  }
  return {
    type: "element",
    name: { raw: tag, prefix: "", local: tag, uri: "" },
    attributes: clean,
    children,
  };
}

function text(s: string): XmlTextNode {
  return { type: "text", text: s };
}

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

  return stringify(document as _XmlDocument, {
    declaration: true,
    indent: "  ",
  });
}
