# Superimposer

A small browser tool for basic geometric morphometrics, made to go with [Landmarker2D](https://github.com/BenceViola/Landmarker2D) and [Landmarker3D](https://github.com/BenceViola/Landmarker3D). Open landmark files and get a Procrustes superimposition, a PCA and the usual plots. Everything runs in the browser, so no data leave your computer.

## What it does

- **Reads** `.lmk.json` files, TPS files (`LM=` and `LM3=`), and hand-in zips.
- **Shows the raw data first**, as digitised. A button runs the fit, and another goes back, so the effect of the superimposition can be shown.
- **Superimposes** by full generalised Procrustes analysis, with centroid size and tangent-space projection.
- **Slides semilandmarks** along their curves, by bending energy or Procrustes distance, as geomorph's `gpagen(curves = ...)`. Which point slides between which neighbours comes from the template's curves, or from a sliders file (for TPS). The superimposition can show the points before sliding.
- **Runs a PCA** on the tangent coordinates.
- **Plots** the superimposition, morphospace, scree plot, shape change along any PC, centroid size against PCs, and repeatability per landmark. 3D figures turn by dragging.
- **Shows individual specimens** picked in the morphospace, up to four side by side over the mean. A click on empty space gives the theoretical shape at that position.
- **Deformation grids** (thin-plate spline, 2D) as an alternative to arrows.
- **Specimen markers:** colour and marker follow the group, and can be changed for any specimen from the specimen list.
- **Data table:** every record with its details, editable group columns (type, paste from a spreadsheet, or assign ticked rows; rename or remove columns), and the coordinates with gaps marked. Arrow keys move between cells, and rows are selected as in a spreadsheet (Shift-click for a range, Ctrl/⌘-click for single rows); Ctrl/⌘ + Enter fills a value into every selected row.
- **Compares groups** (the grouping chosen under *Colour by*) in a Groups tab: group means drawn over each other, the shape change from one group mean to another (or from the mean of all specimens) as arrows or a deformation grid, a table of n, mean centroid size and Procrustes variance per group, and Procrustes distances between group means with permutation tests of the distances and of differences in variance. Group means and 95% ellipses can also be shown in the PCA and size plots.
- **Draws links** between landmarks, by clicking them or as an automatic outline or triangulation (2D). They show on every shape figure, and can be saved as a CSV to reuse or hand out.
- **Checks** for mirrored specimens (offers to flip them), outliers, mixed units and files that don't fit the rest.
- **Allometry** in the Size tab: shape regressed on log centroid size (R², F and a permutation test, as geomorph's `procD.lm(coords ~ log(Csize))`), regression scores against log size (as `plotAllometry(method = "RegScore")`), and the predicted shape change from the smallest to the largest specimen. With a grouping chosen under *Colour by*, allometry can also be fitted by group, as geomorph does: separate slopes (with the test of slopes, i.e. `anova(coords ~ log(Csize) + group, coords ~ log(Csize) * group)`, and pairwise angles between slopes and differences in their length, as `pairwise(..., covariate = log(Csize))`), or a common slope (groups compared at the same size: the group term and distances between size-adjusted means). These tests permute residuals of the simpler model (RRPP), as geomorph, and with the same permutations the p-values equal geomorph's. The allometry can be removed from the PCA: within groups (common slope, so group differences are kept) when a grouping is chosen, otherwise pooled (residuals added to the mean).
- **Animates shape change**: a Play button moves along a PC, from one group mean to another, or from small to large, and the slider beside it scrubs by hand.
- **Saves projects**: one zip with the data files as they were opened and every setting (groups, links, colours, flips, left-out specimens and landmarks, bilateral pairs, sliders, tab and view). Open it with *Open files* to carry on, hand out an exercise or hand in work.
- **Exports** scores, aligned coordinates, consensus, eigenvalues and loadings as CSV (and group means, group statistics and pairwise tests when groups are chosen, and the allometry scores and predicted shapes), and figures as SVG or PNG.

Other statistical tests (Procrustes ANOVA, allometry) are left to R. The exported tables are ready for it.

## Using it

Open `index.html` or the single-file build, and drop in files. *Example data* loads invented fish.

To colour by group, add a CSV with a specimen column (`specimen_id`, `id`, or simply the first column) and one column per grouping.

## Things to know

- **TPS has no landmark names.** Rows are matched by order, so mixing TPS with `.lmk.json` asks you to confirm the order first.
- **TPS `CURVES=` blocks are skipped.** Our own TPS exports write semilandmarks as ordinary rows, so they look like fixed landmarks after import. To slide them, load a sliders file: three columns (before, slide, after) of row numbers, as geomorph's curves matrix (`define.sliders`), or of point ids. The same file can replace a template's sliders.
- **TPS IDs may contain the operator** when a combined export had several operators (`A_ann_r2`). The replicate is read back; the operator stays part of the ID.
- **Semilandmarks are treated as fixed landmarks by default.** They can also slide, or be left out. Sliders from a template: points slide between their neighbours; an end anchored on a landmark (`start`, `end`) slides towards it, a free end stays put, and a closed curve wraps round.
- **Sliding follows geomorph step for step**, so the results equal `gpagen(curves = sliders, ProcD = FALSE)` (bending energy) or `ProcD = TRUE` with geomorph's default iterations (at most 10 rounds). geomorph doesn't put the points back on the curve or re-centre them after sliding, and more rounds let them drift further along their tangents, so the number of rounds is kept as in geomorph. The sliders used are in `sliders.csv` in the results, numbered as the aligned coordinates.
- **Missing landmarks** can be imputed by mirroring (paired landmarks, from the template's `bilateral_pair` or a loaded CSV), thin-plate spline, regression or mean substitution, optionally mirroring first, with a limit per specimen and a choice of reference (all complete specimens, or the same group). Only landmarks marked `missing` are imputed unless "not yet placed" is ticked. Imputed landmarks are ringed in the figures, shown in the Data table, and listed in `imputed.csv`. Gaps that are not imputed lead to leaving out the specimen (default) or the landmark.
- **Imputation and geomorph:** the thin-plate spline matches `estimate.missing(method = "TPS")`. Regression follows `method = "Reg"`, except that the incomplete specimen is placed where a reference specimen of its size has those landmarks, rather than centred on its own; on the test data that is several times more accurate. Mean substitution shrinks variation and is there mainly for teaching.
- **Group tests** follow geomorph: distances between group means as `pairwise(..., test.type = "dist")` on `coords ~ group`, and Procrustes variance and its differences as `morphol.disparity(coords ~ group, groups = ~ group)`. Specimens are shuffled among groups (999 times by default, with a fixed seed, so the numbers don't change between runs); p counts the observed data as one of the permutations. With the same permutations, the p-values equal geomorph's. Replicates kept as separate records count as separate specimens, which makes p-values too small: average them first. Specimens without a group are left out.
- **y points up**, as in TPS. 2D `.lmk.json` files are flipped on import.
- **Centroid size in pixels** is only comparable at equal magnification.

## Development

Plain JavaScript, no framework and no runtime dependencies. See `CLAUDE.md` for the structure.

```
npm install
npm test            # unit tests
npm run test:e2e    # builds, then runs Playwright
npm start           # serves on http://localhost:8080
```

The results are compared with geomorph on synthetic data. `tests/fixtures/geomorph-reference.R` regenerates the reference values.

To publish: Settings → Pages → Source: GitHub Actions. The site then deploys when tests pass on `main`.

MIT licensed.
