# Reference values for the unit tests, computed with geomorph.
#   Rscript tests/fixtures/geomorph-reference.R
# Writes tests/fixtures/geomorph-reference.json. Rerun only if the synthetic data change.
Sys.setenv(RGL_USE_NULL = "TRUE")
suppressMessages({ library(geomorph); library(jsonlite) })

one <- function(file) {
  A <- readland.tps(file, specID = "ID", warnmsg = FALSE)
  g <- gpagen(A, print.progress = FALSE, ProcD = FALSE, Proj = TRUE, PrinAxes = TRUE)
  p <- gm.prcomp(g$coords)
  n <- dim(A)[3]
  list(
    geomorph = as.character(packageVersion("geomorph")),
    n = n, p = dim(A)[1], k = dim(A)[2],
    first_raw = unname(A[, , 1]),
    csize = unname(g$Csize),
    consensus = unname(g$consensus),
    aligned_first = unname(g$coords[, , 1]),
    aligned_last = unname(g$coords[, , n]),
    sdev = unname(p$sdev),
    scores_pc1 = unname(p$x[, 1]),
    scores_pc2 = unname(p$x[, 2]),
    procd = unname(as.matrix(dist(two.d.array(g$coords))))
  )
}
out <- list(two = one("tests/fixtures/synthetic-2d.tps"), three = one("tests/fixtures/synthetic-3d.tps"))

# Thin-plate spline: from the consensus to the first specimen, at a few arbitrary points
query <- rbind(c(0, 0), c(0.1, -0.2), c(-0.3, 0.25), c(0.45, 0.1), c(-0.6, -0.5))
source_shape <- matrix(unlist(out$two$consensus), ncol = 2, byrow = FALSE)
target_shape <- matrix(unlist(out$two$aligned_first), ncol = 2, byrow = FALSE)
out$tps <- list(
  source = source_shape, target = target_shape, query = query,
  warped = geomorph:::tps2d(query, source_shape, target_shape)
)
write_json(out, "tests/fixtures/geomorph-reference.json", digits = 12, auto_unbox = TRUE, matrix = "rowmajor")
