import { sbUrl, sbAnon, sbUser, sbService } from '../lib/sb.js';
import { ZERO_DECIMAL } from '../lib/money.js';
import { esc } from '../lib/http.js';

const PLANS = [
  {
    id: 'lite', name: 'Lite', tone: 'blue',
    tagline: 'For casual users', badge: null, featured: false,
    features: [
      '10 downloads per day — double the free limit',
      'Browse premium content previews',
      'High-quality 1600px downloads — originals need Premium',
      'Good for trying the platform',
    ],
    cta: 'Start Lite',
  },
  {
    id: 'premium', name: 'Premium', tone: 'purple',
    tagline: 'For active creators', badge: '★ Most Popular', featured: true,
    features: [
      '15 downloads per day — triple the free limit',
      'Full-resolution original files',
      'Full access to premium artworks',
      'Premium resources & blog extras',
      'Post 1 job a month — hiring needs a plan',
      'Better support',
    ],
    cta: 'Go Premium',
  },
  {
    id: 'max', name: 'Max', tone: 'gold',
    tagline: 'For power users and serious buyers', badge: '⚡ Best Value',
    featured: false,
    features: [
      '20 downloads per day — the highest limit',
      'Everything in Premium',
      'Keep 90% of every sale, not 85%',
      'No ads anywhere on the site',
      'A community of your own, without Level 100',
      'Upload artwork up to 25MB, and 400MB product files',
      'Post 2 jobs a month — twice Premium',
      'Early access to new features',
      'Priority support',
    ],
    cta: 'Get Max',
  },
];

const COMPARE = {
  cols: [
    { key: 'free',    label: 'Free',    tone: 'free'    },
    { key: 'lite',    label: 'Lite',    tone: 'lite'    },
    { key: 'premium', label: 'Premium', tone: 'premium' },
    { key: 'max',     label: 'Max',     tone: 'max'     },
  ],
  rows: [
    { label: 'Downloads per day',   free: '5',       lite: '10',      premium: '15',       max: '20' },
    { label: 'Download quality',    free: '1600px',  lite: '1600px',  premium: 'Original', max: 'Original' },
    { label: 'Artwork upload size', free: '20MB',    lite: '20MB',    premium: '20MB',     max: '25MB' },
    { label: 'Product file size',   free: '200MB',   lite: '200MB',   premium: '200MB',    max: '400MB' },
    { label: 'Job postings a month',free: false,     lite: false,     premium: '1',        max: '2' },
    { label: 'You keep on a sale',  free: '85%',     lite: '85%',     premium: '85%',      max: '90%' },
    { label: 'Premium artworks',    free: false,     lite: false,     premium: true,       max: true },
    { label: 'Community of your own', free: 'Level 100', lite: 'Level 100', premium: 'Level 100', max: 'Included' },
    { label: 'Ad free',             free: false,     lite: false,     premium: false,      max: true },
    { label: 'Priority support',    free: false,     lite: false,     premium: false,      max: true },
  ],
};

const CURRENCIES = [
  { code: 'USD', name: 'US dollar' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'SEK', name: 'Swedish krona' },
];
const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

function fmtMoney(minor, cur) {
  const major = ZERO_DECIMAL.has(cur) ? Number(minor) : Number(minor) / 100;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency: cur,
      minimumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : (major % 1 ? 2 : 0),
      maximumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2,
    }).format(major);
  } catch { return major + ' ' + cur; }
}

function plansHtml(priced) {
  const cards =
    '<div class="subGrid">' +
    priced.map((p) =>
      '<div class="subCard subCard--' + p.tone + (p.featured ? ' subCard--featured' : '') + '">' +
        '<div class="subCardInner">' +
          (p.badge ? '<div class="subBadge subBadge--' + p.tone + '">' + esc(p.badge) + '</div>' : '') +
          '<div class="subPlanName">' + esc(p.name) + '</div>' +
          '<div class="subTagline">' + esc(p.tagline) + '</div>' +
          '<div class="subPrice">' + esc(p.price) + '</div>' +
          '<div class="subPricePer">per month</div>' +
          '<div class="subCardDiv"></div>' +
          '<ul class="subFeatures">' +
          p.features.map((f) => '<li>' + esc(f) + '</li>').join('') +
          '</ul>' +
          '<button class="subBtn subBtn--' + p.tone + '" data-plan="' + esc(p.id) + '" ' +
            'aria-label="' + esc(p.cta) + '">' + esc(p.cta) + '</button>' +
        '</div>' +
      '</div>').join('') +
    '</div>';

  const compare =
    '<div class="subCmp" aria-labelledby="subCmpTitle">' +
      '<div class="subCmpTitle" id="subCmpTitle">Every plan, side by side</div>' +
      '<div class="subCmpScroll" tabindex="0" role="region" aria-label="Plan comparison, scrolls sideways">' +
        '<table class="subCmpTbl">' +
          '<thead><tr>' +
            '<th scope="col" class="subCmpFeat">Feature</th>' +
            COMPARE.cols.map((c) =>
              '<th scope="col" class="subCmpCol subCmpCol--' + c.tone + '">' + esc(c.label) + '</th>').join('') +
          '</tr></thead>' +
          '<tbody>' +
          COMPARE.rows.map((r) =>
            '<tr>' +
              '<th scope="row" class="subCmpFeat">' + esc(r.label) + '</th>' +
              COMPARE.cols.map((c) => {
                const v = r[c.key];
                const cell = v === true
                  ? '<span class="subCmpYes" aria-hidden="true">✓</span>' +
                    '<span class="srOnly">Included</span>'
                  : v === false
                  ? '<span class="subCmpNo" aria-hidden="true">✕</span>' +
                    '<span class="srOnly">Not included</span>'
                  : esc(v);
                return '<td class="subCmpCell subCmpCell--' + c.tone + '">' + cell + '</td>';
              }).join('') +
            '</tr>').join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<p class="subCmpNote">A community earned at artist Level 100 is yours for good. ' +
      'The one included with Max stays open while the subscription does, plus three days. ' +
      'Job postings refill once every plan month \u2014 Free and Lite read and apply to ' +
      'every posting, but putting one up needs Premium or Max.</p>' +
    '</div>';

  return '<div class="subPgHeadline"><h2>Choose Your Plan</h2>' +
         '<p>Support the project and unlock exclusive benefits</p></div>' +
         cards + compare;
}

const MODULE = `
(function(C){
  'use strict';

  var PATH_RZP =
    'M22.436 0l-11.91 7.773-1.174 4.276 6.625-4.297L11.65 24h4.391l6.395-24z' +
    'M14.26 10.098L3.389 17.166 1.564 24h9.008l3.688-13.902Z';
  var PATH_PP =
    'M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222' +
    'c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743' +
    'a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087zM19.79 6.142' +
    'c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083' +
    '-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612' +
    'c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126' +
    'a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z';

  function svgOf(path, fill){
    return '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"' +
      (fill ? ' style="fill:' + fill + '"' : '') + '><path d="' + path + '"/></svg>';
  }

  var MARKS = {
    visa: { name: 'Visa', hex: '#1A1F71',
      path: 'M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z' },
    mc: { name: 'MasterCard', hex: '#EB001B',
      path: 'M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z' },
    gpay: { name: 'Google Pay', hex: '#4285F4',
      path: 'M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z' },
    phonepe: { name: 'PhonePe', hex: '#5F259F',
      path: 'M10.206 9.941h2.949v4.692c-.402.201-.938.268-1.34.268-1.072 0-1.609-.536-1.609-1.743V9.941zm13.47 4.816c-1.523 6.449-7.985 10.442-14.433 8.919C2.794 22.154-1.199 15.691.324 9.243 1.847 2.794 8.309-1.199 14.757.324c6.449 1.523 10.442 7.985 8.919 14.433zm-6.231-5.888a.887.887 0 0 0-.871-.871h-1.609l-3.686-4.222c-.335-.402-.871-.536-1.407-.402l-1.274.401c-.201.067-.268.335-.134.469l4.021 3.82H6.386c-.201 0-.335.134-.335.335v.67c0 .469.402.871.871.871h.938v3.217c0 2.413 1.273 3.82 3.418 3.82.67 0 1.206-.067 1.877-.335v2.145c0 .603.469 1.072 1.072 1.072h.938a.432.432 0 0 0 .402-.402V9.874h1.542c.201 0 .335-.134.335-.335v-.67z' },
    paypal: { name: 'PayPal', hex: '#003087', path: PATH_PP }
  };

  function marksHtml(ids){
    if(!ids || !ids.length) return '';
    return '<span class="dzPayMarks">' + ids.map(function(k){
      var m = MARKS[k];
      return '<span class="dzPayMark" title="' + esc(m.name) + '" role="img" ' +
        'aria-label="' + esc(m.name) + '">' + svgOf(m.path, m.hex) + '</span>';
    }).join('') + '</span>';
  }

  var RZP_WAYS = {
    INR:   ['Credit card', 'Debit card', 'UPI', 'Net banking', 'Wallets', 'EMI'],
    other: ['Credit card', 'Debit card']
  };
  var RZP_MARKS = { INR: ['visa', 'mc', 'gpay', 'phonepe'], other: ['visa', 'mc'] };
  var RZP_NOTE = {
    INR:   'Pay by card, UPI, net banking or a wallet',
    other: 'Pay by card \\u2014 UPI and net banking need an item priced in rupees'
  };
  function rzpKey(cur){ return cur === 'INR' ? 'INR' : 'other'; }

  var PP_CURRENCIES = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','SEK','NOK',
    'DKK','PLN','CZK','HUF','NZD','SGD','HKD','MXN','BRL','ILS','PHP','THB','TWD'];

  function canTake(id, cur){
    if(id !== 'paypal') return true;
    return PP_CURRENCIES.indexOf(cur) !== -1;
  }

  var PROV = {
    rzp: {
      name: 'Razorpay',
      logo: svgOf(PATH_RZP),
      note: RZP_NOTE.other,
      marks: RZP_MARKS.other,
      ways: RZP_WAYS.other
    },
    paypal: {
      name: 'PayPal',
      logo: svgOf(PATH_PP),
      note: 'Pay from your PayPal account \\u2014 cards are not accepted here',
      marks: ['paypal'],
      ways: ['PayPal balance', 'Bank linked to PayPal']
    }
  };

  function esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function money(cents, cur){
    try{
      return new Intl.NumberFormat(undefined,{style:'currency',currency:cur||'USD'})
        .format((Number(cents)||0)/100);
    }catch(e){ return ((Number(cents)||0)/100).toFixed(2)+' '+(cur||'USD'); }
  }

  var ZERO_DEC = {JPY:1, HUF:1, TWD:1};
  function moneyMinor(v, cur){
    return money(ZERO_DEC[cur] ? Number(v) * 100 : v, cur);
  }
  function orderMoney(o){ return moneyMinor(o.amount, o.currency); }

  var sdks = {};
  function loadSdk(key, src, attrs, ready){
    var got = ready();
    if(got) return Promise.resolve(got);
    if(sdks[key]) return sdks[key];
    sdks[key] = new Promise(function(res, rej){
      function fail(){ delete sdks[key]; rej(new Error('Could not load the payment window')); }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      for(var a in attrs) s.setAttribute(a, attrs[a]);
      s.onload = function(){ var g = ready(); if(g) res(g); else fail(); };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return sdks[key];
  }

  function loadRzp(){
    return loadSdk('rzp', 'https://checkout.razorpay.com/v1/checkout.js', null,
      function(){ return window.Razorpay; });
  }

  var PP_OFF = ['card','credit','paylater','venmo','bancontact','blik','eps',
    'giropay','ideal','mercadopago','mybank','p24','sepa','sofort','trustly',
    'multibanco','satispay','wechatpay'].join(',');

  function loadPP(clientId, currency){
    var ns = 'dzpp_' + currency;
    return loadSdk(ns,
      'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
      '&currency=' + encodeURIComponent(currency) +
      '&intent=capture&components=buttons&disable-funding=' + PP_OFF,
      { 'data-namespace': ns },
      function(){ return window[ns]; });
  }

  async function api(prov, body){
    var s = await sb.auth.getSession();
    var session = s && s.data && s.data.session;
    if(!session) throw new Error('Sign in required');
    var url = prov === 'paypal' ? '/api/paypal'
            : prov === 'payouts' ? '/api/payouts'
            : '/api/rzp';
    var res = await fetch(url, {
      method:'POST',
      headers:{'content-type':'application/json', 'authorization':'Bearer '+session.access_token},
      body: JSON.stringify(body)
    });
    var j = await res.json().catch(function(){return{};});
    if(!res.ok) throw new Error(j.error || 'Payment service error');
    return j;
  }

  function gate(){
    if(window.currentUser) return false;
    if(typeof pfGuestGate === 'function')
      pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
    return true;
  }
  function toast(m){ if(typeof showToast === 'function') showToast(m); }

  var sheet = null;
  function closeSheet(){
    if(!sheet) return;
    document.removeEventListener('keydown', sheet.onKey, true);
    if(sheet.root.parentNode) sheet.root.parentNode.removeChild(sheet.root);
    sheet = null;
  }
  function openSheet(title){
    closeSheet();
    var root = document.createElement('div');
    root.className = 'dzPay';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label', title || 'Checkout');
    root.innerHTML =
      '<div class="dzPayCard">' +
        '<button class="dzPayX" type="button" aria-label="Close">\\u2715</button>' +
        '<div class="dzPayTitle">' + esc(title || 'Checkout') + '</div>' +
        '<div class="dzPayBody"></div>' +
      '</div>';

    var onKey = function(e){ if(e.key === 'Escape'){ e.stopPropagation(); closeSheet(); } };
    root.querySelector('.dzPayX').addEventListener('click', closeSheet);
    root.addEventListener('click', function(e){ if(e.target === root) closeSheet(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);

    sheet = { root:root, body:root.querySelector('.dzPayBody'), onKey:onKey };
    return sheet;
  }

  function runRzp(order, onPaid){
    gateNote('Opening ' + PROV.rzp.name + '\\u2026');
    return loadRzp().then(function(){
      if(!co) return;
      gatePaying('rzp', order, 'Razorpay is open. Finish paying in its window \\u2014 ' +
        'card, UPI, net banking or a wallet, whichever you prefer.');
      var refused = false;
      var rz = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'DigiArtz',
        description: order.label || '',
        theme: { color: '#7C3AED' },
        handler: function(r){
          gateNote('Confirming your payment\\u2026');
          api('rzp', {action:'verify', orderId:r.razorpay_order_id,
               paymentId:r.razorpay_payment_id, signature:r.razorpay_signature})
            .then(function(x){ closeCo(); onPaid(x); },
                  function(e){
                    gateNote(e.message || 'Could not verify the payment');
                    toast(e.message || 'Could not verify the payment');
                  });
        },
        modal: { ondismiss: function(){
            // A refusal has already said why it was refused, and closing the
            // window after reading that is not the member cancelling anything
          if(refused) return;
          toast('Payment cancelled');
          if(co) coRetry('Razorpay was closed before the payment went through.');
        } }
      });
        // Razorpay writes error.description for a member to read -- "Payment blocked
        // as website does not match registered website(s)" is one of its own. Without
        // this the only thing we ever showed for a refusal was ondismiss's "closed
        // before the payment went through", which names the wrong cause every time
        // and hides a real one: an unregistered domain, a dead key, a declined card.
      if(rz && typeof rz.on === 'function') rz.on('payment.failed', function(resp){
        var e = (resp && resp.error) || {};
        var why = e.description || e.reason || 'Razorpay could not take this payment';
        refused = true;
        toast(why);
        if(co) coRetry(why);
      });
      rz.open();
    });
  }

  function runPP(order, onPaid){
    gateNote('Loading ' + PROV.paypal.name + '\\u2026');
    return loadPP(order.clientId, order.currency).then(function(pp){
      if(!co) return;
      co.gate.innerHTML =
        payingHtml('paypal', order) +
        '<div class="dzCoGateNote">Sign in to PayPal to finish. Cards are not ' +
          'accepted through PayPal here \\u2014 choose Razorpay above to pay by card.</div>' +
        '<div class="dzPayBtns"></div>';
      var host = co.gate.querySelector('.dzPayBtns');
      var settled = false;

      pp.Buttons({
        style: { layout:'vertical', shape:'rect', height:48 },
        createOrder: function(){ return order.orderId; },
        onApprove: function(){
          settled = true;
          gateNote('Confirming your payment\\u2026');
          return api('paypal', {action:'capture', orderId:order.orderId})
            .then(function(r){ closeCo(); onPaid(r); },
                  function(e){
                    gateNote(e.message || 'Could not verify the payment');
                    toast(e.message || 'Could not verify the payment');
                  });
        },
        onCancel: function(){
          toast('Payment cancelled');
          coRetry('You closed the PayPal window before paying.');
        },
        onError: function(err){
          if(settled) return;
            // PayPal's message is an internal dump rather than a sentence for a
            // member, so it goes to the console and the member gets the short one
          try{ console.error('paypal checkout:', err); }catch(e){}
          coRetry('PayPal could not complete the payment. You can try Razorpay instead.');
        }
      }).render(host).catch(function(){
        coRetry('PayPal could not open here. Try Razorpay instead.');
      });
    });
  }

  var co = null;

  function closeCo(){
    if(!co) return;
    document.removeEventListener('keydown', co.onKey, true);
    if(co.root.parentNode) co.root.parentNode.removeChild(co.root);
    document.documentElement.classList.remove('dzCoOpen');
    co = null;
  }

  function gateNote(msg){
    if(co) co.gate.innerHTML = '<div class="dzCoGateNote">' + esc(msg) + '</div>';
  }

  function provHtml(id){
    var p = PROV[id];
    return '<div class="dzCoProv dzCoProv--' + esc(id) + '">' +
      '<span class="dzPayLogo">' + p.logo + '</span>' +
      '<span class="dzCoProvName">' + esc(p.name) + '</span></div>';
  }

  function payingHtml(id, order){
    return provHtml(id) +
      '<div class="dzCoPaying">' +
        '<span class="dzCoPayingWhat">' + esc(order.label || 'Your order') + '</span>' +
        '<span class="dzCoPayingAmt">' + esc(orderMoney(order)) + '</span>' +
      '</div>';
  }
  function gatePaying(id, order, msg){
    if(co) co.gate.innerHTML = payingHtml(id, order) +
      '<div class="dzCoGateNote">' + esc(msg) + '</div>';
  }

  function coRetry(why){
    if(!co) return;
    co.step3.hidden = true;
    co.pickMsg.textContent = why || '';
    co.pickMsg.hidden = !why;
    coSelect(null);
    co.how.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function coSelect(id){
    if(!co) return;
    Array.prototype.forEach.call(co.root.querySelectorAll('.dzPayOpt'), function(b){
      var on = b.getAttribute('data-prov') === id;
      b.classList.toggle('dzPayOpt--on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function itemHtml(s){
    var thumb = s.thumb
      ? '<img class="dzCoThumb" src="' + esc(s.thumb) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="dzCoThumb dzCoThumbNo" aria-hidden="true">' + esc(s.icon || '\\u25a6') + '</span>';
    return '<div class="dzCoItem">' + thumb +
        '<div class="dzCoItemMain">' +
          '<div class="dzCoItemName">' + esc(s.name) + '</div>' +
          (s.sub ? '<div class="dzCoItemSub">' + esc(s.sub) + '</div>' : '') +
        '</div>' +
        '<div class="dzCoItemPrice">' + esc(s.price) + '</div>' +
      '</div>' +
      (s.gets && s.gets.length
        ? '<div class="dzCoGetsHead">What you get</div><ul class="dzCoGets">' +
          s.gets.map(function(g){ return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>'
        : '') +
      '<dl class="dzCoTot">' +
        '<div class="dzCoTotRow"><dt>' + esc(s.priceLabel || 'Item price') + '</dt>' +
          '<dd>' + esc(s.price) + '</dd></div>' +
        '<div class="dzCoTotRow"><dt>Fees</dt><dd>None</dd></div>' +
        '<div class="dzCoTotRow dzCoTotRow--sum"><dt>Total</dt>' +
          '<dd>' + esc(s.price) + '</dd></div>' +
      '</dl>' +
      (s.note ? '<p class="dzCoItemNote">' + esc(s.note) + '</p>' : '');
  }

  function pickHtml(list, currency){
    var k = rzpKey(currency);
    var opts = list.map(function(id){
      var p = PROV[id];
      if(id === 'rzp')
        p = { name: p.name, logo: p.logo,
              note: RZP_NOTE[k], marks: RZP_MARKS[k], ways: RZP_WAYS[k] };
      return '<button class="dzPayOpt dzPayOpt--' + esc(id) + '" type="button" ' +
               'data-prov="' + esc(id) + '" aria-pressed="false">' +
               '<span class="dzPayOptTop">' +
                 '<span class="dzPayLogo">' + p.logo + '</span>' +
                 '<span class="dzPayOptName">' + esc(p.name) + '</span>' +
                 '<span class="dzPayOptTick" aria-hidden="true">\\u2713</span>' +
               '</span>' +
               '<span class="dzPayOptNote">' + esc(p.note) + '</span>' +
               marksHtml(p.marks) +
               '<span class="dzPayOptWays">' +
                 p.ways.map(function(w){
                   return '<span class="dzPayWay">' + esc(w) + '</span>';
                 }).join('') +
               '</span>' +
             '</button>';
    });
    return '<div class="dzPayPick">' +
      opts.join('<div class="dzPayOr"><span>or</span></div>') + '</div>';
  }

  function openCo(spec, list){
    closeCo();
    var root = document.createElement('div');
    root.className = 'dzCo';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Checkout');
    root.innerHTML =
      '<header class="dzCoBar">' +
        '<button class="dzCoBack" type="button" aria-label="Leave checkout">\\u2190</button>' +
        '<div class="dzCoBrand">Digi<span class="dzCoBrandA">Artz</span></div>' +
        '<div class="dzCoLock"><span aria-hidden="true">\\ud83d\\udd12</span>Secure</div>' +
      '</header>' +
      '<div class="dzCoScroll"><div class="dzCoWrap">' +
        '<h1 class="dzCoH1">' + esc(spec.title || 'Checkout') + '</h1>' +

        '<section class="dzCoStep">' +
          '<div class="dzCoStepHead"><span class="dzCoNum">1</span>' +
            '<h2>What you\\u2019re buying</h2></div>' +
          '<div class="dzCoBox' +
            (spec.tone ? ' dzCoTone dzCoTone--' + esc(spec.tone) : '') + '">' +
            itemHtml(spec) +
          '</div>' +
        '</section>' +

        (spec.promo ?
        '<section class="dzCoStep" id="dzCoPromo">' +
          '<div class="dzCoStepHead"><span class="dzCoNum">2</span>' +
            '<h2>Promo code</h2></div>' +
          '<div class="dzCoBox">' +
            '<div class="dzCoPromoRow">' +
              '<input type="text" id="dzCoPromoIn" class="dzCoPromoIn" ' +
                'maxlength="6" autocapitalize="characters" autocomplete="off" ' +
                'spellcheck="false" placeholder="ART24" ' +
                'aria-label="Promo code, 4 to 6 letters or digits">' +
              '<button type="button" id="dzCoPromoGo" class="dzCoPromoGo">Apply</button>' +
            '</div>' +
            '<div class="dzCoPromoMsg" id="dzCoPromoMsg" role="status"></div>' +
          '</div>' +
        '</section>' : '') +

        '<section class="dzCoStep" id="dzCoHow">' +
          '<div class="dzCoStepHead"><span class="dzCoNum">' +
            (spec.promo ? '3' : '2') + '</span>' +
            '<h2>Payment method</h2></div>' +
          '<div class="dzCoBox">' +
            '<div class="dzCoPickMsg" hidden></div>' +
            pickHtml(list, spec.currency) +
          '</div>' +
        '</section>' +

        '<section class="dzCoStep" id="dzCoGo" hidden>' +
          '<div class="dzCoStepHead"><span class="dzCoNum">' +
            (spec.promo ? '4' : '3') + '</span>' +
            '<h2>Payment gateway</h2></div>' +
          '<div class="dzCoBox dzCoGate"></div>' +
        '</section>' +

        '<p class="dzCoFine">Your card, UPI or PayPal details are entered in the ' +
          'provider\\u2019s own window and never reach DigiArtz. Questions about a ' +
          'payment: DigiArtzsupport@gmail.com</p>' +
      '</div></div>';

    var onKey = function(e){ if(e.key === 'Escape'){ e.stopPropagation(); closeCo(); } };
    root.querySelector('.dzCoBack').addEventListener('click', closeCo);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    document.documentElement.classList.add('dzCoOpen');

    co = {
      root: root,
      onKey: onKey,
      how: root.querySelector('#dzCoHow'),
      step3: root.querySelector('#dzCoGo'),
      gate: root.querySelector('.dzCoGate'),
      pickMsg: root.querySelector('.dzCoPickMsg'),
      promo: null
    };

    if(spec.promo) wirePromo(spec);
    return co;
  }

  function wirePromo(spec){
    var input = co.root.querySelector('#dzCoPromoIn');
    var btn   = co.root.querySelector('#dzCoPromoGo');
    var msg   = co.root.querySelector('#dzCoPromoMsg');
    if(!input || !btn || !msg) return;

    function say(text, kind){
      msg.textContent = text || '';
      msg.className = 'dzCoPromoMsg' + (kind ? ' dzCoPromoMsg--' + kind : '');
    }

    function apply(){
      var code = String(input.value || '').trim().toUpperCase();
      input.value = code;
      if(!code){ co.promo = null; say('', ''); return; }
      if(!/^[A-Z0-9]{4,6}$/.test(code)){
        co.promo = null;
        say('A code is 4 to 6 letters or digits.', 'bad');
        return;
      }
      btn.disabled = true;
      say('Checking\u2026', '');
      collabApi('promo-resolve', {code: code, kind: spec.promoKind || 'subscription'})
        .then(function(r){
          btn.disabled = false;
          if(!r || !r.ok){
            co.promo = null;
            say((r && r.error) || 'No such code', 'bad');
            return;
          }
          co.promo = code;
          var off = Number(r.discount_bps) || 0;
          say(off > 0
                ? code + ' applied \u2014 ' + (off / 100) + '% off, charged at checkout.'
                : code + ' applied. It does not change your price; it credits ' +
                  'the creator who shared it.',
              'ok');
        }, function(){
          btn.disabled = false;
          co.promo = null;
          say('That code could not be checked \u2014 you can pay without it.', 'bad');
        });
    }

    btn.addEventListener('click', apply);
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); apply(); }
    });
    input.addEventListener('input', function(){
      if(co && co.promo){ co.promo = null; say('', ''); }
    });
  }

  var statePromise = null;
  function collabState(){
    if(!statePromise){
      statePromise = collabApi('state', {}).then(function(r){
        return (r && r.state) || null;
      }, function(){
        statePromise = null;
        return null;
      });
    }
    return statePromise;
  }
  function dzCollabForget(){ statePromise = null; }

  function collabApi(action, body){
    if(typeof sb === 'undefined' || !sb) return Promise.reject(new Error('Sign in required'));
    return sb.auth.getSession().then(function(s){
      var session = s && s.data && s.data.session;
      if(!session) throw new Error('Sign in required');
      return fetch('/api/collab', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + session.access_token
        },
        cache: 'no-store',
        body: JSON.stringify(Object.assign({action: action}, body || {}))
      });
    }).then(function(res){ return res.json().catch(function(){ return null; }); });
  }

  function start(spec, order, onPaid){
    if(gate()) return;
    var all  = C.providers || [];
    var list = all.filter(function(id){ return canTake(id, spec.currency); });
    if(!all.length){ toast('Checkout is not available right now'); return; }
    if(!list.length){
      toast('No checkout here takes ' + (spec.currency || 'that currency'));
      return;
    }

    openCo(spec, list);

    function pick(id){
      if(!co) return;
      coSelect(id);
      co.pickMsg.hidden = true;
      co.step3.hidden = false;
      gateNote('Getting your order ready\\u2026');
      co.step3.scrollIntoView({behavior:'smooth', block:'center'});

      order(id)
        .then(function(o){
          if(!o){ closeCo(); return; }
          if(!co) return;
          return id === 'paypal' ? runPP(o, onPaid) : runRzp(o, onPaid);
        })
        .catch(function(e){
          toast(e.message || 'Could not start checkout');
          coRetry(e.message || 'Could not start checkout');
        });
    }

    Array.prototype.forEach.call(co.root.querySelectorAll('.dzPayOpt'), function(b){
      b.addEventListener('click', function(){ pick(b.getAttribute('data-prov')); });
    });

    if(list.length === 1) pick(list[0]);
  }

  function planSpec(id, amount){
    var cur = C.currency || 'USD';
    var p = null;
    (C.plans || []).forEach(function(x){ if(x.id === id) p = x; });
    if(p) return {
      title: 'Checkout',
      name: p.name + ' membership',
      sub: 'One month \\u00b7 ' + p.tagline,
      price: p.price,
      priceLabel: 'Plan price',
      currency: cur,
      icon: '\\u2605',
      tone: p.tone,
      gets: p.features,
      promo: id === 'max',
      promoKind: 'subscription',
      note: 'A single charge for 31 days. Nothing recurring \\u2014 it does not ' +
            'renew itself, and you keep anything you bought on the marketplace ' +
            'whatever happens to your plan.'
    };
    return {
      title: 'Support DigiArtz',
      name: 'Support DigiArtz',
      sub: 'A one-off contribution',
      price: moneyMinor(amount, cur),
      priceLabel: 'Amount',
      currency: cur,
      icon: '\\u2665',
      gets: ['Keeps the servers and storage paid for',
             'No plan or tier attached \\u2014 this is a thank-you, not a purchase'],
      note: 'Nothing is unlocked by this and nothing recurs.'
    };
  }

  window.dzSubBuy = function(plan){
    if(gate()) return;
    var amount = null;
    if(plan === 'support'){
      var cur = C.currency || 'USD';
      var min = (C.support && C.support.min) || 50;
      var v = prompt('Support amount in ' + cur +
                     ' (minimum ' + moneyMinor(min, cur) + '):', '');
      if(v === null) return;
      amount = minorOf(parseFloat(v), cur);
      if(!Number.isFinite(amount) || amount < min){
        toast('Minimum is ' + moneyMinor(min, cur)); return;
      }
    }
    start(planSpec(plan, amount), function(prov){
      return api(prov, {action:'sub-order', plan:plan, amount:amount,
                        promo:(co && co.promo) || null});
    }, function(r){
      toast(r.tier ? 'Subscription active' : 'Thank you for the support');
        // Read the tier back from the profile before repainting, so the cards
        // show what was actually applied rather than what was asked for
      if(r.tier && typeof window.checkUserRole === 'function'){
        Promise.resolve(window.checkUserRole()).then(function(){ paintPlans(); },
                                                     function(){ paintPlans(); });
      } else { paintPlans(); }
    });
  };

  function slotSpec(id, hasFile){
    var el = document.querySelector('.dzSlot[data-i="' + id + '"]');
    var title = (el && el.getAttribute('data-t')) || 'Marketplace item';
    var prev  = (el && el.getAttribute('data-th')) || '';
    var cents = Number((el && el.getAttribute('data-p')) || 0);
    var cur   = (el && el.getAttribute('data-c')) || 'USD';
    return {
      title: 'Checkout',
      name: title,
      sub: hasFile ? 'Digital files \\u00b7 instant access once paid'
                   : 'Marketplace listing',
      price: money(cents, cur),
      priceLabel: 'Item price',
      currency: cur,
      thumb: prev && typeof getThumbnailUrl === 'function' ? getThumbnailUrl(prev) : prev,
      gets: hasFile
        ? ['Every file on this listing, at the seller\\u2019s original quality',
           'Re-download as often as you like, no limit and no expiry',
           'Yours permanently \\u2014 no subscription tier is involved']
        : ['Access to this listing as the seller delivers it'],
      note: 'Bought once, yours to keep. Your files appear under My Purchases ' +
            'the moment the payment is confirmed.'
    };
  }

  window.dzMarketBuy = function(id, hasFile){
    start(slotSpec(id, hasFile), function(prov){
      return api(prov, {action:'market-order', itemId:id}).then(function(o){
        if(o.owned){
          afterPurchase(id, hasFile, true);
          return null;
        }
        return o;
      });
    }, function(){
      afterPurchase(id, hasFile, false);
    });
  };

  function afterPurchase(id, hasFile, wasAlreadyOwned){
    toast(wasAlreadyOwned ? 'You already own this' : 'Purchased \\u2014 your files are unlocked');
    ownedIds[id] = true;
    repaintOwned();
    purchasesP = null;
    if(document.getElementById('payHubGrid')){
      openPanel('buy');
    } else if(hasFile && typeof window.dzMarketGet === 'function'){
      window.dzMarketGet(id);
    }
  }

  function fillPlans(){
    var host = document.getElementById('subPgGate');
    if(!host) return;
    if(!host.dataset.dzFilled){
      host.innerHTML = C.plansHtml;
      host.dataset.dzFilled = '1';
      Array.prototype.forEach.call(host.querySelectorAll('.subBtn'), function(b){
        b.addEventListener('click', function(){ window.dzSubBuy(b.getAttribute('data-plan')); });
      });
      paintClaim(host);
    }
    paintPlans(host);
  }

  var TIER_RANK = { lite:1, premium:2, max:3 };

    // The cards said "Start Lite" to somebody already on Lite, because nothing
    // ever read the tier back onto them. Below your plan reads Purchased and
    // does not buy: applySubscription keeps the higher tier and still adds a
    // month, so buying Lite on Max would have extended Max at Lite's price.
    // Your own plan stays live because this button is the only way to renew --
    // the label says Activated, the accessible name says what pressing it does.
  function paintPlans(host){
    host = host || document.getElementById('subPgGate');
    if(!host) return;
    var mine = (typeof window.dzTier === 'function') ? window.dzTier() : 'guest';
    var rank = TIER_RANK[mine] || 0;
    var names = {};
    (C.plans || []).forEach(function(p){ names[p.id] = p.name; });

    Array.prototype.forEach.call(host.querySelectorAll('.subBtn'), function(b){
      var id = b.getAttribute('data-plan');
      var want = TIER_RANK[id];
        // No data-plan means paintClaim has taken this button over
      if(!want) return;
      if(b.dataset.dzCta == null) b.dataset.dzCta = b.textContent;
      var name = names[id] || id;
      var mineNow = want === rank, below = rank && want < rank;

      b.textContent = !rank ? b.dataset.dzCta
                    : mineNow ? 'Activated'
                    : below   ? 'Purchased'
                    : 'Upgrade to ' + name;
      b.disabled = !!below;
      b.setAttribute('aria-label',
        mineNow ? 'Renew ' + name + ' for another month'
                : below ? name + ' is already covered by your plan'
                        : b.textContent);
      if(mineNow) b.title = 'Renew ' + name + ' for another month';
      else b.removeAttribute('title');
      b.classList.toggle('subBtn--mine', mineNow);
      b.classList.toggle('subBtn--held', !!below);
    });
  }

  function paintClaim(host){
    var card = host.querySelector('.subBtn[data-plan="max"]');
    if(!card) return;

    collabState().then(function(st){
      if(!st || !st.is_partner) return;
      var btn = host.querySelector('.subBtn[data-plan="max"]');
      if(!btn) return;

      if(st.max_claimed){ claimed(btn); return; }

      btn.textContent = 'Claim Max Membership';
      btn.classList.add('subBtn--claim');
      btn.removeAttribute('data-plan');
      btn.setAttribute('aria-label', 'Claim your free Max membership');

      var fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', function(){
        fresh.disabled = true;
        fresh.textContent = 'Claiming\u2026';
        collabApi('claim-max', {}).then(function(res){
          if(!res || !res.ok){
            fresh.disabled = false;
            fresh.textContent = 'Claim Max Membership';
            toast((res && res.error) || 'Could not claim Max');
            return;
          }
          claimed(fresh);
          dzCollabForget();
          toast('Max is yours \u2014 enjoy it');
          if(typeof window.checkUserRole === 'function') window.checkUserRole();
        }, function(){
          fresh.disabled = false;
          fresh.textContent = 'Claim Max Membership';
          toast('Could not claim Max');
        });
      });
    }, function(){  });

    function claimed(btn){
      btn.textContent = 'Max Claimed';
      btn.disabled = true;
      btn.classList.add('subBtn--claim', 'subBtn--claimed');
      btn.removeAttribute('data-plan');
      btn.setAttribute('aria-label', 'Max claimed \u2014 yours at no cost');
      var price = btn.closest('.subCard');
      price = price && price.querySelector('.subPrice');
      if(price){
        price.textContent = C.freePrice || '0';
        var per = btn.closest('.subCard').querySelector('.subPricePer');
        if(per) per.textContent = 'yours as a partner';
      }
    }
  }

  var ownedIds = {};

  function paintSlot(el){
    var id      = el.getAttribute('data-i') || '';
    var cents   = Number(el.getAttribute('data-p') || 0);
    var cur     = el.getAttribute('data-c') || 'USD';
    var hasFile = el.getAttribute('data-f') === '1';
    var view    = el.getAttribute('data-v') === 'view';
    var priced  = cents > 0;
    var owned   = !!ownedIds[id];

    var price = '<div class="' + (view ? 'dzvPrice' : 'dzPrice') + '">' +
                (owned && priced ? 'Purchased' : esc(money(cents, cur))) + '</div>';
    var btn;
    if(owned && hasFile){
      btn = '<button class="dzBuy dzBuy--own" type="button" data-act="get">' +
              (view ? '\\u2b07 Download your files' : '\\u2b07 Download') + '</button>';
    } else if(owned){
      btn = '<div class="dzOwnNote">Purchased</div>';
    } else if(priced){
      btn = '<button class="dzBuy" type="button" data-act="buy">' +
              (view ? 'Buy now' : 'Buy \\u00b7 ' + esc(money(cents, cur))) + '</button>';
    } else {
      btn = hasFile
        ? '<button class="dzBuy dzBuy--free" type="button" data-act="get">Download \\u00b7 Free</button>'
        : '';
    }

    el.innerHTML = view ? '<div class="dzvBuyCard">' + price + btn + '</div>' : price + btn;

    Array.prototype.forEach.call(el.querySelectorAll('button'), function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        if(b.getAttribute('data-act') === 'buy') window.dzMarketBuy(id, hasFile ? 1 : 0);
        else if(typeof window.dzMarketGet === 'function') window.dzMarketGet(id);
      });
    });

    var lock = document.getElementById('dzvLock-' + id);
    if(lock) lock.hidden = owned;
  }

  function repaintOwned(){
    Array.prototype.forEach.call(document.querySelectorAll('.dzSlot[data-i]'), function(el){
      if(el.dataset.dzFilled) paintSlot(el);
    });
  }

  function askOwned(ids){
    if(!ids.length || typeof sb === 'undefined' || !sb || !sb.rpc) return;
    sb.rpc('dz_market_owned', {p_items: ids}).then(function(res){
      if(!res || res.error || !res.data) return;
      var got = false;
      (res.data || []).forEach(function(r){
        var v = (r && typeof r === 'object') ? (r.dz_market_owned || r.id || '') : r;
        if(v){ ownedIds[String(v)] = true; got = true; }
      });
      if(got) repaintOwned();
    }, function(){  });
  }

  function fillSlots(){
    var fresh = [];
    Array.prototype.forEach.call(document.querySelectorAll('.dzSlot'), function(el){
      if(el.dataset.dzFilled) return;
      el.dataset.dzFilled = '1';
      paintSlot(el);
      var id = el.getAttribute('data-i');
      if(id && !ownedIds[id] && fresh.indexOf(id) === -1) fresh.push(id);
    });
    askOwned(fresh);
  }

  function pay(action, extra){
    return api('payouts', Object.assign({action:action}, extra || {}));
  }

  function when(iso){
    try{
      return new Date(iso).toLocaleDateString(undefined,
        {year:'numeric', month:'short', day:'numeric'});
    }catch(e){ return ''; }
  }

  var STATUS_WORD = {
    paid:'Success', created:'Pending', requested:'Requested', approved:'Approved',
    processing:'Sending', failed:'Failed', refunded:'Refunded', rejected:'Rejected',
    available:'Cleared', pending:'On hold', reversed:'Reversed', paid_out:'Paid out'
  };

  function row(h){
    var sign = h.direction === 'purchase' ? '−' : h.direction === 'payout' ? '−' : '+';
    var cls  = h.direction === 'sale' ? 'dzWlIn' : 'dzWlOut';
    var who  = h.direction === 'purchase' ? 'You bought'
             : h.direction === 'sale'     ? 'Someone bought'
             : 'You withdrew';
    return '<li class="dzWlRow">' +
      '<div class="dzWlMain">' +
        '<div class="dzWlTitle">' + esc(h.title || '') + '</div>' +
        '<div class="dzWlSub">' + esc(who) + ' · ' + esc(when(h.happened_at)) +
          (h.provider ? ' · ' + esc(h.provider) : '') + '</div>' +
      '</div>' +
      '<div class="dzWlRight">' +
        '<div class="dzWlAmt ' + cls + '">' + sign + esc(moneyMinor(h.amount, h.currency)) + '</div>' +
        '<div class="dzWlSt dzWlSt--' + esc(h.status) + '">' +
          esc(STATUS_WORD[h.status] || h.status) + '</div>' +
      '</div></li>';
  }

  var sendable = null;
  function canSendTo(kind){
    return !sendable || sendable.indexOf(kind) !== -1;
  }

  function methodLine(m){
    var what = m.kind === 'paypal_email' ? 'PayPal · ' + esc(m.paypal_email)
             : m.kind === 'upi'          ? 'UPI · ' + esc(m.upi_vpa)
             : 'Bank · ' + esc(m.bank_name || 'Account') + ' ••••' + esc(m.bank_last4 || '');
    var manual = !canSendTo(m.kind);
    return '<li class="dzBkRow' + (m.is_default ? ' dzBkRow--def' : '') +
        (manual ? ' dzBkRow--manual' : '') + '">' +
      '<div class="dzBkMain"><div class="dzBkWhat">' + what + '</div>' +
      '<div class="dzBkSub">' + esc(m.label || '') +
        (m.is_default ? '<span class="dzBkTag">Default</span>' : '') +
        (manual ? '<span class="dzBkTag dzBkTag--manual">Not paid automatically</span>' : '') +
        '</div></div>' +
      '<div class="dzBkActs">' +
        (m.is_default ? '' : '<button type="button" class="dzBkBtn" data-def="' + esc(m.id) + '">Make default</button>') +
        '<button type="button" class="dzBkBtn dzBkBtn--rm" data-rm="' + esc(m.id) + '">Remove</button>' +
      '</div></li>';
  }

  var METHOD_FORMS = {
    paypal_email:
      '<label class="dzBkLbl" for="dzBk_paypalEmail">PayPal email</label>' +
      '<input class="dzBkIn" id="dzBk_paypalEmail" data-f="paypalEmail" type="email" autocomplete="off" placeholder="you@example.com">',
    upi:
      '<label class="dzBkLbl" for="dzBk_upi">UPI ID</label>' +
      '<input class="dzBkIn" id="dzBk_upi" data-f="upi" type="text" autocomplete="off" placeholder="name@bank">',
    bank_account:
      '<label class="dzBkLbl" for="dzBk_holderName">Account holder name</label>' +
      '<input class="dzBkIn" id="dzBk_holderName" data-f="holderName" type="text" autocomplete="off" placeholder="As it appears on the account">' +
      '<label class="dzBkLbl" for="dzBk_bankName">Bank name</label>' +
      '<input class="dzBkIn" id="dzBk_bankName" data-f="bankName" type="text" autocomplete="off" placeholder="Bank">' +
      '<label class="dzBkLbl" for="dzBk_accountNumber">Account number</label>' +
      '<input class="dzBkIn" id="dzBk_accountNumber" data-f="accountNumber" type="text" inputmode="numeric" autocomplete="off" placeholder="Account number">' +
      '<label class="dzBkLbl" for="dzBk_ifsc">IFSC</label>' +
      '<input class="dzBkIn" id="dzBk_ifsc" data-f="ifsc" type="text" autocomplete="off" placeholder="ABCD0123456">' +
      '<p class="dzBkNote">Only the last four digits are kept, so you can tell your ' +
      'accounts apart. The full number is never stored.</p>'
  };

  function pendingCard(s){
    var cur = s.currency;
    var g   = s.pending_gross || 0;
    if(!g) return '';
    var rows = [
      ['Gateway fee',        s.pending_gateway || 0],
      ['DigiArtz commission', s.pending_fee || 0],
      ['Tax withheld (194-O)', s.pending_tds || 0],
      ['GST TCS collected',  s.pending_tcs || 0]
    ].filter(function(r){ return r[1] > 0; });

    return '<div class="dzWlPend">' +
      '<div class="dzWlPendTop">' +
        '<span class="dzWlPendLbl">Pending \\u00b7 ' + esc(cur) + '</span>' +
        '<span class="dzWlPendAmt">' + esc(moneyMinor(g, cur)) + '</span>' +
      '</div>' +
      '<p class="dzWlPendWhy">Sold, but still with the payment provider. None of ' +
        'this can be withdrawn yet' +
        (s.next_clears_at ? ' \\u2014 the first of it clears on ' + esc(when(s.next_clears_at)) : '') +
        '.' + (s.settlement_note ? ' ' + esc(s.settlement_note) + '.' : '') + '</p>' +
      '<ul class="dzWlPendList">' +
        rows.map(function(r){
          return '<li><span>' + esc(r[0]) + '</span><b>\\u2212 ' + esc(moneyMinor(r[1], cur)) + '</b></li>';
        }).join('') +
        '<li class="dzWlPendNet"><span>Reaches your wallet</span><b>' +
          esc(moneyMinor(s.pending_net || 0, cur)) + '</b></li>' +
      '</ul>' +
    '</div>';
  }

  function payoutBlock(d){
    var ms = d.methods || [], def = null;
    if(!ms.length) return 'Add a payout method';
    ms.forEach(function(m){ if(m.is_default) def = m; });
    if(!def) return 'Choose a default method';
    if(!canSendTo(def.kind)) return 'Default method is paid by hand';
    return '';
  }

  function balanceCard(s, d, flagged){
    var cur   = s.currency;
    var block = flagged ? 'Withdrawals paused' : payoutBlock(d);
    var can   = !block && (s.withdrawable || 0) > 0;
    return '<div class="dzWlCur">' +
      '<div class="dzWlHead">' +
        '<div class="dzWlBalLbl">Wallet \\u00b7 ' + esc(cur) + '</div>' +
        '<div class="dzWlBal">' + esc(moneyMinor(s.withdrawable || 0, cur)) + '</div>' +
        '<div class="dzWlBalSub">Settled, after every deduction. Yours to withdraw ' +
          'in ' + esc(cur) + ' \\u2014 nothing is converted at any point</div>' +
      '</div>' +
      '<button type="button" class="dzWlReq" data-cur="' + esc(cur) + '"' +
        (can ? '' : ' disabled') + '>' +
        (block || ('Request ' + esc(cur) + ' payout')) + '</button>' +
      '<div class="dzWlGrid">' +
        '<div class="dzWlCell"><span>Total sales</span><b>' + esc(moneyMinor(s.total_sales || 0, cur)) + '</b></div>' +
        '<div class="dzWlCell"><span>Artworks sold</span><b>' + esc(String(s.items_sold || 0)) + '</b></div>' +
        '<div class="dzWlCell"><span>Gateway fees</span><b>' + esc(moneyMinor(s.gateway_fees || 0, cur)) + '</b></div>' +
        '<div class="dzWlCell"><span>Commission paid</span><b>' + esc(moneyMinor(s.commission || 0, cur)) + '</b></div>' +
        '<div class="dzWlCell"><span>Tax withheld</span><b>' + esc(moneyMinor(s.tds_withheld || 0, cur)) + '</b></div>' +
        '<div class="dzWlCell"><span>Withdrawn</span><b>' + esc(moneyMinor(s.paid_out || 0, cur)) + '</b></div>' +
      '</div>' +
    '</div>';
  }

  function renderWallet(host, d){
    sendable = Array.isArray(d.sendableKinds) ? d.sendableKinds : null;
    var rows = Array.isArray(d.summary) ? d.summary : [];
    var pref = C.currency || 'USD';
    rows = rows.slice().sort(function(a, b){
      return (b.currency === pref) - (a.currency === pref);
    });
    var paid = (d.payouts || []).filter(function(p){ return p.status === 'paid'; });

    var flagged = (d.flags || []).length > 0;

    host.innerHTML =
      '<div class="dzWl">' +
        (flagged
          ? '<div class="dzWlFlag">' +
              '<div class="dzWlFlagTop">‼️ Balance check failed</div>' +
              '<p>Your wallet total and our independent transaction record do not ' +
              'agree, so withdrawals are paused on this account as a precaution. ' +
              'Nothing has been lost — your earnings are intact and this is a ' +
              'safeguard, not a deduction.</p>' +
              '<a class="dzWlFlagBtn" href="mailto:DigiArtzsupport@gmail.com' +
                '?subject=Balance%20check%20failed">Contact support</a>' +
            '</div>'
          : '') +

        (rows.length
          ? rows.map(function(s){ return balanceCard(s, d, flagged); }).join('')
          : '<div class="dzWlHead">' +
              '<div class="dzWlBalLbl">Wallet</div>' +
              '<div class="dzWlBal">' + esc(moneyMinor(0, 'USD')) + '</div>' +
              '<div class="dzWlBalSub">Nothing sold yet. You are paid in whichever ' +
                'currency you priced your listing in.</div>' +
            '</div>') +
        '<div class="dzWlMsg" hidden></div>' +

        (rows.some(function(s){ return (s.pending_gross || 0) > 0; })
          ? '<div class="dzWlSect">Pending \\u2014 not yet yours</div>' +
            rows.map(pendingCard).join('')
          : '') +

        (paid.length
          ? '<div class="dzWlSect">Payout history</div><ul class="dzWlList">' +
            paid.map(function(p){
              return '<li class="dzWlRow"><div class="dzWlMain">' +
                '<div class="dzWlTitle">' + esc(moneyMinor(p.amount, p.currency)) + ' paid</div>' +
                '<div class="dzWlSub">' + esc(when(p.paid_at)) + ' · ' + esc(p.destination || '') + '</div>' +
                '</div></li>';
            }).join('') + '</ul>'
          : '') +

        '<div class="dzWlSect">Activity</div>' +
        ((d.history || []).length
          ? '<ul class="dzWlList">' + d.history.map(row).join('') + '</ul>'
          : '<div class="dzWlEmpty">Nothing yet.</div>') +

        '<div class="dzWlSect">Wallet guidelines</div>' +
        '<ol class="dzWlGuide">' +
          '<li>You are paid in the currency you priced your listing in. Your ' +
            'earnings are never converted \\u2014 a sale in euros stays euros all ' +
            'the way to your payout \\u2014 so no exchange spread is taken out of ' +
            'them at any point.</li>' +
          '<li>Each currency has its own withdrawal minimum, roughly five ' +
            'dollars\\u2019 worth. The exact figure is shown on the payout form.</li>' +
          '<li>A sale is Pending until the payment provider settles it \\u2014 ' +
            'Razorpay takes two working days on a domestic sale and seven on an ' +
            'international one, PayPal up to five business days. Pending shows ' +
            'the whole sale and what will come out of it; the wallet shows only ' +
            'what has cleared and is genuinely yours.</li>' +
          '<li>DigiArtz will take a 10% platform charge and 5% GST (government tax). ' +
            'The remaining 85% goes to the user. Max Subscription users will get 90% ' +
            'of the commission, while DigiArtz will take 5% as the platform charge and ' +
            '5% for GST and other taxes.</li>' +
          '<li>Losing money due to scams will not be tolerated. If you send money ' +
            'without our involvement, we cannot help with recovery.</li>' +
          '<li>Losing all your wallet money due to a hacked account will also not be ' +
            'tolerated. Please don’t share your email or password with anyone, and ' +
            'activate MFA or 2FA.</li>' +
          '<li>If any system bug or glitch from our side increases your wallet balance, ' +
            'it does not mean that money belongs to you. Anyone who takes advantage of ' +
            'bugs or glitches will get an IP ban from the server and may no longer be ' +
            'able to log in.</li>' +
          '<li>If you have any questions, email us at:' +
            '<a class="dzWlGuideMail" href="mailto:DigiArtzsupport@gmail.com' +
            '?subject=Wallet%20question" ' +
            'aria-label="Email DigiArtz support at DigiArtzsupport@gmail.com">' +
            '<span aria-hidden="true">✉</span>DigiArtzsupport@gmail.com</a></li>' +
        '</ol>' +
      '</div>';

    Array.prototype.forEach.call(host.querySelectorAll('.dzWlReq[data-cur]'), function(btn){
      btn.addEventListener('click', function(){
        var cur = btn.getAttribute('data-cur');
        var s   = null;
        rows.forEach(function(r){ if(r.currency === cur) s = r; });
        if(!s) return;
        openPayoutForm(s, d);
      });
    });
  }

  function minorOf(v, cur){
    return ZERO_DEC[cur] ? Math.round(v) : Math.round(v * 100);
  }
  function majorOf(minor, cur){
    return ZERO_DEC[cur] ? String(minor) : (minor / 100).toFixed(2);
  }

  function openPayoutForm(s, d){
    var cur = s.currency;
    var max = s.withdrawable || 0;
    var min = (d.minPayouts && d.minPayouts[cur] != null)
      ? d.minPayouts[cur] : (d.minDefault || 500);

    openSheet('Request ' + cur + ' payout');
    sheet.body.innerHTML =
      '<div class="dzBkForm">' +
        '<label class="dzBkLbl" for="dzWlAmt">Amount in ' + esc(cur) + '</label>' +
        '<input class="dzBkIn" id="dzWlAmt" type="text" inputmode="decimal" placeholder="' +
          esc(majorOf(max, cur)) + '">' +
        '<p class="dzBkNote">Minimum ' + esc(moneyMinor(min, cur)) + '. You can withdraw up to ' +
          esc(moneyMinor(max, cur)) + ', and it is sent in ' + esc(cur) +
          ' \\u2014 not converted \\u2014 to your default method.' +
          ((d.tax && d.tax.country === 'IN') || !d.tax
            ? ' Tax may be withheld at source under section 194-O; it is withheld in ' +
              esc(cur) + ' and the exact amount is shown once you request.'
            : '') + '</p>' +
        '<div class="dzWlMsg" hidden></div>' +
        '<button type="button" class="dzWlReq" id="dzWlGo">Request</button>' +
      '</div>';

    var m2 = sheet.body.querySelector('.dzWlMsg');
    sheet.body.querySelector('#dzWlGo').addEventListener('click', function(){
      var v = minorOf(parseFloat(sheet.body.querySelector('#dzWlAmt').value), cur);
      if(!Number.isFinite(v) || v <= 0){
        m2.textContent = 'Enter an amount.'; m2.hidden = false;
        m2.classList.add('dzWlMsg--bad'); return;
      }
      m2.textContent = 'Sending…'; m2.hidden = false; m2.classList.remove('dzWlMsg--bad');
      pay('request', {amount:v, currency:cur})
        .then(function(r){
                closeSheet();
                toast(r && r.tds
                  ? 'Payout requested \\u00b7 ' + moneyMinor(r.tds, cur) + ' withheld as tax'
                  : 'Payout requested');
                refreshPanel();
              },
              function(e){
                m2.textContent = e.message || 'Could not request that';
                m2.classList.add('dzWlMsg--bad');
                if(/paused|verified/i.test(e.message || '')) refreshPanel();
              });
    });
  }

  function renderBank(host, d){
    sendable = Array.isArray(d.sendableKinds) ? d.sendableKinds : null;
    var manualKinds = ['upi', 'bank_account'].filter(function(k){ return !canSendTo(k); });
    host.innerHTML =
      '<div class="dzBk">' +
        ((d.methods || []).length
          ? '<ul class="dzBkList">' + d.methods.map(methodLine).join('') + '</ul>'
          : '<div class="dzWlEmpty">No payout method yet.</div>') +
        '<div class="dzBkPick">' +
          '<button type="button" class="dzBkAdd" data-add="paypal_email">Add PayPal</button>' +
          '<button type="button" class="dzBkAdd" data-add="upi">Add UPI' +
            (canSendTo('upi') ? '' : ' ·  manual') + '</button>' +
          '<button type="button" class="dzBkAdd" data-add="bank_account">Add bank account' +
            (canSendTo('bank_account') ? '' : ' · manual') + '</button>' +
        '</div>' +
        (manualKinds.length
          ? '<p class="dzBkNote dzBkNote--warn">Payouts are sent automatically to a ' +
            'PayPal address only. ' +
            (manualKinds.length === 2 ? 'A UPI ID or a bank account' :
             manualKinds[0] === 'upi' ? 'A UPI ID' : 'A bank account') +
            ' can be kept here for our records, but a payout to one has to be ' +
            'arranged by hand — email DigiArtzsupport@gmail.com. Add a PayPal ' +
            'address and make it your default if you want to withdraw from this page.</p>'
          : '') +
        '<p class="dzBkNote">Card numbers are never asked for or stored here. ' +
        'Cards are handled inside the provider’s own checkout, which is the only ' +
        'place they belong.</p>' +

        '<div class="dzBkHead">Tax details</div>' +
        '<div class="dzBkForm">' +
          '<label class="dzBkLbl" for="dzTxC">Country of tax residence</label>' +
          '<input class="dzBkIn" id="dzTxC" type="text" maxlength="2" placeholder="IN" value="' +
            esc((d.tax && d.tax.country) || 'IN') + '">' +
          '<label class="dzBkLbl" for="dzTxP">PAN (India only)</label>' +
          '<input class="dzBkIn" id="dzTxP" type="text" maxlength="10" placeholder="ABCDE1234F" value="' +
            esc((d.tax && d.tax.pan) || '') + '">' +
          '<p class="dzBkNote">Indian sellers: we are required to deduct tax at source ' +
          'on marketplace sales under section 194-O. With a PAN on file the rate is 0.1%, ' +
          'and individuals stay exempt below ₹5,00,000 of sales in the financial year. ' +
          'Without a PAN the rate is 5%. Sellers outside India have nothing withheld.</p>' +
          '<div class="dzWlMsg" hidden></div>' +
          '<button type="button" class="dzWlReq" id="dzTxSave">Save tax details</button>' +
        '</div>' +
      '</div>';

    Array.prototype.forEach.call(host.querySelectorAll('[data-add]'), function(b){
      b.addEventListener('click', function(){ addMethod(b.getAttribute('data-add')); });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-def]'), function(b){
      b.addEventListener('click', function(){
        pay('method-default', {id:b.getAttribute('data-def')})
          .then(function(){ refreshPanel(); }, function(e){ toast(e.message); });
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-rm]'), function(b){
      b.addEventListener('click', function(){
        pay('method-remove', {id:b.getAttribute('data-rm')})
          .then(function(){ toast('Removed'); refreshPanel(); }, function(e){ toast(e.message); });
      });
    });

    var tm = host.querySelector('.dzBkForm .dzWlMsg');
    host.querySelector('#dzTxSave').addEventListener('click', function(){
      tm.textContent = 'Saving…'; tm.hidden = false; tm.classList.remove('dzWlMsg--bad');
      pay('tax', {
        country: host.querySelector('#dzTxC').value,
        pan:     host.querySelector('#dzTxP').value
      }).then(function(){ tm.textContent = 'Saved.'; refreshPanel(); },
              function(e){
                tm.textContent = e.message || 'Could not save that';
                tm.classList.add('dzWlMsg--bad');
              });
    });
  }

  function addMethod(kind){
    openSheet('Add payout method');
    sheet.body.innerHTML =
      '<div class="dzBkForm">' + METHOD_FORMS[kind] +
        '<label class="dzBkLbl" for="dzBk_label">Label (optional)</label>' +
        '<input class="dzBkIn" id="dzBk_label" data-f="label" type="text" placeholder="e.g. Main account">' +
        '<div class="dzWlMsg" hidden></div>' +
        '<button type="button" class="dzWlReq" id="dzBkSave">Save</button>' +
      '</div>';
    var m = sheet.body.querySelector('.dzWlMsg');
    sheet.body.querySelector('#dzBkSave').addEventListener('click', function(){
      var payload = {kind:kind};
      Array.prototype.forEach.call(sheet.body.querySelectorAll('[data-f]'), function(i){
        payload[i.getAttribute('data-f')] = i.value;
      });
      m.textContent = 'Saving…'; m.hidden = false; m.classList.remove('dzWlMsg--bad');
      pay('method-add', payload)
        .then(function(){ closeSheet(); toast('Payout method added'); refreshPanel(); },
              function(e){
                m.textContent = e.message || 'Could not save that';
                m.classList.add('dzWlMsg--bad');
              });
    });
  }

  var VIEWS = { bal: 'Balance', pay: 'Payout methods', buy: 'My purchases',
                cur: 'Currency', collab: 'Collab Hub' };

  function panelEl(){
    var el = document.getElementById('dzPanelHost');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'dzPanelHost';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<div class="subPgHdr">' +
        '<button class="subPgX" type="button" aria-label="Back">\\u2190</button>' +
        '<div class="subPgTitle"></div>' +
      '</div>' +
      '<div class="bmBdy"><div class="dzPanelWrap"></div></div>';
    el.querySelector('.subPgX').addEventListener('click', closePanel);
    document.body.appendChild(el);
    return el;
  }

  function closePanel(){
    var el = document.getElementById('dzPanelHost');
    if(el) el.classList.remove('open');
    if(typeof restoreScroll === 'function') restoreScroll();
    else document.body.style.overflow = '';
  }
  window.dzClosePanel = closePanel;

  function openPanel(view){
    var title = VIEWS[view];
    if(!title) return;
    var el = panelEl();
    el.setAttribute('aria-label', title);
    el.querySelector('.subPgTitle').textContent = title.toUpperCase();
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    el.dataset.view = view;
    paintPanel(true);
  }

  var paintSeq = 0;
  function stale(seq){ return seq !== paintSeq; }

  function paintPanel(force){
    var el = document.getElementById('dzPanelHost');
    if(!el || !el.classList.contains('open')) return;
    var host = el.querySelector('.dzPanelWrap');
    var view = el.dataset.view;

    if(host.dataset.shown !== view){
      host.innerHTML = '';
      host.dataset.shown = view;
    }
    var seq = ++paintSeq;

    if(view === 'buy') return loadPurchases(force, host, seq);
    if(view === 'cur') return renderCurrency(host);
    if(view === 'collab') return loadCollab(force, host, seq);
    loadWallet(force, host, view === 'pay' ? renderBank : renderWallet, seq);
  }

  var PAY_CARDS = {
    bal: { name:'Balance', cta:'View balance', a:'#4ADE80', b:'#15803D',
           desc:'What you have earned, what has been paid out, and the history behind both.',
           svg:'<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/>' +
               '<path d="M6.5 15h4"/>' },
    pay: { name:'Payout Methods', cta:'Manage methods', a:'#38BDF8', b:'#0369A1',
           desc:'The account your earnings are sent to, and the details a payout needs.',
           svg:'<rect x="3" y="4.5" width="18" height="15" rx="2.5"/>' +
               '<path d="M3 9h18"/><path d="M15.5 14.5h3"/>' },
    buy: { name:'My Purchases', cta:'View purchases', a:'#FB923C', b:'#C2410C',
           desc:'Everything you have bought, and the files you own a licence to re-download.',
           svg:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>' +
               '<path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>' },
    cur: { name:'Currency', cta:'Change currency', a:'#A78BFA', b:'#6D28D9',
           desc:'The currency prices, balances and payouts are shown to you in.',
           svg:'<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2A2.8 2.8 0 0 0 12 8c-1.7 0-2.6.9-2.6 2 0 2.6 5.2 1.4 5.2 4 0 1.1-.9 2-2.6 2a2.8 2.8 0 0 1-2.5-1.2"/><path d="M12 6.2v11.6"/>' }
  };

  function payCard(v){
    var c = PAY_CARDS[v];
    return { key:v, name:c.name, desc:c.desc, cta:c.cta, a:c.a, b:c.b, svg:c.svg,
             go: function(){ openPanel(v); } };
  }

  function fillMenu(){
    fillPayBoard();
    fillCollabRow();
  }

  function fillPayBoard(){
    if(typeof window.dzPayHubFill !== 'function') return;
    var host = document.getElementById('payHubGrid');
    if(!host || host.dataset.dzFilled) return;
    host.dataset.dzFilled = '1';
    window.dzPayHubFill(['bal','pay','buy','cur'].map(payCard));
  }

  function fillCollabRow(){
    var host = document.getElementById('setListGate');
    if(!host || host.dataset.dzFilled) return;
    host.dataset.dzFilled = '1';
    collabState().then(function(st){
      if(!st || !st.is_partner) return;
      if(host.querySelector('[data-v="collab"]')) return;
      var b = document.createElement('button');
      b.className = 'pfMenuItem';
      b.type = 'button';
      b.setAttribute('data-v', 'collab');
      b.innerHTML = '<span class="pfMenuTxt"></span>';
      b.firstChild.textContent = 'Collab Hub';
      b.addEventListener('click', function(){
        if(typeof setGo === 'function') setGo(function(){ openPanel('collab'); }, 'dzPanelHost');
        else openPanel('collab');
      });
      host.appendChild(b);
    }, function(){  });
  }

  var collabP = null;

  function loadCollab(force, host, seq){
    if(force) collabP = null;
    if(!collabP) collabP = collabApi('wallet', {limit: 50});
    collabP.then(function(d){
      if(!d || !d.ok){
        collabP = null;
        if(stale(seq)) return;
        host.innerHTML = '<div class="dzWlEmpty">' +
          esc((d && d.error) || 'Could not load your Collab Hub') + '</div>';
        return;
      }
      if(!stale(seq)) renderCollab(host, d);
    }, function(){
      collabP = null;
      if(stale(seq)) return;
      host.innerHTML = '<div class="dzWlEmpty">Could not load your Collab Hub</div>';
    });
  }

  function refreshCollab(){
    collabP = null;
    var el = document.getElementById('dzPanelHost');
    if(el && el.classList.contains('open') && el.dataset.view === 'collab') paintPanel(true);
  }

  var SPLIT_INFO = [
    {
      head: 'When someone buys a marketplace file with your code',
      note: 'Your code does not change what the buyer pays here. It tells us ' +
            'who sent them.',
      rows: [
        ['The artist who made it', '85%', 'Or 90% if they are on Max. Your ' +
          'commission never comes out of this.'],
        ['Tax and processing', 'as charged', 'Payment fees, plus whatever tax ' +
          'is due by law on the sale. Not a rate we set.'],
        ['You', '5%', 'Of the sale, paid the moment it settles.'],
        ['DigiArtz', 'the rest', 'Our commission, less your 5%.']
      ]
    },
    {
      head: 'When someone buys Max with your code',
      note: 'They pay a tenth of the price. Half of everything collected is ' +
            'yours.',
      rows: [
        ['The buyer saves', '90%', 'The discount your code applies at checkout.'],
        ['Tax and processing', '5%', 'Of the full price.'],
        ['You', '2.5%', 'Of the full price — a quarter of what was actually ' +
          'charged.'],
        ['DigiArtz', '2.5%', 'The same as you.']
      ]
    }
  ];

  function splitInfoHtml(){
    return SPLIT_INFO.map(function(b){
      return '<div class="dzClInfoBlk">' +
        '<h3>' + esc(b.head) + '</h3>' +
        '<p class="dzClInfoNote">' + esc(b.note) + '</p>' +
        '<ul class="dzClInfoRows">' +
          b.rows.map(function(r){
            return '<li>' +
              '<span class="dzClInfoWho">' + esc(r[0]) + '</span>' +
              '<span class="dzClInfoPct">' + esc(r[1]) + '</span>' +
              '<span class="dzClInfoWhy">' + esc(r[2]) + '</span>' +
            '</li>';
          }).join('') +
        '</ul>' +
      '</div>';
    }).join('') +
    '<p class="dzClInfoFine">Commissions are credited the moment a sale ' +
    'settles — there is no holding period, because DigiArtz does not refund ' +
    'digital files or subscriptions. If a payment is later charged back by the ' +
    'buyer’s bank, the commission on it is reversed with the sale.</p>';
  }

  function openSplitInfo(){
    var sh = openSheet('How the split works');
    sh.body.innerHTML = '<div class="dzClInfo">' + splitInfoHtml() + '</div>';
  }

  function renderCollab(host, d){
    var promo  = d.promo || {};
    var wallet = d.wallet || [];
    var ledger = d.ledger || [];
    var pref   = C.currency || 'USD';

    wallet = wallet.slice().sort(function(a, b){
      return (b.currency === pref) - (a.currency === pref);
    });

    var routed = !!(d.state && d.state.has_payout_method);

    host.innerHTML =
      '<div class="dzCl">' +

        '<div class="dzClTop">' +
          '<div class="dzClTopTxt">' +
            '<div class="dzClTopLbl">Creator collab</div>' +
            '<p class="dzClTopSub">Your code, what it has earned, and where ' +
              'that money goes.</p>' +
          '</div>' +
          '<button type="button" class="dzClInfoBtn" id="dzClInfoBtn" ' +
            'aria-label="How the revenue split works">ⓘ</button>' +
        '</div>' +

        promoHtml(promo) +
        collabWalletHtml(wallet, routed) +
        ledgerHtml(ledger) +

      '</div>';

    host.querySelector('#dzClInfoBtn').addEventListener('click', openSplitInfo);

    var make = host.querySelector('#dzClMake');
    if(make) wirePromoMaker(host);

    var copy = host.querySelector('#dzClCopy');
    if(copy) copy.addEventListener('click', function(){
      var code = copy.getAttribute('data-code') || '';
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(code).then(
          function(){ toast('Copied ' + code); },
          function(){ toast(code); });
      } else toast(code);
    });

    var add = host.querySelector('#dzClAddPay');
    if(add) add.addEventListener('click', function(){
      openPanel('pay');
    });
  }

  function promoHtml(promo){
    if(!promo.code){
      return '<section class="dzClCard">' +
        '<div class="dzClCardHd">Your promo code</div>' +
        '<p class="dzClMakeNote">Pick 4 to 6 letters or digits. It is yours for ' +
          'good — it cannot be changed once it is made, and nobody else can ' +
          'take it.</p>' +
        '<div class="dzClMakeRow">' +
          '<input type="text" id="dzClMakeIn" class="dzClMakeIn" maxlength="6" ' +
            'autocapitalize="characters" autocomplete="off" spellcheck="false" ' +
            'placeholder="ART24" aria-label="Your promo code, 4 to 6 letters or digits">' +
          '<button type="button" id="dzClMake" class="dzClMakeGo">Create</button>' +
        '</div>' +
        '<div class="dzClMakeMsg" id="dzClMakeMsg" role="status"></div>' +
      '</section>';
    }

    return '<section class="dzClCard">' +
      '<div class="dzClCardHd">Your promo code</div>' +
      '<div class="dzClCode">' +
        '<span class="dzClCodeTxt">' + esc(promo.code) + '</span>' +
        '<button type="button" id="dzClCopy" class="dzClCopy" ' +
          'data-code="' + esc(promo.code) + '" aria-label="Copy your promo code">Copy</button>' +
      '</div>' +
      (promo.is_active
        ? ''
        : '<p class="dzClCodeOff">This code is not taking new orders. Anything ' +
          'it already earned is still yours.</p>') +
      '<ul class="dzClStats">' +
        statCell('Times used', promo.usage_count || 0) +
        statCell('Buyers', promo.unique_buyers || 0) +
        statCell('Files', promo.marketplace_conversions || 0) +
        statCell('Max plans', promo.subscription_conversions || 0) +
      '</ul>' +
    '</section>';
  }

  function statCell(label, n){
    return '<li class="dzClStat">' +
      '<span class="dzClStatN">' + esc(String(n)) + '</span>' +
      '<span class="dzClStatL">' + esc(label) + '</span>' +
    '</li>';
  }

  function wirePromoMaker(host){
    var input = host.querySelector('#dzClMakeIn');
    var btn   = host.querySelector('#dzClMake');
    var msg   = host.querySelector('#dzClMakeMsg');

    function say(t, kind){
      msg.textContent = t || '';
      msg.className = 'dzClMakeMsg' + (kind ? ' dzClMakeMsg--' + kind : '');
    }

    input.addEventListener('input', function(){
      input.value = String(input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      say('', '');
    });

    btn.addEventListener('click', function(){
      var code = String(input.value || '').trim().toUpperCase();
      if(!/^[A-Z0-9]{4,6}$/.test(code)){
        say('4 to 6 letters or digits, nothing else.', 'bad');
        return;
      }
      btn.disabled = true;
      say('Creating…', '');
      collabApi('promo-create', {code: code}).then(function(r){
        btn.disabled = false;
        if(!r || !r.ok){ say((r && r.error) || 'Could not create that code', 'bad'); return; }
        toast(r.code + ' is yours');
        refreshCollab();
      }, function(){
        btn.disabled = false;
        say('Could not create that code', 'bad');
      });
    });
  }

  function collabWalletHtml(wallet, routed){
    if(!wallet.length){
      return '<section class="dzClCard">' +
        '<div class="dzClCardHd">Earnings</div>' +
        '<div class="dzClBal">' + esc(moneyMinor(0, C.currency || 'USD')) + '</div>' +
        '<p class="dzClBalSub">Nothing yet. You earn in whichever currency the ' +
          'buyer paid in, and it is never converted.</p>' +
      '</section>';
    }

    return wallet.map(function(w){
      return '<section class="dzClCard">' +
        '<div class="dzClCardHd">Earnings · ' + esc(w.currency) + '</div>' +
        '<div class="dzClBal">' + esc(moneyMinor(w.available, w.currency)) + '</div>' +
        '<div class="dzClBalSub">Available now</div>' +
        '<ul class="dzClFigs">' +
          '<li><span>Lifetime</span><b>' + esc(moneyMinor(w.lifetime, w.currency)) + '</b></li>' +
          '<li><span>Paid out</span><b>' + esc(moneyMinor(w.paid_out, w.currency)) + '</b></li>' +
          '<li><span>Sales</span><b>' + esc(String(w.conversions || 0)) + '</b></li>' +
        '</ul>' +
      '</section>';
    }).join('') + routeHtml(routed);
  }

  function routeHtml(routed){
    if(routed){
      return '<section class="dzClCard dzClRoute dzClRoute--on">' +
        '<div class="dzClRouteHd">✓ Paid to your account</div>' +
        '<p>You have a payout method on file, so your commissions are ready to ' +
          'withdraw to it. Use Payout Methods in Settings to change where they ' +
          'go.</p>' +
      '</section>';
    }
    return '<section class="dzClCard dzClRoute">' +
      '<div class="dzClRouteHd">Held in your DigiArtz wallet</div>' +
      '<p>You have not added a payout method, so everything you earn is ' +
        'accumulating here. Nothing is lost or expiring — add an account and ' +
        'you can withdraw it.</p>' +
      '<button type="button" id="dzClAddPay" class="dzClAddPay">' +
        'Add Payment Method to Withdraw</button>' +
    '</section>';
  }

  function ledgerHtml(rows){
    if(!rows.length){
      return '<section class="dzClCard">' +
        '<div class="dzClCardHd">Activity</div>' +
        '<div class="dzWlEmpty">Nobody has used your code yet.</div>' +
      '</section>';
    }

    return '<section class="dzClCard">' +
      '<div class="dzClCardHd">Activity</div>' +
      '<ul class="dzClLedger">' +
        rows.map(function(r){
          var when = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
          var off  = r.payout_status === 'reversed';
          return '<li class="dzClRow' + (off ? ' dzClRow--off' : '') + '">' +
            '<div class="dzClRowMain">' +
              '<span class="dzClRowWho">@' + esc(r.buyer_username || 'someone') + '</span>' +
              '<span class="dzClRowWhat">' + esc(r.label || r.kind) + '</span>' +
            '</div>' +
            '<div class="dzClRowSide">' +
              '<span class="dzClRowAmt">' +
                (off ? '—' : '+' + esc(moneyMinor(r.amount, r.currency))) +
              '</span>' +
              '<span class="dzClRowWhen">' + esc(when) +
                (off ? ' · reversed' : '') + '</span>' +
            '</div>' +
          '</li>';
        }).join('') +
      '</ul>' +
    '</section>';
  }

  function renderCurrency(host){
    var cur  = C.currency || 'USD';
    var list = C.currencies || [];
    host.innerHTML =
      '<div class="dzCur">' +
        '<p class="dzCurNote">Your subscription is charged in this currency, and ' +
          'anything you list is priced in it by default. Changing it does not ' +
          'change what you already own, what you have already been charged, or ' +
          'any balance you have already earned \u2014 money is never converted ' +
          'between currencies here.</p>' +
        '<ul class="dzCurList">' +
          list.map(function(c){
            var on = c.code === cur;
            return '<li><button type="button" class="dzCurOpt' + (on ? ' dzCurOpt--on' : '') +
              '" data-c="' + esc(c.code) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
              '<span class="dzCurCode">' + esc(c.code) + '</span>' +
              '<span class="dzCurName">' + esc(c.name) + '</span>' +
              '<span class="dzCurTick" aria-hidden="true">\u2713</span>' +
            '</button></li>';
          }).join('') +
        '</ul>' +
        '<div class="dzWlMsg" hidden></div>' +
      '</div>';

    var msg = host.querySelector('.dzWlMsg');
    Array.prototype.forEach.call(host.querySelectorAll('.dzCurOpt'), function(b){
      b.addEventListener('click', function(){
        var code = b.getAttribute('data-c');
        if(code === (C.currency || 'USD')) return;
        msg.textContent = 'Saving\u2026'; msg.hidden = false;
        msg.classList.remove('dzWlMsg--bad');
        veil(true);
        pay('currency', {currency: code})
          .then(function(){
                  C.currency = code;
                  reloadModule(function(ok){
                    veil(false);
                    toast(ok ? 'Currency set to ' + code
                             : 'Currency saved \u2014 reload to see the new prices');
                  });
                },
                function(e){
                  veil(false);
                  msg.textContent = e.message || 'Could not save that';
                  msg.classList.add('dzWlMsg--bad');
                });
      });
    });
  }

  function veilEl(){
    var el = document.getElementById('intro');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'intro';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Loading');
    el.className = 'iHide iGone';
    el.innerHTML = '<div class="iSpin" aria-hidden="true"></div>' +
                   '<div class="iTxt">LOADING</div>';
    document.body.appendChild(el);
    return el;
  }

  function veil(on){
    var el = veilEl();
    if(on){
      el.classList.remove('iGone');
      void el.offsetWidth;
      el.classList.remove('iHide');
      return;
    }
    el.classList.add('iHide');
    var done = false;
    var h = function(e){
      if(e.propertyName !== 'opacity') return;
      gone();
    };
    var gone = function(){
      if(done) return;
      done = true;
      el.removeEventListener('transitionend', h);
      el.classList.add('iGone');
    };
    el.addEventListener('transitionend', h);
    setTimeout(gone, 450);
  }

  function reloadModule(done){
    closePanel();
    var fired = false;
    var finish = function(ok){
      if(fired) return;
      fired = true;
      if(typeof done === 'function') done(ok);
    };
    var s = document.createElement('script');
    s.src = '/api/store?t=' + Date.now();
    s.onload = function(){
      var host = document.getElementById('subPgGate');
      if(host) host.dataset.dzFilled = '';
      if(typeof window.dzFill === 'function') window.dzFill();
      finish(true);
    };
    s.onerror = function(){ finish(false); };
    document.head.appendChild(s);
    setTimeout(function(){ finish(false); }, 15000);
  }

  var walletP = null;
  function loadWallet(force, host, render, seq){
    if(!host) return;
    if(force) walletP = null;
    if(!walletP) walletP = pay('overview');
    walletP.then(function(d){ if(stale(seq)) return; render(host, d); },
                 function(e){
                   walletP = null;
                   if(stale(seq)) return;
                   host.innerHTML = '<div class="dzWlEmpty">' +
                     esc(e.message || 'Could not load') + '</div>';
                 });
  }
  function refreshPanel(){ walletP = null; paintPanel(true); }

  function purchaseRow(p){
    var title = esc(p.title || 'Marketplace item');
    var thumb = p.preview_url
      ? '<img class="dzPuThumb" loading="lazy" decoding="async" src="' +
          esc(typeof getThumbnailUrl === 'function' ? getThumbnailUrl(p.preview_url) : p.preview_url) +
          '" alt="">'
      : '<span class="dzPuThumb dzPuThumbNo" aria-hidden="true">\\u25a6</span>';
    var n = Number(p.file_count) || 0;
    return '<li class="dzPuRow" data-item="' + esc(p.item_id || '') + '">' +
      '<div class="dzPuTop">' +
        thumb +
        '<div class="dzPuMain">' +
          '<div class="dzPuTitle">' + title + '</div>' +
          '<div class="dzPuSub">' +
            (p.seller_name ? 'by ' + esc(p.seller_name) + ' \\u00b7 ' : '') +
            esc(moneyMinor(p.amount, p.currency)) + ' \\u00b7 ' + esc(when(p.paid_at)) +
          '</div>' +
          '<div class="dzPuFiles">' +
            (p.delisted
              ? 'The seller has removed this listing \\u2014 its files are no longer available'
              : n ? n + ' file' + (n === 1 ? '' : 's') + ' \\u00b7 full quality, no download limit'
                  : 'No files attached to this listing') +
          '</div>' +
        '</div>' +
      '</div>' +
      (!p.delisted && n
        ? '<button type="button" class="dzPuBtn" data-get="' + esc(p.item_id) + '">' +
            (n === 1 ? '\\u2b07 Download' : '\\u2b07 Show ' + n + ' files') + '</button>'
        : '') +
      '<div class="dzPuList" hidden></div>' +
    '</li>';
  }

  function renderPurchases(host, rows){
    if(!rows.length){
      host.innerHTML =
        '<div class="dzWlEmpty">Nothing bought yet. Anything you buy on the marketplace ' +
        'lands here permanently, with every file unlocked.</div>';
      return;
    }
    host.innerHTML =
      '<p class="dzPuNote">Bought once, yours to keep. Every file is the seller\\u2019s ' +
      'original at full quality, re-downloadable as often as you like, and no ' +
      'subscription tier is involved either way.</p>' +
      '<ul class="dzPuList--top">' + rows.map(purchaseRow).join('') + '</ul>';

    Array.prototype.forEach.call(host.querySelectorAll('[data-get]'), function(b){
      b.addEventListener('click', function(){ openFiles(b); });
    });
  }

  function openFiles(btn){
    var item = btn.getAttribute('data-get');
    var box  = btn.parentNode.querySelector('.dzPuList');
    if(!box) return;
    if(!box.hidden){ box.hidden = true; return; }
    if(box.dataset.loaded){ box.hidden = false; return; }
    if(box.dzOneFile){
      if(typeof window.dzMarketFetch === 'function'){
        window.dzMarketFetch(item, box.dzOneFile.file_id, box.dzOneFile.name, btn);
      }
      return;
    }
    if(btn.disabled) return;

    btn.disabled = true;
    sb.rpc('dz_market_files', {p_item: item}).then(function(res){
      btn.disabled = false;
      if(!res || res.error){
        toast((res && res.error && res.error.message) || 'Could not open your files');
        return;
      }
      var files = res.data || [];
      if(!files.length){ toast('This listing has no files attached'); return; }
      if(files.length === 1 && typeof window.dzMarketFetch === 'function'){
        box.dzOneFile = files[0];
        window.dzMarketFetch(item, files[0].file_id, files[0].name, btn);
        return;
      }
      box.innerHTML = files.map(function(f){
        return '<div class="dzPuFile">' +
          '<span class="dzPuExt">' + esc(String(f.ext || 'file').toUpperCase()) + '</span>' +
          '<div class="dzPuFileMeta">' +
            '<div class="dzPuFileNm">' + esc(f.name) + '</div>' +
            '<div class="dzPuFileSz">' + esc(bytesOf(f.bytes)) + '</div>' +
          '</div>' +
          '<button type="button" class="dzPuFileBtn" data-f="' + esc(f.file_id) + '" ' +
            'data-n="' + esc(f.name) + '">Download</button>' +
        '</div>';
      }).join('');
      box.dataset.loaded = '1';
      box.hidden = false;
      Array.prototype.forEach.call(box.querySelectorAll('[data-f]'), function(fb){
        fb.addEventListener('click', function(){
          if(typeof window.dzMarketFetch === 'function')
            window.dzMarketFetch(item, fb.getAttribute('data-f'), fb.getAttribute('data-n'), fb);
        });
      });
    }, function(){ btn.disabled = false; toast('Could not open your files'); });
  }

  function bytesOf(n){
    n = Number(n) || 0;
    if(n <= 0) return '\\u2014';
    var u = ['B','KB','MB','GB'], i = 0;
    while(n >= 1024 && i < u.length - 1){ n /= 1024; i++; }
    return (n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }

  var purchasesP = null;
  function loadPurchases(force, host, seq){
    if(!host || typeof sb === 'undefined' || !sb || !sb.rpc) return;
    if(force) purchasesP = null;
    if(!purchasesP) purchasesP = Promise.resolve(sb.rpc('dz_my_purchases'));
    purchasesP.then(function(res){
      if(!res || res.error){
        purchasesP = null;
        if(stale(seq)) return;
        host.innerHTML = '<div class="dzWlEmpty">' +
          esc((res && res.error && res.error.message) || 'Could not load your purchases') + '</div>';
        return;
      }
      if(!stale(seq)) renderPurchases(host, res.data || []);
      var changed = false;
      (res.data || []).forEach(function(p){
        if(p.item_id && !ownedIds[p.item_id]){ ownedIds[p.item_id] = true; changed = true; }
      });
      if(changed) repaintOwned();
    }, function(){
      purchasesP = null;
      if(stale(seq)) return;
      host.innerHTML = '<div class="dzWlEmpty">Could not load your purchases</div>';
    });
  }

  window.dzFill = function(){ fillPlans(); fillSlots(); fillMenu(); paintPanel(false); };
  window.dzPaintPlans = paintPlans;
  window.dzFill();
})(__dzStore);
`;

function liveProviders(env) {
  const out = [];
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) out.push('rzp');
  if (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET) out.push('paypal');
  return out;
}

export async function onRequestGet({ env, request }) {
  const deny = (s = 401) =>
    new Response(s === 401 ? '/* sign in required */' : '/* unavailable */', {
      status: s,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store, private',
        'x-robots-tag': 'noindex, nofollow',
      },
    });

  if (!sbUrl(env) || !sbAnon(env)) return deny(503);
  const user = await sbUser(env, request);
  if (!user) return deny(401);

  let currency = 'USD';
  let prices = {};
  let support = null;
  try {
    const me = await sbService(env, '/profiles?id=eq.' + user.id + '&select=currency&limit=1');
    const c = me && me[0] && me[0].currency;
    if (c && CURRENCY_CODES.has(c)) currency = c;

    const rows = await sbService(env,
      '/subscription_prices?currency=eq.' + currency + '&select=plan,amount');
    (rows || []).forEach((r) => { prices[r.plan] = Number(r.amount); });

    const lim = await sbService(env,
      '/support_limits?currency=eq.' + currency + '&select=min_amount,max_amount&limit=1');
    if (lim && lim[0]) support = { min: Number(lim[0].min_amount), max: Number(lim[0].max_amount) };
  } catch {   }

  if (!Object.keys(prices).length) {
    currency = 'USD';
    try {
      const rows = await sbService(env, '/subscription_prices?currency=eq.USD&select=plan,amount');
      (rows || []).forEach((r) => { prices[r.plan] = Number(r.amount); });
      const lim = await sbService(env,
        '/support_limits?currency=eq.USD&select=min_amount,max_amount&limit=1');
      if (lim && lim[0]) support = { min: Number(lim[0].min_amount), max: Number(lim[0].max_amount) };
    } catch {   }
  }

  const priced = PLANS
    .filter((p) => prices[p.id] > 0)
    .map((p) => Object.assign({}, p, {
      price: fmtMoney(prices[p.id], currency),
      amount: prices[p.id],
    }));

  const cfg = {
    providers: liveProviders(env),
    currency,
    currencies: CURRENCIES,
    support,
    freePrice: fmtMoney(0, currency),
    plansHtml: plansHtml(priced),
    plans: priced.map((p) => ({
      id: p.id, name: p.name, price: p.price, tone: p.tone,
      tagline: p.tagline, features: p.features,
    })),
  };
  const body = 'var __dzStore = ' + JSON.stringify(cfg) + ';\n' + MODULE;

  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, private, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
      vary: 'authorization',
    },
  });
}
