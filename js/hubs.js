(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function card(o) {
    var b = document.createElement('button');
    b.className = 'hubCard';
    b.type = 'button';
    if (o.key) b.id = 'hubCard-' + o.key;
    b.style.setProperty('--hubA', o.a);
    b.style.setProperty('--hubB', o.b);

    var ico = document.createElement('span');
    ico.className = 'hubIco';
    ico.setAttribute('aria-hidden', 'true');
    ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + o.svg + '</svg>';

    var nm = document.createElement('span');
    nm.className = 'hubName';
    nm.textContent = o.name;

    var ds = document.createElement('span');
    ds.className = 'hubBlurb';
    ds.textContent = o.desc;

    var go = document.createElement('span');
    go.className = 'hubGo';
    go.textContent = o.cta;

    b.appendChild(ico); b.appendChild(nm); b.appendChild(ds); b.appendChild(go);
    b.addEventListener('click', o.go);
    return b;
  }

  function paint(host, list) {
    if (!host) return;
    host.innerHTML = '';
    list.forEach(function (o) { host.appendChild(card(o)); });
  }

  function openPage(id, before, bn) {
    if (!window.currentUser) {
      if (typeof showToast === 'function') showToast('Sign in to see this');
      if (typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    if (typeof bnCloseAllSections === 'function') bnCloseAllSections();
    if (!el(id)) return;
    if (bn && typeof bnSetActive === 'function') bnSetActive(bn);
    if (before) before();
    dzPanelOpen(id);
    if (typeof window.dzRouteAudit === 'function') window.dzRouteAudit();
  }
  function closePage(id) { dzPanelShut(id); }

  var AN = [
    { key:'artwork', name:'Artwork', a:'#A78BFA', b:'#6D28D9',
      desc:'Views, likes, saves and where your audience arrives from, piece by piece.',
      cta:'Explore data',
      svg:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/>' +
          '<path d="M21 15l-5-5L5 21"/>' },
    { key:'marketplace', name:'Marketplace', a:'#FB923C', b:'#C2410C',
      desc:'Sales, revenue and conversion — the one board that counts money.',
      cta:'Explore data',
      svg:'<path d="M3 9.4 4.8 4.3A2 2 0 0 1 6.7 3h10.6a2 2 0 0 1 1.9 1.3L21 9.4"/>' +
          '<path d="M4.6 9.4V19a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2V9.4"/><path d="M3 9.4h18"/>' +
          '<path d="M9.6 21v-5.4h4.8V21"/>' },
    { key:'blog', name:'Blog', a:'#818CF8', b:'#4338CA',
      desc:'Reads, reading time and which posts kept people to the end.',
      cta:'Explore data',
      svg:'<rect x="3.4" y="3" width="17.2" height="18" rx="2.4"/><path d="M7.3 8.2h9.4"/>' +
          '<path d="M7.3 12h9.4"/><path d="M7.3 15.8h5.2"/>' },
    { key:'resource', name:'Resources', a:'#4ADE80', b:'#15803D',
      desc:'Downloads, saves and which of your packs people keep coming back for.',
      cta:'Explore data',
      svg:'<path d="M12 2.7 2.8 7.1 12 11.5l9.2-4.4z"/><path d="M3.2 12.1 12 16.3l8.8-4.2"/>' +
          '<path d="M3.2 16.5 12 20.7l8.8-4.2"/>' }
  ];

  function anHubOpen() {
    openPage('anHubPage', function () {
      paint(el('anHubGrid'), AN.map(function (o) {
        var c = {}; for (var k in o) c[k] = o[k];
        c.go = function () {
          if (typeof window.openAnalyticsPage === 'function') window.openAnalyticsPage(o.key);
        };
        return c;
      }));
    }, 'bnAnalytics');
  }
  function anHubClose() { closePage('anHubPage'); }

  function payHubOpen() {
    openPage('payHubPage', function () {
      if (typeof window.dzExtras === 'function') { try { window.dzExtras(); } catch (e) {} }
    }, 'bnPayouts');
  }
  function payHubClose() { closePage('payHubPage'); }

  window.dzPayHubFill = function (list) {
    var host = el('payHubGrid');
    if (!host || !list || !list.length) return;
    paint(host, list);
    var note = el('payHubNote');
    if (note) note.style.display = 'none';
  };

  window.anHubOpen   = anHubOpen;
  window.anHubClose  = anHubClose;
  window.payHubOpen  = payHubOpen;
  window.payHubClose = payHubClose;
})();
