(function () {
  'use strict';

function qrMake (text) {
  'use strict';
  var ECL_M = { ord: 1, fmt: 0 };
  var data = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) { data.push(c); }
    else {
      var enc = unescape(encodeURIComponent(text[i]));
      for (var k = 0; k < enc.length; k++) data.push(enc.charCodeAt(k));
    }
  }

  var ECC_PER_BLOCK_M  = [10,16,26,18,24,16,18,22,22,26];
  var NUM_BLOCKS_M     = [1,1,1,2,2,4,4,4,5,5];

  function rawModules (ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCapacityBytes (ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK_M[ver-1] * NUM_BLOCKS_M[ver-1];
  }

  var ver = -1;
  for (var v = 1; v <= 10; v++) {
    var cntBits = v <= 9 ? 8 : 16;
    var needBits = 4 + cntBits + data.length * 8;
    if (needBits <= dataCapacityBytes(v) * 8) { ver = v; break; }
  }
  if (ver < 0) throw new Error('Data too long');
  var size = ver * 4 + 17;
  var countBits = ver <= 9 ? 8 : 16;

  var bits = [];
  function pushBits (val, n) { for (var b = n - 1; b >= 0; b--) bits.push((val >>> b) & 1); }
  pushBits(4, 4);
  pushBits(data.length, countBits);
  data.forEach(function (byte) { pushBits(byte, 8); });
  var capBits = dataCapacityBytes(ver) * 8;
  pushBits(0, Math.min(4, capBits - bits.length));
  pushBits(0, (8 - bits.length % 8) % 8);
  for (var pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) pushBits(pad, 8);
  var dataCw = [];
  for (var bi = 0; bi < bits.length; bi += 8) {
    var by = 0;
    for (var j = 0; j < 8; j++) by = (by << 1) | bits[bi + j];
    dataCw.push(by);
  }

  function gfMul (x, y) {
    var z = 0;
    for (var b = 7; b >= 0; b--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> b) & 1) * x;
    }
    return z;
  }
  function rsDivisor (degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 2);
    }
    return result;
  }
  function rsRemainder (msg, divisor) {
    var result = divisor.map(function () { return 0; });
    msg.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  var numBlocks = NUM_BLOCKS_M[ver-1], eccLen = ECC_PER_BLOCK_M[ver-1];
  var totalCw = Math.floor(rawModules(ver) / 8);
  var numShort = numBlocks - totalCw % numBlocks;
  var shortLen = Math.floor(totalCw / numBlocks);
  var blocks = [], off = 0, divisor = rsDivisor(eccLen);
  for (var b2 = 0; b2 < numBlocks; b2++) {
    var dlen = shortLen - eccLen + (b2 < numShort ? 0 : 1);
    var dat = dataCw.slice(off, off + dlen); off += dlen;
    var ecc = rsRemainder(dat, divisor);
    blocks.push({ data: dat, ecc: ecc });
  }
  var allCw = [];
  var maxDataLen = shortLen - eccLen + 1;
  for (var ci = 0; ci < maxDataLen; ci++)
    blocks.forEach(function (blk) { if (ci < blk.data.length) allCw.push(blk.data[ci]); });
  for (var ce = 0; ce < eccLen; ce++)
    blocks.forEach(function (blk) { allCw.push(blk.ecc[ce]); });

  var grid = [], func = [];
  for (var y = 0; y < size; y++) { grid.push(new Array(size).fill(false)); func.push(new Array(size).fill(false)); }
  function setF (x, y, dark) { grid[y][x] = dark; func[y][x] = true; }

  function finder (cx, cy) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      var dist = Math.max(Math.abs(dx), Math.abs(dy));
      setF(x, y, dist !== 2 && dist !== 4);
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  for (var t = 0; t < size; t++) {
    if (!func[6][t]) setF(t, 6, t % 2 === 0);
    if (!func[t][6]) setF(6, t, t % 2 === 0);
  }
  var alignPos = [];
  if (ver > 1) {
    var na2 = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na2 * 2 - 2)) * 2;
    alignPos = [6];
    for (var pos = size - 7; alignPos.length < na2; pos -= step) alignPos.splice(1, 0, pos);
  }
  alignPos.forEach(function (ay) {
    alignPos.forEach(function (ax) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    });
  });
  for (var fi = 0; fi <= 8; fi++) {
    if (fi !== 6) { setF(8, fi, false); setF(fi, 8, false); }
    if (fi < 8)  { setF(size - 1 - fi, 8, false); setF(8, size - 1 - fi, false); }
  }
  setF(8, size - 8, true);
  if (ver >= 7) {
    var vrem = ver;
    for (var vi = 0; vi < 12; vi++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1F25);
    var vbits = ver << 12 | vrem;
    for (var vb = 0; vb < 18; vb++) {
      var bit = ((vbits >>> vb) & 1) === 1;
      var a = size - 11 + vb % 3, c = Math.floor(vb / 3);
      setF(a, c, bit); setF(c, a, bit);
    }
  }

  function placeData (cw, readMode) {
    var out = readMode ? [] : null;
    var i2 = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jx = 0; jx < 2; jx++) {
          var x = right - jx;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (func[y][x]) continue;
          if (readMode) { out.push(grid[y][x] ? 1 : 0); }
          else {
            var dark = false;
            if (i2 < cw.length * 8) dark = ((cw[i2 >>> 3] >>> (7 - (i2 & 7))) & 1) === 1;
            grid[y][x] = dark;
          }
          i2++;
        }
      }
    }
    return readMode ? out : i2;
  }
  placeData(allCw, false);

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];
  function applyMask (m) {
    for (var y2 = 0; y2 < size; y2++) for (var x2 = 0; x2 < size; x2++)
      if (!func[y2][x2] && MASKS[m](x2, y2)) grid[y2][x2] = !grid[y2][x2];
  }
  function drawFormat (mask) {
    var fdata = ECL_M.fmt << 3 | mask;
    var rem = fdata;
    for (var r2 = 0; r2 < 10; r2++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var fbits = (fdata << 10 | rem) ^ 0x5412;
    function bit (i3) { return ((fbits >>> i3) & 1) === 1; }
    for (var i3 = 0; i3 <= 5; i3++) setF(8, i3, bit(i3));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (var i4 = 9; i4 < 15; i4++) setF(14 - i4, 8, bit(i4));
    for (var i5 = 0; i5 < 8; i5++) setF(size - 1 - i5, 8, bit(i5));
    for (var i6 = 8; i6 < 15; i6++) setF(8, size - 15 + i6, bit(i6));
    setF(8, size - 8, true);
  }
  function penalty () {
    var p = 0, y3, x3;
    for (y3 = 0; y3 < size; y3++) {
      var runC = grid[y3][0], runL = 1;
      for (x3 = 1; x3 < size; x3++) {
        if (grid[y3][x3] === runC) { runL++; if (runL === 5) p += 3; else if (runL > 5) p++; }
        else { runC = grid[y3][x3]; runL = 1; }
      }
    }
    for (x3 = 0; x3 < size; x3++) {
      var runC2 = grid[0][x3], runL2 = 1;
      for (y3 = 1; y3 < size; y3++) {
        if (grid[y3][x3] === runC2) { runL2++; if (runL2 === 5) p += 3; else if (runL2 > 5) p++; }
        else { runC2 = grid[y3][x3]; runL2 = 1; }
      }
    }
    for (y3 = 0; y3 < size - 1; y3++) for (x3 = 0; x3 < size - 1; x3++) {
      var c2 = grid[y3][x3];
      if (c2 === grid[y3][x3+1] && c2 === grid[y3+1][x3] && c2 === grid[y3+1][x3+1]) p += 3;
    }
    var PAT = [1,0,1,1,1,0,1];
    function runHas (get, len) {
      for (var s2 = 0; s2 < len - 10; s2++) {
        var okA = true, okB = true;
        for (var q2 = 0; q2 < 7; q2++) if (!!get(s2 + 4 + q2) !== !!PAT[q2]) { okA = false; break; }
        for (var q3 = 0; q3 < 4; q3++) if (get(s2 + q3)) { okA = false; break; }
        for (var q4 = 0; q4 < 7; q4++) if (!!get(s2 + q4) !== !!PAT[q4]) { okB = false; break; }
        for (var q5 = 0; q5 < 4; q5++) if (get(s2 + 7 + q5)) { okB = false; break; }
        if (okA) p += 40;
        if (okB) p += 40;
      }
    }
    for (y3 = 0; y3 < size; y3++) (function (yy) { runHas(function (x4) { return grid[yy][x4]; }, size); })(y3);
    for (x3 = 0; x3 < size; x3++) (function (xx) { runHas(function (y4) { return grid[y4][xx]; }, size); })(x3);
    var dark = 0;
    for (y3 = 0; y3 < size; y3++) for (x3 = 0; x3 < size; x3++) if (grid[y3][x3]) dark++;
    var pct = dark * 100 / (size * size);
    p += Math.floor(Math.abs(pct * 2 - 100) / 10) * 10;
    return p;
  }
  var best = 0, bestP = Infinity;
  for (var m2 = 0; m2 < 8; m2++) {
    applyMask(m2); drawFormat(m2);
    var pp = penalty();
    if (pp < bestP) { bestP = pp; best = m2; }
    applyMask(m2);
  }
  applyMask(best); drawFormat(best);

  return { size: size, get: function (x, y) { return grid[y][x]; } };
}

  function qrToSvg (q, quiet) {
    quiet = quiet == null ? 4 : quiet;
    var n = q.size, t = n + quiet * 2, path = '';
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++)
        if (q.get(x, y)) path += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img">' +
           '<rect width="' + t + '" height="' + t + '" fill="#FFFFFF"/>' +
           '<path d="' + path + '" fill="#131317"/></svg>';
  }

  var shareUrl = '';

  window.openPfShare = function () {
    var prof = (window.pf && window.pf.profile) || null;
    var uname = prof && prof.username;
    if (!uname) { if (typeof showToast === 'function') showToast('Open a profile to share it'); return; }
    shareUrl = location.origin + '/profile/' + encodeURIComponent(uname);
    var qrEl = document.getElementById('pfShareQr');
    try { qrEl.innerHTML = qrToSvg(qrMake(shareUrl), 4); }
    catch (e) { qrEl.innerHTML = ''; }
    document.getElementById('pfShareUser').textContent = '@' + uname;
    document.getElementById('pfShareLink').textContent = shareUrl.replace(/^https?:\/\//, '');
    document.getElementById('pfShareMod').classList.add('open');
  };
  window.closePfShare = function () {
    document.getElementById('pfShareMod').classList.remove('open');
  };
  window.pfShareCopy = function () {
    if (!shareUrl) return;
    function ok () { if (typeof showToast === 'function') showToast('Link copied'); }
    function fallback () {
      var ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { if (typeof showToast === 'function') showToast('Couldn\u2019t copy \u2014 long-press the link instead'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(ok, fallback);
    } else fallback();
  };
  window.pfShareNative = function () {
    if (!shareUrl) return;
    var uname = document.getElementById('pfShareUser').textContent || '';
    if (navigator.share) {
      navigator.share({
        title: 'DigiArtz \u2014 ' + uname,
        text: 'Check out ' + uname + ' on DigiArtz',
        url: shareUrl
      }).catch(function () {   });
    } else {
      window.pfShareCopy();
    }
  };

  document.addEventListener('click', function (e) {
    var mod = document.getElementById('pfShareMod');
    if (mod && e.target === mod) window.closePfShare();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var mod = document.getElementById('pfShareMod');
    if (mod && mod.classList.contains('open')) window.closePfShare();
  });
})();
