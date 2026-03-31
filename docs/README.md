# Israel Shield — Documentation

## Files in this folder

| File | Description |
|------|-------------|
| `paper.tex` | Full LaTeX academic paper — compile with `pdflatex paper.tex` (twice for TOC) |
| `notebooklm.md` | Comprehensive system description for NotebookLM / AI research tools |
| `README.md` | This file |

## Compiling the PDF

You need a LaTeX distribution installed (e.g., [MiKTeX](https://miktex.org/) on Windows or TeX Live):

```bash
cd docs
pdflatex paper.tex
pdflatex paper.tex   # Run twice to resolve TOC and cross-references
```

The output will be `paper.pdf` in the same folder.

### Required LaTeX packages (all standard, included in MiKTeX/TeX Live):
- `amsmath`, `amssymb`, `amsthm`
- `tikz` + libraries: `shapes.geometric`, `arrows.meta`, `positioning`, `fit`, `backgrounds`, `decorations.pathreplacing`, `calc`, `patterns`, `shadows`
- `listings`, `xcolor`, `hyperref`, `booktabs`, `longtable`
- `geometry`, `fancyhdr`, `titlesec`, `caption`, `subcaption`
- `microtype`, `setspace`

## Paper Contents

1. Introduction
2. Background and Related Work
3. Data Sources and Processing Pipeline
4. System Architecture
5. UAV Route Reconstruction Algorithm (with TikZ flowchart)
6. Safe Route Departure Planner (with TikZ flowchart)
7. Shower Index: Daily Safety Window Estimator
8. Temporal Analysis Models
9. Filtering System
10. User Interface Design (with TikZ layout diagrams)
11. Implementation Notes (React anti-patterns, ECharts, OSRM)
12. Evaluation
13. Future Work
14. Conclusion
15. References
16. Appendices (Haversine formula, TypeScript interfaces, code listings)
