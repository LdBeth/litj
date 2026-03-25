import { parseArgs } from "@std/cli/parse-args";
import { parse } from "./parser.ts";
import { resolveChunks } from "./variants.ts";
import { tangle } from "./tangle.ts";
import { weave } from "./weave.ts";

function usage(): never {
  console.error(`Usage: lit <command> [options] <input>

Commands:
  tangle  Extract J source code for a variant
  weave   Generate XML documentation for a variant

Options:
  --variant, -v <name>   Target variant (required)
  --output, -o <file>    Output file (default: stdout)`);
  Deno.exit(1);
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["variant", "output"],
    alias: { v: "variant", o: "output" },
  });

  const command = args._[0];
  const inputFile = args._[1];

  if (
    !command || !inputFile || typeof command !== "string" ||
    typeof inputFile !== "string"
  ) usage();
  if (!args.variant) {
    console.error("Error: --variant is required");
    Deno.exit(1);
  }

  const source = await Deno.readTextFile(inputFile);
  const doc = parse(source);

  let output: string;
  if (command === "tangle") {
    const resolved = resolveChunks(doc, args.variant);
    output = tangle(resolved);
  } else if (command === "weave") {
    output = weave(doc, args.variant);
  } else {
    console.error(`Unknown command: ${command}`);
    Deno.exit(1);
  }

  if (args.output) {
    await Deno.writeTextFile(args.output, output);
  } else {
    console.log(output);
  }
}

main();
