# Bundled Catalan application

Only the compiled Vite artifact is present in this repository. A future source rebuild should retain these corrections:

- The KaTeX lexer had replacement characters followed by `d800`, `dbff`, `dc00`, `dfff` in its surrogate-pair character ranges. Those broad, damaged ranges consumed `\f` before the control-word branch could recognize `\frac`. Repaired only that lexer expression with explicit escaped Unicode ranges. The formula strings themselves were already escaped correctly.
- The Dyck visualization uses paths below `y=x`. The prose now consistently uses `y≤x` and reflects the suffix after first contact with `y=x+1`, giving endpoint `(n−1,n+1)`.
- The motivation emphasizes bijections and the Catalan recurrence. An arbitrary avoidance constraint is not sufficient to imply Catalan enumeration.

Verification: the displayed Catalan formula contains MathML `mfrac` for both the fraction and the binomial coefficient; no KaTeX error-colored nodes remain. The interactive representations and their selected `n` remain unchanged.
