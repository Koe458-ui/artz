(function () {
  'use strict';

  var MEDIA = 'img,picture,canvas,video,svg,image';
  var FIELD = 'input,textarea,[contenteditable=""],[contenteditable="true"]';

  function isProtected(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('[data-allow-save]')) return false;
    if (el.matches(MEDIA)) return true;
    return !!el.closest(MEDIA);
  }

  document.addEventListener('contextmenu', function (e) {
    if (isProtected(e.target)) e.preventDefault();
  }, true);

  document.addEventListener('dragstart', function (e) {
    if (isProtected(e.target)) e.preventDefault();
  }, true);

  function inField(el) {
    if (!el || el.nodeType !== 1) return false;
    return !!(el.closest && el.closest(FIELD));
  }

  function selectable(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (!el || el.nodeType !== 1) return false;
    var cs = window.getComputedStyle(el);
    var v = cs.webkitUserSelect || cs.userSelect;
    return !!v && v !== 'none';
  }

  function rangeAllowed(range) {
    var root = range.commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentElement;
    if (!root) return false;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node, seen = 0;
    while ((node = walker.nextNode())) {
      if (++seen > 5000) return false;
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      if (range.intersectsNode && !range.intersectsNode(node)) continue;
      if (!selectable(node.parentElement)) return false;
    }
    return true;
  }

  function guardClipboard(e) {
    if (inField(e.target) || inField(document.activeElement)) return;

    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) { e.preventDefault(); return; }

    for (var i = 0; i < sel.rangeCount; i++) {
      if (!rangeAllowed(sel.getRangeAt(i))) {
        e.preventDefault();
        sel.removeAllRanges();
        return;
      }
    }
  }

  document.addEventListener('copy', guardClipboard, true);
  document.addEventListener('cut', guardClipboard, true);

  document.addEventListener('selectstart', function (e) {
    if (isProtected(e.target)) { e.preventDefault(); return; }
    if (inField(e.target)) return;
    if (!selectable(e.target)) e.preventDefault();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (inField(e.target) || inField(document.activeElement)) return;
    var k = (e.key || '').toLowerCase();
    if (k === 's') {
      e.preventDefault();
      if (typeof window.showToast === 'function') {
        window.showToast('Use the Download button to save artwork');
      }
    }
  }, true);
})();
