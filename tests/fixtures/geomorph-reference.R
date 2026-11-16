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
# written at the end
#write_json(out, "tests/fixtures/geomorph-reference.json", digits = 12, auto_unbox = TRUE, matrix = "rowmajor")

# Missing landmarks: estimate.missing with both methods, on copies with a few landmarks removed.
# Indices are 1-based here; the JSON stores them 0-based.
holes <- function(file, gaps) {
  A <- readland.tps(file, specID = "ID", warnmsg = FALSE)
  for (g in gaps) A[g$lm, , g$spec] <- NA
  list(
    gaps = lapply(gaps, function(g) list(spec = g$spec - 1, lm = g$lm - 1)),
    tps = lapply(gaps, function(g) unname(estimate.missing(A, method = "TPS")[, , g$spec])),
    reg = lapply(gaps, function(g) unname(estimate.missing(A, method = "Reg")[, , g$spec]))
  )
}
out$missing <- list(
  two = holes("tests/fixtures/synthetic-2d.tps", list(list(spec = 4, lm = 3), list(spec = 8, lm = c(6, 10)), list(spec = 13, lm = 1))),
  three = holes("tests/fixtures/synthetic-3d.tps", list(list(spec = 3, lm = 5), list(spec = 11, lm = c(2, 8))))
)
write_json(out, "tests/fixtures/geomorph-reference.json", digits = 12, auto_unbox = TRUE, matrix = "rowmajor")

# Groups: means, disparity and pairwise tests on the 2D set, with three arbitrary groups.
# The permutations are exported so the unit test can repeat them exactly.
A <- readland.tps("tests/fixtures/synthetic-2d.tps", specID = "ID", warnmsg = FALSE)
g <- gpagen(A, print.progress = FALSE, ProcD = FALSE, Proj = TRUE, PrinAxes = TRUE)
grp <- factor(rep(c("a", "b", "c"), times = c(10, 12, 8)))
gdf <- geomorph.data.frame(coords = g$coords, grp = grp)
iter <- 99
fit <- procD.lm(coords ~ grp, data = gdf, iter = iter, seed = 7, print.progress = FALSE)
pw <- summary(pairwise(fit, groups = grp), test.type = "dist", confidence = 0.95)
md <- morphol.disparity(coords ~ grp, groups = ~grp, data = gdf, iter = iter, seed = 7, print.progress = FALSE)
ind <- RRPP:::perm.index(dim(A)[3], iter = iter, seed = 7)
means <- lapply(levels(grp), function(l) unname(apply(g$coords[, , grp == l], c(1, 2), mean)))
out$groups <- list(
  labels = as.character(grp),
  coords = lapply(1:dim(A)[3], function(i) unname(g$coords[, , i])),
  csize = unname(g$Csize),
  means = means,
  distances = unname(as.matrix(pw$pairwise.tables$D)),
  p_distances = unname(as.matrix(pw$pairwise.tables$P)),
  disparity = unname(md$Procrustes.var),
  disparity_diff = unname(md$PV.dist),
  p_disparity = unname(md$PV.dist.Pval),
  perms = unname(lapply(ind[-1], function(x) x - 1))
)
write_json(out, "tests/fixtures/geomorph-reference.json", digits = 12, auto_unbox = TRUE, matrix = "rowmajor")

# Sliding semilandmarks: gpagen with a curves matrix, by bending energy and by Procrustes distance,
# with geomorph's default iterations. Written to a file of its own.
slide <- function(tps, csv) {
  A <- readland.tps(tps, specID = "ID", warnmsg = FALSE)
  cv <- as.matrix(read.csv(csv))
  run <- function(procD) {
    g <- gpagen(A, curves = cv, ProcD = procD, Proj = TRUE, PrinAxes = TRUE, print.progress = FALSE)
    list(iter = g$iter, csize = unname(g$Csize), consensus = unname(g$consensus),
         coords = lapply(1:dim(A)[3], function(i) unname(g$coords[, , i])))
  }
  list(n = dim(A)[3], p = dim(A)[1], k = dim(A)[2], curves = unname(cv),
       be = run(FALSE), procd = run(TRUE))
}
sl <- list(geomorph = as.character(packageVersion("geomorph")),
           two = slide("tests/fixtures/curves-2d.tps", "tests/fixtures/sliders-2d.csv"),
           three = slide("tests/fixtures/curves-3d.tps", "tests/fixtures/sliders-3d.csv"))
write_json(sl, "tests/fixtures/geomorph-sliders.json", digits = 12, auto_unbox = TRUE, matrix = "rowmajor")

# Allometry: shape on log centroid size (procD.lm), with the same permutations as the group tests,
# and regression scores as plotAllometry(method = "RegScore").
A <- readland.tps("tests/fixtures/synthetic-2d.tps", specID = "ID", warnmsg = FALSE)
g <- gpagen(A, print.progress = FALSE, ProcD = FALSE, Proj = TRUE, PrinAxes = TRUE)
gdf <- geomorph.data.frame(coords = g$coords, Csize = g$Csize)
fit <- procD.lm(coords ~ log(Csize), data = gdf, iter = 99, seed = 7, print.progress = FALSE)
tab <- fit$aov.table
pdf(NULL)
pa <- plotAllometry(fit, size = g$Csize, logsz = TRUE, method = "RegScore")
dev.off()
out <- jsonlite::fromJSON("tests/fixtures/geomorph-reference.json", simplifyVector = FALSE)
out$allometry <- list(
  ss = unname(tab$SS), df = unname(tab$Df), rsq = unname(tab$Rsq[1]), f = unname(tab$F[1]),
  z = unname(tab$Z[1]), p = unname(tab$`Pr(>F)`[1]),
  slope = unname(coef(fit)[2, ]),
  regscore = unname(as.vector(pa$RegScore))
)
write_json(out, "tests/fixtures/geomorph-reference.json", digits = 12, auto_unbox = TRUE, matrix = "rowmajor")
