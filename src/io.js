// Stub so the tests can load and fail one by one (red).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupIO = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {};
}));
