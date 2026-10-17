/* Do'kon hisobi — bulutga saqlash (Supabase) + login.
   Ilovaning o'z kodi o'zgarmagan: bu fayl localStorage'ga yozuvlarni kuzatib, serverga yuboradi. */
(function () {
  "use strict";
  var C = window.DOKON_CONFIG || {};
  var BASE = String(C.SUPABASE_URL || "").replace(/\/+$/, ""), KEY = String(C.SUPABASE_ANON_KEY || "");
  if (!/^https:\/\/.+/.test(BASE) || !KEY || /YOUR|XXXX/i.test(BASE + KEY)) return; // sozlanmagan — o'chiq
  var ls;
  try { ls = window.localStorage; ls.getItem("x"); } catch (e) { return; }

  var DK = "dokon-pro-v1", SK = "dokon-sb-session", MK = "dokon-sb-meta";
  var oSet = Storage.prototype.setItem, oDel = Storage.prototype.removeItem;
  function jget(k) { try { return JSON.parse(ls.getItem(k)); } catch (e) { return null; } }
  function jput(k, v) { try { oSet.call(ls, k, JSON.stringify(v)); } catch (e) {} }
  function $(i) { return document.getElementById(i); }
  function ready(fn) { document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn(); }
  function mount(el) { (document.body || document.documentElement).appendChild(el); }

  var sess = jget(SK);
  if (sess && !(sess.at && sess.uid)) sess = null;
  var meta = jget(MK) || { v: null, dirty: false, uid: null, del: false };
  var lastStr = null, pushing = false, again = false, timer = null, remoteNew = false, status = "wait", started = false;
  function saveMeta() { jput(MK, meta); }

  /* ---------- localStorage kuzatuvi ---------- */
  Storage.prototype.setItem = function (k, v) {
    var r = oSet.apply(this, arguments);
    try {
      if (this === ls && k === DK && sess && String(v) !== lastStr) {
        meta.dirty = true; meta.del = false; saveMeta(); setStatus("wait"); sched(2000);
      }
    } catch (e) {}
    return r;
  };
  Storage.prototype.removeItem = function (k) {
    var r = oDel.apply(this, arguments);
    try {
      if (this === ls && k === DK && sess) { meta.dirty = true; meta.del = true; lastStr = null; saveMeta(); setStatus("wait"); sched(2000); }
    } catch (e) {}
    return r;
  };
  function sched(ms) { clearTimeout(timer); timer = setTimeout(function () { push(); }, ms); }

  /* ---------- tarmoq ---------- */
  function req(path, o) {
    o = o || {};
    var h = { apikey: KEY, "Content-Type": "application/json" };
    if (o.headers) for (var k in o.headers) h[k] = o.headers[k];
    h.Authorization = "Bearer " + (o.anon || !sess ? KEY : sess.at);
    var ctl = window.AbortController && !o.keepalive ? new AbortController() : null;
    var tm = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;
    return fetch(BASE + path, { method: o.method || "GET", headers: h, body: o.body, keepalive: !!o.keepalive, signal: ctl ? ctl.signal : undefined })
      .finally(function () { clearTimeout(tm); });
  }
  function setSess(j) {
    var u = j.user || {}, old = sess || {};
    sess = { at: j.access_token, rt: j.refresh_token, exp: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), uid: u.id || old.uid, email: u.email || old.email };
    jput(SK, sess);
  }
  async function refresh() {
    var r = await req("/auth/v1/token?grant_type=refresh_token", { method: "POST", anon: true, body: JSON.stringify({ refresh_token: sess.rt }) });
    if (!r.ok) { if (r.status >= 500) throw new Error("srv"); return false; }
    setSess(await r.json()); return true;
  }
  function expired() {
    sess = null; try { oDel.call(ls, SK); } catch (e) {}
    showLogin("Sessiya tugadi. Qayta kiring."); throw new Error("expired");
  }
  async function api(path, o, retried) {
    o = o || {};
    if (!sess) throw new Error("expired");
    if (!o.anon && sess.exp - 60 < Date.now() / 1000) { if ((await refresh()) === false) return expired(); }
    var r = await req(path, o);
    if (r.status === 401 && !retried) { var ok = await refresh(); if (ok) return api(path, o, true); return expired(); }
    return r;
  }
  async function getRemote() {
    var r = await api("/rest/v1/dokon_data?select=data,version&user_id=eq." + sess.uid);
    if (!r.ok) throw new Error("get " + r.status);
    var a = await r.json(); return a[0] || null;
  }

  /* ---------- sinxronlash ---------- */
  function applyRemote(rem) {
    var s = JSON.stringify(rem.data == null ? {} : rem.data);
    oSet.call(ls, DK, s); lastStr = s;
    meta = { v: rem.version, dirty: false, uid: sess.uid, del: false }; saveMeta(); remoteNew = false;
  }
  async function pushOnce(ka) {
    var str = ls.getItem(DK), data, r;
    if (str == null) { if (!meta.del) { meta.dirty = false; saveMeta(); return "none"; } data = {}; }
    else data = JSON.parse(str);
    if (meta.v == null) {
      r = await api("/rest/v1/dokon_data", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: sess.uid, data: data }), keepalive: ka });
      if (r.status === 409) return "conflict";
    } else {
      r = await api("/rest/v1/dokon_data?user_id=eq." + sess.uid + "&version=eq." + meta.v, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: data }), keepalive: ka });
    }
    if (!r.ok) throw new Error("push " + r.status);
    var a = await r.json(); if (!a.length) return "conflict";
    meta.v = a[0].version; meta.uid = sess.uid; lastStr = str;
    meta.dirty = ls.getItem(DK) !== str; if (!meta.dirty) meta.del = false;
    saveMeta(); remoteNew = false; setStatus(meta.dirty ? "wait" : "ok");
    return "ok";
  }
  async function push(ka) {
    if (!sess) return;
    if (pushing) { again = true; return; }
    pushing = true; var res;
    try { res = await pushOnce(ka); } catch (e) { res = "err"; } finally { pushing = false; }
    if (res === "conflict") return conflict();
    if (res === "err") { setStatus("off"); sched(20000); }
    else if (again || meta.dirty) { again = false; sched(1500); }
  }
  async function conflict() {
    var useSrv = confirm("Diqqat: ma'lumot boshqa qurilmada ham o'zgartirilgan.\n\nOK — serverdagi ma'lumotni olish\nBekor qilish — shu qurilmadagini serverga yozish");
    try {
      var rem = await getRemote();
      if (!rem) { meta.v = null; saveMeta(); await push(); return false; }
      if (useSrv) { applyRemote(rem); location.reload(); return true; }
      meta.v = rem.version; meta.uid = sess.uid; meta.dirty = true; saveMeta(); await push(); return false;
    } catch (e) { setStatus("off"); return false; }
  }
  async function initialSync() {
    var reload = false;
    if (meta.uid && meta.uid !== sess.uid) { // boshqa akkaunt ma'lumoti — tozalaymiz
      oDel.call(ls, DK); meta = { v: null, dirty: false, uid: null, del: false }; saveMeta(); reload = true;
    }
    var rem = await getRemote(), local = ls.getItem(DK), same = meta.uid === sess.uid;
    if (!rem) {
      meta.v = null; meta.uid = sess.uid;
      if (local) { meta.dirty = true; saveMeta(); await push(); } else saveMeta();
      return reload;
    }
    if (!local && !meta.del) { applyRemote(rem); return true; }
    if (same && !meta.dirty) {
      if (meta.v === rem.version) { lastStr = local; return reload; }
      applyRemote(rem); return true;
    }
    if (same && meta.dirty && meta.v === rem.version) { await push(); return reload; }
    return conflict();
  }
  async function check() {
    if (!sess || pushing) return;
    try {
      if (meta.dirty) { await push(); return; }
      var r = await api("/rest/v1/dokon_data?select=version&user_id=eq." + sess.uid);
      if (!r.ok) throw new Error("chk");
      var a = await r.json(), v = a[0] ? a[0].version : null;
      if (v != null && v !== meta.v) { remoteNew = true; setStatus("new"); } else { remoteNew = false; setStatus("ok"); }
    } catch (e) { setStatus("off"); }
  }

  /* ---------- interfeys ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".dsb-ov{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:var(--bg,#111);color:var(--ink,#fff);font:500 15px/1.5 var(--fb,system-ui,sans-serif)}" +
    ".dsb-card{width:min(380px,100%);display:flex;flex-direction:column;gap:12px}" +
    ".dsb-t{font:700 26px/1.1 var(--fd,system-ui);letter-spacing:-.03em}.dsb-s{color:var(--mut,#999);font-size:14px}" +
    ".dsb-card label{display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:13px}" +
    ".dsb-card input{font:500 16px var(--fb,system-ui);padding:13px 14px;border:1.5px solid var(--ln2,#444);border-radius:14px;background:var(--c,#222);color:var(--ink,#fff);outline:0}" +
    ".dsb-card input:focus{border-color:var(--ink,#fff)}.dsb-e{min-height:20px;color:var(--r,#e5483c);font-size:13.5px;font-weight:600}" +
    ".dsb-b1,.dsb-b2{font:800 15px var(--fb,system-ui);padding:14px;border-radius:16px;cursor:pointer;border:1.5px solid var(--sa,#fff)}" +
    ".dsb-b1{background:var(--sa,#fff);color:var(--sai,#111)}.dsb-b2{background:none;color:var(--ink,#fff);border-color:var(--ln2,#444)}" +
    ".dsb-b1:disabled,.dsb-b2:disabled{opacity:.5}" +
    "#dsb-badge{position:fixed;z-index:50;top:calc(env(safe-area-inset-top,0px) + 3px);left:3px;width:26px;height:26px;padding:0;border-radius:50%;border:1px solid var(--ln2,#444);background:var(--c,#222);color:var(--ink,#fff);font-size:13px;line-height:1;cursor:pointer;opacity:.9}" +
    "#dsb-panel{position:fixed;z-index:60;top:calc(env(safe-area-inset-top,0px) + 36px);left:8px;width:min(290px,calc(100vw - 16px));display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;border:1px solid var(--ln2,#444);background:var(--c,#222);color:var(--ink,#fff);font:500 14px/1.45 var(--fb,system-ui);box-shadow:0 20px 40px -12px rgba(0,0,0,.5)}" +
    "#dsb-panel small{color:var(--mut,#999)}";
  document.head.appendChild(css);

  function uz(m) {
    m = String(m || "");
    if (/invalid login/i.test(m)) return "Email yoki parol noto'g'ri.";
    if (/already registered|already been registered/i.test(m)) return "Bu email allaqachon ro'yxatdan o'tgan. «Kirish» tugmasini bosing.";
    if (/at least 6|weak/i.test(m)) return "Parol kamida 6 ta belgidan iborat bo'lsin.";
    if (/not confirmed/i.test(m)) return "Email tasdiqlanmagan. Pochtangizni tekshiring.";
    if (/signups? (not allowed|.*disabled)|disabled/i.test(m)) return "Yangi foydalanuvchi qo'shish o'chirilgan.";
    if (/rate limit/i.test(m)) return "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.";
    if (/failed to fetch|network|abort/i.test(m)) return "Internet yo'q yoki server javob bermayapti.";
    return m || "Xatolik yuz berdi.";
  }
  async function doAuth(kind, f, ov) {
    var e = ov.querySelector(".dsb-e"), bs = ov.querySelectorAll("button");
    e.textContent = ""; bs.forEach(function (b) { b.disabled = true; });
    try {
      var res = await authReq(kind, f.email.value.trim(), f.pw.value);
      if (res === "confirm") { e.textContent = "Emailingizga tasdiqlash xati yuborildi. Tasdiqlab, keyin «Kirish» ni bosing."; }
      else { ov.remove(); start(); return; }
    } catch (x) { e.textContent = uz(x.message); }
    bs.forEach(function (b) { b.disabled = false; });
  }
  async function authReq(kind, email, pw) {
    var r = await req(kind === "up" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password", { method: "POST", anon: true, body: JSON.stringify({ email: email, password: pw }) });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || ("Xato " + r.status));
    if (!j.access_token) return "confirm";
    setSess(j); return "ok";
  }
  function showLogin(msg) {
    hideCover(); var old = $("dsb-login"); if (old) old.remove();
    var o = document.createElement("div"); o.id = "dsb-login"; o.className = "dsb-ov";
    o.innerHTML = '<form class="dsb-card"><div class="dsb-t">Do\u2019kon hisobi</div><div class="dsb-s">Hisobingizga kiring: ma\u2019lumotlar bulutda saqlanadi va barcha qurilmalarda bir xil bo\u2019ladi.</div>' +
      '<label>Email<input name="email" type="email" autocomplete="username" required></label>' +
      '<label>Parol<input name="pw" type="password" autocomplete="current-password" minlength="6" required></label>' +
      '<div class="dsb-e" role="alert"></div><button class="dsb-b1">Kirish</button><button type="button" class="dsb-b2">Ro\u2019yxatdan o\u2019tish</button></form>';
    var f = o.querySelector("form");
    o.querySelector(".dsb-e").textContent = msg || "";
    f.onsubmit = function (ev) { ev.preventDefault(); doAuth("in", f, o); };
    o.querySelector(".dsb-b2").onclick = function () { if (f.reportValidity()) doAuth("up", f, o); };
    mount(o);
  }
  function showCover() {
    if ($("dsb-cover")) return;
    var c = document.createElement("div"); c.id = "dsb-cover"; c.className = "dsb-ov"; c.textContent = "Yuklanmoqda\u2026"; mount(c);
  }
  function hideCover() { var c = $("dsb-cover"); if (c) c.remove(); }

  var ICON = { ok: "\u2601", wait: "\u23F3", off: "\u26A0", "new": "\uD83D\uDD14" };
  var TXT = { ok: "Hammasi bulutga saqlangan.", wait: "Saqlanmoqda\u2026", off: "Aloqa yo\u2019q. Ma\u2019lumot shu qurilmada saqlanadi, aloqa tiklanganda yuboriladi.", "new": "Boshqa qurilmada yangi ma\u2019lumot bor." };
  function setStatus(s) { status = s; var b = $("dsb-badge"); if (b) b.textContent = ICON[s] || ""; var t = $("dsb-st"); if (t) t.textContent = TXT[s] || ""; }
  function mountBadge() {
    if ($("dsb-badge")) return;
    var b = document.createElement("button"); b.id = "dsb-badge"; b.type = "button"; b.setAttribute("aria-label", "Sinxronlash holati");
    b.onclick = togglePanel; mount(b); setStatus(status);
  }
  function togglePanel() {
    var p = $("dsb-panel"); if (p) { p.remove(); return; }
    p = document.createElement("div"); p.id = "dsb-panel";
    p.innerHTML = '<div><b></b><small id="dsb-st"></small></div><button type="button" class="dsb-b1" data-k="sync"></button><button type="button" class="dsb-b2" data-k="out">Chiqish</button><button type="button" class="dsb-b2" data-k="x">Yopish</button>';
    p.querySelector("b").textContent = sess ? sess.email : "";
    p.querySelector("[data-k=sync]").textContent = remoteNew ? "Yangilash (sahifa qayta yuklanadi)" : "Hozir sinxronlash";
    p.onclick = async function (e) {
      var k = e.target.dataset && e.target.dataset.k; if (!k) return;
      if (k === "x") { p.remove(); return; }
      if (k === "out") { p.remove(); logout(); return; }
      if (k === "sync") {
        try {
          if (meta.dirty) { await push(); }
          else if (remoteNew) { var rem = await getRemote(); if (rem) { applyRemote(rem); location.reload(); } }
          else await check();
        } catch (x) { setStatus("off"); }
        p.remove();
      }
    };
    mount(p); setStatus(status);
  }
  async function logout() {
    if (meta.dirty) { try { await push(); } catch (e) {} }
    var msg = meta.dirty ? "DIQQAT: saqlanmagan o\u2019zgarishlar bor (aloqa yo\u2019q)! Chiqsangiz ular yo\u2019qoladi. Baribir chiqasizmi?"
      : "Chiqsangiz, bu qurilmadagi nusxa o\u2019chadi (serverda saqlanib qoladi). Davom etasizmi?";
    if (!confirm(msg)) return;
    try { await req("/auth/v1/logout", { method: "POST" }); } catch (e) {}
    try { oDel.call(ls, DK); oDel.call(ls, SK); oDel.call(ls, MK); } catch (e) {}
    sess = null; location.reload();
  }

  /* ---------- ishga tushirish ---------- */
  async function start() {
    if (!sess) { showLogin(); return; }
    showCover();
    var rl = false;
    try { rl = await initialSync(); setStatus(meta.dirty ? "wait" : "ok"); }
    catch (e) { if (e && e.message === "expired") return; setStatus("off"); lastStr = meta.dirty ? null : ls.getItem(DK); }
    if (rl) { location.reload(); return; }
    hideCover(); ready(mountBadge);
    if (!started) {
      started = true;
      setInterval(check, 30000);
      window.addEventListener("online", check);
      window.addEventListener("pagehide", function () { if (meta.dirty && sess) push(true); });
      document.addEventListener("visibilitychange", function () { if (document.hidden) { if (meta.dirty && sess) push(true); } else check(); });
    }
  }
  start();
})();
