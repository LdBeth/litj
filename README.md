# Literate J

A literate programming tool for the [J programming language](https://www.jsoftware.com/), inspired by UHC's Shuffle. Source files (`.ij`) are doc-first and also valid J — all markup uses `NB.%`, J's comment syntax extended with a `%` marker.

Named code chunks are tagged with variant labels. Chunks can override each other across variants, enabling incremental development of a single system across multiple language variants from one source file.

## Requirements

[Deno](https://deno.com/) 2.x

## Usage

```sh
deno task tangle -- --variant <name> <input.ij>
deno task weave  -- --variant <name> <input.ij>
```

- **tangle** — extracts code chunks into a runnable `.ijs` file
- **weave** — produces an XML document for documentation rendering

## Source File Format

`.ij` files are valid J. All markup is written with `NB.%` (J comment + `%` marker).

### Variants

Declare a partial order of variants at the top of the file:

```j
NB.% variants: base < poly < full
```

### Chunks

```j
NB.% [[base.name              NB. open chunk: variant.chunkname
code goes here
NB.% ]]                       NB. close chunk

NB.% [[poly.name -base.name   NB. open chunk that overrides base.name
...
NB.% ]]
```

When tangling at variant `poly`, the resolver picks the most specific chunk for each name that is reachable from `poly` in the variant order. An explicit `-variant.name` override suppresses inheritance of that name from ancestors.

### Prose

Prose blocks use J's `0 : 0` noun-definition syntax. The leading `[` distinguishes them from `0 : 0` used in code; the delimiters are stripped during weaving:

```j
[ 0 : 0
This text appears in the woven output.
)
```

### Program Refinement

Chunks can contain inline derivation sequences — Bird-Meertens / program-calculation style proofs where each step is valid, executable J. Only the final step is emitted by tangle; weave emits all steps with their justifications.

```j
NB.% [[poly.name -base.name
NB.% <<
spec=: naive but correct J expression
NB.% :: law or theorem applied
spec=: more refined J expression
NB.% :: final simplification >>
spec=: efficient tacit expression
NB.% ]]
```

- `NB.% <<` opens a refinement sequence
- `NB.% :: reason` introduces the next step with a justification
- `NB.% :: reason >>` marks the final (tangled) step

Tangle emits only the `>>` step. Weave emits `<step reason="...">` elements for each step, with `final="true"` on the last.

## Example

See [`example.ij`](example.ij) for a worked Prime Sieve across variants `naive → n1 → n2 → e1 → e2 → poly`, including a three-step tacit refinement of the `poly` variant using the reflex law.

```sh
deno task tangle -- --variant poly example.ij
deno task weave  -- --variant poly example.ij
```

## Running Tests

```sh
deno task test
```
