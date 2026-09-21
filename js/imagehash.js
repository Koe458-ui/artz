(function () {
  'use strict';

    // Perceptual hash for an uploaded image, stored on the row as `phash`. It is a fingerprint only — nothing
    // is gated on it, and a match never stops an upload.

  function fileToBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file);
    }
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Could not read image')); };
      img.src = url;
    });
  }

  async function computeDHash(file) {
    var bmp = await fileToBitmap(file);
    var W = 9, H = 8;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, W, H);
    if (bmp.close) { try { bmp.close(); } catch (e) {} }
    var d = ctx.getImageData(0, 0, W, H).data;
    var gray = new Array(W * H);
    for (var i = 0; i < W * H; i++) {
      gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }
    var hex = '';
    var nibble = 0, bitCount = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W - 1; x++) {
        var bit = gray[y * W + x] < gray[y * W + x + 1] ? 1 : 0;
        nibble = (nibble << 1) | bit;
        bitCount++;
        if (bitCount === 4) { hex += nibble.toString(16); nibble = 0; bitCount = 0; }
      }
    }
    return hex;
  }

  var POP = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];
  function hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      d += POP[(parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 15];
    }
    return d;
  }

    // Never throws: a hash that could not be taken is simply absent, and the upload carries on without it.
  async function phashOf(file) {
    try { return await computeDHash(file); } catch (e) { return null; }
  }

  window.ImageHash = {
    computeDHash: computeDHash,
    hamming: hamming,
    phashOf: phashOf
  };
})();
