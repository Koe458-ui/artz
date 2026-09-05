(function () {
  'use strict';

    // The follow graph, held once for the signed-in reader, so a follow in one place repaints every other Follow button.
    // A follower count belongs to the profile row and is read from there.

  var MAX_FOLLOWING = 2000;

  var set = null;          // { artistId: createdAt } once loaded, null before
  var pending = null;      // the in-flight load, so callers share one
  var busy = {};           // artistId -> true while a write is out

  function db ()  { return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function me ()  { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
  function toast (m) { if (typeof showToast === 'function') showToast(m); }
  function cache () { return window.dzCached ? window.dzCached() : null; }
  function key () { var c = cache(); return c ? c.ukey('follows') : null; }

  function emit (id, on) {
    try {
      document.dispatchEvent(new CustomEvent('dz:follow', { detail: { id: String(id), following: !!on } }));
    } catch (e) {}
  }

  async function fetchFollows () {
    var r = await db().from('follows')
      .select('following_id,created_at')
      .eq('follower_id', me().id)
      .order('created_at', { ascending: false })
      .limit(MAX_FOLLOWING);
    if (r.error) throw r.error;
    var map = {};
    (r.data || []).forEach(function (f) { map[f.following_id] = f.created_at || ''; });
    return map;
  }

    // Resolves once the set is known. Repeat calls during a load share it; afterwards a no-op unless force is set.
  function load (force) {
    if (!db() || !me()) { set = {}; return Promise.resolve(set); }
    if (set && !force) return Promise.resolve(set);
    if (pending) return pending;

    var c = cache(), k = key();
    var warm = (c && k) ? c.peek(k, 'user:follows', { any: true }) : null;
    if (warm && !set) set = warm;

    pending = (c && k ? c.getOrSet(k, fetchFollows, 'user:follows') : fetchFollows())
      .then(function (fresh) {
        set = fresh || {};
        pending = null;
        return set;
      }, function () {
        if (!set) set = {};
        pending = null;
        return set;
      });
    return pending;
  }

  function drop () {
    var c = cache(), k = key();
    if (c && k) { try { c['delete'](k, 'user:follows'); } catch (e) {} }
  }

  function isFollowing (id) { return !!(set && id && set[String(id)] !== undefined); }
  function ready () { return !!set; }
  function ids () { return set ? Object.keys(set) : []; }
  function count () { return set ? Object.keys(set).length : 0; }

  function reset () { set = null; pending = null; busy = {}; }

  function atCap () {
    if (count() < MAX_FOLLOWING) return false;
    toast('You follow ' + MAX_FOLLOWING + ' artists — the most allowed. Unfollow one first.');
    return true;
  }

    // Writes the edge and keeps the local set honest. Returns the state it landed on, so an optimistic caller can correct.
  async function setFollowing (id, want) {
    id = String(id || '');
    if (!id || !db()) return isFollowing(id);
    if (!me()) {
      toast('Sign in to follow artists');
      if (typeof openAuthMod === 'function') openAuthMod();
      return false;
    }
    if (String(me().id) === id) return false;
    if (busy[id]) return isFollowing(id);

    await load();
    var was = isFollowing(id);
    if (was === want) return was;
    if (want && atCap()) return false;

    busy[id] = true;
      // paint now, correct below if the write does not land
    if (want) set[id] = new Date().toISOString(); else delete set[id];
    emit(id, want);

    try {
      var r = want
        ? await db().from('follows').insert({ follower_id: me().id, following_id: id })
        : await db().from('follows').delete()
            .eq('follower_id', me().id).eq('following_id', id);
      // a duplicate insert means the edge is already there — the state we wanted
      if (r.error && !(want && r.error.code === '23505')) throw r.error;
      drop();
      if (typeof window.dzAnTrack === 'function') {
        window.dzAnTrack(want ? 'follow' : 'unfollow', null, { scope: 'profile', owner: id });
      }
      return want;
    } catch (e) {
      if (was) set[id] = ''; else delete set[id];
      emit(id, was);
      toast('Couldn’t update follow — try again');
      return was;
    } finally {
      busy[id] = false;
    }
  }

  function fmt (n) {
    n = +n || 0;
    return n.toLocaleString();
  }

  window.dzFollow = {
    load: load,
    ready: ready,
    is: isFollowing,
    ids: ids,
    count: count,
    set: setFollowing,
    fmt: fmt
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (db() && db().auth && db().auth.onAuthStateChange) {
      var lastId = me() ? String(me().id) : 'guest';
      db().auth.onAuthStateChange(function () {
        var nowId = me() ? String(me().id) : 'guest';
        if (nowId === lastId) return;
        lastId = nowId;
        reset();
        setTimeout(function () { load(true); }, 400);
      });
    }
    load();
  });
})();
