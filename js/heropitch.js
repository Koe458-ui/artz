(function(){
  'use strict';

    // The hero was four tabs from a data table, now one static block — only the two buttons' navigation is left here

  function go(to){
    var path = typeof window.dzRoutePath === 'function' ? window.dzRoutePath(to) : null;
    if(path && typeof window.dzRouteGo === 'function' && window.dzRouteGo(path)) return;
    if(typeof openFG === 'function'){
      openFG();
      if(typeof fgSwitchSection === 'function') fgSwitchSection(to);
    }
  }

  function hpGo(){ go('artworks'); }

    // /community has no `section`, so dzRoutePath cannot resolve it; open it the way the top nav does, route push as fallback
  function hpJoin(){
    var open = typeof window.bnGoCommunity === 'function' ? window.bnGoCommunity : null;
    if(open){ open(); return; }
    if(typeof window.dzRouteGo === 'function' && window.dzRouteGo('/community')) return;
    window.location.href = '/community';
  }

  window.hpGo   = hpGo;
  window.hpJoin = hpJoin;
})();
