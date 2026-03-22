NB. variants: base < poly < full

This module defines type variable constructors.
The base variant provides a simple wrapper.

NB. [[base.mkTyVar
mkTyVar =: monad define
  Ty_Var y
)
NB. ]]

The polymorphic variant adds category information
to type variables.

NB. [[poly.mkTyVar -base.mkTyVar
mkTyVar =: monad define
  Ty_Var y, TyVarCateg_Plain
)
NB. ]]

A helper used across all variants.

NB. [[base.display
display =: 3 : 'smoutput y'
NB. ]]
