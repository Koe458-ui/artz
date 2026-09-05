import { sbUrl, sbAnon, sbUser, sbRpc } from '../lib/sb.js';

const TABS_STAFF = [
  ['tel', 'TELEMETRY'], ['rpt', 'REPORTS'], ['mod', 'MODERATION'],
  ['prt', 'PARTNERS'], ['log', 'AUDIT'], ['noti', 'NOTIFY'],
];
const TABS_PARTNER = [['rpt', 'REPORTS'], ['mod', 'MODERATION']];

const STYLE_STAFF = `
.admTelGrp{margin-bottom:1.6rem;}
.admTelHd{margin:0 0 .6rem;font-family:var(--fm);font-size:.64rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--txd);}
.admTelGrid{list-style:none;margin:0;padding:0;display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));}
.admTelCell{padding:.8rem .85rem;border:1px solid var(--bdr);border-radius:10px;background:var(--sur);}
.admTelN{display:block;font-family:var(--fd);font-size:1.5rem;font-weight:800;line-height:1.1;color:var(--tx);}
.admTelL{display:block;margin-top:.2rem;font-family:var(--fm);font-size:.6rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--txd);}
.admTelToday{display:block;margin-top:.35rem;font-family:var(--fm);font-size:.6rem;font-weight:700;color:#16a34a;}
.admTelAt{margin:0;font-family:var(--fb);font-size:.76rem;line-height:1.55;color:var(--txd);}
`;

const STYLE_CORE = `
.admRptSwitch{display:flex;gap:.4rem;margin-bottom:1rem;}
.admRptTog{padding:.42rem .85rem;border:1px solid var(--bdr);border-radius:999px;background:var(--sur);color:var(--txd);font-family:var(--fm);font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}
.admRptTog.active{border-color:var(--pg);background:var(--pdim);color:var(--pg);}
@media(hover:hover){.admRptTog:not(.active):hover{border-color:var(--bdrh);}}
.admRptCard{display:flex;flex-direction:column;gap:.35rem;}
.admRptWhy{font-family:var(--fm);font-size:.66rem;font-weight:700;letter-spacing:.08em;color:var(--danger);}
.admRptWho{font-family:var(--fd);font-size:.92rem;font-weight:700;color:var(--tx);}
.admRptBanned{font-family:var(--fm);font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--danger);}
.admRptDet{font-family:var(--fb);font-size:.82rem;line-height:1.5;color:var(--txd);white-space:pre-wrap;word-break:break-word;}
.admRptMeta{font-family:var(--fm);font-size:.6rem;color:var(--txd);opacity:.8;}
.admRptActs{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem;}

.admModLbl{font-family:var(--fm);font-size:.68rem;font-weight:700;letter-spacing:.1em;color:var(--tx);margin-bottom:.3rem;}
.admModNote{margin:0 0 .9rem;font-family:var(--fb);font-size:.82rem;line-height:1.5;color:var(--txd);}
.admModForm{display:flex;gap:.5rem;margin-bottom:1.1rem;}
.admModIn{flex:1 1 auto;min-width:0;padding:.62rem .8rem;border:1px solid var(--bdr);border-radius:9px;background:var(--sur2);color:var(--tx);font-family:var(--fb);font-size:.86rem;}
.admModIn:focus-visible{outline:2px solid var(--pg);outline-offset:1px;}
.admModGo{flex:0 0 auto;padding:.62rem 1.1rem;border:none;border-radius:9px;background:var(--pg);color:var(--text-on-accent);font-family:var(--fm);font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;}
@media(hover:hover){.admModGo:hover{filter:brightness(1.1);}}
.admMemb{padding:1rem;border:1px solid var(--bdr);border-radius:12px;background:var(--sur);}
.admMembTop{display:flex;align-items:flex-start;gap:.8rem;flex-wrap:wrap;}
.admMembName{font-family:var(--fd);font-size:1.05rem;font-weight:800;color:var(--tx);}
.admMembSub{margin-top:.15rem;font-family:var(--fb);font-size:.8rem;color:var(--txd);}
.admMembTags{margin-left:auto;display:flex;gap:.35rem;flex-wrap:wrap;}
.admTag{padding:.2rem .5rem;border:1px solid var(--bdr);border-radius:999px;background:var(--sur2);color:var(--txd);font-family:var(--fm);font-size:.56rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.admTag--admin,.admTag--dev{border-color:var(--pg);color:var(--pg);}
.admTag--partner{border-color:#16a34a;color:#16a34a;}
.admTag--ban{border-color:var(--danger);color:var(--danger);}
.admMembId{margin-top:.6rem;font-family:var(--fm);font-size:.6rem;color:var(--txd);opacity:.7;word-break:break-all;}
.admMembBan{margin-top:.6rem;padding:.55rem .7rem;border-radius:8px;background:var(--danger-bg);color:var(--danger);font-family:var(--fb);font-size:.8rem;line-height:1.45;}
.admMembActs{margin-top:.9rem;}
.admMembNo{margin:0;font-family:var(--fb);font-size:.8rem;line-height:1.5;color:var(--txd);}
.admBanForm{display:flex;flex-direction:column;gap:.55rem;}
.admBanRow{display:flex;gap:.5rem;}
.admBanLen{flex:1 1 auto;padding:.6rem .7rem;border:1px solid var(--bdr);border-radius:9px;background:var(--sur2);color:var(--tx);font-family:var(--fb);font-size:.84rem;}
.admBanGo{flex:0 0 auto;padding:.6rem 1.3rem;border:1px solid var(--danger);border-radius:9px;background:var(--danger-bg);color:var(--danger);font-family:var(--fm);font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;}
@media(hover:hover){.admBanGo:hover{background:var(--danger-bg-hover);}}
`;

const STYLE_STAFF2 = `
.admPrtTop{display:flex;align-items:center;gap:.7rem;margin-bottom:1rem;}
.admPrtLbl{font-family:var(--fm);font-size:.68rem;font-weight:700;letter-spacing:.1em;color:var(--tx);}
.admPrtAdd{margin-left:auto;width:34px;height:34px;border:1px solid var(--pg);border-radius:999px;background:var(--pdim);color:var(--pg);font-size:1.25rem;line-height:1;cursor:pointer;display:grid;place-items:center;}
@media(hover:hover){.admPrtAdd:hover{background:var(--pg);color:var(--text-on-accent);}}
.admPrtAdd:focus-visible{outline:2px solid var(--pg);outline-offset:2px;}
.admPrtList{display:flex;flex-direction:column;gap:.6rem;}
.admPrt{display:flex;align-items:center;gap:.8rem;padding:.85rem .95rem;border:1px solid var(--bdr);border-radius:10px;background:var(--sur);}
.admPrtMain{flex:1 1 auto;min-width:0;}
.admPrtName{font-family:var(--fd);font-size:.92rem;font-weight:700;color:var(--tx);}
.admPrtSub{margin-top:.2rem;font-family:var(--fm);font-size:.62rem;color:var(--txd);}
.admPrtCode{font-weight:800;letter-spacing:.14em;color:var(--pg);}
.admPrtOff{color:var(--danger);}
.admPrtMoney{margin-top:.25rem;font-family:var(--fm);font-size:.62rem;color:var(--txd);opacity:.85;}
.admPrtActs{flex:0 0 auto;}

.admLogList{display:flex;flex-direction:column;}
.admLog{padding:.7rem 0;border-bottom:1px solid var(--bdr);display:flex;flex-direction:column;gap:.2rem;}
.admLog:last-child{border-bottom:none;}
.admLogMain{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;}
.admLogWho{font-family:var(--fm);font-size:.78rem;font-weight:700;color:var(--tx);}
.admLogRole{padding:.1rem .4rem;border:1px solid var(--bdr);border-radius:999px;font-family:var(--fm);font-size:.54rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--txd);}
.admLogAct{font-family:var(--fb);font-size:.8rem;color:var(--txd);}
.admLogTgt{font-family:var(--fm);font-size:.78rem;font-weight:700;color:var(--tx);}
.admLogWhy{font-family:var(--fb);font-size:.78rem;font-style:italic;color:var(--txd);word-break:break-word;}
.admLogWhen{font-family:var(--fm);font-size:.6rem;color:var(--txd);opacity:.75;}
`;

const HEAD = `
(function(C){
  'use strict';

  var TABS = C.tabs;
  var PANELS = {};
  var tab = TABS[0][0];

  function esc(v){
    return String(v==null?'':v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function toast(m){ if(typeof showToast==='function') showToast(m); }

  var ZERO_DEC = { JPY:1, HUF:1, TWD:1 };
  function money(minor, cur){
    var n = Number(minor) || 0;
    var v = ZERO_DEC[cur] ? n : n / 100;
    try {
      return new Intl.NumberFormat(undefined, { style:'currency', currency:cur,
        minimumFractionDigits: ZERO_DEC[cur] ? 0 : 2 }).format(v);
    } catch(e) {
      return cur + ' ' + v.toFixed(ZERO_DEC[cur] ? 0 : 2);
    }
  }

  function style(){
    if(document.getElementById('dzOpsCss')) return;
    var s = document.createElement('style');
    s.id = 'dzOpsCss';
    s.textContent = C.css;
    document.head.appendChild(s);
  }

  function api(action, body){
    if(typeof sb === 'undefined' || !sb) return Promise.reject(new Error('Not signed in'));
    return sb.auth.getSession().then(function(s){
      var session = s && s.data && s.data.session;
      if(!session) throw new Error('Not signed in');
      return fetch('/api/collab', {
        method:'POST',
        headers:{'content-type':'application/json',
                 authorization:'Bearer ' + session.access_token},
        cache:'no-store',
        body:JSON.stringify(Object.assign({action:action}, body || {}))
      });
    }).then(function(res){
      return res.json().catch(function(){ return null; }).then(function(j){
        if(!res.ok) throw new Error((j && j.error) || 'That did not work');
        return j;
      });
    });
  }

  function btn(text, fn){
    var b = document.createElement('button');
    b.className = 'rptBtn';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function build(el){
    if(el.firstElementChild) return;
    style();
    el.setAttribute('role','dialog');
    el.setAttribute('aria-modal','true');
    el.setAttribute('aria-label', C.title);

    el.innerHTML =
      '<div class="subPgHdr">' +
        '<button class="subPgX" type="button" aria-label="Close">\\u2190</button>' +
        '<div class="subPgTitle">' + esc(C.title.toUpperCase()) + '</div>' +
      '</div>' +
      '<div class="admBdy">' +
        '<div class="pfTabs" role="tablist"><div class="pfTabGroup">' +
          TABS.map(function(t, i){
            return '<button class="pfTab' + (i===0?' active':'') +
              '" data-t="' + esc(t[0]) + '" role="tab" aria-selected="' +
              (i===0?'true':'false') + '">' + esc(t[1]) +
              (t[0]==='rpt' ? '<span class="admTabCount" hidden>0</span>' : '') +
            '</button>';
          }).join('') +
        '</div></div>' +
        TABS.map(function(t, i){
          return '<div class="pfPanel' + (i===0?' active':'') +
                 '" data-p="' + esc(t[0]) + '">' +
                 (PANELS[t[0]] && PANELS[t[0]].html ? PANELS[t[0]].html() : '') +
                 '</div>';
        }).join('') +
      '</div>';

    el.querySelector('.subPgX').addEventListener('click', close);
    Array.prototype.forEach.call(el.querySelectorAll('.pfTab'), function(b){
      b.addEventListener('click', function(){ switchTo(b.getAttribute('data-t')); });
    });
    TABS.forEach(function(t){
      var p = PANELS[t[0]];
      if(p && p.wire) p.wire(el.querySelector('[data-p="' + t[0] + '"]'));
    });
  }

  function open(){
    var el = document.getElementById('admPage');
    if(!el) return;
    build(el);
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    load(tab);
    loadReports();
  }

  function close(){
    var el = document.getElementById('admPage');
    if(!el) return;
    el.classList.remove('open');
    if(typeof restoreScroll === 'function') restoreScroll();
    else document.body.style.overflow = '';
  }

  function switchTo(t){
    tab = t;
    var el = document.getElementById('admPage');
    if(!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('.pfTab'), function(b){
      var on = b.getAttribute('data-t') === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(el.querySelectorAll('.pfPanel'), function(p){
      p.classList.toggle('active', p.getAttribute('data-p') === t);
    });
    load(t);
  }

  function load(t){
    var p = PANELS[t];
    if(p && p.load) p.load();
  }

  function panelEl(name){
    var el = document.getElementById('admPage');
    return el ? el.querySelector('[data-p="' + name + '"]') : null;
  }

  var RPT_LABELS = {
    copyright:'Copyright infringement', ai_undisclosed:'AI-generated artwork',
    nudity:'Nudity / Sexual content', violence:'Violence / Gore',
    hate:'Hate speech / Harassment', spam:'Spam / Advertising',
    misinformation:'Misinformation', impersonation:'Impersonation',
    illegal:'Illegal content', offtopic:'Off-topic / Wrong category',
    lowquality:'Low-quality / Broken upload', other:'Other',
    dmca:'DMCA / Copyright', harassment:'Harassment', fraud:'Fraud'
  };
  var rptWhich = 'user';

  PANELS.rpt = {
    html: function(){
      return '<div class="admRptSwitch" role="group" aria-label="Which reports">' +
          '<button type="button" class="admRptTog active" data-q="user">Accounts</button>' +
          '<button type="button" class="admRptTog" data-q="item">Uploads</button>' +
        '</div>' +
        '<div class="pfGrid" data-r="list"></div>' +
        '<div class="pfEmpty" data-r="empty" hidden>' +
          '<span class="admEmptyIcon">\\u2713</span>No open reports.</div>';
    },
    wire: function(host){
      Array.prototype.forEach.call(host.querySelectorAll('.admRptTog'), function(b){
        b.addEventListener('click', function(){
          rptWhich = b.getAttribute('data-q');
          Array.prototype.forEach.call(host.querySelectorAll('.admRptTog'), function(x){
            x.classList.toggle('active', x.getAttribute('data-q') === rptWhich);
          });
          loadReports();
        });
      });
    },
    load: function(){ loadReports(); }
  };

  function rptParts(){
    var host = panelEl('rpt');
    if(!host) return null;
    return { host:host,
             list: host.querySelector('[data-r="list"]'),
             empty: host.querySelector('[data-r="empty"]') };
  }

  function rptCount(n){
    var el = document.getElementById('admPage');
    var b = el && el.querySelector('.admTabCount');
    if(!b) return;
    b.textContent = n;
    b.hidden = !n;
  }

  function rptEmpty(p, msg){
    p.list.innerHTML = '';
    p.empty.hidden = false;
    if(msg) p.empty.textContent = msg;
    else p.empty.innerHTML = '<span class="admEmptyIcon">\\u2713</span>No open reports.';
  }

  function loadReports(){
    return rptWhich === 'item' ? loadItemReports() : loadUserReports();
  }

  function rptFill(p, rows, card){
    if(!rows.length) return rptEmpty(p);
    p.empty.hidden = true;
    p.list.innerHTML = '';
    rows.forEach(function(rep){
      var o = card(rep);
      var el = document.createElement('div');
      el.className = 'pfCard admRptCard';
      el.innerHTML =
        '<div class="admRptWhy">\\ud83d\\udea9 ' +
          esc(RPT_LABELS[rep.reason] || rep.reason) + '</div>' +
        '<div class="admRptWho">' + o.who + '</div>' +
        (rep.details ? '<div class="admRptDet"></div>' : '') +
        '<div class="admRptMeta">' + o.meta + '</div>' +
        '<div class="admRptActs"></div>';
      if(rep.details) el.querySelector('.admRptDet').textContent = rep.details;
      var acts = el.querySelector('.admRptActs');
      o.acts.forEach(function(a){ acts.appendChild(btn(a[0], a[1])); });
      p.list.appendChild(el);
    });
  }

  function rptWhen(at){ return esc(at ? new Date(at).toLocaleString() : ''); }

  function loadUserReports(){
    var p = rptParts();
    if(!p) return;
    api('reports', {status:'pending'}).then(function(r){
      var rows = (r && r.reports) || [];
      rptCount(rows.length);
      rptFill(p, rows, function(rep){
        return {
          who: '@' + esc(rep.target_username || 'unknown') +
               (rep.target_banned ? ' <span class="admRptBanned">banned</span>' : ''),
          meta: 'by @' + esc(rep.reporter_username || 'someone') +
                ' \\u00b7 ' + rptWhen(rep.created_at),
          acts: [
            ['REVIEW',  function(){ switchTo('mod'); modSearch(rep.target_id, true); }],
            ['RESOLVE', function(){ resolveUser(rep.id, 'resolved'); }],
            ['DISMISS', function(){ resolveUser(rep.id, 'dismissed'); }]
          ]
        };
      });
    }, function(err){ rptEmpty(p, err.message); });
  }

  function resolveUser(id, status){
    api('report-resolve', {id:id, status:status}).then(function(){
      toast(status === 'resolved' ? 'Report resolved' : 'Report dismissed');
      loadReports();
    }, function(e){ toast(e.message || 'Action failed'); });
  }

  function loadItemReports(){
    var p = rptParts();
    if(!p || typeof sb === 'undefined' || !sb) return;
    sb.from('artwork_reports')
      .select('id,artwork_id,reason,details,created_at,reporter_id,artworks(name,image_url,user_id)')
      .eq('status','open').order('created_at',{ascending:false}).limit(100)
      .then(function(r){
        if(r.error){ rptEmpty(p, 'Could not load reports.'); return; }
        rptFill(p, r.data || [], function(rep){
          return {
            who: esc((rep.artworks || {}).name || '(untitled artwork)'),
            meta: rptWhen(rep.created_at),
            acts: [
              ['VIEW', function(){
                if(typeof openArtworkById === 'function') openArtworkById(String(rep.artwork_id), false);
              }],
              ['RESOLVE', function(){ resolveItem(rep.id, 'resolved'); }],
              ['DISMISS', function(){ resolveItem(rep.id, 'dismissed'); }]
            ]
          };
        });
      }, function(){ rptEmpty(p, 'Could not load reports.'); });
  }

  function resolveItem(id, status){
    sb.from('artwork_reports').update({status:status}).eq('id', id).then(function(r){
      if(r.error){ toast('Action failed \\u2014 try again'); return; }
      toast(status === 'resolved' ? 'Report resolved' : 'Report dismissed');
      loadReports();
    }, function(){ toast('Action failed \\u2014 try again'); });
  }

  PANELS.mod = {
    html: function(){
      return '<div class="admModLbl">FIND A MEMBER</div>' +
        '<p class="admModNote">Search by username, email address or user ID. ' +
          'It has to be exact \\u2014 this does not list members, it finds one.</p>' +
        '<form class="admModForm" data-m="form">' +
          '<input type="text" data-m="q" class="admModIn" autocomplete="off" ' +
            'spellcheck="false" placeholder="@handle, email, or ID" ' +
            'aria-label="Username, email address or user ID">' +
          '<button type="submit" class="admModGo">Find</button>' +
        '</form>' +
        '<div data-m="result"></div>';
    },
    wire: function(host){
      host.querySelector('[data-m="form"]').addEventListener('submit', function(e){
        e.preventDefault();
        modSearch(host.querySelector('[data-m="q"]').value);
      });
    }
  };

  function modSearch(query, fill){
    var host = panelEl('mod');
    if(!host) return;
    var out = host.querySelector('[data-m="result"]');
    if(fill) host.querySelector('[data-m="q"]').value = query;
    var q = String(query || '').trim();
    if(q.length < 2){ out.innerHTML = '<div class="pfEmpty">Type a little more.</div>'; return; }
    out.innerHTML = '<div class="pfEmpty">Looking\\u2026</div>';

    api('mod-find', {query:q}).then(function(r){
      var u = r && r.user;
      if(!u){ out.innerHTML = '<div class="pfEmpty">No member matches that exactly.</div>'; return; }
      renderMember(out, u);
    }, function(err){
      out.innerHTML = '<div class="pfEmpty">' + esc(err.message) + '</div>';
    });
  }

  function renderMember(out, u){
    out.innerHTML =
      '<div class="admMemb">' +
        '<div class="admMembTop">' +
          '<div>' +
            '<div class="admMembName">@' + esc(u.username || '\\u2014') + '</div>' +
            (u.email ? '<div class="admMembSub">' + esc(u.email) + '</div>' : '') +
          '</div>' +
          '<div class="admMembTags">' +
            (u.role ? '<span class="admTag admTag--' + esc(u.role) + '">' +
                      esc(u.role) + '</span>' : '') +
            '<span class="admTag">' + esc(u.tier || 'guest') + '</span>' +
            (u.banned ? '<span class="admTag admTag--ban">banned</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="admMembId">' + esc(u.id) + '</div>' +
        (u.banned && u.ban_reason
          ? '<div class="admMembBan">Banned for ' + esc(u.ban_reason) +
            (u.ban_expires_at
              ? ' until ' + esc(new Date(u.ban_expires_at).toLocaleDateString())
              : ' \\u2014 no end date') + '</div>'
          : '') +
        '<div class="admMembActs"></div>' +
      '</div>';

    var acts = out.querySelector('.admMembActs');

    if(!u.can_moderate){
      var no = document.createElement('p');
      no.className = 'admMembNo';
      no.textContent = C.staff
        ? 'Staff accounts cannot be banned from here.'
        : 'You can moderate ordinary members. Admins, devs and other partners ' +
          'are outside what this account may do.';
      acts.appendChild(no);
      return;
    }

    if(u.banned){
      acts.appendChild(btn('LIFT BAN', function(){
        api('unban', {userId:u.id}).then(function(){
          toast('Ban lifted');
          modSearch(u.id, true);
          loadReports();
        }, function(e){ toast(e.message || 'Could not lift that ban'); });
      }));
      return;
    }

    var form = document.createElement('div');
    form.className = 'admBanForm';
    form.innerHTML =
      '<input type="text" data-b="why" class="admModIn" maxlength="60" ' +
        'placeholder="Reason (shown in the audit log)" aria-label="Reason for the ban">' +
      '<div class="admBanRow">' +
        '<select data-b="len" class="admBanLen" aria-label="How long">' +
          '<option value="">Permanent</option>' +
          '<option value="1">1 day</option>' +
          '<option value="7">7 days</option>' +
          '<option value="30">30 days</option>' +
          '<option value="90">90 days</option>' +
        '</select>' +
        '<button type="button" data-b="go" class="admBanGo">Ban</button>' +
      '</div>';
    acts.appendChild(form);

    form.querySelector('[data-b="go"]').addEventListener('click', function(){
      var why = String(form.querySelector('[data-b="why"]').value || '').trim();
      if(why.length < 2){ toast('Give a reason'); return; }
      var days = form.querySelector('[data-b="len"]').value;
      api('ban', {userId:u.id, reason:why, days:days ? Number(days) : null})
        .then(function(){
          toast('@' + (u.username || 'member') + ' banned');
          modSearch(u.id, true);
          loadReports();
        }, function(e){ toast(e.message || 'Could not ban that account'); });
    });
  }
`;

const PANEL_TEL = `
  PANELS.tel = {
    html: function(){ return '<div data-tel="host"></div>'; },
    load: function(){
      var host = panelEl('tel');
      if(!host) return;
      host = host.querySelector('[data-tel="host"]');

      api('telemetry', {}).then(function(r){
        var t = r && r.telemetry;
        if(!t){ host.innerHTML = '<div class="pfEmpty">Could not read telemetry.</div>'; return; }
        var c = t.content || {}, day = c.today || {}, s = t.subscriptions || {},
            e = t.engagement || {}, d = t.devices || {}, m = t.moderation || {};

        host.innerHTML =
          group('Live submissions', [
            stat('Artworks', c.artworks, day.artworks),
            stat('Resources', c.resources, day.resources),
            stat('Marketplace', c.marketplace, day.marketplace),
            stat('Blogs', c.blogs, day.blogs),
            stat('Jobs', c.jobs, day.jobs),
            stat('Communities', c.communities, null)
          ]) +
          group('Subscriptions, live', [
            stat('Lite', s.lite), stat('Premium', s.premium), stat('Max', s.max),
            stat('Free', s.free), stat('Partners', s.partners), stat('Members', s.total)
          ]) +
          group('Engagement', [
            stat('DAU', e.dau), stat('MAU', e.mau),
            stat('Signed-in DAU', e.dau_signed_in),
            stat('Events, 24h', e.events_24h),
            stat('New members, 24h', e.new_members_24h)
          ]) +
          group('Devices, 24h', Object.keys(d).sort().map(function(k){
            return stat(k.charAt(0).toUpperCase() + k.slice(1), d[k]);
          })) +
          group('Moderation', [
            stat('Open account reports', m.open_user_reports),
            stat('Open upload reports', m.open_item_reports),
            stat('Active bans', m.active_bans)
          ]) +
          '<p class="admTelAt">Read at ' +
            esc(t.at ? new Date(t.at).toLocaleTimeString() : '') +
            '. Subscription counts are live \\u2014 a lapsed plan is not counted ' +
            'as active. Device and engagement figures cover recorded activity only.</p>';
      }, function(err){
        host.innerHTML = '<div class="pfEmpty">' + esc(err.message) + '</div>';
      });
    }
  };

  function group(title, cells){
    var body = cells.filter(Boolean).join('');
    if(!body) return '';
    return '<section class="admTelGrp"><h3 class="admTelHd">' + esc(title) + '</h3>' +
           '<ul class="admTelGrid">' + body + '</ul></section>';
  }

  function stat(label, n, today){
    return '<li class="admTelCell">' +
      '<span class="admTelN">' + esc(Number(n) || 0) + '</span>' +
      '<span class="admTelL">' + esc(label) + '</span>' +
      (today == null ? '' :
        '<span class="admTelToday">+' + esc(Number(today) || 0) + ' today</span>') +
    '</li>';
  }
`;

const PANEL_PRT = `
  PANELS.prt = {
    html: function(){
      return '<div class="admPrtTop">' +
          '<div class="admPrtLbl">PARTNERS</div>' +
          '<button type="button" class="admPrtAdd" data-prt="add" ' +
            'aria-label="Add a partner">+</button>' +
        '</div>' +
        '<div data-prt="list" class="admPrtList"></div>' +
        '<div class="pfEmpty" data-prt="empty" hidden>' +
          '<span class="admEmptyIcon">\\ud83e\\udd1d</span>' +
          'No partners yet. Use + to invite one.</div>';
    },
    wire: function(host){
      host.querySelector('[data-prt="add"]').addEventListener('click', invite);
    },
    load: function(){
      var host = panelEl('prt');
      if(!host) return;
      var list = host.querySelector('[data-prt="list"]');
      var empty = host.querySelector('[data-prt="empty"]');

      api('partners', {}).then(function(r){
        var rows = (r && r.partners) || [];
        list.innerHTML = '';
        if(!rows.length){ empty.hidden = false; return; }
        empty.hidden = true;

        rows.forEach(function(p){
          var earned = p.earned_json || {};
          var earnedTxt = Object.keys(earned).map(function(c){
            return esc(money(earned[c], c));
          }).join(' \\u00b7 ');

          var row = document.createElement('div');
          row.className = 'admPrt';
          row.innerHTML =
            '<div class="admPrtMain">' +
              '<div class="admPrtName">@' + esc(p.username || '\\u2014') + '</div>' +
              '<div class="admPrtSub">' +
                (p.code
                  ? '<span class="admPrtCode">' + esc(p.code) + '</span>' +
                    (p.code_active ? '' : ' <span class="admPrtOff">inactive</span>') +
                    ' \\u00b7 ' + esc(p.usage_count || 0) + ' uses'
                  : 'No code yet') +
                (p.max_claimed ? ' \\u00b7 Max claimed' : '') +
              '</div>' +
              (earnedTxt ? '<div class="admPrtMoney">' + earnedTxt +
                           ' earned</div>' : '') +
            '</div><div class="admPrtActs"></div>';

          row.querySelector('.admPrtActs').appendChild(btn('REVOKE', function(){
            if(!confirm('Remove partner status from @' + (p.username || 'this member') +
                        '? Their code stops taking new orders. Anything already ' +
                        'earned stays theirs.')) return;
            api('revoke-partner', {userId:p.partner_id}).then(function(){
              toast('Partner removed');
              PANELS.prt.load();
            }, function(e){ toast(e.message || 'Could not remove that partner'); });
          }));
          list.appendChild(row);
        });
      }, function(err){
        list.innerHTML = '';
        empty.hidden = false;
        empty.textContent = err.message;
      });
    }
  };

  function invite(){
    var email = prompt('Email address of the member to make a partner:', '');
    if(email === null) return;
    email = String(email).trim();
    if(!email) return;
    api('add-partner', {email:email}).then(function(r){
      toast(r && r.changed
        ? '@' + (r.username || 'they') + ' is now a partner'
        : 'That member was already a partner');
      PANELS.prt.load();
    }, function(e){ toast(e.message || 'Could not add that partner'); });
  }
`;

const PANEL_LOG = `
  var VERB = {
    ban_user:'banned', unban_user:'lifted the ban on',
    grant_partner:'made a partner', revoke_partner:'removed as a partner',
    create_promo:'created a promo code', claim_max:'claimed Max',
    resolve_report:'resolved a report about'
  };

  PANELS.log = {
    html: function(){
      return '<div class="admModLbl">WHO DID WHAT</div>' +
        '<p class="admModNote">Every privileged action on this platform, newest ' +
          'first. Append-only \\u2014 nothing here can be edited or deleted, by ' +
          'anyone.</p>' +
        '<div data-log="list" class="admLogList"></div>' +
        '<div class="pfEmpty" data-log="empty" hidden>' +
          '<span class="admEmptyIcon">\\ud83d\\udccb</span>Nothing logged yet.</div>';
    },
    load: function(){
      var host = panelEl('log');
      if(!host) return;
      var list = host.querySelector('[data-log="list"]');
      var empty = host.querySelector('[data-log="empty"]');

      api('audit', {limit:100}).then(function(r){
        var rows = (r && r.entries) || [];
        list.innerHTML = '';
        if(!rows.length){ empty.hidden = false; return; }
        empty.hidden = true;

        rows.forEach(function(e){
          var row = document.createElement('div');
          row.className = 'admLog';
          var who  = e.actor_username ? '@' + e.actor_username : 'someone';
          var whom = e.target_username ? '@' + e.target_username : '';
          var why = (e.metadata && e.metadata.reason) ? String(e.metadata.reason) : '';

          row.innerHTML =
            '<div class="admLogMain">' +
              '<span class="admLogWho">' + esc(who) + '</span>' +
              '<span class="admLogRole">' + esc(e.actor_role || 'member') + '</span>' +
              '<span class="admLogAct">' + esc(VERB[e.action] || e.action) + '</span>' +
              (whom ? '<span class="admLogTgt">' + esc(whom) + '</span>' : '') +
            '</div>' +
            (why ? '<div class="admLogWhy"></div>' : '') +
            '<div class="admLogWhen">' +
              esc(e.created_at ? new Date(e.created_at).toLocaleString() : '') +
            '</div>';
          if(why) row.querySelector('.admLogWhy').textContent = '\\u201c' + why + '\\u201d';
          list.appendChild(row);
        });
      }, function(err){
        list.innerHTML = '';
        empty.hidden = false;
        empty.textContent = err.message;
      });
    }
  };
`;

const PANEL_NOTI = `
  PANELS.noti = {
    html: function(){
      return '<div class="admNotiLbl">SEND A NOTIFICATION</div>' +
        '<div class="admNotiCompose">' +
          '<input type="text" data-n="title" class="admNotiInput" placeholder="Title" maxlength="80">' +
          '<textarea data-n="msg" class="admNotiTextarea" placeholder="Message" maxlength="500" rows="3"></textarea>' +
          '<input type="text" data-n="url" class="admNotiInput" placeholder="Where it opens \u2014 optional, e.g. /explore" maxlength="300">' +
          '<input type="text" data-n="to" class="admNotiInput" placeholder="Usernames \u2014 optional, blank sends to everyone" maxlength="400">' +
          '<button class="admNotiSendBtn" data-n="send">Send</button>' +
        '</div>' +
        '<div class="admNotiSentLbl">RECENTLY SENT TO EVERYONE</div>' +
        '<div class="pfEmpty" data-n="empty" hidden>' +
          '<span class="admEmptyIcon">\\ud83d\\udd14</span>No notifications sent yet.</div>' +
        '<div data-n="list" class="admNotiSentList"></div>';
    },
    wire: function(host){
      host.querySelector('[data-n="send"]').addEventListener('click', function(){
        send(host);
      });
    },
    load: function(){
      var host = panelEl('noti');
      if(!host || typeof sb === 'undefined' || !sb) return;
      var wrap = host.querySelector('[data-n="list"]');
      var empty = host.querySelector('[data-n="empty"]');
      sb.from('notifications').select('*').is('user_id', null)
        .order('created_at',{ascending:false}).limit(20)
        .then(function(r){
          if(r.error) return;
          var rows = r.data || [];
          wrap.innerHTML = rows.map(function(x){
            return '<div class="admNotiSentItem">' +
              '<div class="admNotiSentTitle">' + esc(x.title) + '</div>' +
              '<div class="admNotiSentMsg">' + esc(x.message) + '</div>' +
              '<div class="admNotiSentTime">' +
                esc(x.created_at ? new Date(x.created_at).toLocaleString() : '') +
                esc(x.target_url ? ' \u00b7 ' + x.target_url : '') +
              '</div></div>';
          }).join('');
          empty.hidden = !!rows.length;
        }, function(){});
    }
  };

  function send(host){
    var t = host.querySelector('[data-n="title"]');
    var m = host.querySelector('[data-n="msg"]');
    var u = host.querySelector('[data-n="url"]');
    var w = host.querySelector('[data-n="to"]');
    var b = host.querySelector('[data-n="send"]');
    var title = (t.value || '').trim(), message = (m.value || '').trim();
    var to = (w.value || '').trim();
    if(!title || !message){ toast('Enter a title and message'); return; }
    b.disabled = true;
    api('broadcast', {title:title, message:message, url:(u.value || '').trim(), to:to})
      .then(function(r){
        t.value = ''; m.value = ''; u.value = ''; w.value = '';
        toast(to ? ('Sent to ' + ((r && r.sent) || 0) + ' member' + (((r && r.sent) === 1) ? '' : 's'))
                 : 'Notification sent to all users');
        b.disabled = false;
        PANELS.noti.load();
      }, function(e){
        b.disabled = false;
        toast(e.message || 'Could not send that');
      });
  }
`;

const FOOT = `
  function menu(){
    var gate = document.getElementById('setAdmGate');
    if(!gate) return;
    var old = gate.querySelector('#smAdmBtn');
    if(old) old.parentNode.removeChild(old);
    var b = document.createElement('button');
    b.id = 'smAdmBtn';
    b.type = 'button';
    b.className = 'pfMenuItem';
    b.textContent = C.menu;
    b.addEventListener('click', function(){
      if(typeof setGo === 'function') setGo(open, 'admPage');
      else open();
    });
    gate.appendChild(b);
  }

  function reset(){
    close();
    var el = document.getElementById('admPage');
    if(el){ el.innerHTML = ''; }
    var gate = document.getElementById('setAdmGate');
    var b = gate && gate.querySelector('#smAdmBtn');
    if(b) b.parentNode.removeChild(b);
  }

  window.dzOpsClose = close;
  window.dzOpsReset = reset;
  window.dzOpsMenu = menu;
  menu();
})(__dzOps);
`;

async function roleOf(env, request) {
  const res = await sbRpc(env, 'dz_my_collab_state', {}, request);
  return res.ok ? res.body : null;
}

export async function onRequestGet({ env, request }) {
  const deny = (s) =>
    new Response(s === 401 ? '/* sign in required */' : '/* unavailable */', {
      status: s,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store, private, max-age=0',
        'x-robots-tag': 'noindex, nofollow',
      },
    });

  if (!sbUrl(env) || !sbAnon(env)) return deny(503);

  const user = await sbUser(env, request);
  if (!user) return deny(401);

  const state = await roleOf(env, request);
  if (!state) return deny(503);

  const staff = !!state.is_staff;
  const partner = !!state.is_partner;
  if (!staff && !partner) return deny(404);

  const cfg = {
    staff,
    tabs: staff ? TABS_STAFF : TABS_PARTNER,
    title: staff ? 'Admin panel' : 'Moderation',
    menu: staff ? '⚙ ADMIN PANEL' : '🛡 MODERATION',
    css: STYLE_CORE + (staff ? STYLE_STAFF + STYLE_STAFF2 : ''),
  };

  const body =
    'var __dzOps = ' + JSON.stringify(cfg) + ';\n' +
    HEAD +
    (staff ? PANEL_TEL + PANEL_PRT + PANEL_LOG + PANEL_NOTI : '') +
    FOOT;

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
