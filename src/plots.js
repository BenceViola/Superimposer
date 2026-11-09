(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupPlots = factory();
}(typeof self !== 'undefined' ? self : this, function () { 'use strict'; return {}; }));
