/* Çapraz Manşet data loader (ADR-0002).
   Fetches core.bin and one article pack per month, rebuilds the article objects the app has
   always used (D.A), then runs the app scripts in page order. Ledes stay on the server until
   something asks for them: window.cmLedes() loads every month's lede pack once and returns
   a Map from article id to lede. */
(function () {
  "use strict";
  var BASE = "data/";
  var app = document.getElementById("app");

  function status(title, detail) {
    app.innerHTML = '<section class="wrap page" role="status" style="padding:48px 0"><h1 style="font-size:22px">' +
      title + '</h1><p class="lede" id="cm-load">' + detail + "</p></section>";
  }

  // Packs are gzip JSON. Hosts that serve only text get them base64-encoded (".txt", see
  // pipeline/capraz_pipeline/site.py); a host may also have decoded the gzip already. Check the bytes.
  var SUFFIX = window.CM_PACK_SUFFIX || "";
  function gunzip(bytes) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  function unbase64(text) {
    var bin = atob(text), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function load(name) {
    return fetch(BASE + name + SUFFIX).then(function (r) {
      if (!r.ok) throw new Error(name + " " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var u = new Uint8Array(buf);
      if (u[0] === 0x1f && u[1] === 0x8b) return gunzip(u);
      if (u[0] === 0x48 && u[1] === 0x34 && u[2] === 0x73 && u[3] === 0x49) // "H4sI": base64 of a gzip header
        return gunzip(unbase64(new TextDecoder().decode(u)));
      return new TextDecoder().decode(u);
    }).then(JSON.parse);
  }

  function unpack(p, packs, member) {
    var out = new Array(p.i.length);
    for (var j = 0; j < p.i.length; j++) {
      var a = { i: p.i[j], s: packs.sources[p.s[j]], t: p.t[j], u: "https://" + p.hosts[p.h[j]] + "/" + p.u[j],
        d: p.d[j], c: packs.cats[p.c[j]], k: p.k[j].map(function (x) { return packs.keys[x]; }), v: p.v[j],
        b: packs.bands[p.b[j]], p: p.p[j], e: p.e[j] || [] };
      if (p.lv[j] != null) a.lv = p.lv[j];
      if (member[a.i]) a.st = member[a.i];
      out[j] = a;
    }
    return out;
  }

  function start(core) {
    [].forEach.call(document.querySelectorAll('script[type="text/x-cm"]'), function (tpl) {
      var s = document.createElement("script");
      s.text = tpl.textContent; // inline scripts run synchronously and at global scope, as before
      document.body.appendChild(s);
    });
  }

  var ledes = null;
  window.cmLedes = function () {
    if (!ledes) ledes = Promise.all(window.DATA.meta.packs.months.map(function (m) { return load("l-" + m + ".bin"); }))
      .then(function (ps) {
        var map = new Map();
        ps.forEach(function (p) { for (var j = 0; j < p.i.length; j++) map.set(p.i[j], p.l[j]); });
        return map;
      });
    return ledes;
  };

  status("Veri yükleniyor", "Olaylar ve kurumlar hazırlanıyor…");
  window.CM_LOGO = JSON.parse(document.getElementById("cm-logo").textContent);
  load("core.bin").then(function (core) {
    var months = core.meta.packs.months, done = 0, member = {};
    core.E.forEach(function (e) { e.a.forEach(function (i) { member[i] = e.i; }); });
    status("Veri yükleniyor", "Başlıklar yükleniyor: 0 / " + months.length + " ay");
    return Promise.all(months.map(function (m) {
      return load("a-" + m + ".bin").then(function (p) {
        var el = document.getElementById("cm-load");
        if (el) el.textContent = "Başlıklar yükleniyor: " + (++done) + " / " + months.length + " ay";
        return unpack(p, core.meta.packs, member);
      });
    })).then(function (parts) {
      core.A = [].concat.apply([], parts);
      window.DATA = core;
      start(core);
    });
  }).catch(function (err) {
    console.error("Çapraz Manşet data load failed", err);
    status("Veri yüklenemedi", "Veri dosyalarına şu anda erişilemiyor. Sayfayı yenileyerek yeniden deneyin.");
  });
})();
