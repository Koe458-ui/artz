(function(){
  'use strict';

  var CHUNKS = {
    analytics: {
      src: ['/js/analytics.js?v=23'],
      css: ['/css/analytics.css?v=17'],
      api: ['openAnalyticsPage']
    },
    hubs: {
      src: ['/js/hubs.js?v=5'],
      css: ['/css/analytics.css?v=17'],
      api: ['anHubOpen', 'payHubOpen']
    },
    share: {
      src: ['/js/share.js?v=3'],
      api: ['openPfShare', 'closePfShare', 'pfShareCopy', 'pfShareNative']
    },
    zeo: {
      src: ['/aiAssistantData.js?v=7', '/js/zeo.js?v=6'],
      api: ['zeoOpen', 'zeoHide']
    },
    secview: {
      src: ['/js/secview.js?v=8'],
      warm: true,
      api: ['dzOpenById', 'dzOpenRow', 'dzOpenView', 'dzOpenArtwork', 'dzOpenListing',
            'dzVwFill', 'dzVwCard', 'dzVwActRow', 'dzResourceDownload', 'dzReportItem',
            'dzCmLoad', 'dzCmMore', 'dzCmPost', 'dzCmDelAsk', 'dzCmDel',
            'dzVwShare', 'dzVwDownload', 'dzVwProfile', 'dzVwFriend', 'dzVwFollow', 'dzVwEng',
            'dzViewNav', 'dzConfirm', 'dzConfirmClose', 'dzConfirmYes',
            'dzQuotaOpen', 'avLoadQuota', 'dzAdMount', 'dzAdHtml']
    },
    legal: {
      src: ['/js/legal-content.js?v=4'],
      module: true,
      api: []
    }
  };

  var pending = {};
  var sheets = {};

  function sheet(href){
    if(sheets[href]) return sheets[href];
    sheets[href] = new Promise(function(resolve){
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = l.onerror = function(){ resolve(); };
      document.head.appendChild(l);
    });
    return sheets[href];
  }

  function inject(src, isModule){
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      if(isModule) s.type = 'module';
      else s.async = false;
      s.src = src;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('could not load ' + src)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function load(name){
    if(pending[name]) return pending[name];
    var c = CHUNKS[name];
    if(!c) return Promise.reject(new Error('no such chunk: ' + name));
    pending[name] = Promise.all((c.css || []).map(sheet)).then(function(){
      return c.src.reduce(function(p, src){
        return p.then(function(){ return inject(src, c.module); });
      }, Promise.resolve());
    });
    pending[name]['catch'](function(){ pending[name] = null; });
    return pending[name];
  }

  window.dzLazy = load;

  function stub(chunk, name){
    var placeholder = function(){
      var args = arguments, self = this;
      return load(chunk).then(function(){
        var real = window[name];
        if(typeof real === 'function' && real !== placeholder) return real.apply(self, args);
        console.error('chunk ' + chunk + ' loaded but did not define ' + name);
      })['catch'](function(err){
        console.error(err);
        if(typeof showToast === 'function') showToast('Could not load that just now — check your connection');
      });
    };
    placeholder.dzChunk = chunk;
    window[name] = placeholder;
  }

  Object.keys(CHUNKS).forEach(function(chunk){
    CHUNKS[chunk].api.forEach(function(name){
      if(typeof window[name] === 'function') return;
      stub(chunk, name);
    });
  });

  function metered(){
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(!c) return false;
    if(c.saveData) return true;
    return /(^|-)(2g|slow-2g)$/.test(String(c.effectiveType || ''));
  }

  function warm(){
    if(metered()) return;
    Object.keys(CHUNKS).forEach(function(name){
      if(CHUNKS[name].warm) load(name)['catch'](function(){});
    });
  }

  if(window.requestIdleCallback) requestIdleCallback(warm, { timeout: 8000 });
  else setTimeout(warm, 4000);
})();
