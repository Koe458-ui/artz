    (function () {
      'use strict';
      function $ (id) { return document.getElementById(id); }

      window.cmChatPanelOpen = function () {
        var p = $('cmChatPanel'); if (!p) return;
        p.style.paddingBottom = '';
        p.classList.add('open');
      };
      window.cmChatPanelClose = function () {
        var p = $('cmChatPanel'); if (!p) return;
        p.classList.remove('open');
        p.style.paddingBottom = '';
      };
      window.cmChatPanelReset = function () {
        var p = $('cmChatPanel'); if (!p) return;
        p.classList.add('noAnim');
        p.classList.remove('open');
        p.style.paddingBottom = '';
        void p.offsetWidth;
        p.classList.remove('noAnim');
      };

      window.cmHdrChatMode = function (o) {
        o = o || {};
        var hdr = $('cmHdr'); if (!hdr) return;
        var img = $('cmHdrAvImg'), txt = $('cmHdrAvTxt'), av = $('cmHdrAv');
        var nm  = $('cmHdrName'), sub = $('cmHdrSub'), tap = $('cmHdrTap');

        if (av)  av.style.background = o.grad || 'linear-gradient(135deg,var(--pb),var(--pg))';
        if (img && txt) {
          if (o.avatar) {
            img.src = (typeof getThumbnailUrl === 'function') ? getThumbnailUrl(o.avatar) : o.avatar;
            img.style.display = 'block'; txt.style.display = 'none';
            img.onerror = function () {
              img.style.display = 'none'; txt.style.display = '';
              txt.textContent = o.emoji || o.letter || '?';
            };
          } else {
            img.removeAttribute('src'); img.style.display = 'none';
            txt.style.display = ''; txt.textContent = o.emoji || o.letter || '?';
          }
        }
        if (nm)  nm.textContent = o.name || 'Chat';
        if (sub) {
          sub.innerHTML = '';
          if (o.subDot) { var d = document.createElement('span'); d.className = 'dot'; sub.appendChild(d); }
          if (o.sub) { var s = document.createElement('span'); s.textContent = o.sub; sub.appendChild(s); }
          sub.style.display = (o.sub || o.subDot) ? 'flex' : 'none';
        }
        if (tap) {
          tap.onclick = o.tap || null;
          tap.classList.toggle('on', !!o.tap);
          if (o.tap) { tap.setAttribute('role', 'button'); tap.setAttribute('tabindex', '0'); }
          else { tap.removeAttribute('role'); tap.removeAttribute('tabindex'); }
        }
        hdr.classList.add('chat');
        var back = $('cmHdrBack'); if (back) back.classList.add('show');
      };
      window.cmHdrHomeMode = function () {
        var tap = $('cmHdrTap');
        if (tap) {
          tap.onclick = null;
          tap.classList.remove('on');
          tap.removeAttribute('role');
          tap.removeAttribute('tabindex');
        }
      };

      window.cmHomeReset = function () {
        var scroll = $('cmGridScroll');
        if (scroll) scroll.scrollTop = 0;
      };

      window.cmSyncCount = function () {
        var pane = $('cmGridScroll'), total = $('cmStatNum');
        if (total && pane) total.textContent = pane.querySelectorAll('.cmCard').length;
        paintCaps();
      };
      window.cmSetFriendCount = function (n) {
        var el = $('cmStatFriends');
        if (el) el.textContent = Number(n) || 0;
      };
      function paintCaps () {
        var c = window.CM_MAX_JOINED, f = window.FR_MAX_FRIENDS;
        var max = $('cmCapMax');   if (max && c) max.textContent = c;
        var note = $('cmBannerNoteTxt');
        if (note && c && f) note.textContent = 'Join up to ' + c + ' communities and ' + f + ' friends.';
      }

      var CHAT_BANDS = [
        { ms: 10000,    max: 5,    label: '5 messages in ten seconds' },
        { ms: 60000,    max: 30,   label: '30 messages in a minute' },
        { ms: 600000,   max: 150,  label: '150 messages in ten minutes' },
        { ms: 3600000,  max: 500,  label: '500 messages in an hour' },
        { ms: 86400000, max: 3000, label: '3000 messages in a day' }
      ];
      var CHAT_MAX_CHARS = 1000;
      var CHAT_MIN_GAP_MS = 1000;
      var CHAT_DUPE_MS = 30000;

      var sent = [];
      var lastText = '';
      var lastTextAt = 0;
      var coolUntil = 0;
      var coolReason = '';
      var coolTimer = null;
      var coolTargets = [];

      function norm (s) { return String(s || '').trim().toLowerCase(); }
      function secsLeft () { return Math.max(0, Math.ceil((coolUntil - Date.now()) / 1000)); }

      function paintCooldown () {
        var left = secsLeft();
        coolTargets.forEach(function (t) {
          var btn = $(t.btn); if (!btn) return;
          btn.disabled = left > 0;
          btn.title = left > 0 ? (coolReason + ' — ' + left + 's') : (t.label || 'Send');
        });
        if (left > 0) return;
        clearInterval(coolTimer); coolTimer = null; coolReason = '';
      }

      function startCooldown (seconds, reason) {
        coolUntil = Date.now() + (Number(seconds) || 0) * 1000;
        coolReason = reason || 'Slow down';
        clearInterval(coolTimer);
        coolTimer = setInterval(paintCooldown, 500);
        paintCooldown();
      }

      window.dzChat = {
        MAX_CHARS: CHAT_MAX_CHARS,

        watch: function (btnId, label) {
          if (!coolTargets.some(function (t) { return t.btn === btnId; })) {
            coolTargets.push({ btn: btnId, label: label });
          }
        },

        check: function (text) {
          var now = Date.now();
          var left = secsLeft();
          if (left > 0) return coolReason + ' — try again in ' + left + 's';

          var t = String(text || '');
          if (t.length > CHAT_MAX_CHARS) {
            return 'That is over ' + CHAT_MAX_CHARS + ' characters — shorten it';
          }
          if (norm(t) && norm(t) === lastText && now - lastTextAt < CHAT_DUPE_MS) {
            return 'You just sent that — wait ' +
                   Math.ceil((CHAT_DUPE_MS - (now - lastTextAt)) / 1000) + 's';
          }
          if (sent.length && now - sent[sent.length - 1] < CHAT_MIN_GAP_MS) {
            return 'One message a second';
          }
          for (var i = CHAT_BANDS.length - 1; i >= 0; i--) {
            var b = CHAT_BANDS[i];
            var n = 0;
            for (var j = sent.length - 1; j >= 0 && now - sent[j] < b.ms; j--) n++;
            if (n >= b.max) return 'That is ' + b.label + ' — take a moment';
          }
          return null;
        },

        note: function (text) {
          var now = Date.now();
          sent.push(now);
          var cut = now - CHAT_BANDS[CHAT_BANDS.length - 1].ms;
          while (sent.length && sent[0] < cut) sent.shift();
          lastText = norm(text); lastTextAt = now;
        },

        async fromServer (sb) {
          try {
            var r = await sb.rpc('dz_chat_status');
            var row = r && r.data && r.data[0];
            if (!row) return 'That didn’t send — try again';
            var s = Number(row.cooldown_seconds) || 0;
            var why = row.reason || 'Slow down';
            if (s > 0) startCooldown(s, why);
            return why + (s > 0 ? ' — try again in ' + s + 's' : '');
          } catch (e) {
            return 'That didn’t send — try again';
          }
        }
      };

      document.addEventListener('DOMContentLoaded', function () {
        window.dzChat.watch('cpBarSend', 'Send');
        window.dzChat.watch('dmSendBtn', 'Send');
        window.cmSyncCount();
      });
    })();
