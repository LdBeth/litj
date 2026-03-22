# Coping with maintenance complexity: generate, generate and generate

For any large programming project the greatest challenge is not to
make the first version, but to be able to make subsequent versions. In
order to facilitate change, the object of change should be isolated
and encapsulated. Although many programming languages support
encapsulation, this is not sufficient for the construction of a
compiler, because each language feature influences not only various
parts of the compiler (parser, structure of abstract syntax tree, type
system, code generation, runtime system) but also other artefacts such
as specification, documentation, and test suites. Encapsulation of a
language feature in a compiler therefore is difficult, if not
impossible, to achieve.  We mitigate the above problems by using
Shuffle, a separate preprocessor. In all source files, we annotate to
which language variants the text is relevant. Shuffle preprocesses all
source files by selecting and reordering those fragments (called
chunks) that are needed for a particular language variant. Source code
for a particular Haskell module is stored in a single “chunked
Haskell” (.chs) file, from which Shuffle can generate the Haskell (.hs)
file for any desired variant (see figure (page 4), where the stacks of
intermediate files denote various variants of a module). Source files
can be chunked Haskell code, chunked AG code, but also chunked LaTeX
text and code in other languages we use.  Shuffle behaves similar to
literate programming tools in that it generates program source
code. The key difference is that with the literate programming style
program source code is generated out of a file containing program text
plus documentation, whereas Shuffle combines chunks for different
variants from different files into either program source code or
documentation.  Shuffle offers a different functionality than version
management tools: these offer historical versions, whereas Shuffle offers
the simultaneous handling of different variants from a single source.
For example, for language variant 2 and 3 (on top of 2 ) a different
wrapper function mkTyVar for the construction of the internal
representation of a type variable is required. In variant 2, mkTyVar
is equal to the constructor Ty_Var:


mkTyVar :: TyVarId -> Ty
mkTyVar tv = Ty_Var tv

However, version 3 introduces polymorphism as a language variant, which requires additional infor-
mation for a type variable, which defaults to TyVarCateg_Plain (we do not further explain this):

mkTyVar :: TyVarId -> Ty
mkTyVar tv = Ty_Var tv TyVarCateg_Plain

These two Haskell fragments are generated from the following Shuffle source:

%%[2.mkTyVar
mkTyVar :: TyVarId -> Ty
mkTyVar tv = Ty_Var tv
%%]
%%[3.mkTyVar -2.mkTyVar
mkTyVar :: TyVarId -> Ty
mkTyVar tv = Ty_Var tv TyVarCateg_Plain
%%]

The notation %%[2.mkTyVar begins a chunk for variant 2 with name mkTyVar, ended by %%]. The
chunk for 3.mkTyVar explicitly specifies to override 2.mkTyVar for variant 3. Although the type
signature can be factored out, we refrain from doing so for small definitions.
In summary, Shuffle:
• uses notation %%[... %%] to delimit and name text chunks
• names chunks by a variant number and (optional) additional naming
• allows overriding of chunks based on their name
• combines chunks upto an externally specified variant, using an also externally specified variant
ordering.
