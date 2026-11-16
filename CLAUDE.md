# Superimposer: notes for Claude Code

Browser app for basic geometric morphometrics on landmark-json and TPS data. Plain JavaScript, no framework, no build step, no runtime dependencies; hosted as static files on GitHub Pages and shared with students.

## Structure

All logic is pure and DOM-free (UMD: `window.SupX` in the browser, `require` in Node), so it can be unit tested.

- `src/io.js` (`SupIO`): parses TPS and landmark-json into specimen records, `assemble` combines them into a dataset (with the template's `curves`), zip reading and writing, group tables, sliders (`templateSliders`, `parseSliders`, `slidersCSV`; as row ids).
- `src/gm.js` (`SupGM`): `prepare` (dataset to complete matrix, including `impute`), `gpa` (with `sliders`, step for step as geomorph's `gpagen(curves = ...)`), `pca`, `tpsWarp` (2D and 3D), `impute` (mirroring, thin-plate spline, regression, mean), `findMirrored`, `repeatability`, `groupStats` (group means, Procrustes variance, distances between means, permutation tests; seeded), `ellipse`, `allometry` (shape on log centroid size, as `procD.lm`; regression scores; `corrected()` for the size-corrected PCA), `allometryByGroups` (common and separate slopes with RRPP: `anovaTable` gives type I SS with residuals of the reduced model permuted, as RRPP; the data are first reduced to at most n − 1 columns by `compactRows`, which keeps all sums of squares, distances and angles), `analyse` (whole chain).
- `src/exports.js` (`SupExport`): result tables as text.
- `src/plots.js` (`SupPlots`): figures as self-contained SVG strings, used for both the page and the exports.
- `src/links.js` (`SupLinks`): lines between landmarks, as pairs of row ids. They belong to the app, not the file format.
- `src/table.js` (`SupTable`): the Data table: editing group columns, building, sorting and filtering rows. A group table is the `{ columns, rows }` from `IO.parseTable`, so CSV files and edits are one thing. Group values belong to the specimen ID.
- `src/project.js` (`SupProject`): project files, a zip of `project.json` (settings and collections, each checked on reading; unknown or damaged ones are dropped with a warning) and `data/` (the files as opened, `S.sources`). New state worth keeping goes into its `SETTINGS` or `COLLECTIONS`.
- `src/example.js` (`SupExample`): invented fish, as landmark-json. Deep and slender forms, one mirrored fish, three with gaps, replicates, and relatively shorter heads in larger fish (allometry).
- `src/app.js`: UI only. One state object `S`, exposed as `window.__sup` for the browser tests; any change calls `rerun()` or `render()`. The calculation always runs; `S.fitted` decides whether the fitted results are shown, and goes back to false when new data arrive. Morphospace, Groups, Size and the results download wait for it. Group statistics and the allometry test are cached (`S.groupCache`, `S.alloCache`) and only computed for their tab and the download. Animations (`ANIM`) move one slider value and redraw only that figure; `rerun()` and tab changes stop them. Shape-change figures that animate get a fixed `frame` (both ends, and their grids; `frameFor`), so the drawing doesn't rescale as the target moves.
- Must keep working from `file://`: classic `<script src>` only, no ES module imports.

## Conventions

- Coordinates in a specimen record are y-up (as TPS) and already scaled. 3D units are converted to mm.
- Format rules are in `docs/landmark-json-spec.md`, a copy of the shared master spec. Follow it; if a change needs the format to change, say so rather than diverging silently.
- `ids` are stable; row order comes from the template (`export_order`), as in the landmarking apps.
- Rotations never reflect. Mirroring is only done on request (`flip`).
- A specimen record's `key` is unique; `id` is not (replicates, operators).

## Performance and reliability

- Never spread a list that can grow into function arguments (`Math.max(...xs)`, `push(...xs)`): it overflows the call stack on long lists, much sooner in Safari. Use loops (`extent()` in each module) or `concat`. `tests/unit/large.test.js` guards this.
- `app.js` reruns the analysis only when `analysisKey()` changes (data version plus `optsNow()`); display options, group edits and selection don't redo it. Anything new that affects the analysis must go through `optsNow()`.
- `rerun()` and `render()` catch errors and show them in `#message`, so one bad case doesn't leave a blank page.
- The Data table draws only the rows in view once there are more than `WINDOW_FROM` rows. The filter applies to `S.dtRows` at once and only the redraw waits for a pause in typing, so actions on rows never see stale ones; selection updates rows in place (`refreshSelection`), and keyboard movement goes by position in `S.dtRows`, not by DOM siblings.
- While a 3D view is dragged, figures draw at most `DRAG_POINTS` points; the full figure is drawn on release.
- Saved settings in `localStorage` are checked for shape before use (`VALID`); damaged entries are ignored.

## Working method: red/green TDD

Write the failing test first, see it fail, then implement. Commit red and green separately when that's practical.

- `npm test`: unit tests (node:test) in `tests/unit/`.
- `npm run test:e2e`: builds, then runs Playwright in `tests/e2e/`. `PW_CHANNEL=chrome` uses an installed Chrome; `PW_CHROME=<path>` a specific Chromium binary. Tests run in Chromium and WebKit; `--project=desktop` runs Chromium only.
- Run both before committing.
- `tests/unit/impute.test.js` compares imputation with geomorph's `estimate.missing`. Regression differs on purpose (placement of the incomplete specimen); the test passes `geomorphCentring: true` to show the rest agrees, and another test checks ours is more accurate.
- `tests/unit/gm-slide.test.js` compares sliding (bending energy and Procrustes distance, 2D and 3D) with `gpagen(curves = ...)` at geomorph's default iterations, to 1e-7. The procedure copies geomorph's exactly (first alignment to the first specimen, no re-centring after sliding, at most 10 rounds); running it longer doesn't converge, so don't "improve" it without a reason and a new reference.
- `tests/unit/allometry.test.js` compares the allometry with `procD.lm` and `plotAllometry`, with geomorph's permutations, so p must agree exactly. `tests/unit/allometry-groups.test.js` does the same for the models by group (`procD.lm`, `anova` of two models, `pairwise` with and without a covariate). RRPP evaluates size-adjusted means at the mean log size.
- `tests/unit/groups.test.js` compares group statistics with geomorph's `pairwise` and `morphol.disparity`, repeating geomorph's own permutations (exported in the fixture), so p-values must agree exactly.
- `tests/unit/gm-geomorph.test.js` compares with geomorph 4.1.1. The tolerance on aligned coordinates reflects geomorph's own stopping rule (at most a few iterations). Don't loosen it to get a test to pass; find out why it differs.
- Reference data: `node tests/fixtures/make-synthetic.js`, then `Rscript tests/fixtures/geomorph-reference.R`. The fixtures are invented shapes, to keep third-party data out of the repo.

## Next

A comparison of imputation methods (side by side, and recovering deleted landmarks of complete specimens). Surface semilandmarks (3D) are not planned yet.
