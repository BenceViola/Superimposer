# Superimposer

A small browser tool for basic geometric morphometrics, made to go with [Landmarker2D](https://github.com/BenceViola/Landmarker2D) and [Landmarker3D](https://github.com/BenceViola/Landmarker3D). Open landmark files and get a Procrustes superimposition, a PCA and the usual plots. Everything runs in the browser, so no data leave your computer.

## What it does

- **Reads** `.lmk.json` files, TPS files (`LM=` and `LM3=`), and hand-in zips.
- **Shows the raw data first**, as digitised. A button runs the fit, and another goes back, so the effect of the superimposition can be shown.
- **Superimposes** by full generalised Procrustes analysis, with centroid size and tangent-space projection.
- **Runs a PCA** on the tangent coordinates.
- **Plots** the superimposition, morphospace, scree plot, shape change along any PC, centroid size against PCs, and repeatability per landmark. 3D figures turn by dragging.
- **Shows individual specimens** picked in the morphospace, up to four side by side over the mean. A click on empty space gives the theoretical shape at that position.
- **Deformation grids** (thin-plate spline, 2D) as an alternative to arrows.
- **Specimen markers:** colour and marker follow the group, and can be changed for any specimen from the specimen list.
- **Data table:** every record with its details, editable group columns (type, paste from a spreadsheet, or assign ticked rows; rename or remove columns), and the coordinates with gaps marked. Arrow keys move between cells, and rows are selected as in a spreadsheet (Shift-click for a range, Ctrl/⌘-click for single rows); Ctrl/⌘ + Enter fills a value into every selected row.
- **Draws links** between landmarks, by clicking them or as an automatic outline or triangulation (2D). They show on every shape figure, and can be saved as a CSV to reuse or hand out.
- **Checks** for mirrored specimens (offers to flip them), outliers, mixed units and files that don't fit the rest.
- **Exports** scores, aligned coordinates, consensus, eigenvalues and loadings as CSV, and figures as SVG or PNG.

Statistical tests (Procrustes ANOVA, allometry) are left to R. The exported tables are ready for it.

## Using it

Open `index.html` or the single-file build, and drop in files. *Example data* loads invented fish.

To colour by group, add a CSV with a specimen column (`specimen_id`, `id`, or simply the first column) and one column per grouping.

## Things to know

- **TPS has no landmark names.** Rows are matched by order, so mixing TPS with `.lmk.json` asks you to confirm the order first.
- **TPS `CURVES=` blocks are skipped.** Our own TPS exports write semilandmarks as ordinary rows, so they look like fixed landmarks after import. For curve data, use `.lmk.json`.
- **TPS IDs may contain the operator** when a combined export had several operators (`A_ann_r2`). The replicate is read back; the operator stays part of the ID.
- **Semilandmarks are left out by default.** They can be included, but they are not slid yet, so such results are only exploratory.
- **Missing landmarks** can be imputed by mirroring (paired landmarks, from the template's `bilateral_pair` or a loaded CSV), thin-plate spline, regression or mean substitution, optionally mirroring first, with a limit per specimen and a choice of reference (all complete specimens, or the same group). Only landmarks marked `missing` are imputed unless "not yet placed" is ticked. Imputed landmarks are ringed in the figures, shown in the Data table, and listed in `imputed.csv`. Gaps that are not imputed lead to leaving out the specimen (default) or the landmark.
- **Imputation and geomorph:** the thin-plate spline matches `estimate.missing(method = "TPS")`. Regression follows `method = "Reg"`, except that the incomplete specimen is placed where a reference specimen of its size has those landmarks, rather than centred on its own; on the test data that is several times more accurate. Mean substitution shrinks variation and is there mainly for teaching.
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
