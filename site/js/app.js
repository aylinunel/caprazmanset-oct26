/* =====================================================================
   Yanlılık Haritası — front end
   Single file, no framework. Data arrives as window.DATA (see scripts/bundle.mjs).
   ===================================================================== */
(function () {
"use strict";
var D = window.DATA;
var $ = function (s, r) { return (r || document).querySelector(s); };
var el = function (t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
var pct = function (n, d) { return d ? Math.round(100 * n / d) : 0; };

/* ---------------------------------------------------------------- index */
var SRC = {}; D.S.forEach(function (s) { SRC[s.s] = s; });
var ART = {}; D.A.forEach(function (a) { ART[a.i] = a; });
var BIA = {}; D.B.forEach(function (b) { BIA[b.k] = b; });
var FRM = {}; D.F.forEach(function (f) { FRM[f.k] = f; });
var REG = D.R.map(function (r) { return { s: r[0], n: r[1], u: r[2], v: r[3], lab: r[4] }; });

var POL = D.A.filter(function (a) { return a.p; });
/* Political headlines grouped by outlet once: per-outlet filters over 139k headlines inside
   per-outlet loops were the slowest part of Bulgular. */
var POLBY = {}; POL.forEach(function (a) { (POLBY[a.s] = POLBY[a.s] || []).push(a); });
function polOf(s) { return POLBY[s] || []; }
var DAYS = Object.keys(D.meta.perDay).sort();
var WIN = (function () {
  var M = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var f = function (d) { return +d.slice(8, 10) + " " + M[+d.slice(5, 7) - 1]; }, a = DAYS[0], b = DAYS[DAYS.length - 1];
  var v3 = D.meta.v3, st = v3 && v3.storedEnd;
  return { range: f(a) + " – " + f(b) + " " + b.slice(0, 4), days: DAYS.length, half: Math.ceil(DAYS.length / 2),
    stored: st ? " (" + f(a) + " – " + f(st) + " verisi)" : "" };
})();
var STAT = {};
D.A.forEach(function (a) {
  var s = STAT[a.s] || (STAT[a.s] = { n: 0, pol: 0, sum: 0, days: {}, keys: {}, hi: null });
  s.n++; s.days[a.d.slice(0, 10)] = (s.days[a.d.slice(0, 10)] || 0) + 1;
  if (a.p) { s.pol++; s.sum += a.v; }
  a.k.forEach(function (k) { s.keys[k] = (s.keys[k] || 0) + 1; });
  if (!s.hi || a.v > s.hi.v) s.hi = a;
});
Object.keys(STAT).forEach(function (k) { var s = STAT[k]; s.mean = s.pol ? s.sum / s.pol : null; });
var LIVE = Object.keys(STAT).sort();

/* BANDS, bandOf and the headline rules: shared/analysis/rules.cjs, inlined here at build time
   (one scorer for the analyser and the pipeline, ADR-0002). */
/*@@RULES@@*/
var SECT = { gundem: "Gündem", dunya: "Dünya", ekonomi: "Ekonomi", siyaset: "Siyaset", yorum: "Yorum",
  egitim: "Eğitim", teknoloji: "Teknoloji", saglik: "Sağlık", kultur: "Kültür", medya: "Medya",
  cevre: "Çevre", spor: "Spor", magazin: "Magazin", yasam: "Yaşam", ilan: "İlan", diger: "Diğer" };

/* Cluster labels are the shared tokens, which arrive lowercased by the matcher.
   Presented raw they read as debug output, so they are re-cased for display —
   Turkish-aware, because "iran" must become "İran" and not "Iran". */
function tcase(w) { return w.charAt(0).toLocaleUpperCase("tr") + w.slice(1); }
function evTitle(e, n) { return e.c.slice(0, n || 4).map(tcase).join(" "); }
function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

var MON = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
var fmtD = function (iso) { var d = new Date(iso + ":00Z"); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
var fmtDT = function (iso) { var d = new Date(iso + ":00Z");
  return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };

/* ================================================================ ACID ==
   React Bits <AcidSquares/> ported to raw WebGL2.
   The fragment shader is the component's own GLSL, unchanged. The React
   wrapper and its `ogl` dependency are replaced by ~50 lines of plain WebGL,
   which is what the wrapper was doing anyway: one full-screen triangle and a
   uniform update per frame. That keeps the visual identical while letting the
   page stay a single file with no runtime dependency.

   The three colours are not arbitrary. They are this project's own spectrum
   encoding — rose for the left pole, blue for the right, black for the ground —
   so the field reads as the political spectrum itself rather than decoration.  */
var VERT = "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
var FRAG = ["#version 300 es","precision highp float;",
"uniform vec2 iResolution;uniform float iTime;uniform float uSpeed;uniform float uWaveDepth;",
"uniform float uZoom;uniform float uDensity;uniform float uSpread;uniform float uStepSize;",
"uniform float uGlow;uniform float uExposure;uniform float uColorShift;uniform float uContrast;",
"uniform float uBrightness;uniform float uOpacity;uniform float uSteps;",
"uniform vec3 uColor1;uniform vec3 uColor2;uniform vec3 uColor3;",
"uniform vec2 uMouse;uniform float uMouseStrength;uniform float uMouseRadius;",
"uniform float uEnableMouse;uniform float uMouseActive;uniform float uGrain;",
"uniform float uGrainIntensity;uniform float uLightMode;","out vec4 fragColor;",
"void main(){",
"vec2 frag=gl_FragCoord.xy;float zoom=max(uZoom,0.05);float aspect=iResolution.x/iResolution.y;",
"vec2 ndc=(2.0*frag-iResolution.xy)/iResolution.y;vec2 dir=ndc*(0.5/zoom);",
"vec2 mouseNdc=vec2(uMouse.x*aspect,uMouse.y);float mr=max(uMouseRadius,0.01);",
"vec2 md=ndc-mouseNdc;float dent=exp(-dot(md,md)/(mr*mr))*(3.0*uMouseStrength*uEnableMouse*uMouseActive);",
"float travel=sin(iTime*uSpeed)*uWaveDepth;float density=max(uDensity,1.0);",
"float spread=clamp(uSpread,0.05,0.6);float stepSize=max(uStepSize,0.0005);",
"float glowGain=max(uGlow,0.0);",
"vec3 tOffset=vec3(0.0,dent,travel);vec3 p=vec3(0.0);float s=0.0;float glow=0.0;",
"for(int i=0;i<64;i++){if(float(i)>=uSteps)break;p+=vec3(dir*s,s);vec3 q=p+tOffset;",
"s+=density-length(q.xz)+length(ceil(q).xy);s=stepSize+abs(s)*spread;glow+=glowGain/s;}",
"float e=glow/max(uExposure,1.0);",
"float shimmer=0.5+0.5*dot(cos(iTime*uColorShift+p),vec3(0.3333));",
"float v=tanh(e*uBrightness*mix(0.7,1.05,shimmer));",
"v=clamp((v-0.5)*uContrast+0.5,0.0,1.0);",
"vec3 col=mix(uColor1,uColor2,smoothstep(0.0,0.55,v));",
"col=mix(col,uColor3,smoothstep(0.55,1.0,v));col*=v;",
"float a=clamp(v,0.0,1.0)*uOpacity;vec3 outRgb=col*a;",
"if(uGrain>0.5){float gv=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+iTime)*43758.5453)-0.5)*uGrainIntensity;",
"outRgb=clamp(outRgb+gv,0.0,1.0);a=clamp(a+gv,0.0,1.0);}",
"if(uLightMode>0.5){float peak=max(col.r,max(col.g,col.b));",
"vec3 chroma=pow(clamp(col/max(peak,0.0001),0.0,1.0),vec3(1.16));",
"fragColor=vec4(mix(vec3(1.0),chroma,a*0.94),1.0);}else{fragColor=vec4(outRgb,a);}}"].join("\n");

var CFG = { color1: [0, 0, 0], color2: [0.957, 0.247, 0.369], color3: [0.231, 0.510, 0.965],
  steps: 34, speed: 0.7, waveDepth: 1, zoom: 1.3, density: 10, glow: 1, exposure: 2700,
  spread: 0.3, stepSize: 0.002, colorShift: 0, contrast: 1, brightness: 1, opacity: 1,
  mouseStrength: 0.1, mouseRadius: 0.35, grain: 1, grainIntensity: 0.05 };

var acid = null;
function startAcid(cv) {
  if (acid) { acid.stop(); acid = null; }
  var gl = cv.getContext("webgl2", { antialias: false, alpha: true, powerPreference: "low-power" });
  if (!gl) { cv.style.background = "linear-gradient(140deg,#000,#3B0A1C 45%,#0A1B3D)"; return; }
  function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
  var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { cv.style.background = "linear-gradient(140deg,#000,#3B0A1C 45%,#0A1B3D)"; return; }
  var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  gl.useProgram(pr);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {}; ["iResolution","iTime","uSpeed","uWaveDepth","uZoom","uDensity","uSpread","uStepSize",
    "uGlow","uExposure","uColorShift","uContrast","uBrightness","uOpacity","uSteps","uColor1",
    "uColor2","uColor3","uMouse","uMouseStrength","uMouseRadius","uEnableMouse","uMouseActive",
    "uGrain","uGrainIntensity","uLightMode"].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });

  var mouse = [0, 0], mActive = 0, raf = 0, t0 = performance.now(), alive = true;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;

  function size() {
    var dpr = Math.min(devicePixelRatio || 1, 1.6);
    var w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
  }
  function draw(now) {
    if (!alive) return;
    size();
    var t = reduce ? 2.4 : (now - t0) / 1000;
    gl.uniform2f(U.iResolution, cv.width, cv.height);
    gl.uniform1f(U.iTime, t);
    gl.uniform1f(U.uSpeed, CFG.speed); gl.uniform1f(U.uWaveDepth, CFG.waveDepth);
    gl.uniform1f(U.uZoom, CFG.zoom); gl.uniform1f(U.uDensity, CFG.density);
    gl.uniform1f(U.uSpread, CFG.spread); gl.uniform1f(U.uStepSize, CFG.stepSize);
    gl.uniform1f(U.uGlow, CFG.glow); gl.uniform1f(U.uExposure, CFG.exposure);
    gl.uniform1f(U.uColorShift, CFG.colorShift); gl.uniform1f(U.uContrast, CFG.contrast);
    gl.uniform1f(U.uBrightness, CFG.brightness); gl.uniform1f(U.uOpacity, CFG.opacity);
    gl.uniform1f(U.uSteps, CFG.steps);
    gl.uniform3fv(U.uColor1, CFG.color1); gl.uniform3fv(U.uColor2, CFG.color2);
    gl.uniform3fv(U.uColor3, CFG.color3);
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    gl.uniform1f(U.uMouseStrength, CFG.mouseStrength); gl.uniform1f(U.uMouseRadius, CFG.mouseRadius);
    gl.uniform1f(U.uEnableMouse, reduce ? 0 : 1); gl.uniform1f(U.uMouseActive, mActive);
    gl.uniform1f(U.uGrain, CFG.grain); gl.uniform1f(U.uGrainIntensity, CFG.grainIntensity);
    gl.uniform1f(U.uLightMode, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduce) raf = requestAnimationFrame(draw);
  }
  function onMove(e) {
    var r = cv.getBoundingClientRect();
    mouse[0] = ((e.clientX - r.left) / r.width * 2 - 1) * (r.width / r.height);
    mouse[1] = -((e.clientY - r.top) / r.height * 2 - 1); mActive = 1;
  }
  function onLeave() { mActive = 0; }
  cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerleave", onLeave);

  /* Stop drawing when the masthead scrolls away — a full-screen raymarch has no
     business burning a laptop battery behind an article the reader is reading. */
  var io = new IntersectionObserver(function (es) {
    var vis = es[0].isIntersecting;
    if (vis && !raf && !reduce) { t0 = performance.now() - 2400; raf = requestAnimationFrame(draw); }
    if (!vis && raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: 0 });
  io.observe(cv);
  raf = requestAnimationFrame(draw);
  acid = { stop: function () { alive = false; if (raf) cancelAnimationFrame(raf); io.disconnect();
    cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave); } };
}

/* ============================================================== tooltip */
var TIP = null;
function tipOn(e, html) {
  TIP = TIP || $("#tip"); TIP.innerHTML = html; TIP.classList.add("on");
  var w = TIP.offsetWidth, h = TIP.offsetHeight;
  var x = Math.min(Math.max(8, e.clientX + 14), innerWidth - w - 8);
  var y = e.clientY - h - 12; if (y < 8) y = e.clientY + 18;
  TIP.style.left = x + "px"; TIP.style.top = y + "px";
}
function tipOff() { if (TIP) TIP.classList.remove("on"); }
function bindTip(node, html) {
  node.addEventListener("pointerenter", function (e) { tipOn(e, html); });
  node.addEventListener("pointermove", function (e) { tipOn(e, html); });
  node.addEventListener("pointerleave", tipOff);
}

/* =============================================================== charts */
var NS = "http://www.w3.org/2000/svg";
function svg(w, h) { var s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 " + w + " " + h); s.setAttribute("width", "100%");
  s.setAttribute("role", "img"); return s; }
function mk(n, at) { var e = document.createElementNS(NS, n);
  for (var k in at) e.setAttribute(k, at[k]); return e; }

/* Sequential ramp for intensity: one hue, light to dark, four steps. */
function seq(v) { return v >= 65 ? "var(--seq4)" : v >= 45 ? "var(--seq3)" : v >= 25 ? "var(--seq2)" : "var(--seq1)"; }
/* Diverging scale for placement: two poles, neutral midpoint. */
function lean(v) { return v == null ? "var(--mid)" : v < 45 ? "var(--left)" : v > 55 ? "var(--right)" : "var(--mid)"; }

/* ===================================================== figure primitives ==
   Adapted from the diagram-design grammar. Four rules carry most of the look:
   every coordinate sits on a 4px grid; mono/tracked/uppercase for axis and tag
   text, sans for names, italic serif for editorial asides; the accent colour
   marks one or two focal marks and nothing else; and overlapping marks get a
   paper-coloured underlay so no mark is ever read through another. */
var G4 = function (n) { return Math.round(n / 4) * 4; };

/* Text roles. `eb` = the tracked mono tag used for axis and scale labels,
   `nm` = a human-readable name, `val` = a number, `note` = an aside. */
function tx(s, x, y, str, o) {
  o = o || {};
  var role = o.role || "nm";
  var at = { x: x, y: y, fill: o.fill || (role === "val" ? "var(--ink2)" : role === "eb" ? "var(--muted)" : "var(--ink2)"),
    "font-size": o.size || (role === "eb" ? 10 : role === "val" ? 11 : 11.5),
    "text-anchor": o.anchor || "start" };
  if (role === "eb" || role === "val") { at["font-family"] = "var(--ff-m)"; }
  if (role === "eb") { at["letter-spacing"] = ".14em"; }
  if (role === "note") { at["font-family"] = "var(--ff-d)"; at["font-style"] = "italic"; }
  if (o.weight) at["font-weight"] = o.weight;
  if (o.opacity != null) at.opacity = o.opacity;
  if (o.rotate) at.transform = "rotate(" + o.rotate + " " + x + " " + y + ")";
  /* A halo of the surface colour keeps a label readable where it crosses a
     rule or another mark — the alternative is text sitting under a line. */
  if (o.halo) { at.stroke = "var(--surface)"; at["stroke-width"] = o.halo; at["paint-order"] = "stroke fill"; }
  var e = mk("text", at);
  e.textContent = role === "eb" && o.keepCase !== 1 ? String(str).toLocaleUpperCase("tr") : str;
  s.appendChild(e);
  return e;
}

/** A data point: paper underlay, translucent fill, full-strength stroke. */
function dotMark(s, x, y, r, color, o) {
  o = o || {};
  var g = mk("g", {});
  g.appendChild(mk("circle", { cx: x, cy: y, r: r, fill: "var(--surface)" }));
  g.appendChild(mk("circle", { cx: x, cy: y, r: r, fill: color,
    "fill-opacity": o.opacity == null ? .22 : o.opacity,
    stroke: color, "stroke-width": o.focal ? 1.2 : 1 }));
  s.appendChild(g);
  return g;
}

/** Hairline rule — the recessive furniture every plot is built on. */
function rule(s, x1, x2, y, strong) {
  s.appendChild(mk("line", { x1: x1, x2: x2, y1: y, y2: y,
    stroke: strong ? "var(--line2)" : "var(--line)", "stroke-width": strong ? 1 : .8 }));
}
function vrule(s, x, y1, y2, strong) {
  s.appendChild(mk("line", { x1: x, x2: x, y1: y1, y2: y2,
    stroke: strong ? "var(--line2)" : "var(--line)", "stroke-width": strong ? 1 : .8 }));
}

/** Editorial callout: italic serif text, dashed Bézier leader, landing dot.
    Reserved for the one or two things a reader should look at first — more
    than two and it stops being signal and becomes commentary. */


/** Legend strip, in HTML below the figure — never floating in the plot. */
function legendHTML(items, label) {
  return '<div class="fig-legend"><span class="lb">' + (label || "Açıklama") + "</span>" +
    items.map(function (it) {
      var m = it.line ? '<em class="ln" style="background:' + it.c + '"></em>' :
        it.dash ? '<em class="dash"></em>' :
        '<em style="background:' + (it.c || "var(--muted)") + (it.ring ? ";box-shadow:inset 0 0 0 1px " + it.ring : "") + '"></em>';
      return '<span class="k">' + m + esc(it.t) + "</span>";
    }).join("") + "</div>";
}

/** Sequential scale key. The ramp's two lightest steps sit under 3:1 against
    paper, so the key states the numbers rather than relying on the swatches. */
function scaleHTML(lo, hi, label) {
  return '<span class="fig-scale">' + esc(label || "yoğunluk") + " " + lo +
    '<i><b style="background:var(--seq1)"></b><b style="background:var(--seq2)"></b>' +
    '<b style="background:var(--seq3)"></b><b style="background:var(--seq4)"></b></i>' + hi + "</span>";
}

/** Figure wrapper: eyebrow, body, optional takeaway and legend. */
function fig(id, eyebrow, o) {
  o = o || {};
  return '<figure class="fig">' +
    '<div class="fig-eb"><span>' + esc(eyebrow) + "</span>" +
    (o.right ? '<span class="rt">' + o.right + "</span>" : "") + "</div>" +
    '<div class="fig-body" id="' + id + '"></div>' +
    (o.legend || "") +
    (o.take ? '<div class="fig-take">' + o.take + "</div>" : "") +
    "</figure>";
}

/** Horizontal bar chart. rows:[{label,value,color?,display?,focal?,tip?}]
    opt.ref sets a reference value: bars then read as distance from a baseline
    (above/below the corpus average) rather than as bare magnitudes, which is
    the difference between "this outlet triggers 40 times" and "this outlet
    triggers twice as often as everyone else". */
function barChart(rows, opt) {
  opt = opt || {};
  var rh = opt.rh || 20, gap = 8, padL = G4(opt.padL || 108), padT = 16, padB = 28;
  /* The value sits outside the bar's end, so the right gutter has to fit the
     longest label — otherwise the biggest bar, which is the one people read
     first, is the one whose number gets clipped. */
  var longest = rows.reduce(function (n, r) {
    return Math.max(n, String(r.display != null ? r.display : r.value).length); }, 0);
  var padR = G4(Math.max(48, longest * 6.6 + 16));
  var w = 720, h = G4(padT + rows.length * (rh + gap) + padB);
  var max = opt.max || Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
  var s = svg(w, h); var iw = w - padL - padR;
  var X = function (v) { return padL + iw * (v / max); };
  [0, .25, .5, .75, 1].forEach(function (f) {
    var x = G4(padL + iw * f);
    vrule(s, x, padT - 4, h - padB);
    /* A ratio axis maxing at 5.6 rounds to 0,1,3,4,6 and reads as a broken
       scale. Keep a decimal while the range is small. */
    tx(s, x, h - padB + 16, max < 10 ? +(max * f).toFixed(1) : Math.round(max * f),
      { role: "val", anchor: "middle", size: 10, fill: "var(--muted)" });
  });
  if (opt.axis) tx(s, padL, h - padB + 30, opt.axis, { role: "eb", size: 9.5, fill: "var(--muted)" });
  rows.forEach(function (r, i) {
    var y = G4(padT + i * (rh + gap));
    var maxCh = Math.floor((padL - 16) / 6.1);
    var lb = tx(s, padL - 10, y + rh / 2 + 4, clip(r.label, maxCh),
      { anchor: "end", weight: r.focal ? 600 : 400, fill: r.focal ? "var(--ink)" : "var(--ink2)" });
    if (r.label.length > maxCh) { var ti = mk("title", {}); ti.textContent = r.label; lb.appendChild(ti); }
    var bw = Math.max(2, iw * (r.value / max));
    var g = mk("g", {});
    g.appendChild(mk("rect", { x: padL, y: y, width: bw, height: rh, rx: 4,
      fill: r.color || (r.focal ? "var(--hot)" : "var(--seq3)") }));
    tx(g, padL + bw + 8, y + rh / 2 + 4, r.display != null ? r.display : r.value,
      { role: "val", fill: r.focal ? "var(--ink)" : "var(--ink2)", weight: r.focal ? 600 : 400 });
    if (r.tip) bindTip(g, r.tip);
    s.appendChild(g);
  });
  /* Reference line last, so it reads on top of every bar it cuts through. */
  if (opt.ref != null && opt.ref <= max) {
    var rx = X(opt.ref);
    s.appendChild(mk("line", { x1: rx, x2: rx, y1: padT - 8, y2: h - padB,
      stroke: "var(--ink)", "stroke-width": 1, "stroke-dasharray": "4,3", "stroke-opacity": .55 }));
    tx(s, rx, padT - 12, opt.refLabel || "ortalama", { role: "eb", size: 9,
      anchor: "middle", fill: "var(--ink2)", halo: 3 });
  }
  return s;
}

/* ============================================================= dumbbell ==
   Two values per row joined by a line. Used where the DISTANCE between the two
   numbers is the finding, not either number on its own: an outlet's trust
   among its own readers against everyone else's (the span is polarisation),
   or an outlet's calmest topic against its loudest (the span is how much its
   register moves). Two separate bar charts hide exactly this — the reader has
   to hold one chart in memory while scanning the other. */
function dumbbellChart(rows, opt) {
  opt = opt || {};
  var rh = 24, padL = G4(opt.padL || 128), padR = G4(opt.padR || 96), padT = 32, padB = 32;
  var w = 720, h = G4(padT + rows.length * rh + padB);
  var lo = opt.min != null ? opt.min : 0;
  var hi = opt.max != null ? opt.max : 10;
  var s = svg(w, h), iw = w - padL - padR;
  var X = function (v) { return padL + iw * ((v - lo) / (hi - lo)); };

  (opt.ticks || [lo, (lo + hi) / 2, hi]).forEach(function (v) {
    var x = G4(X(v));
    vrule(s, x, padT - 12, h - padB + 4);
    tx(s, x, h - padB + 20, v, { role: "val", anchor: "middle", size: 10, fill: "var(--muted)" });
  });
  if (opt.axis) tx(s, padL, 14, opt.axis, { role: "eb", size: 9.5 });

  rows.forEach(function (r, i) {
    var y = G4(padT + i * rh) + rh / 2;
    var xa = X(r.a.v), xb = X(r.b.v);
    var g = mk("g", { style: r.href ? "cursor:pointer" : "" });
    tx(g, padL - 12, y + 4, clip(r.label, Math.floor((padL - 20) / 6.1)),
      { anchor: "end", weight: r.focal ? 600 : 400,
        fill: r.focal ? "var(--ink)" : "var(--ink2)" });
    /* The connector is the measurement: it carries the accent when the span is
       the one the surrounding text is talking about. */
    g.appendChild(mk("line", { x1: xa, x2: xb, y1: y, y2: y,
      stroke: r.focal ? "var(--hot)" : "var(--line2)",
      "stroke-width": r.focal ? 2.5 : 2, "stroke-linecap": "round" }));
    dotMark(g, xa, y, 5, r.a.c || "var(--muted)", { opacity: .3 });
    dotMark(g, xb, y, 5, r.b.c || "var(--ink)", { opacity: .3, focal: r.focal });
    /* The span, printed. A reader should not have to measure pixels to get the
       number the row exists to report. */
    tx(g, w - padR + 12, y + 4, r.gapLabel != null ? r.gapLabel :
      (r.b.v - r.a.v > 0 ? "+" : "") + (r.b.v - r.a.v).toFixed(1),
      { role: "val", fill: r.focal ? "var(--hot)" : "var(--ink2)", weight: r.focal ? 600 : 400 });
    if (r.tip) bindTip(g, r.tip);
    if (r.href) g.addEventListener("click", function () { go(r.href); });
    s.appendChild(g);
  });
  return s;
}

/** Diverging bar: values read as distance from a centre, in two directions.
    A zero-anchored bar chart cannot show "below average" at all — everything
    grows the same way and the sign disappears into the label. */
function divergingBar(rows, opt) {
  opt = opt || {};
  var rh = 20, gap = 8, padL = G4(opt.padL || 128), padR = G4(opt.padR || 72), padT = 32, padB = 32;
  var w = 720, h = G4(padT + rows.length * (rh + gap) + padB);
  var lim = opt.max || Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) * 1.1;
  var s = svg(w, h), iw = w - padL - padR, cx = padL + iw / 2;
  var X = function (v) { return cx + (iw / 2) * (v / lim); };

  [-lim, -lim / 2, 0, lim / 2, lim].forEach(function (v) {
    var x = G4(X(v));
    vrule(s, x, padT - 10, h - padB + 4, v === 0);
    tx(s, x, h - padB + 18, (v > 0 ? "+" : "") + v.toFixed(1),
      { role: "val", anchor: "middle", size: 10, fill: "var(--muted)" });
  });
  if (opt.leftLabel) tx(s, padL, 14, opt.leftLabel, { role: "eb", size: 9.5 });
  if (opt.rightLabel) tx(s, w - padR, 14, opt.rightLabel, { role: "eb", size: 9.5, anchor: "end" });

  rows.forEach(function (r, i) {
    var y = G4(padT + i * (rh + gap));
    var g = mk("g", { style: r.href ? "cursor:pointer" : "" });
    tx(g, padL - 12, y + rh / 2 + 4, clip(r.label, Math.floor((padL - 20) / 6.1)),
      { anchor: "end", weight: r.focal ? 600 : 400,
        fill: r.focal ? "var(--ink)" : "var(--ink2)" });
    var x0 = Math.min(cx, X(r.value)), bw = Math.max(2, Math.abs(X(r.value) - cx));
    g.appendChild(mk("rect", { x: x0, y: y, width: bw, height: rh, rx: 4,
      fill: r.color || (r.value >= 0 ? "var(--hot)" : "var(--mid)"),
      "fill-opacity": r.focal ? 1 : .82 }));
    tx(g, r.value >= 0 ? X(r.value) + 8 : X(r.value) - 8, y + rh / 2 + 4,
      (r.value > 0 ? "+" : "") + r.value.toFixed(1),
      { role: "val", anchor: r.value >= 0 ? "start" : "end",
        fill: r.focal ? "var(--ink)" : "var(--ink2)", weight: r.focal ? 600 : 400 });
    if (r.tip) bindTip(g, r.tip);
    if (r.href) g.addEventListener("click", function () { go(r.href); });
    s.appendChild(g);
  });
  return s;
}

/** Outlet placement strip: diverging 0-100 with每 outlet marked. */


/** Coverage matrix: outlet × day, sequential fill. */
function matrixChart(srcs) {
  var cw = 44, ch = 19, padL = 112, padT = 30;
  var w = padL + DAYS.length * cw + 20, h = padT + srcs.length * ch + 14;
  var s = svg(w, h);
  var max = 0; srcs.forEach(function (k) { DAYS.forEach(function (d) { max = Math.max(max, STAT[k].days[d] || 0); }); });
  DAYS.forEach(function (d, j) {
    var t = mk("text", { x: padL + j * cw + cw / 2, y: padT - 10, "text-anchor": "middle",
      fill: "var(--muted)", "font-size": 10, "font-family": "var(--ff-m)" });
    t.textContent = d.slice(8); s.appendChild(t);
  });
  srcs.forEach(function (k, i) {
    var y = padT + i * ch;
    var lb = mk("text", { x: padL - 9, y: y + ch / 2 + 3.5, "text-anchor": "end", fill: "var(--ink2)", "font-size": 11 });
    lb.textContent = (SRC[k] ? SRC[k].n : k); s.appendChild(lb);
    DAYS.forEach(function (d, j) {
      var n = STAT[k].days[d] || 0;
      var g = mk("rect", { x: padL + j * cw + 1, y: y + 1, width: cw - 3, height: ch - 3, rx: 2,
        fill: n === 0 ? "var(--sunk)" : seq(Math.min(100, 18 + 82 * (n / max))),
        stroke: "var(--line)", "stroke-width": .8 });
      bindTip(g, "<span class='k'>" + esc(SRC[k] ? SRC[k].n : k) + " · " + fmtD(d + "T00:00") + "</span>" +
        (n === 0 ? "Bu gün için akışta kayıt yok" : n + " haber"));
      s.appendChild(g);
    });
  });
  return s;
}

/** Event spread: one row per event, min→max intensity range. */
function spreadChart(evs) {
  var padL = 172, padR = 42, padT = 26, rh = 19;
  var w = 700, h = padT + evs.length * rh + 26; var iw = w - padL - padR;
  var s = svg(w, h);
  [0, 25, 50, 75, 100].forEach(function (v) {
    var x = padL + iw * v / 100;
    s.appendChild(mk("line", { x1: x, x2: x, y1: padT - 6, y2: h - 22, stroke: "var(--line)", "stroke-width": 1 }));
    var t = mk("text", { x: x, y: h - 8, "text-anchor": "middle", fill: "var(--muted)",
      "font-size": 10, "font-family": "var(--ff-m)" }); t.textContent = v; s.appendChild(t);
  });
  evs.forEach(function (e, i) {
    var arts = e.a.map(function (id) { return ART[id]; });
    var vs = arts.map(function (a) { return a.v; });
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    var y = padT + i * rh + rh / 2;
    var g = mk("g", { style: "cursor:pointer" });
    var lb = mk("text", { x: padL - 9, y: y + 3.5, "text-anchor": "end", fill: "var(--ink2)", "font-size": 11 });
    lb.textContent = clip(storyLabel(e, 26), 25); g.appendChild(lb);
    g.appendChild(mk("line", { x1: padL + iw * lo / 100, x2: padL + iw * hi / 100, y1: y, y2: y,
      stroke: "var(--line2)", "stroke-width": 2, "stroke-linecap": "round" }));
    arts.forEach(function (a) {
      var pf = SRC[a.s];
      g.appendChild(mk("circle", { cx: padL + iw * a.v / 100, cy: y, r: 4,
        fill: lean(pf ? pf.lean : null), stroke: "var(--surface)", "stroke-width": 1.5 }));
    });
    bindTip(g, "<span class='k'>" + esc(storyLabel(e, 70)) + "</span>" + e.s.length +
      " kurum · yoğunluk " + lo + "–" + hi + " (aralık " + (hi - lo) + ")");
    g.addEventListener("click", function () { go("/olay?e=" + e.i); });
    s.appendChild(g);
  });
  return s;
}


/* ================================================================= nav = */
/* Two-level header. SECTIONS are the pills; each section's `tabs` are the second
   level. A section with one view shows no strip, so the strip appearing is
   itself the signal that the section holds more than one thing. Detail pages
   (an event, an outlet) belong to a section and keep its pill lit. */
var SECTIONS = [
  { p: "/", label: "Giriş", fn: pgHome },
  { p: "/olaylar", label: "Olaylar", fn: pgEvents, tabs: [
    ["liste", "Tüm olaylar"], ["kor", "Kör noktalar"], ["konular", "Konular"], ["kapsama", "Kapsama"], ["ilan", ""]] },
  { p: "/benim", label: "Benim", fn: pgMine, tabs: [
    ["akis", "Size özel"], ["denge", "Haber dengem"], ["takip", "Takip ettiklerim"]] },
  { p: "/anlati", label: "Anlatı", fn: pgNarrative },
  { p: "/bulgular", label: "Bulgular", fn: pgFindings, tabs: [
    ["temel", "Temel bulgular"], ["ileri", "İleri analiz"], ["hiz", "Hız, spot, benzerlik"]] },
  { p: "/kurumlar", label: "Kurumlar", fn: pgSources, tabs: [
    ["genel", "Genel bakış"], ["liste", "Kurum listesi"], ["karsilastir", "İkili karşılaştırma"], ["siralama", "Sıralama"],
    ["kayit", "Kayıt defteri"], ["guven", "Güven"]] },
  { p: "/harita", label: "Harita", fn: pgMap },
  { p: "/yanlilik", label: "Çerçeveleme", fn: pgBias, tabs: [
    ["kesif", "Araç tezgâhı"], ["cozumleyici", "Çözümleyici"],
    ["bicimler", "Üretim aşamaları"], ["turkiye", "Türkiye bağlamı"]] },
  { p: "/yontem", label: "Yöntem", fn: pgMethod }
];
var DETAIL = { "/olay": { fn: pgEvent, of: "/olaylar" }, "/kurum": { fn: pgSource, of: "/kurumlar" },
  "/konu": { fn: pgTopic, of: "/olaylar" }, "/ara": { fn: pgSearch, of: "/" } };
var ADMIN = { p: "/yonetim", label: "Yönetim", fn: pgAdmin, tabs: [
  ["panel", "Panel"], ["inceleme", "İnceleme kuyruğu"], ["ozet", "Özet bildirimleri"], ["saglik", "Akış sağlığı"]] };

function secFor(path) {
  if (path === ADMIN.p) return ADMIN;
  if (DETAIL[path]) path = DETAIL[path].of;
  return SECTIONS.filter(function (s) { return s.p === path; })[0] || SECTIONS[0];
}
function go(h) { location.hash = h; }


function tabOf(sec, q) {
  if (!sec.tabs) return null;
  var t = q.t;
  var tabs = v3tabsOf(sec);
  return tabs.filter(function (x) { return x[0] === t; }).length ? t : tabs[0][0];
}
/* Circle geometry from the original component: a circle wide enough that its
   arc covers the pill when scaled, seated just below the bottom edge. */
function layoutPills() {
  [].forEach.call(document.querySelectorAll(".pill"), function (p) {
    var c = p.querySelector(".hover-circle"); if (!c) return;
    var r = p.getBoundingClientRect(), w = r.width, h = r.height; if (!w || !h) return;
    var R = ((w * w) / 4 + h * h) / (2 * h);
    var Dm = Math.ceil(2 * R) + 2;
    var delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
    c.style.width = Dm + "px"; c.style.height = Dm + "px"; c.style.bottom = -delta + "px";
    c.style.transformOrigin = "50% " + (Dm - delta) + "px";
  });
}

/* The review/operations area is a separate application, not another public
   section: it never shares the masthead, PillNav or AcidSquares hero. It
   gets its own minimal top bar, its own tab strip, and a standing notice
   that nothing decided here is written back to the corpus or shown to a
   reader — only kept in this browser's storage. */
function adminShell(tab) {
  return '<div class="admtop"><div class="row">' +
    '<span class="mk" aria-hidden="true"></span><b>Çapraz Manşet 2.0</b>' +
    '<span class="badge">Yönetim</span><span class="sp"></span>' +
    '<a class="back" href="#/">← Siteye dön</a>' +
    '<button class="icobtn" id="theme" aria-label="Açık/koyu tema">' +
      '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.3">' +
      '<path d="M7.5 1.6a5.9 5.9 0 1 0 5.9 5.9 4.6 4.6 0 0 1-5.9-5.9Z"/></svg></button>' +
    "</div></div>" +
    '<div class="admbar"><div class="wrap"><b>Bu bölüm editör içindir, okur için değil.</b> ' +
    "Onay, işaretleme ve notlar yalnızca bu tarayıcıda saklanır; veri setine yazılmaz ve kamu " +
    "görünümünde hiçbir yerde görünmez.</div></div>" +
    '<div class="admtabs"><div class="wrap">' +
    v3adminTabs(ADMIN.tabs).map(function (t) {
      return '<a class="admtab' + (t[0] === tab ? " on" : "") + '" href="#' + ADMIN.p +
        "?t=" + t[0] + '">' + t[1] + "</a>";
    }).join("") + "</div></div>";
}
function adminFoot() {
  return '<div class="admfoot">Yönetim görünümü · durum yalnızca bu tarayıcıda saklanır · ' +
    '<a href="#/">kamu görünümüne dön</a></div>';
}

/* ================================================================ pages */


/* Story label: the least-loaded headline in the cluster. Using the plainest
   account as the name of the story is the same principle the site argues for —
   describe the event, then show what each outlet added to it. */
function storyLabel(e, max) {
  if (e.t) return max && e.t.length > max ? e.t.slice(0, max - 1) + "…" : e.t;
  var arts = e.a.map(function (i) { return ART[i]; });
  var plain = arts.slice().sort(function (x, y) { return x.v - y.v; })[0];
  var t = plain ? plain.t : evTitle(e, 4);
  return max && t.length > max ? t.slice(0, max - 1) + "…" : t;
}
function topStories(n) {
  return D.E.slice().filter(function (e) { return e.s.length >= 4; })
    .sort(function (x, y) { return y.p - x.p || y.s.length - x.s.length; }).slice(0, n || 14);
}



/* The comparison view. Everything the site is for happens in this function. */
function renderStory(id) {
  var box = $("#storybox"); if (!box) return;
  var e = D.E.filter(function (x) { return x.i === id; })[0]; if (!e) return;
  var arts = e.a.map(function (i) { return ART[i]; }).sort(function (x, y) { return y.v - x.v; });
  var lo = arts[arts.length - 1], hi = arts[0];
  var c = evCoverage(e);

  /* Devices that appear in the loaded half but not the plain half — the concrete
     answer to "what did this outlet add that the others did not". */
  var half = Math.max(1, Math.ceil(arts.length / 2));
  var inHi = {}, inLo = {};
  arts.slice(0, half).forEach(function (a) { a.k.forEach(function (k) { inHi[k] = 1; }); });
  arts.slice(half).forEach(function (a) { a.k.forEach(function (k) { inLo[k] = 1; }); });
  var added = Object.keys(inHi).filter(function (k) { return !inLo[k]; });

  var h = '<div class="panel" style="padding:20px 22px 8px">';
  h += '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;' +
    'justify-content:space-between;margin-bottom:4px">' +
    '<h3 style="font-size:21px;max-width:52ch">' + esc(storyLabel(e)) + "</h3>" +
    '<span class="gap"><b>' + e.p + "</b> puanlık fark</span></div>";
  h += '<div style="max-width:340px;margin-bottom:6px">' + covBar(c) + "</div>";
  h += '<p style="color:var(--ink2);font-size:14px;margin:12px 0 4px;max-width:74ch">' +
    e.s.length + " kurum bu olayı verdi. En yalın başlık " + lo.v + ", en yüklü başlık " +
    hi.v + " puan aldı. Aşağıda işaretli kelimeler, farkı yaratan kelimelerdir — " +
    "üzerlerine gelin ya da yapı adına tıklayın.</p>";
  if (added.length) {
    h += '<p style="font-size:13.5px;color:var(--ink2);margin:10px 0 2px">' +
      '<b>Yüklü yarıda olup yalın yarıda olmayan yapılar:</b> ' +
      added.map(function (k) {
        return '<button class="devchip" data-k="' + esc(k) + '">' +
          esc(BIA[k] ? BIA[k].en : k) + "</button>"; }).join(" ") + "</p>";
  }
  h += '<div id="expbox"></div>';
  arts.forEach(function (a) { h += artRow(a); });
  h += '<div style="padding:14px 0 8px;border-top:1px solid var(--line);margin-top:4px">' +
    '<a class="lnk" href="#/olay?e=' + e.i + '">Bu olayı dört soruda incele →</a></div>';
  box.innerHTML = h + "</div>";
  wireDevices(box);
}

/* One handler for every device chip and every highlighted word on the page.
   Both carry the article id, so the modal shows the exact firing rather than a
   generic definition. */
function wireDevices(root) {
  var hitFor = function (node, key) {
    var host = node.closest ? node.closest("[data-aid]") : null;
    var a = host ? ART[host.getAttribute("data-aid")] : null;
    if (!a) return null;
    var e = a.e.filter(function (x) { return x[0] === key; })[0];
    if (!e) return { article: a };
    return { article: a, terms: String(e[1] || "").split(", ").filter(Boolean),
      level: e[2], why: String(e[3] || "").split(",").filter(Boolean),
      rule: (RULEDEF.filter(function (r) { return r[0] === key; })[0] || [])[1] };
  };
  [].forEach.call(root.querySelectorAll(".devchip"), function (btn) {
    btn.onclick = function () { var k = btn.getAttribute("data-k"); openBias(k, hitFor(btn, k)); };
  });
  [].forEach.call(root.querySelectorAll("mark.hl"), function (mk2) {
    var k = mk2.getAttribute("data-k"), b = REG[k] || BIA[k];
    if (b) bindTip(mk2, "<span class='k'>" + esc(b.en) + "</span>" + esc(b.tr || "") +
      " — tıklayarak kanıtı ve açıklamasını açın");
    mk2.onclick = function () { openBias(k, hitFor(mk2, k)); };
    mk2.onkeydown = function (ev) { if (ev.key === "Enter") openBias(k, hitFor(mk2, k)); };
  });
  [].forEach.call(root.querySelectorAll("[data-bias]"), function (n) {
    n.style.cursor = "pointer";
    n.onclick = function () {
      var k = n.getAttribute("data-bias"); openBias(k, hitFor(n, k)); };
  });
}

/* ================================================== headline highlighting ==
   The core move of the whole site: show the headline and mark the exact words
   that triggered a device. "Bias score 85" is a number to take on trust;
   "Siyonist katilden alçakça tehdit" with `katil` marked is the evidence, and
   the reader can disagree with it. Everything else here is scaffolding for this.

   Turkish note: toLocaleLowerCase("tr") is length-preserving for İ and I (they
   map to i and ı, one char each), so offsets found in the lowered string map
   straight back onto the original. The en-US lowercase of İ is two code points
   and would shift every later offset. */
function hlTitle(a) {
  var t = a.t || "";
  if (!a.e || !a.e.length) return esc(t);
  var low = t.toLocaleLowerCase("tr");
  var spans = [];
  a.e.forEach(function (pair) {
    var key = pair[0];
    String(pair[1] || "").split(", ").forEach(function (term) {
      term = term.trim(); if (!term) return;
      var needle = term.toLocaleLowerCase("tr");
      var from = 0, i;
      while ((i = low.indexOf(needle, from)) >= 0) {
        spans.push({ a: i, b: i + needle.length, k: key });
        from = i + needle.length;
      }
    });
  });
  if (!spans.length) return esc(t);
  spans.sort(function (x, y) { return x.a - y.a || y.b - x.b; });
  var out = "", at = 0;
  spans.forEach(function (sp) {
    if (sp.a < at) return;                 // overlapping match already covered
    out += esc(t.slice(at, sp.a));
    out += '<mark class="hl" data-k="' + esc(sp.k) + '" tabindex="0">' +
      esc(t.slice(sp.a, sp.b)) + "</mark>";
    at = sp.b;
  });
  return out + esc(t.slice(at));
}

/* Small pills naming the devices a headline triggered. */
function devChips(a) {
  if (!a.k || !a.k.length) return "";
  return a.k.map(function (k) {
    var b = BIA[k];
    return '<button class="devchip" data-k="' + esc(k) + '">' +
      esc(b ? b.en : k) + "</button>";
  }).join("");
}

function artRow(a, opt) {
  opt = opt || {};
  var pf = SRC[a.s], b = bandOf(a.v);
  return '<div class="artrow" data-aid="' + a.i + '"><div class="sc" style="color:' +
    (a.v >= 45 ? "var(--hot)" : "var(--ink2)") + '">' + a.v + "</div>" +
    '<div><div class="ttl">' + (a.u ?
      '<a class="hlnk" href="' + esc(a.u) + '" target="_blank" rel="noopener">' + hlTitle(a) + "</a>" :
      hlTitle(a)) + "</div>" +
    '<div class="meta"><span class="dot" style="background:' + lean(pf ? pf.lean : null) + '"></span>' +
    (opt.noSrc ? "" : esc(pf ? pf.n : a.s) + "<span>·</span>") + fmtDT(a.d) +
    "<span>·</span>" + esc(b.tr) + "</div>" +
    (a.k.length ? '<div class="devs">' + devChips(a) + "</div>" : "") + "</div>" +
    '<div style="min-width:70px"><div class="bar"><i style="width:' + a.v +
    "%;background:" + seq(a.v) + '"></i></div></div></div>';
}

/** Inline range strip: the event's spread drawn at the size of a table cell.
    "Aralık 42" is the site's central number and it was printed as a bare
    integer — the one column a reader most needs to compare down the page was
    the one with no visual at all. Each dot is one outlet's headline, placed on
    a shared 0-100 scale and coloured by that outlet's register placement, so a
    wide strip with red at one end and blue at the other is legible at a glance. */
function rangeStrip(e) {
  var W = 132, H = 22, pad = 4, iw = W - pad * 2;
  var arts = e.a.map(function (i) { return ART[i]; });
  var vs = arts.map(function (a) { return a.v; });
  var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  var X = function (v) { return pad + iw * (v / 100); };
  var g = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
    '" role="img" aria-label="Yoğunluk aralığı ' + lo + " – " + hi + '">' +
    '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + (H / 2) +
    '" y2="' + (H / 2) + '" stroke="var(--line)" stroke-width="1"/>' +
    '<line x1="' + X(lo).toFixed(1) + '" x2="' + X(hi).toFixed(1) + '" y1="' + (H / 2) +
    '" y2="' + (H / 2) + '" stroke="var(--line2)" stroke-width="3" stroke-linecap="round"/>';
  arts.forEach(function (a) {
    var pf = SRC[a.s];
    g += '<circle cx="' + X(a.v).toFixed(1) + '" cy="' + (H / 2) + '" r="3.4" fill="' +
      lean(pf ? pf.lean : null) + '" stroke="var(--surface)" stroke-width="1.2"/>';
  });
  return g + "</svg>";
}

/* ================================================== reporting spectrum ===
   An event drawn as the thing it actually is: a set of newsrooms placed along
   the political scale, each having written the same occurrence with a
   different amount of loaded language. A ranked list hides the two facts that
   matter — WHERE on the spectrum the coverage sat, and whether the loudest
   headline came from one end of it or from the middle. */
function spectrumCard(e) {
  var arts = e.a.map(function (i) { return ART[i]; });
  var vs = arts.map(function (a) { return a.v; });
  var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  var top = arts.slice().sort(function (a, b) { return b.v - a.v; })[0];
  var bot = arts.slice().sort(function (a, b) { return a.v - b.v; })[0];
  var c = evCoverage(e);

  /* Dots are placed by the outlet's register position and sized by how loaded
     its headline was, so a big dot far from the middle and a big dot in the
     middle are equally visible — which is the point, because the corpus says
     loudness does not follow position. */
  var dots = arts.map(function (a) {
    var pf = SRC[a.s];
    if (!pf || pf.lean == null) return "";
    var r = 5 + (a.v / 100) * 12;
    return '<span class="spec-dot" style="left:' + pf.lean + "%;width:" + r.toFixed(1) +
      "px;height:" + r.toFixed(1) + "px;background:" + lean(pf.lean) +
      ";opacity:" + (0.45 + (a.v / 100) * 0.55).toFixed(2) + '" title="' +
      esc((pf.n || a.s) + " · yerleşim " + pf.lean + " · yoğunluk " + a.v) + '"></span>';
  }).join("");

  return '<a class="spec-card" href="#/olay?e=' + e.i + '">' +
    "<h3>" + esc(storyLabel(e, 92)) + "</h3>" +
    '<div class="spec-meta"><span>' + e.s.length + " kurum</span>" +
    "<span>" + fmtD(e.f) + "</span>" +
    (e.k === "event" ? "" : '<span class="tag">doğrulanmamış küme</span>') +
    '<span style="margin-left:auto" class="spec-gap"><b>' + e.p + "</b> puanlık ayrışma</span>" +
    "</div>" +
    '<div class="spec-rail"><span class="spec-axis"></span>' +
    [0, 25, 50, 75, 100].map(function (t) {
      return '<span class="spec-tick" style="left:' + t + '%"></span>'; }).join("") +
    dots + "</div>" +
    '<div class="spec-scale"><span>Sol</span><span>Merkez</span><span>Sağ</span></div>' +
    '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;' +
    'font-size:12.5px;color:var(--ink2)">' +
    '<div><span class="eyebrow" style="font-size:9px">En yalın</span><div style="margin-top:3px">' +
    esc(SRC[bot.s] ? SRC[bot.s].n : bot.s) + ' <span class="num" style="color:var(--muted)">' +
    bot.v + "</span></div></div>" +
    '<div><span class="eyebrow" style="font-size:9px">En yüklü</span><div style="margin-top:3px">' +
    esc(SRC[top.s] ? SRC[top.s].n : top.s) + ' <span class="num" style="color:var(--hot)">' +
    top.v + "</span></div></div></div>" +
    (c.left === 0 || c.right === 0 ?
      '<div style="margin-top:10px"><span class="tag b">' +
      (c.left === 0 ? "sol yerleşimli kurum vermedi" : "sağ yerleşimli kurum vermedi") +
      "</span></div>" : "") +
    "</a>";
}

function evTable(list) {
  var h = '<div class="scroller panel"><table><thead><tr><th>Olay</th><th class="r">Kurum</th>' +
    '<th class="r">Haber</th><th class="r">Yoğunluk</th><th>Ayrışma aralığı</th><th>Tarih</th>' +
    "</tr></thead><tbody>";
  list.forEach(function (e) {
    h += '<tr style="cursor:pointer" onclick="location.hash=\'/olay?e=' + e.i + '\'">' +
      "<td>" + esc(storyLabel(e, 72)) + "</td>" +
      '<td class="r num">' + e.s.length + "</td><td class=\"r num\">" + e.n + "</td>" +
      '<td class="r num">' + e.m + "</td>" +
      '<td style="white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:8px">' +
      rangeStrip(e) + '<b class="num" style="font-size:12.5px;color:' +
      (e.p >= 30 ? "var(--hot)" : "var(--ink2)") + '">' + e.p + "</b></span></td>" +
      "<td class=\"mono\" style=\"font-size:12px;color:var(--muted)\">" + fmtD(e.f) + "</td></tr>";
  });
  return h + "</tbody></table></div>";
}

/* Coverage blocs. An outlet counts to a bloc by its register placement, which is
   supplied data, not our assessment — so a bloc count is "outlets the register
   places on this side", never "the left said X". */
function bloc(slug) { var p = SRC[slug]; if (!p || p.lean == null) return p && p.unplaced ? "none" : "mid";
  return p.lean < 45 ? "left" : p.lean > 55 ? "right" : "mid"; }
function evCoverage(e) {
  var c = { left: 0, mid: 0, right: 0, none: 0 };
  e.s.forEach(function (s) { c[bloc(s)]++; });
  c.total = e.s.length - c.none;
  return c;
}
function covBar(c) {
  var t = c.total || 1;
  return '<div class="cov">' +
    (c.left ? '<i style="width:' + (100 * c.left / t) + '%;background:var(--left)"></i>' : "") +
    (c.mid ? '<i style="width:' + (100 * c.mid / t) + '%;background:var(--mid)"></i>' : "") +
    (c.right ? '<i style="width:' + (100 * c.right / t) + '%;background:var(--right)"></i>' : "") +
    "</div><div class=\"covleg\">" +
    '<span><em style="background:var(--left)"></em>Sol ' + c.left + "</span>" +
    '<span><em style="background:var(--mid)"></em>Merkez ' + c.mid + "</span>" +
    '<span><em style="background:var(--right)"></em>Sağ ' + c.right + "</span></div>";
}

function pgEventsV1(q) {
  var tab = tabOf(secFor("/olaylar"), q);
  var h = '<div class="wrap page">';

  if (tab === "liste") {
    h += '<div class="phead"><div class="eyebrow">Ortak olaylar</div>' +
      "<h1>Aynı olayı kimler, nasıl verdi</h1>" +
      '<p class="lede">En az üç kurumun aynı olayı verdiği haberler. Her kart bir olay: ' +
      "şeritteki her nokta o olayı veren bir kurumdur, <b>yatay konumu</b> kurumun siyasi " +
      "yerleşimi, <b>büyüklüğü</b> başlığındaki yüklü dilin miktarıdır. Yelpazenin bir " +
      "ucunda toplanan büyük noktalar, olayın tek taraftan sert bir dille verildiği " +
      "anlamına gelir; dağınık büyük noktalar, sertliğin siyasi tarafı olmadığı.</p></div>";
    h += '<div class="ctl">' +
      '<input type="search" id="esearch" placeholder="Olay ya da kurum ara…" style="min-width:240px">' +
      '<label class="eyebrow" for="esort">Sırala</label>' +
      '<select id="esort"><option value="p">Ayrışma (geniş → dar)</option>' +
      '<option value="s">Kurum sayısı</option><option value="m">Ortalama yoğunluk</option>' +
      '<option value="f">Tarih</option></select>' +
      '<span style="display:inline-flex;gap:4px;margin-left:auto">' +
      '<button class="chip" data-ev="spectrum" aria-pressed="true">Şerit</button>' +
      '<button class="chip" data-ev="table" aria-pressed="false">Tablo</button></span>' +
      '<span id="ecount" class="mono" style="font-size:12px;color:var(--muted)"></span>' +
      "</div><div id=\"elist\"></div>";
  }

  if (tab === "kapsama") {
    h += '<div class="phead"><div class="eyebrow">Kapsama analizi</div>' +
      "<h1>Bir olayı yelpazenin hangi tarafı verdi</h1>" +
      '<p class="lede">Her olay için, onu veren kurumların kayıt defterindeki siyasi ' +
      "yerleşimlerine göre dağılımı. Şerit, olayın yelpazede nasıl dağıldığını gösterir. " +
      "Bloklar <b>sağlanan yerleşimlerden</b> türetilir; bu sitenin kendi değerlendirmesi değildir.</p></div>";
    var evs = D.E.slice().sort(function (a, b) { return b.s.length - a.s.length; });
    h += '<div class="grid g2">';
    evs.slice(0, 24).forEach(function (e) {
      var c = evCoverage(e);
      h += '<div class="card" style="cursor:pointer" onclick="location.hash=\'/olay?e=' + e.i + '\'">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">' +
        "<b>" + esc(storyLabel(e, 64)) + "</b>" +
        '<span class="tag">' + e.s.length + " kurum</span></div>" +
        '<div style="margin-top:11px">' + covBar(c) + "</div></div>";
    });
    h += "</div>";
  }

  if (tab === "kor") {
    /* The naive test — "a bloc is entirely absent" — finds nothing here, and
       that is the honest headline. It also would not mean much if it did: the
       register places 17 live outlets on the right and 7 on the left, so an
       empty left bloc is far more likely by arithmetic than by editorial choice.
       So the page reports the null result first, then uses a baseline-relative
       measure, which is the only version of this question the data can answer. */
    var nLeft = 0, nRight = 0, nMid = 0;
    LIVE.forEach(function (k) { var b = bloc(k);
      if (b === "left") nLeft++; else if (b === "right") nRight++; else if (b !== "none") nMid++; });
    var baseL = nLeft / LIVE.length;
    var big = D.E.filter(function (e) { return e.s.length >= 5; });
    var none = big.filter(function (e) { var c = evCoverage(e); return c.left === 0 || c.right === 0; });
    var scored = big.map(function (e) {
      var c = evCoverage(e);
      return { e: e, c: c, share: c.left / c.total, gap: c.left / c.total - baseL };
    }).sort(function (a, b) { return a.gap - b.gap; });

    h += '<div class="phead"><div class="eyebrow">Kör noktalar</div>' +
      "<h1>Bir olay yelpazenin bir tarafında eksik kalıyor mu</h1>" +
      '<p class="lede">Ground News tarzı “kör nokta”, bir olayın yelpazenin bir tarafında ' +
      "hiç görünmemesidir. Bu bu dönemdeki haberlerde, en az beş kurumun verdiği " + big.length +
      " olaydan <b>" + none.length + " tanesi</b> bu tanıma uyuyor.</p></div>";

    h += '<div class="note"><b>Sıfır, burada gerçek bir sonuçtur.</b> Bu dönemdeki bu dönemdeki haberlerde ' +
      "kurumlar büyük ölçüde <b>aynı olayları</b> veriyor; ayrıştıkları yer olayın seçimi " +
      "değil, dili. Bu, sitenin geri kalanının neden çerçevelemeye odaklandığını da " +
      "açıklıyor: ölçülebilir fark orada.</div>";

    h += '<div class="note warn" style="margin-top:12px"><b>Testin kendisi zayıf.</b> ' +
      "Kayıt defteri bu dönemdeki " + LIVE.length + " kurumdan " + nRight + " tanesini sağda, " +
      nLeft + " tanesini solda konumlandırıyor. Bu dengesizlikle, “solda hiç yok” sonucu " +
      "editoryal bir tercihten çok aritmetikten doğar. Ayrıca Halk TV, Karar ve Aydınlık " +
      "gibi sol/muhalif kurumlar tek bir akış yayınlıyor ve pencerenin yalnızca bir gününü " +
      "kapsıyor — verinin ince olduğu yerde kör nokta bulmak kolaydır.</div>";

    h += '<section class="sec"><h2>Bloka göre orantısız olaylar</h2>' +
      '<p class="sub">Mutlak yokluk yerine orana bakan ölçüt. Bu dönemdeki haberlerde sol blok kurumların ' +
      "%" + Math.round(100 * baseL) + sufNum(Math.round(100 * baseL), 1) + " oluşturuyor; aşağıdaki olaylarda sol blokun payı " +
      "bu taban çizgisinin en çok altında ya da üstünde. Bu bir kapsama gözlemidir, " +
      "bir suçlama değil.</p>";
    h += '<div class="grid g2">';
    scored.slice(0, 6).concat(scored.slice(-6).reverse()).forEach(function (x, i) {
      if (i === 6) h += '</div><h3 style="margin:26px 0 12px;font-size:17px">Sol blokun payı ' +
        "taban çizgisinin üstünde</h3><div class=\"grid g2\">";
      h += '<div class="card" style="cursor:pointer" onclick="location.hash=\'/olay?e=' + x.e.i + '\'">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">' +
        "<b>" + esc(storyLabel(x.e, 64)) + "</b>" +
        '<span class="tag' + (x.gap < -0.15 ? " b" : "") + '">' +
        (x.gap >= 0 ? "+" : "") + Math.round(100 * x.gap) + " puan</span></div>" +
        '<div style="margin-top:11px">' + covBar(x.c) + "</div>" +
        '<div style="margin-top:9px;font-size:12px;color:var(--muted)">' +
        esc(x.e.s.map(function (sl) { return SRC[sl] ? SRC[sl].n : sl; }).join(", ")) + "</div></div>";
    });
    h += "</div></section>";
  }

  return h + "</div>";
}
var EVVIEW = "spectrum";
function renderEvents() {
  var k = $("#esort") ? $("#esort").value : "p";
  var q = (($("#esearch") && $("#esearch").value) || "").toLocaleLowerCase("tr");
  var list = D.E.slice().sort(function (a, b) {
    if (k === "p") return b.p - a.p || b.s.length - a.s.length;
    if (k === "s") return b.s.length - a.s.length || b.p - a.p;
    if (k === "m") return b.m - a.m;
    return b.f.localeCompare(a.f);
  }).filter(function (e) {
    if (!q) return true;
    return storyLabel(e, 200).toLocaleLowerCase("tr").indexOf(q) >= 0 ||
      e.s.some(function (sl) {
        return (SRC[sl] ? SRC[sl].n : sl).toLocaleLowerCase("tr").indexOf(q) >= 0; });
  });
  var box = $("#elist"); if (!box) return;
  var cnt = $("#ecount");
  if (cnt) cnt.textContent = list.length + " olay";
  box.innerHTML = EVVIEW === "table" ? evTable(list) :
    '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">' +
    list.map(spectrumCard).join("") + "</div>";
}

function pgEventV1(q) {
  var e = D.E.filter(function (x) { return x.i === q.e; })[0];
  if (!e) return '<div class="wrap page"><div class="phead"><h1>Olay bulunamadı</h1>' +
    '<p class="lede"><a class="lnk" href="#/olaylar">Olay listesine dön</a></p></div></div>';
  var arts = e.a.map(function (i) { return ART[i]; }).sort(function (a, b) { return b.v - a.v; });
  var vs = arts.map(function (a) { return a.v; });
  var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
  var plain = arts[arts.length - 1], loud = arts[0];

  /* What they agree on: tokens carried by most of the cluster. */
  var cnt = {};
  arts.forEach(function (a) {
    var seen = {};
    a.t.toLocaleLowerCase("tr").replace(/['’‘"“”]/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/).forEach(function (w) { if (w.length >= 4 && !seen[w]) { seen[w] = 1; cnt[w] = (cnt[w] || 0) + 1; } });
  });
  var shared = Object.keys(cnt).filter(function (w) { return cnt[w] >= Math.ceil(arts.length * .6); })
    .sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 10);

  /* Where they differ: the devices that fired, and on whom. */
  var devs = {};
  arts.forEach(function (a) { a.e.forEach(function (x) {
    (devs[x[0]] || (devs[x[0]] = [])).push({ s: a.s, ev: x[1], v: a.v }); }); });
  var devKeys = Object.keys(devs).sort(function (a, b) { return devs[b].length - devs[a].length; });

  var KINDLBL = { event: ["doğrulanmış olay", "g"],
    topic: ["konu kümesi — aynı tür olaylar", "b"],
    unverified: ["ortak özel ad saptanamadı", ""] };
  var kl = KINDLBL[e.k] || KINDLBL.unverified;
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Olay ' + esc(e.i) +
    " · " + fmtD(e.f) + " – " + fmtD(e.l) +
    ' <span class="tag ' + kl[1] + '" style="margin-left:8px">' + kl[0] + "</span></div>" +
    "<h1>" + esc(storyLabel(e, 90)) + "</h1>" +
    '<p class="lede">' + e.s.length + " kurum, " + e.n + " haber. Yüklü dil yoğunluğu " + lo +
    " ile " + hi + " arasında — " + (hi - lo) + " puanlık aralık.</p></div>";

  h += '<div class="q"><div class="q-n">01</div><div><h3>Ne oldu?</h3>' +
    "<p>Bu kümedeki en az yüklü başlık, olayın en yalın aktarımıdır: " +
    '<b>“' + esc(plain.t) + '”</b> — ' + esc(SRC[plain.s] ? SRC[plain.s].n : plain.s) +
    ", yoğunluk " + plain.v + " (" + esc(bandOf(plain.v).tr).toLocaleLowerCase("tr") + "). " +
    "Küme, " + fmtDT(e.f) + " ile " + fmtDT(e.l) + " arasında yayımlanan haberlerden oluşuyor.</p></div></div>";

  var FL = factLayers(e);
  h += '<div class="q"><div class="q-n">02</div><div><h3>Kaynaklar neyde uzlaşıyor?</h3>' +
    "<p>Üç katman ayrı tutulur: her kurumun taşıdığı ortak unsurlar, yalnızca bazılarının " +
    "taşıdığı iddialar, ve bu sitenin kendi okuması. Bunları birbirine karıştırmak bu tür " +
    "analizlerin en yaygın hatasıdır.</p>";
  h += '<div style="margin-top:14px"><div style="margin-bottom:14px">' +
    '<span class="tag g">1 · Olgu — hepsinde ortak</span>' +
    '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2)">' +
    (FL.all.length ? "Kümedeki <b>" + FL.n + " başlığın hepsinde</b> geçen unsurlar. " +
      "Hiçbir kurum bunları tartışmıyor.</p><p style=\"margin-top:7px\">" +
      FL.all.map(function (w) { return '<span class="tag" style="margin:2px 4px 2px 0">' +
        esc(w) + "</span>"; }).join("")
      : "Bu kümede bütün başlıkların paylaştığı bir unsur yok. Kurumlar aynı olayı farklı " +
        "sözcüklerle adlandırıyor olabilir; bu tek başına ayrışma kanıtı değildir, kümenin " +
        "gevşek olduğunun da işareti olabilir.") + "</p></div>";
  if (FL.some.length) {
    h += '<div style="margin-bottom:14px"><span class="tag b">2 · İddia — yalnızca bazılarında</span>' +
      '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2)">Kümenin bir bölümünde ' +
      "geçen, hepsinde geçmeyen unsurlar. Bunlar iddia düzeyindedir: bir kurumun eklediği, " +
      "diğerlerinin eklemediği bilgi ya da niteleme.</p><p style=\"margin-top:7px\">" +
      FL.some.map(function (w) { return '<span class="tag" style="margin:2px 4px 2px 0">' +
        esc(w) + "</span>"; }).join("") + "</p></div>";
  }
  h += '<div><span class="tag">3 · Yorum — bu sitenin okuması</span>' +
    '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2)">Yoğunluk puanları ve yapı ' +
    "etiketleri <b>yorumdur</b>, olgu değil. Kural tabanlı, denetlenebilir ve " +
    "tartışılabilirler; her birinin kanıtı işaretli kelimede görünür ve tıklanabilir.</p>" +
    "</div></div></div></div>";

  h += '<div class="q"><div class="q-n">03</div><div><h3>Nerede ayrışıyorlar?</h3>';
  if (hi - lo < 8) {
    h += "<p>Bu olayda kayda değer bir ayrışma yok. Tüm kurumlar " + lo + "–" + hi +
      " bandında kaldı; başlıklar olayı bildiriyor, yeniden çerçevelemiyor. " +
      "Ayrışmanın <b>olmaması</b> da bir bulgudur: rutin aktarımda Türk basını büyük ölçüde aynı dili kullanıyor.</p>";
  } else {
    h += "<p>En yüksek yoğunluk <b>" + esc(SRC[loud.s] ? SRC[loud.s].n : loud.s) + "</b>'de (" + loud.v +
      "), en düşük <b>" + esc(SRC[plain.s] ? SRC[plain.s].n : plain.s) + "</b>'de (" + plain.v +
      "). Aradaki fark olgudan değil, dilden geliyor. Tetiklenen yapılar:</p>";
    h += '<div style="margin-top:12px">';
    devKeys.forEach(function (k) {
      var b = BIA[k], hits = devs[k];
      h += '<div class="card" style="margin-bottom:10px;padding:14px">' +
        '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">' +
        '<b style="font-family:var(--ff-b);font-size:14px">' + esc(b ? b.en : k) + "</b>" +
        '<span style="color:var(--muted);font-size:13px">' + esc(b ? b.tr : "") + "</span>" +
        '<span class="tag b" style="margin-left:auto">' + hits.length + " başlıkta</span></div>";
      if (b) h += '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2);line-height:1.6">' + esc(b.df) + "</p>";
      h += '<div style="margin-top:9px;font-size:12.5px;color:var(--muted);font-family:var(--ff-m)">' +
        hits.map(function (x) { return esc(SRC[x.s] ? SRC[x.s].n : x.s) + " → “" + esc(x.ev) + "”"; }).join(" &nbsp;·&nbsp; ") +
        "</div></div>";
    });
    h += "</div>";
  }
  h += "</div></div>";

  h += '<div class="q"><div class="q-n">04</div><div><h3>Bu fark neden önemli?</h3><p>';
  if (hi - lo < 8) {
    h += "Bu olay, ölçeğin kalibrasyonu için yararlıdır: aralığın dar olduğu durumlar, " +
      "geniş olduğu durumların gerçekten ayrıştığını gösterir. Her haberde yanlılık aramak, " +
      "yanlılığın anlamını yitirmesine yol açar.";
  } else {
    h += "Aynı olayı okuyan iki kişi, hangi kurumu açtığına göre farklı bir olay hatırlar. " +
      "Yüksek yoğunluklu başlık okura olayla birlikte bir <b>değerlendirme</b> de verir: kimin " +
      "sorumlu olduğunu, olayın ne kadar ciddi olduğunu, kime öfkelenmesi gerektiğini. Düşük " +
      "yoğunluklu başlık bu kararı okura bırakır. Fark, olgunun kendisinde değil, okurun " +
      "olguyla ne yapacağındadır.";
  }
  h += "</p></div></div>";

  h += '<section class="sec"><h2>Kaynak kaynağa karşılaştırma</h2>' +
    '<p class="sub">Bu olayı veren her kurum, kendi manşeti ve anlatı kodlamasıyla. ' +
    "Uzlaşılan ve ayrışılan noktalar aynı satırda görünür; yapı adına tıklayarak " +
    "kanıtını ve açıklamasını açabilirsiniz.</p>" + comparisonTable(e) + "</section>";

  h += '<section class="sec"><h2>Çerçeveleme merdiveni</h2>' +
    '<p class="sub">Aynı olay, en yalın başlıktan en yüklüsüne. Her basamak, bir ' +
    "alttakine <b>ne eklediğini</b> söylüyor. Çerçeveleme bir kurumun sahip olduğu bir " +
    "özellik değil, adım adım kurulan bir şeydir; bu merdiven o adımları gösterir.</p>" +
    framingLadder(e) + "</section>";

  var wd = wordDivergence(e);
  if (wd) {
    h += '<section class="sec"><h2>Kelime düzeyinde ayrışma</h2>' +
      '<p class="sub">Bu olayda yalnızca bir blokta geçen kelimeler. Bloklar sağlanan ' +
      "kayıt defteri yerleşimlerinden gelir; tablo hangi kelimelerin hangi yerleşimle " +
      "birlikte dolaştığını gösterir, bir bloğun neye inandığını değil.</p>" + wd + "</section>";
  }

  h += '<section class="sec"><h2>Bu olaydaki tüm haberler</h2>' +
    '<p class="sub">Yoğunluğa göre sıralı. Başlıklara tıklayınca kurumun kendi sayfası açılır.</p>' +
    '<div class="panel" style="padding:4px 18px 14px">';
  arts.forEach(function (a) { h += artRow(a); });
  h += "</div></section>";

  if (NOF(e)) {
    h += '<div class="note" style="margin-top:22px"><b>Bu olayın anlatı haritası var.</b> ' +
      "Dokuz boyutta kurumların kurduğu hikâyeler kodlandı — kim merkezde, kim sorumlu " +
      'tutuluyor, hangi çözüm meşrulaştırılıyor. <a class="lnk" href="#/anlati?n=' +
      NKEY(e) + '">Anlatı haritasında aç →</a></div>';
  }
  h += '<div class="note" style="margin-top:26px"><b>Bu küme bir adaydır.</b> Haberler ortak ' +
    "kelime dağarcığıyla eşleştirildi; aynı olayı işledikleri editoryal olarak onaylanmadı. " +
    "Yanlışlıkla bir araya gelmiş bir küme, yapılmamış bir karşılaştırmayı yapılmış gibi gösterir — " +
    'hatalı eşleşmeleri <a class="lnk" href="#/yontem">yöntem sayfasındaki</a> düzeltme yoluyla bildirin.</div>';
  h += '<p style="margin-top:22px"><a class="lnk" href="#/olaylar">← Tüm olaylar</a></p></div>';
  return h;
}

function pgSources(q) {
  var tab = tabOf(secFor("/kurumlar"), q);
  var h = '<div class="wrap page">';
  if (tab === "siralama") return h + pgRanking5(q) + "</div>";

  if (tab === "genel") {
    h += '<div class="phead"><div class="eyebrow">Genel bakış</div>' +
      "<h1>Hangi kurum ne kadar yüklü dil kullanıyor</h1>" +
      '<p class="lede">Tekil habere değil dağılıma bakan görünüm. Bir kuruma tıklayarak ' +
      "o kurumun dönem dökümüne geçebilirsiniz.</p></div>";
    h += '<section class="sec" style="margin-top:0"><h2>Kurum başına ortalama yoğunluk</h2>' +
      '<p class="sub">0–100 ölçeği, yalnızca siyasi haberler üzerinden. Düşük değer ' +
      '“yansız” demek değil; “başlık olayı yeniden çerçevelemeden bildiriyor” demektir.</p>' +
      fig("cmean", "kurum başına ortalama yoğunluk · 0–100", {
        right: scaleHTML(0, 100),
        take: "Bu sıralama bir kalite sıralaması <b>değildir</b>. Üstteki kurum daha çok " +
          "yanlış haber yapmıyor; olayı daha çok yeniden çerçeveleyen bir dil kuruyor." }) +
      "</section>";
    h += '<section class="sec"><h2>Hangi yapılar ne sıklıkta tetikleniyor</h2>' +
      '<p class="sub">Tüm bu dönemdeki haberlerde kural tabanlı tarayıcının saydığı yapılar. Adlar özgün ' +
      "İngilizceleriyle; Türkçe karşılık ve örnek Çerçeveleme bölümündedir.</p>" +
      fig("ckeys", "tüm haberlerde tetiklenme sayısı", {
        take: "Bir yapının sık görülmesi, onun en <b>etkili</b> yapı olduğu anlamına gelmez — " +
          "yalnızca kuralla saptanması en kolay olanların sık göründüğü anlamına gelir." }) +
      "</section>";
    h += '<section class="sec"><h2>Hangi kurum nerede sesini yükseltiyor</h2>' +
      '<p class="sub">Bölüm başına ortalama yoğunluk. Tek bir kurum ortalaması bunu ' +
      "tamamen gizler: bir yayın ekonomide ölçülü, dünya haberlerinde sert olabilir. " +
      "Boş hücre o bölümde haber olmadığını gösterir.</p>" +
      fig("cheat", "kurum × bölüm · ortalama yoğunluk", {
        right: scaleHTML(0, 30),
        legend: legendHTML([{c:"var(--sunk)",ring:"var(--line)",t:"o bölümde haber yok"}]),
        take: "Satır boyunca renk değişiyorsa, kurum konuya göre dil değiştiriyor demektir." }) +
      "</section>";
    h += '<section class="sec"><h2>Olaylarda ayrışma aralığı</h2>' +
      '<p class="sub">Her satır bir olaydır; nokta, o olayı veren bir kurumun yoğunluğu, ' +
      "rengi kurumun yerleşimi. Uzun çizgi, aynı olayın çok farklı dillerle kurulduğu " +
      "anlamına gelir. Satıra tıklayın.</p>" +
      fig("cspread", "olay başına en düşük–en yüksek yoğunluk", {
        legend: legendHTML([{c:"var(--left)",t:"sola yerleşik"},{c:"var(--mid)",t:"merkez"},{c:"var(--right)",t:"sağa yerleşik"}]),
        take: "Uzun çizgi, aynı olguyu bildiren başlıkların çok farklı dillerle kurulduğu " +
          "yerdir — bu sitenin bakmaya değer bulduğu şey tam olarak orada." }) +
      "</section>";
  }

  if (tab === "karsilastir") {
    var opts = LIVE.map(function (k) {
      return '<option value="' + k + '">' + esc(SRC[k] ? SRC[k].n : k) + "</option>"; }).join("");
    h += '<div class="phead"><div class="eyebrow">İkili karşılaştırma</div>' +
      "<h1>İki kurumu yan yana koyun</h1>" +
      '<p class="lede">İki kurum seçin: ikisinin de verdiği olaylarda başlıkları yan yana ' +
      "gelsin. Aynı olguyu bildiren iki cümle arasındaki farkı görmenin en doğrudan yolu budur.</p></div>";
    h += '<div class="ctl"><label class="eyebrow" for="cmpA">Kurum A</label>' +
      '<select id="cmpA">' + opts + "</select>" +
      '<label class="eyebrow" for="cmpB">Kurum B</label>' +
      '<select id="cmpB">' + opts + "</select></div>";
    h += '<div id="cmpbox"></div>';
  }

  if (tab === "liste") {
    var noData = D.S.filter(function (p) { return LIVE.indexOf(p.s) < 0; });
    h += '<div class="phead"><div class="eyebrow">Kurumlar</div>' +
      "<h1>Kim yayınlıyor, nasıl yerleşiyor</h1>" +
      '<p class="lede">Bu dönemdeki akışlarda görünen ' + LIVE.length + ' kurum, siyasi ' +
      'yerleşim sırasına göre. Yerleşim ve sahiplik bilgileri sağlanan kayıt defterinden ' +
      'gelir ve bağımsız olarak doğrulanmamıştır; haftalık sayılar bu sitenin kendi ' +
      "toplamasıdır.</p></div>";
    h += '<div class="ctl"><input type="search" id="ssearch" placeholder="Kurum ara…" style="min-width:200px">' +
      '<label class="eyebrow" for="ssort">Sırala</label><select id="ssort">' +
      '<option value="lean">Siyasi yerleşim</option><option value="n">Haber sayısı</option>' +
      '<option value="mean">Ortalama yoğunluk</option><option value="days">Gün kapsamı</option></select></div>';
    h += '<div class="scroller panel"><table id="stab"><thead><tr><th>Kurum</th>' +
      '<th>Yerleşim</th><th class="r">0–100</th><th class="r">Haber</th><th class="r">Gün</th>' +
      '<th class="r">Ort. yoğunluk</th><th>Sahiplik</th></tr></thead><tbody></tbody></table></div>';
    h += '<p style="margin-top:12px;font-size:12.5px;color:var(--muted)">Satıra tıklayarak ' +
      "kurumun dönem dökümünü açın.</p>";
    if (noData.length) {
      h += '<div class="note warn" style="margin-top:26px"><b>Kayıt defterinde olup bu dönem ' +
        "veri vermeyen " + noData.length + " kurum:</b> " +
        noData.map(function (p) { return esc(p.n); }).join(", ") +
        ". Bunlar analiz dışıdır — yayın yapmadıkları anlamına gelmez, yalnızca sendikasyon " +
        "akışlarının bu pencerede kayıt döndürmediği anlamına gelir.</div>";
    }
  }

  if (tab === "kayit") {
    h += '<div class="phead"><div class="eyebrow">Kayıt defteri</div>' +
      "<h1>Kayıtlı " + REG.length + " kurumun tamamı</h1>" +
      '<p class="lede">Kayıt defteri projeye sağlanan veridir. Ziyaretçi rakamları tarih ' +
      "taşımaz ve güncel kabul edilmemelidir; etiketler de bu sitede doğrulanmamıştır. " +
      "Son sütun, kurumun bu dönemdeki toplamaya veri verip vermediğini gösterir.</p></div>";
    h += '<div class="scroller panel"><table><thead><tr><th>Kurum</th><th>Sağlanan etiket</th>' +
      '<th class="r">Ziyaretçi (sağlanan)</th><th class="r">Bu dönem</th><th>Durum</th>' +
      "</tr></thead><tbody>" +
      REG.map(function (r) {
        var live = STAT[r.s];
        return "<tr><td>" + esc(r.n) + '</td><td style="color:var(--muted)">' + esc(r.lab || "—") + "</td>" +
          '<td class="r mono" style="font-size:12px">' + esc(r.v || "—") + "</td>" +
          '<td class="r num">' + (live ? live.n : '<span style="color:var(--muted)">—</span>') + "</td>" +
          "<td>" + (live ? '<span class="tag g">veri verdi</span>' :
            '<span class="tag">akışta kayıt yok</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  if (tab === "guven") {
    var withT = D.S.filter(function (p) { return p.risj && p.risj.trustUsed != null; })
      .sort(function (a, b) { return b.risj.trustUsed - a.risj.trustUsed; });
    h += '<div class="phead"><div class="eyebrow">Güven ve kutuplaşma</div>' +
      "<h1>Kim güveniyor, kim güvenmiyor</h1>" +
      '<p class="lede">Reuters Institute Digital News Report anket verisi. İki ayrı sayı ' +
      "var ve karıştırılmamaları önemli.</p></div>";
    h += '<div class="grid g2">' +
      '<div class="card"><h3 style="font-size:17px">Kullananlar arasında güven</h3>' +
      '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
      "Bir kurumu <b>takip edenlerin</b> ona verdiği güven puanı (0–10). Neredeyse her " +
      "kurumda yüksektir — insanlar güvenmedikleri yayını zaten okumaz. Bu yüzden tek " +
      "başına kalite göstergesi değildir.</p></div>" +
      '<div class="card"><h3 style="font-size:17px">Genel güven ile farkı</h3>' +
      '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
      "Aynı kuruma <b>herkesin</b> verdiği puanla arasındaki fark. Fark büyüdükçe kurum " +
      "kutuplaştırıcıdır: kendi okuru güvenir, dışarısı güvenmez. Kutuplaşmayı gösteren " +
      "sayı budur, güvenin kendisi değil.</p></div></div>";
    h += '<section class="sec"><h2>Güven ve kutuplaştırma, tek grafikte</h2>' +
      '<p class="sub">Her satır bir kurum. Soldaki nokta <b>herkesin</b> o kuruma verdiği ' +
      "güven, sağdaki nokta <b>kendi okurunun</b> verdiği güven. Aradaki çizginin uzunluğu " +
      "kutuplaştırma farkıdır: uzun çizgi, kurumun kendi kitlesi ile toplumun geri kalanı " +
      "arasında keskin bir ayrım oluşturduğu anlamına gelir.</p>" +
      fig("ctrust", "reuters institute · kutuplaştırma farkına göre sıralı", {
        /* The right-hand dot is coloured by the outlet's register placement,
           not by what it measures, so the legend has to say so — a blue swatch
           labelled "own readers' trust" would claim the colour encodes the
           measure when it encodes the outlet. */
        legend: legendHTML([{c:"var(--muted)",t:"herkesin verdiği güven"},
          {c:"var(--left)",t:"kendi okurunun verdiği güven — sola yerleşik kurum"},
          {c:"var(--right)",t:"…sağa yerleşik kurum"},
          {line:1,c:"var(--hot)",t:"aradaki fark = kutuplaştırma"}]),
        take: "Yüksek güven tek başına kalite göstergesi değildir — insanlar zaten " +
          "güvenmedikleri yayını okumaz. Anlamlı olan <b>fark</b>: kendi okurunun çok, " +
          "toplumun geri kalanının az güvendiği bir yayın kutuplaştırıyor demektir." }) +
      "</section>";
    var split = withT.filter(function (p) { return p.risj.left != null && p.risj.right != null; });
    if (split.length) {
      h += '<section class="sec"><h2>Sol ve sağ seçmen ayrı ayrı</h2>' +
        '<p class="sub">Ankette sol ve sağ kendini tanımlayan katılımcıların aynı kuruma ' +
        "verdiği güven. Bu " + split.length + " kurum için ayrı veri var. Bu, bu sitedeki " +
        "yerleşimlerin dışarıdan tek kontrolüdür.</p>" +
        '<div class="scroller panel"><table><thead><tr><th>Kurum</th>' +
        '<th class="r">Sol seçmen</th><th class="r">Sağ seçmen</th><th class="r">Fark</th>' +
        '<th class="r">Bu sitedeki yerleşim</th></tr></thead><tbody>' +
        split.map(function (p) {
          var d = p.risj.right - p.risj.left;
          return "<tr><td><b>" + esc(p.n) + "</b></td>" +
            '<td class="r num" style="color:var(--left)">' + p.risj.left + "</td>" +
            '<td class="r num" style="color:var(--right)">' + p.risj.right + "</td>" +
            '<td class="r num">' + (d > 0 ? "+" : "") + d.toFixed(1) + "</td>" +
            '<td class="r num">' + p.lean + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<div class="note" style="margin-top:12px">Farkın işareti yerleşimle aynı yönde ' +
        "olduğunda, bağımsız bir anket bu sitenin yerleşimini destekliyor demektir. " +
        "Örneklem küçüktür (" + split.length + " kurum); bu bir doğrulama değil, bir işarettir.</div>";
      h += "</section>";
    }
    h += '<div class="note warn" style="margin-top:24px"><b>Verinin yaşı.</b> ' +
      "Bu anket verisi Digital News Report'un Türkiye ekinden gelir ve toplandığı tarihi " +
      "taşır. Medya sahiplikleri ve kitleler o tarihten sonra değişmiş olabilir; " +
      "buradaki sayılar güncel bir ölçüm değil, tarihli bir gözlemdir.</div>";
  }
  return h + "</div>";
}

function renderSources() {
  var tb = $("#stab tbody"); if (!tb) return;
  var q = ($("#ssearch").value || "").toLocaleLowerCase("tr");
  var k = $("#ssort").value;
  var rows = LIVE.map(function (key) {
    var p = SRC[key], s = STAT[key];
    return { k: key, n: p ? p.n : key, lean: p ? p.lean : null, n1: v3haberCount(key, s.n), mean: s.mean,
      days: Object.keys(s.days).length, own: p && p.own ? p.own.grp : "" };
  }).filter(function (r) { return !q || r.n.toLocaleLowerCase("tr").indexOf(q) >= 0; });
  rows.sort(function (a, b) {
    if (k === "lean") return (a.lean == null ? 999 : a.lean) - (b.lean == null ? 999 : b.lean);
    if (k === "n") return b.n1 - a.n1;
    if (k === "mean") return (b.mean || 0) - (a.mean || 0);
    return b.days - a.days;
  });
  tb.innerHTML = rows.map(function (r) {
    return '<tr style="cursor:pointer" onclick="location.hash=\'/kurum?s=' + r.k + '\'">' +
      "<td><b>" + esc(r.n) + "</b></td>" +
      '<td style="min-width:120px"><div class="spec">' + (r.lean == null ? "" :
        '<i style="left:calc(' + r.lean + "% - 1px);background:" + lean(r.lean) + '"></i>') + "</div></td>" +
      '<td class="r num">' + (r.lean == null ? "—" : r.lean) + "</td>" +
      '<td class="r num">' + r.n1 + v3noticeBeside(r.k) + "</td><td class=\"r num\">" + r.days + "</td>" +
      '<td class="r num" style="color:' + ((r.mean || 0) >= 14 ? "var(--hot)" : "var(--ink2)") + '">' +
        (r.mean == null ? "—" : r.mean.toFixed(1)) + "</td>" +
      '<td style="color:var(--muted);font-size:12.5px">' + esc(r.own || "—") + "</td></tr>";
  }).join("");
}

function pgSourceV1(q) {
  var k = q.s, p = SRC[k], st = STAT[k];
  if (!p || !st) return '<div class="wrap page"><div class="phead"><h1>Kurum bulunamadı</h1>' +
    '<p class="lede"><a class="lnk" href="#/kurumlar">Kurum listesine dön</a></p></div></div>';
  var arts = D.A.filter(function (a) { return a.s === k; }).sort(function (x, y) { return y.v - x.v; });

  /* Fingerprint: how often this outlet reaches for a device, against how often
     the corpus does. A ratio, not a count — a big outlet triggers more of
     everything, and that says nothing about its habits. */
  var corpusRate = {}, myRate = {};
  var corpusPol = 0; D.A.forEach(function (a) { if (a.p) corpusPol++; });
  D.A.forEach(function (a) { if (a.p) a.k.forEach(function (kk) { corpusRate[kk] = (corpusRate[kk] || 0) + 1; }); });
  arts.forEach(function (a) { if (a.p) a.k.forEach(function (kk) { myRate[kk] = (myRate[kk] || 0) + 1; }); });
  var fp = Object.keys(myRate).map(function (kk) {
    var mine = myRate[kk] / Math.max(1, st.pol), all = corpusRate[kk] / Math.max(1, corpusPol);
    return { k: kk, n: myRate[kk], mine: mine, all: all, ratio: all ? mine / all : 0 };
  }).sort(function (x, y) { return y.ratio - x.ratio; });

  /* Where this outlet lands on stories it shared with others. */
  var shared = [];
  D.E.forEach(function (e) {
    if (e.s.indexOf(k) < 0) return;
    var as = e.a.map(function (i) { return ART[i]; });
    var mine = as.filter(function (a) { return a.s === k; })[0]; if (!mine) return;
    var others = as.filter(function (a) { return a.s !== k; });
    if (!others.length) return;
    var om = others.reduce(function (t, a) { return t + a.v; }, 0) / others.length;
    shared.push({ e: e, mine: mine, othersMean: om, delta: mine.v - om });
  });
  shared.sort(function (x, y) { return y.delta - x.delta; });
  var meanDelta = shared.length ?
    shared.reduce(function (t, x) { return t + x.delta; }, 0) / shared.length : null;

  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Kurum</div>' +
    "<h1>" + esc(p.n) + " bu dönemi nasıl verdi</h1>" +
    '<p class="lede">' + esc(p.note || "") + "</p></div>";

  h += '<div class="grid g3">' +
    kpi(v3haberCount(k, st.n), "haber") + kpi(Object.keys(st.days).length + "/" + (DAYS.length - 1), "gün") +
    kpi(st.mean == null ? "—" : st.mean.toFixed(1), "ortalama yoğunluk") +
    kpi(meanDelta == null ? "—" : (meanDelta > 0 ? "+" : "") + meanDelta.toFixed(1),
      "ortak olaylarda diğerlerine fark") + "</div>";

  if (meanDelta != null) {
    h += '<div class="note" style="margin-top:16px"><b>Nasıl okunur.</b> ' +
      esc(p.n) + ", aynı olayı veren diğer kurumlarla karşılaştırıldığında ortalama " +
      "<b>" + (meanDelta > 0 ? "+" : "") + meanDelta.toFixed(1) + " puan</b> " +
      (meanDelta > 1.5 ? "daha yüklü" : meanDelta < -1.5 ? "daha yalın" : "hemen hemen aynı") +
      " başlık kuruyor (" + shared.length + " ortak olay). Bu, kurumun genel ortalamasından " +
      "daha anlamlıdır: aynı olguyu bildiren başlıkları karşılaştırır, farklı haber " +
      "karışımlarını değil.</div>";
  }

  if (fp.length) {
    h += '<section class="sec"><h2>Yapı parmak izi</h2>' +
      '<p class="sub">Bu kurumun başlıklarında bir yapının görülme oranı, haber derlemesi ' +
      "ortalamasına bölünmüş hâli. <b>1.0</b> ortalama demektir; <b>2.0</b> bu kurumun o " +
      "yapıya iki kat sık başvurduğu anlamına gelir. Sayı yerine oran kullanılır, çünkü " +
      "çok haber veren kurum her şeyden daha çok tetikler.</p>" +
      fig("cfp", "bu kurum ÷ bütün haberlerin ortalaması", {
        legend: legendHTML([{dash:1,t:"1.0× — bütün haberlerin ortalaması"}]),
        take: "Kesikli çizginin <b>sağındaki</b> her çubuk, bu kurumun o yapıya haber derlemesi " +
          "ortalamasından daha sık başvurduğu anlamına gelir; solundaki, daha seyrek." }) + "</section>";
  }

  if (shared.length) {
    h += '<section class="sec"><h2>Ortak olaylarda ' + esc(p.n) +
      " ve diğerleri</h2>" +
      '<p class="sub">Bu kurumun da verdiği olaylarda, kendi başlığının yoğunluğu ile ' +
      "aynı olayı veren diğer kurumların ortalaması. Fark büyüdükçe, kurum olayı " +
      "diğerlerinden farklı kuruyor demektir.</p>" +
      '<div class="scroller panel"><table><thead><tr><th>Olay</th>' +
      '<th class="r">' + esc(p.n) + '</th><th class="r">Diğerleri (ort.)</th>' +
      '<th class="r">Fark</th></tr></thead><tbody>' +
      shared.slice(0, 12).map(function (x) {
        return '<tr style="cursor:pointer" onclick="location.hash=\'/olay?e=' + x.e.i + '\'">' +
          "<td>" + esc(storyLabel(x.e, 62)) + "</td>" +
          '<td class="r num">' + x.mine.v + "</td>" +
          '<td class="r num" style="color:var(--muted)">' + x.othersMean.toFixed(1) + "</td>" +
          '<td class="r num" style="color:' + (x.delta > 4 ? "var(--hot)" : "var(--ink2)") + '">' +
          (x.delta > 0 ? "+" : "") + x.delta.toFixed(1) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  h += '<section class="sec"><h2>En yüklü başlıkları</h2>' +
    '<p class="sub">İşaretli kelimeler kuralı tetikleyen kelimelerdir. Üzerlerine gelin ' +
    "ya da yapı adına tıklayın.</p>" +
    '<div class="panel" style="padding:4px 18px 14px" id="srcarts">' +
    arts.slice(0, 12).map(function (a) { return artRow(a, { noSrc: 1 }); }).join("") + "</div></section>";

  /* Three axes, never merged into one score. Political placement, the
     register's own alignment label, and ownership are different things that
     happen to correlate; collapsing them would be exactly the conflation the
     brief warns against. Each says where it came from. */
  h += '<section class="sec"><h2>Üç ayrı eksen</h2>' +
    '<p class="sub">Siyasi yerleşim, hükümetle hizalanma ve mülkiyet ayrı ayrı gösterilir. ' +
    "Bunlar birbirinin yerine geçmez: bir yayın sağda konumlanıp hükümete eleştirel " +
    "olabilir, bağımsız sahiplikte olup belirli bir çizgi izleyebilir. Hiçbiri " +
    "<b>habercilik güvenilirliğinin</b> ölçüsü değildir — bu site onu ölçmez.</p>" +
    '<div class="grid g3">' +
    '<div class="card"><div class="eyebrow">1 · Siyasi yerleşim</div>' +
    '<div class="spec" style="height:8px;margin:14px 0 9px"><i style="left:calc(' + p.lean +
    '% - 1px);height:16px;top:-4px"></i></div>' +
    '<div style="display:flex;justify-content:space-between;font-family:var(--ff-m);' +
    'font-size:10px;letter-spacing:.07em;color:var(--muted)"><span>SOL 0</span>' +
    "<span>50</span><span>SAĞ 100</span></div>" +
    '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Kayıt defterinden ' +
    "gelen 0–100 değeri. Bu sitenin kendi değerlendirmesi değil.</p></div>" +
    '<div class="card"><div class="eyebrow">2 · Sağlanan hizalanma etiketi</div>' +
    '<div style="font-size:19px;font-family:var(--ff-d);margin:12px 0 4px">' +
    esc(p.supp || "—") + "</div>" +
    '<p style="margin-top:8px;font-size:12.5px;color:var(--muted)">Kayıt defterinin ' +
    "kendi etiketi. Hükümete yakınlık ile ideolojik konum aynı şey değildir; bu etiket " +
    "ikisini birden taşıyabilir ve bu sitede doğrulanmamıştır.</p></div>" +
    '<div class="card"><div class="eyebrow">3 · Mülkiyet</div>' +
    '<div style="font-size:16px;font-family:var(--ff-d);margin:12px 0 4px;line-height:1.3">' +
    esc(p.own && p.own.grp ? p.own.grp : "Kayıt yok") + "</div>" +
    (p.own && p.own.bik ? '<p style="margin-top:8px;font-size:12.5px">BİK resmî ilan ' +
      "geliri: <b>" + Number(p.own.bik).toLocaleString("tr") + " TL</b></p>" : "") +
    '<p style="margin-top:8px;font-size:12.5px;color:var(--muted)">Belgelenmiş yapısal ' +
    "olgu. Mülkiyet, yayın çizgisini belirlemez — yalnızca ekonomik bağımlılığın nerede " +
    "olduğunu gösterir.</p></div></div>";
  if (p.own && p.own.bik) {
    h += '<div class="note warn" style="margin-top:14px"><b>Bu rakam nasıl okunmalı.</b> ' +
      "BİK üzerinden dağıtılan resmî ilan geliri, yayının devlet kaynaklı gelire ne " +
      "ölçüde bağlı olduğunu gösteren <b>yapısal</b> bir veridir (kaynak: Yanatma 2021, " +
      "Tablo 1). Yapısal bir koşul, tek bir haberin nasıl yazıldığını <b>açıklamaz</b>: " +
      "bu sayfadaki hiçbir başlık analizi bu rakama dayandırılmamıştır. İkisi ayrı " +
      'kanıt türüdür. <a class="lnk" href="#/yanlilik?t=turkiye">Türkiye bağlamı →</a></div>';
  }
  h += "</section>";

  h += '<section class="sec"><h2>Künye</h2><div class="grid g2">' +
    '<div class="card"><div class="eyebrow">Siyasi yerleşim</div>' +
    '<div class="spec" style="height:8px;margin:14px 0 9px"><i style="left:calc(' + p.lean +
    '% - 1px);height:16px;top:-4px"></i></div>' +
    '<div style="display:flex;justify-content:space-between;font-family:var(--ff-m);' +
    'font-size:10.5px;letter-spacing:.08em;color:var(--muted)"><span>SOL 0</span>' +
    "<span>MERKEZ 50</span><span>SAĞ 100</span></div>" +
    '<p style="margin-top:11px;font-size:13px;color:var(--ink2)">Sağlanan etiket: <b>' +
    esc(p.supp || "—") + "</b>. Kayıt defterinden gelir; bu sitenin kendi değerlendirmesi değildir.</p></div>";
  h += '<div class="card"><div class="eyebrow">Sahiplik</div>' +
    '<p style="margin-top:9px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
    (p.own ? "<b>" + esc(p.own.grp || "—") + "</b>" + (p.own.route ? "<br>" + esc(p.own.route) : "") +
      (p.own.bik ? "<br><br>BİK resmî ilan geliri: <b>" + Number(p.own.bik).toLocaleString("tr") + " TL</b>" : "") +
      (p.own.circ ? " · Tiraj: <b>" + Number(p.own.circ).toLocaleString("tr") + "</b>" : "")
      : "Kayıt yok") + "</p>" +
    (p.risj ? '<p style="margin-top:11px;font-size:13px;color:var(--muted)">Reuters ' +
      "Institute: kullananlar arasında güven " + p.risj.trustUsed + "/10" +
      (p.risj.weekly ? ", haftalık erişim %" + p.risj.weekly : "") +
      ". Anket verisidir, kalite ölçüsü değildir.</p>" : "") + "</div></div></section>";

  h += '<section class="sec"><h2>Günlük hacim</h2>' +
    '<p class="sub">Kurumun akışlarından bu pencerede kaç haber toplandığı. ' +
    "Yayın hacmi değil, <b>akışta görünen</b> hacimdir.</p>" +
    fig("sdays", "gün başına toplanan haber") + "</section>";
  h += '<p style="margin-top:22px"><a class="lnk" href="#/kurumlar">← Tüm kurumlar</a></p></div>';
  return h;
}

/* Head-to-head: only stories BOTH outlets covered, so the comparison is on the
   same facts rather than on two different news mixes. */


function kpi(v, l) {
  return '<div class="card"><div class="num" style="font-size:26px">' + (v == null ? "—" : v) + "</div>" +
    '<div class="eyebrow" style="margin-top:3px">' + l + "</div></div>";
}

/* ================================================= polarisation curve ====
   The finding a straight line could not see.
   Fitting a LINE to placement against loaded language returns almost nothing
   (r = 0.20), and the site reported that as "placement does not predict
   loudness". It is truer to say a line cannot express what is there: fit a
   curve instead and the residual variance drops from 98% to 66%, because the
   relationship is not a slope but a valley — outlets at BOTH ends write hotter
   than outlets in the middle. A straight line drawn through a valley is flat,
   which is exactly the number the linear fit produced.

   Robustness, stated because the curve is easy to over-read: the quadratic
   coefficient stays positive when any single outlet is removed (lowest 26.6 of
   40.9), so no one publication creates the shape. Its STRENGTH does lean on the
   most extreme outlet — drop Yeni Akit and R² falls from 0.34 to 0.16. The
   plain comparison underneath the curve does not depend on curve-fitting at
   all, and is the number to trust. */
var POLARFIT = {};
function polarFit(ex) { var k = String(ex); return k in POLARFIT ? POLARFIT[k] : (POLARFIT[k] = polarFitCompute(ex)); }
function polarFitCompute(ex) {
  var by = {};
  Object.keys(POLBY).forEach(function (s) { if (s !== ex) by[s] = POLBY[s]; });
  var pts = Object.keys(by).filter(function (k) {
    return by[k].length >= 20 && SRC[k] && SRC[k].lean != null; })
    .map(function (k) {
      var ar = by[k];
      return { k: k, n: SRC[k].n, x: SRC[k].lean,
        y: ar.reduce(function (t, a) { return t + a.v; }, 0) / ar.length, c: ar.length };
    });
  if (pts.length < 8) return null;
  var n = pts.length, S0 = n, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
  pts.forEach(function (p) {
    var x = p.x / 100, y = p.y;
    S1 += x; S2 += x * x; S3 += x * x * x; S4 += x * x * x * x;
    T0 += y; T1 += x * y; T2 += x * x * y;
  });
  var m = [[S4, S3, S2], [S3, S2, S1], [S2, S1, S0]], v = [T2, T1, T0];
  for (var i = 0; i < 3; i++) {
    var pv = m[i][i];
    for (var j = i + 1; j < 3; j++) {
      var f = m[j][i] / pv;
      for (var k2 = i; k2 < 3; k2++) m[j][k2] -= f * m[i][k2];
      v[j] -= f * v[i];
    }
  }
  var co = [0, 0, 0];
  for (var i2 = 2; i2 >= 0; i2--) {
    var t = v[i2];
    for (var j2 = i2 + 1; j2 < 3; j2++) t -= m[i2][j2] * co[j2];
    co[i2] = t / m[i2][i2];
  }
  var my = pts.reduce(function (t2, p) { return t2 + p.y; }, 0) / n;
  var ssT = 0, ssQ = 0;
  pts.forEach(function (p) {
    var x = p.x / 100, yh = co[0] * x * x + co[1] * x + co[2];
    ssT += Math.pow(p.y - my, 2); ssQ += Math.pow(p.y - yh, 2);
  });
  var edge = pts.filter(function (p) { return p.x < 35 || p.x > 75; });
  var mid = pts.filter(function (p) { return p.x >= 35 && p.x <= 75; });
  var mean = function (l) { return l.length ?
    l.reduce(function (t2, p) { return t2 + p.y; }, 0) / l.length : 0; };
  return { pts: pts, co: co, R2: 1 - ssQ / ssT, n: n,
    vertex: co[0] ? -co[1] / (2 * co[0]) * 100 : 50,
    edge: edge, mid: mid, edgeMean: mean(edge), midMean: mean(mid),
    fit: function (x) { var xx = x / 100; return co[0] * xx * xx + co[1] * xx + co[2]; } };
}

function polarChart() {
  var F = polarFit(); if (!F) return null;
  var w = 720, h = 420, padL = 60, padR = 40, padT = 44, padB = 64;
  var s = svg(w, h), iw = w - padL - padR, ih = h - padT - padB;
  var maxY = Math.ceil(Math.max.apply(null, F.pts.map(function (p) { return p.y; })) * 1.25 / 4) * 4;
  var X = function (v) { return padL + iw * v / 100; };
  var Y = function (v) { return padT + ih - ih * (v / maxY); };

  [0, 25, 50, 75, 100].forEach(function (v) {
    vrule(s, G4(X(v)), padT - 8, padT + ih);
    tx(s, G4(X(v)), padT + ih + 20, v, { role: "val", anchor: "middle", size: 10, fill: "var(--muted)" });
  });
  [0, maxY / 2, maxY].forEach(function (v) {
    rule(s, padL, w - padR, G4(Y(v)));
    tx(s, padL - 10, G4(Y(v)) + 4, v.toFixed(0), { role: "val", anchor: "end", size: 10, fill: "var(--muted)" });
  });
  tx(s, padL, padT + ih + 40, "sol ← siyasi yerleşim → sağ", { role: "eb", size: 9.5 });
  tx(s, 14, padT + ih / 2, "ortalama yoğunluk", { role: "eb", size: 9.5, anchor: "middle", rotate: -90 });

  /* The middle band, shaded — the region the curve says is calmest. */
  s.appendChild(mk("rect", { x: X(35), y: padT, width: X(75) - X(35), height: ih,
    fill: "var(--ink)", "fill-opacity": .028 }));
  tx(s, X(55), padT - 14, "merkez bandı — en sakin dil", { role: "eb", size: 9,
    anchor: "middle", fill: "var(--muted)" });

  var d = "";
  for (var i = 0; i <= 100; i += 2) {
    d += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(Math.max(0, F.fit(i))).toFixed(1);
  }
  s.appendChild(mk("path", { d: d, fill: "none", stroke: "var(--hot)", "stroke-width": 2,
    "stroke-dasharray": "6,4", "stroke-opacity": .9 }));

  F.pts.forEach(function (p) {
    var isEdge = p.x < 35 || p.x > 75;
    var g = dotMark(s, X(p.x), Y(p.y), isEdge ? 6.5 : 5, lean(p.x),
      { opacity: isEdge ? .32 : .2, focal: isEdge });
    g.style.cursor = "pointer";
    bindTip(g, "<span class='k'>" + esc(p.n) + "</span>Yerleşim " + p.x +
      " · ortalama yoğunluk " + p.y.toFixed(1) + " · " + p.c + " haber");
    g.addEventListener("click", function () { go("/kurum?s=" + p.k); });
  });
  return s;
}

/* ============================================== placement × loudness =====
   The chart behind finding 05. A correlation coefficient is not a reader-facing
   number, so the figure is built to make the absence of a relationship VISIBLE:
   the dashed line is the best straight line through the cloud, and it is nearly
   flat — as the eye moves from left to right along the political scale, the
   dots do not climb. Two outlets are called out by name because a concrete
   counter-example is what actually convinces: one far-right placement among the
   calmest writers, one centre placement among the loudest. */





/* ================================================================ /yonetim */
/* Review store with an audit trail. Each record keeps the ORIGINAL machine
   output alongside every reviewer action, so an approved finding and a
   machine-generated one are never confusable and a decision can be traced back.
   Client-side only: this lives in the reviewer's own browser, which is stated
   in the panel rather than implied to be a server. */
var QKEY = "cm-review-v2";
function qLoad() { try { return JSON.parse(localStorage.getItem(QKEY) || "{}"); } catch (e) { return {}; } }
function qSave(o) { try { localStorage.setItem(QKEY, JSON.stringify(o)); } catch (e) {} }
function qRecord(id, action, note) {
  var db = qLoad();
  var a = ART[id];
  var rec = db[id] || {
    original: a ? { keys: a.k.slice(), score: a.v, evidence: a.e.map(function (x) { return x.slice(); }) } : null,
    trail: [],
  };
  rec.status = action;
  rec.trail.push({ at: new Date().toISOString(), action: action, note: note || "" });
  db[id] = rec; qSave(db);
  return rec;
}


function pgAdminV1(q) {
  var tab = tabOf(ADMIN, q);
  var m = D.meta.counts;
  var bad = D.FD.filter(function (f) { return !f.ok; });
  var stale = D.FD.filter(function (f) { return f.ok && f.w === 0; });
  var h = '<div class="wrap page">';

  if (tab === "panel") {
    h += '<div class="phead"><div class="eyebrow">Panel</div>' +
      "<h1>İşletim paneli</h1>" +
      '<p class="lede">Toplama sağlığı ve inceleme durumu.</p></div>';
    h += '<div class="grid g3">' + kpi(D.FD.length, "kayıtlı akış") +
      kpi(D.FD.filter(function (f) { return f.ok && f.w > 0; }).length, "canlı akış") +
      kpi(stale.length, "terk edilmiş") + kpi(bad.length, "yanıt vermeyen") +
      kpi(D.E.length, "aday küme") + kpi(m.clustersRejected || 0, "elenen küme") +
      kpi(m.articles.toLocaleString("tr"), "haber derlemesi") +
      kpi(Object.keys(qLoad()).length, "incelenmiş kayıt") + "</div>";
    h += '<section class="sec"><h2>Bu dönem ne değişti</h2>' +
      '<div class="note"><b>Haber derlemesi.</b> ' + m.harvested.toLocaleString("tr") +
      " kayıt toplandı, " + m.duplicates + " yinelenen ve " + m.outOfWindow.toLocaleString("tr") +
      " pencere dışı kayıt elendi, " + m.articles.toLocaleString("tr") + " haber kaldı. " +
      "Tarihsiz kayıt yok: tarih taşımayan kayıt tahmin edilmez, düşürülür.</div>" +
      '<div class="note" style="margin-top:10px"><b>Kümeleme.</b> ' + D.E.length +
      " aday küme kuruldu, " + (m.clustersRejected || 0) + " aday sıkılık testinde elendi. " +
      "Test, kümedeki başlıkların başlıkların birbiriyle ne kadar kelime paylaştığına bakar: yalnızca kalıp " +
      "bir deyimi paylaşan başlıklar ayıklanır.</div>";
    h += "</section>";
  }

  if (tab === "inceleme") {
    h += '<div class="phead"><div class="eyebrow">İnceleme kuyruğu</div>' +
      "<h1>Kural tetiklemesi kanıt değildir</h1>" +
      '<p class="lede">Kural bir yapıyı işaretlediğinde, bu bir insanın bakması gereken yer ' +
      "demektir — verilmiş bir karar değil. Buradan onaylayın, işaretleyin ya da reddedin. " +
      "Kararlar bu tarayıcıda saklanır ve veri setine yazılmaz.</p></div>";
    h += '<div class="ctl">' +
      '<input type="search" id="qsearch" placeholder="Başlık veya kurum ara…" style="min-width:220px">' +
      '<select id="qstat"><option value="all">Tüm kayıtlar</option>' +
      '<option value="pending">Bekleyen</option><option value="approved">Onaylanan</option>' +
      '<option value="flagged">İşaretlenen</option><option value="rejected">Reddedilen</option></select>' +
      '<select id="qpri"><option value="all">Tüm öncelikler</option>' +
      '<option value="high">Yüksek (45+)</option><option value="med">Orta (25–44)</option>' +
      '<option value="low">Düşük (&lt;25)</option></select>' +
      '<span id="qcount" style="font-size:12.5px;color:var(--muted)"></span></div>';
    h += '<div class="panel" style="padding:2px 18px 14px" id="qlist"></div>';
  }

  if (tab === "saglik") {
    h += '<div class="phead"><div class="eyebrow">Akış sağlığı</div>' +
      "<h1>Müdahale gereken akışlar</h1>" +
      '<p class="lede">Yanıt vermeyen ve terk edilmiş akışlar. Terk edilmiş bir akış sessizce ' +
      "başarısız olur: istek başarılı döner, içerik eskidir. Kapsamayı en çok bozan sorun budur.</p></div>";
    h += '<div class="scroller panel"><table><thead><tr><th>Kurum</th><th>Akış</th>' +
      "<th>Son kayıt</th><th>Sorun</th></tr></thead><tbody>" +
      bad.concat(stale).map(function (f) {
        return "<tr><td>" + esc(SRC[f.s] ? SRC[f.s].n : f.s) + "</td>" +
          '<td class="mono" style="font-size:11.5px;color:var(--muted);max-width:360px;overflow-wrap:anywhere">' +
          esc(f.u || "—") + "</td>" +
          '<td class="mono" style="font-size:12px">' + esc(f.l || "—") + "</td>" +
          "<td>" + (f.ok ? '<span class="tag b">pencerede kayıt yok</span>' :
            '<span class="tag">' + esc(f.e || "yanıt yok") + "</span>") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  return h + "</div>";
}

function renderQueue() {
  var box = $("#qlist"); if (!box) return;
  var st = qLoad();
  var qs = (($("#qsearch") && $("#qsearch").value) || "").toLocaleLowerCase("tr");
  var fs = $("#qstat") ? $("#qstat").value : "all";
  var fp = $("#qpri") ? $("#qpri").value : "all";
  var list = D.A.filter(function (a) { return a.k.length; })
    .sort(function (a, b) { return b.v - a.v; })
    .filter(function (a) {
      var pri = a.v >= 45 ? "high" : a.v >= 25 ? "med" : "low";
      if (fp !== "all" && fp !== pri) return false;
      var s2 = (st[a.i] && st[a.i].status) || "pending";
      if (fs !== "all" && fs !== s2) return false;
      if (qs) {
        var nm = (SRC[a.s] ? SRC[a.s].n : a.s).toLocaleLowerCase("tr");
        if (a.t.toLocaleLowerCase("tr").indexOf(qs) < 0 && nm.indexOf(qs) < 0) return false;
      }
      return true;
    });
  var cnt = $("#qcount");
  if (cnt) {
    var decided = Object.keys(st).filter(function (k) {
      return st[k].status && st[k].status !== "pending"; }).length;
    var acts = Object.keys(st).reduce(function (t, k) {
      return t + ((st[k].trail || []).length); }, 0);
    cnt.textContent = list.length + " kayıt · " + decided + " karara bağlandı · " +
      acts + " denetim kaydı";
  }
  box.innerHTML = list.slice(0, 120).map(function (a) {
    var rec = st[a.i], cur = rec ? rec.status : "pending";
    var pri = a.v >= 45 ? "var(--hot)" : a.v >= 25 ? "var(--seq3)" : "var(--line2)";
    return '<div class="rq" data-id="' + a.i + '">' +
      '<div style="display:flex;gap:11px"><span class="pri" style="background:' + pri + '"></span>' +
      "<div>" + artRow(a).replace('<div class="artrow">', '<div class="artrow" style="border-top:0;padding-top:0">') +
      '<div style="font-size:12px;color:var(--muted);margin-top:6px">' +
      a.e.map(function (x) {
        return esc(BIA[x[0]] ? BIA[x[0]].en : x[0]) + " → “" + esc(x[1]) + "”"; }).join(" · ") +
      "</div>" +
      '<div style="margin-top:7px;font-size:11.5px;color:var(--muted)">' +
      '<span class="tag' + (cur === "pending" ? "" : " g") + '">' +
      (cur === "pending" ? "makine çıktısı — incelenmedi" : "incelendi: " + esc(cur)) + "</span>" +
      (rec && rec.trail && rec.trail.length ?
        ' <span class="mono">' + rec.trail.length + " işlem · son: " +
        esc(rec.trail[rec.trail.length - 1].at.slice(0, 16).replace("T", " ")) + "</span>" : "") +
      "</div></div></div>" +
      '<div class="rq-acts">' +
      ["approved:Onayla", "flagged:İşaretle", "rejected:Reddet"].map(function (o) {
        var k = o.split(":")[0];
        return '<button class="rq-b" data-act="' + k + '" data-on="' + (cur === k ? "1" : "0") + '">' +
          o.split(":")[1] + "</button>"; }).join("") + "</div></div>";
  }).join("") || '<div class="note" style="margin:14px 0">Bu filtrelerle eşleşen kayıt yok.</div>';

  [].forEach.call(box.querySelectorAll(".rq-b"), function (b) {
    b.onclick = function () {
      var id = b.closest(".rq").getAttribute("data-id");
      var act = b.getAttribute("data-act");
      var db = qLoad();
      if (db[id] && db[id].status === act) {
        /* Undo is itself an event in the trail, not an erasure of one. */
        qRecord(id, "pending", "önceki karar geri alındı");
      } else {
        qRecord(id, act, "");
      }
      renderQueue();
    };
  });
}


/* ======================================================= political map ==
   Entity shape encodes KIND (party / print / tv / online) and position encodes
   placement on the chosen axis pair. Shape carries identity so the chart never
   depends on colour alone, and every point is labelled directly — the earlier
   version made you hover to learn who a dot was, which is unusable on a chart
   this dense. */

var MAPFILTER = { party: 1, print: 1, tv: 1, online: 1 };


/* ==================================================== parallel coords ==
   Six axes at once. A scatter shows two, so an outlet that sits mid-scale on
   one pair and at an extreme on another reads as moderate; the parallel plot
   is what makes that visible. */
var PCAX = [["eco", "Ekonomik"], ["soc", "Toplumsal"], ["sec", "Laik–dindar"],
            ["st", "Devlet rolü"], ["nat", "Milliyetçi–çoğulcu"], ["cul", "Gelenek–kozmopolit"]];
function parallelCoords() {
  var w = 880, h = 420, padL = 58, padR = 58, padT = 46, padB = 50;
  var s = svg(w, h), iw = w - padL - padR, ih = h - padT - padB;
  var ax = function (i) { return padL + iw * i / (PCAX.length - 1); };
  var Y = function (v) { return padT + ih - ih * v / 100; };
  PCAX.forEach(function (a, i) {
    s.appendChild(mk("line", { x1: ax(i), x2: ax(i), y1: padT, y2: padT + ih,
      stroke: "var(--line2)", "stroke-width": 1 }));
    var t = mk("text", { x: ax(i), y: padT - 18, "text-anchor": "middle", fill: "var(--ink2)",
      "font-size": 10, "font-family": "var(--ff-m)", "letter-spacing": ".05em" });
    t.textContent = a[1].toLocaleUpperCase("tr"); s.appendChild(t);
  });
  [0, 50, 100].forEach(function (v) {
    var g = mk("text", { x: padL - 10, y: Y(v) + 3.5, "text-anchor": "end", fill: "var(--muted)",
      "font-size": 10, "font-family": "var(--ff-m)" });
    g.textContent = v; s.appendChild(g);
  });
  var lines = [];
  D.S.forEach(function (m) {
    var ok = PCAX.every(function (a) { return m[a[0]] != null; });
    if (!ok) return;
    var pts = PCAX.map(function (a, i) { return ax(i) + "," + Y(m[a[0]]); }).join(" ");
    var pl = mk("polyline", { points: pts, class: "pc-line", stroke: lean(m.lean),
      "stroke-opacity": ".55" });
    bindTip(pl, "<span class='k'>" + esc(m.n) + "</span>" +
      PCAX.map(function (a) { return a[1] + " " + m[a[0]]; }).join(" · "));
    pl.addEventListener("pointerenter", function () {
      lines.forEach(function (o) { if (o !== pl) o.classList.add("dim"); });
      pl.setAttribute("stroke-opacity", "1");
    });
    pl.addEventListener("pointerleave", function () {
      lines.forEach(function (o) { o.classList.remove("dim"); });
      pl.setAttribute("stroke-opacity", ".55");
    });
    pl.addEventListener("click", function () { go("/kurum?s=" + m.s); });
    pl.style.cursor = "pointer";
    lines.push(pl); s.appendChild(pl);
  });
  var lg = mk("text", { x: padL, y: h - 14, fill: "var(--muted)", "font-size": 10.5 });
  lg.textContent = "Her çizgi bir kurum · rengi kayıt defterindeki yerleşimi · üzerine gelin";
  s.appendChild(lg);
  return s;
}

/* Headline rules (RULEDEF, runRules, runScore): see shared/analysis/rules.cjs, inlined with BANDS. */

/* ========================================================== atlas =========
   Three ways into the same six-dimensional table, because no single view
   answers all three questions a reader has: where does an outlet sit, what is
   its whole profile, and who is it actually near. */
var ATL = { view: "scatter", x: "eco", y: "soc", color: "lean", size: "flat",
  q: "", parties: true, sources: true, sel: null, focus: null };
var AXES6 = [["eco", "Ekonomik", "sol", "sağ"], ["soc", "Toplumsal", "muhafazakâr", "liberal"],
  ["sec", "Laik–dindar", "laik", "dindar"], ["st", "Devlet rolü", "sınırlı", "güçlü"],
  ["nat", "Milliyetçi–çoğulcu", "milliyetçi", "çoğulcu"],
  ["cul", "Gelenek–kozmopolit", "gelenekçi", "kozmopolit"]];

function atlasEntities() {
  var out = [];
  if (ATL.sources) D.S.forEach(function (m) {
    out.push({ id: m.s, n: m.n, kind: m.t === "tv" ? "tv" : m.t === "online" ? "online" : "print",
      lean: m.lean, note: m.note, risj: m.risj, own: m.own, eco: m.eco, soc: m.soc,
      sec: m.sec, st: m.st, nat: m.nat, cul: m.cul, isSrc: 1 });
  });
  if (ATL.parties) D.P.forEach(function (p) {
    out.push({ id: "p_" + p.s, n: p.n, kind: "party", lean: p.lean, note: p.note,
      eco: p.eco, soc: p.soc, sec: p.sec, st: p.st, nat: p.nat, cul: p.cul });
  });
  return out.filter(function (e) {
    return AXES6.every(function (a) { return e[a[0]] != null; }) &&
      (!ATL.q || e.n.toLocaleLowerCase("tr").indexOf(ATL.q.toLocaleLowerCase("tr")) >= 0);
  });
}
function atlasColor(e) {
  if (ATL.color === "type") return e.kind === "party" ? "var(--mid)" :
    e.kind === "tv" ? "var(--seq4)" : e.kind === "online" ? "var(--seq2)" : "var(--seq3)";
  if (ATL.color === "trust") {
    if (!e.risj || e.risj.trustUsed == null) return "var(--line2)";
    return seq((e.risj.trustUsed - 4) / 4 * 100);
  }
  if (ATL.color === "capture") {
    if (!e.own || !e.own.bik) return "var(--line2)";
    return seq(Math.min(100, e.own.bik / 60000));
  }
  return lean(e.lean);
}
function atlasRadius(e) {
  if (ATL.size === "flat" || e.kind === "party") return 6;
  if (ATL.size === "trust") return e.risj && e.risj.trustUsed != null ?
    4 + (e.risj.trustUsed - 4) * 2.2 : 4;
  if (ATL.size === "polar") return e.risj && e.risj.gapUsed != null ?
    4 + e.risj.gapUsed * 3.4 : 4;
  var st2 = STAT[e.id];
  return st2 ? 4 + Math.sqrt(st2.n) * .7 : 4;
}

/** View 1 — any two of the six axes. */
function atlasScatter() {
  var ax = AXES6.filter(function (a) { return a[0] === ATL.x; })[0] || AXES6[0];
  var ay = AXES6.filter(function (a) { return a[0] === ATL.y; })[0] || AXES6[1];
  var w = 880, h = 620, pad = 72;
  var s = svg(w, h), iw = w - pad * 2, ih = h - pad * 2;
  var X = function (v) { return pad + iw * v / 100; };
  var Y = function (v) { return pad + ih - ih * v / 100; };

  s.appendChild(mk("rect", { x: pad, y: pad, width: iw, height: ih, fill: "var(--sunk)",
    stroke: "var(--line)", "stroke-width": 1, rx: 4 }));
  [25, 50, 75].forEach(function (v) {
    vrule(s, X(v), pad, pad + ih, v === 50);
    rule(s, pad, pad + iw, Y(v), v === 50);
  });
  tx(s, pad, pad + ih + 28, ax[2], { role: "eb", size: 9.5 });
  tx(s, pad + iw, pad + ih + 28, ax[3], { role: "eb", size: 9.5, anchor: "end" });
  tx(s, pad + iw / 2, pad + ih + 46, ax[1], { role: "eb", size: 10, anchor: "middle", fill: "var(--ink2)" });
  tx(s, 24, pad + ih, ay[2], { role: "eb", size: 9.5, anchor: "start", rotate: -90 });
  tx(s, 24, pad + 4, ay[3], { role: "eb", size: 9.5, anchor: "end", rotate: -90 });
  tx(s, 42, pad + ih / 2, ay[1], { role: "eb", size: 10, anchor: "middle", rotate: -90, fill: "var(--ink2)" });

  var taken = [];
  atlasEntities().forEach(function (e) {
    var x = X(e[ATL.x]), y = Y(e[ATL.y]), r = atlasRadius(e);
    var g = mk("g", { style: "cursor:pointer" });
    if (e.kind === "party") {
      g.appendChild(mk("rect", { x: x - r, y: y - r, width: r * 2, height: r * 2,
        transform: "rotate(45 " + x + " " + y + ")", fill: "var(--surface)" }));
      g.appendChild(mk("rect", { x: x - r, y: y - r, width: r * 2, height: r * 2,
        transform: "rotate(45 " + x + " " + y + ")", fill: atlasColor(e),
        "fill-opacity": .3, stroke: atlasColor(e), "stroke-width": 1.2 }));
    } else {
      g.appendChild(mk("circle", { cx: x, cy: y, r: r, fill: "var(--surface)" }));
      g.appendChild(mk("circle", { cx: x, cy: y, r: r, fill: atlasColor(e),
        "fill-opacity": .28, stroke: atlasColor(e), "stroke-width": 1 }));
    }
    /* Labels slide to the first free slot so names stay readable without hover. */
    var wEst = e.n.length * 5.2, cands = [y - r - 6, y + r + 13, y - r - 18, y + r + 25];
    var ly = cands[0];
    for (var ci = 0; ci < cands.length; ci++) {
      var cy = cands[ci];
      if (!taken.some(function (t) {
        return Math.abs(t[1] - cy) < 11 && Math.abs(t[0] - x) < (t[2] + wEst) / 2 + 6; })) {
        ly = cy; break;
      }
    }
    taken.push([x, ly, wEst]);
    tx(g, x, ly, e.n, { anchor: "middle", size: 10.5, halo: 3,
      weight: e.kind === "party" ? 600 : 400,
      fill: e.kind === "party" ? "var(--ink)" : "var(--ink2)" });
    bindTip(g, "<span class='k'>" + esc(e.n) + "</span>" +
      esc(ax[1]) + " " + e[ATL.x] + " · " + esc(ay[1]) + " " + e[ATL.y] +
      (e.note ? "<br><br>" + esc(e.note) : ""));
    g.addEventListener("click", function () { ATL.sel = e.id; renderAtlas(); });
    s.appendChild(g);
  });
  return s;
}

/** View 2 — all six axes at once.
    The previous version drew 26 lines at one opacity and left the reader to
    find a pattern in a thicket. Three changes make it readable: outlets are
    bundled into blocs with a median line per bloc drawn thick and the members
    faint behind it, so the SHAPE of each bloc is the primary mark; axes are
    ordered so that neighbouring axes are the most correlated pair available,
    which is the standard fix for parallel-coordinate crossing; and hovering an
    outlet lifts it out of its bundle. */
function atlasParallel() {
  var ents = atlasEntities().filter(function (e) { return e.isSrc; });
  if (!ents.length) return svg(10, 10);
  /* Order axes by correlation so lines cross as little as possible. */
  var order = AXES6.slice();
  var corr = function (a, b) {
    var n = ents.length, ma = 0, mb = 0;
    ents.forEach(function (e) { ma += e[a]; mb += e[b]; });
    ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    ents.forEach(function (e) {
      num += (e[a] - ma) * (e[b] - mb);
      da += Math.pow(e[a] - ma, 2); db += Math.pow(e[b] - mb, 2);
    });
    return da && db ? num / Math.sqrt(da * db) : 0;
  };
  var used = [order.shift()], rest = order;
  while (rest.length) {
    var last = used[used.length - 1], best = 0, bi = 0;
    rest.forEach(function (a, i) {
      var c = Math.abs(corr(last[0], a[0]));
      if (c > best) { best = c; bi = i; }
    });
    used.push(rest.splice(bi, 1)[0]);
  }
  var AX = used;

  var w = 880, h = 480, padL = 76, padR = 76, padT = 62, padB = 72;
  var s = svg(w, h), iw = w - padL - padR, ih = h - padT - padB;
  var ax = function (i) { return padL + iw * i / (AX.length - 1); };
  var Y = function (v) { return padT + ih - ih * v / 100; };

  AX.forEach(function (a, i) {
    vrule(s, ax(i), padT, padT + ih, true);
    tx(s, ax(i), padT - 26, a[1], { role: "eb", size: 9, anchor: "middle", fill: "var(--ink2)" });
    tx(s, ax(i), padT - 12, a[3], { role: "eb", size: 8, anchor: "middle" });
    tx(s, ax(i), padT + ih + 16, a[2], { role: "eb", size: 8, anchor: "middle" });
  });
  [0, 50, 100].forEach(function (v) {
    tx(s, padL - 12, Y(v) + 4, v, { role: "val", anchor: "end", size: 10, fill: "var(--muted)" });
  });

  var BL = [["left", "var(--left)", "sola yerleşik"], ["mid", "var(--mid)", "merkez"],
    ["right", "var(--right)", "sağa yerleşik"]];
  var groups = { left: [], mid: [], right: [] };
  ents.forEach(function (e) { groups[bloc(e.id)] && groups[bloc(e.id)].push(e); });

  /* Members first, faint. */
  var lines = [];
  ents.forEach(function (e) {
    var pts = AX.map(function (a, i) { return ax(i) + "," + Y(e[a[0]]); }).join(" ");
    var pl = mk("polyline", { points: pts, fill: "none", stroke: lean(e.lean),
      "stroke-width": 1.2, "stroke-opacity": .22, style: "cursor:pointer" });
    bindTip(pl, "<span class='k'>" + esc(e.n) + "</span>" +
      AX.map(function (a) { return a[1] + " " + e[a[0]]; }).join(" · "));
    pl.addEventListener("pointerenter", function () {
      lines.forEach(function (o) { o.setAttribute("stroke-opacity", ".06"); });
      pl.setAttribute("stroke-opacity", "1"); pl.setAttribute("stroke-width", "2.5");
    });
    pl.addEventListener("pointerleave", function () {
      lines.forEach(function (o) { o.setAttribute("stroke-opacity", ".22"); });
      pl.setAttribute("stroke-width", "1.2");
    });
    pl.addEventListener("click", function () { ATL.sel = e.id; renderAtlas(); });
    lines.push(pl); s.appendChild(pl);
  });

  /* An outlet sitting at ~50 on all six axes has not been placed, it has been
     defaulted. Three of the four centre-bloc outlets here are aggregators coded
     50 across the board, which would draw a perfectly flat "centre profile"
     that measures a filing convention rather than a centrist editorial line.
     The line is still drawn — hiding it would be its own distortion — but
     dashed, and the caption says what it is. */
  var unplaced = function (e) {
    return AXES6.every(function (a) { return e[a[0]] >= 48 && e[a[0]] <= 52; }); };
  var defaulted = {};
  BL.forEach(function (b) {
    var g = groups[b[0]] || [];
    defaulted[b[0]] = g.length && g.filter(unplaced).length / g.length >= .5;
  });

  /* Bloc medians on top — the shape a reader is meant to come away with. */
  BL.forEach(function (b) {
    var g = groups[b[0]]; if (g.length < 2) return;
    var pts = AX.map(function (a, i) {
      var vals = g.map(function (e) { return e[a[0]]; }).sort(function (x, y) { return x - y; });
      var med = vals[Math.floor(vals.length / 2)];
      return ax(i) + "," + Y(med);
    }).join(" ");
    s.appendChild(mk("polyline", { points: pts, fill: "none", stroke: "var(--surface)",
      "stroke-width": 6, "stroke-linejoin": "round" }));
    var at = { points: pts, fill: "none", stroke: b[1], "stroke-width": 3,
      "stroke-linejoin": "round" };
    if (defaulted[b[0]]) { at["stroke-dasharray"] = "7,5"; at["stroke-opacity"] = ".75"; }
    s.appendChild(mk("polyline", at));
  });
  s.__defaulted = BL.filter(function (b) { return defaulted[b[0]]; })
    .map(function (b) { return b[2]; });
  return s;
}

/** View 3 — who is actually near whom, in all six dimensions at once. */
function atlasNeighbours() {
  var ents = atlasEntities();
  var pairs = [];
  for (var i = 0; i < ents.length; i++) {
    for (var j = i + 1; j < ents.length; j++) {
      var d = 0;
      AXES6.forEach(function (a) { d += Math.pow(ents[i][a[0]] - ents[j][a[0]], 2); });
      pairs.push({ a: ents[i], b: ents[j], d: Math.sqrt(d) });
    }
  }
  pairs.sort(function (x, y) { return x.d - y.d; });
  var near = pairs.slice(0, 14);
  /* The interesting ones: close in six dimensions, far apart on the one axis
     the register publishes. */
  var surprising = pairs.slice(0, 90).filter(function (p) {
    return Math.abs(p.a.lean - p.b.lean) >= 25; }).slice(0, 6);

  var row = function (p) {
    return '<div style="display:grid;grid-template-columns:1fr auto 1fr 92px;gap:12px;' +
      'align-items:center;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px">' +
      '<span style="text-align:right"><b>' + esc(p.a.n) + "</b>" +
      '<span class="mono" style="color:' + lean(p.a.lean) + ';margin-left:7px">' + p.a.lean + "</span></span>" +
      '<span style="color:var(--muted)">↔</span>' +
      "<span><b>" + esc(p.b.n) + "</b>" +
      '<span class="mono" style="color:' + lean(p.b.lean) + ';margin-left:7px">' + p.b.lean + "</span></span>" +
      '<span class="mono" style="text-align:right;color:var(--ink2)">' + p.d.toFixed(1) + "</span></div>";
  };
  return '<div class="grid g2" style="gap:26px"><div>' +
    '<div class="eyebrow">Altı boyutta en yakın çiftler</div>' +
    '<p style="font-size:12.5px;color:var(--muted);margin:8px 0 12px">Sayı, altı eksende ' +
    "aradaki toplam mesafedir — küçük değer benzer profil demektir.</p>" +
    near.map(row).join("") + "</div><div>" +
    '<div class="eyebrow">Profili yakın, yerleşimi uzak</div>' +
    '<p style="font-size:12.5px;color:var(--muted);margin:8px 0 12px">Altı boyutta ' +
    "komşu ama sol–sağ ekseninde en az 25 puan ayrı duran çiftler. Tek eksenli bir " +
    "haritanın gizlediği tam olarak bunlardır.</p>" +
    (surprising.length ? surprising.map(row).join("") :
      '<p style="color:var(--muted);font-size:13px">Bu filtrede çift yok.</p>') +
    "</div></div>";
}

/* ================================================================ /harita */
function pgMap(q) {
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Harita ve görseller</div>' +
    "<h1>Çok boyutlu kurum atlası</h1>" +
    '<p class="lede">Tek bir sol–sağ çizgisi Türkiye siyasetini taşımaz: laiklik ile devlet ' +
    "rolü, ya da milliyetçilik ile kültürel açıklık, birbirinden bağımsız hareket eder. " +
    "Aynı kurumlar burada <b>altı ayrı boyutta</b> duruyor — istediğiniz iki ekseni seçin, " +
    "hepsini aynı anda görün, ya da altı boyutlu uzayda gerçekten kimin kime komşu " +
    "olduğunu ölçün.</p></div>";
  h += '<div id="atlBar"></div><div id="atlBody"></div><div id="atlSel"></div>';
  h += '<div class="note" style="margin-top:22px"><b>Parti yerleşimleri</b> ideolojik ' +
    "tanımlardan türetilmiştir, oy davranışından değil. <b>Yayın yerleşimleri</b> sağlanan " +
    "kayıt defterinden gelir. İkisi ayrı kaynaklardır ve bu sitede bağımsız olarak " +
    "doğrulanmamıştır. Bir yayının bir partiye yakın düşmesi, ona ait olduğunu ya da " +
    "onun sözcülüğünü yaptığını göstermez — yalnızca iki ayrı kaynağın onları aynı " +
    "eksen çiftinde benzer yerlere koyduğunu gösterir.</div>";
  return h + "</div>";
}

function renderAtlas() {
  var bar = $("#atlBar"); if (!bar) return;
  var views = [["scatter", "İki eksen"], ["parallel", "Tüm boyutlar"], ["neighbours", "Yakınlık"]];
  var sel = function (id, label, opts, cur) {
    return '<label class="eyebrow" for="' + id + '">' + esc(label) + "</label>" +
      '<select id="' + id + '">' + opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (cur === o[0] ? " selected" : "") + ">" +
          esc(o[1]) + "</option>"; }).join("") + "</select>";
  };
  var axOpts = AXES6.map(function (a) { return [a[0], a[1]]; });
  bar.innerHTML = '<div class="subrow" style="border-bottom:1px solid var(--line);margin-bottom:18px">' +
    views.map(function (v) {
      return '<button class="subtab' + (ATL.view === v[0] ? " on" : "") +
        '" data-av="' + v[0] + '" style="background:none;border:0;border-bottom:2px solid ' +
        (ATL.view === v[0] ? "var(--ink)" : "transparent") + ';cursor:pointer">' +
        esc(v[1]) + "</button>"; }).join("") + "</div>" +
    '<div class="ctl">' +
    (ATL.view === "scatter" ? sel("axX", "Yatay", axOpts, ATL.x) + sel("axY", "Dikey", axOpts, ATL.y) +
      '<button class="chip" id="axSwap" title="Eksenleri değiştir">⇄</button>' : "") +
    (ATL.view !== "neighbours" ? sel("axC", "Renk", [["lean", "Siyasi yerleşim"],
      ["type", "Yayın türü"], ["trust", "Güven (RISJ)"], ["capture", "Devlet reklamı"]], ATL.color) : "") +
    (ATL.view === "scatter" ? sel("axS", "Boyut", [["flat", "Sabit"], ["visitors", "Haber sayısı"],
      ["trust", "Güven"], ["polar", "Kutuplaştırma"]], ATL.size) : "") +
    '<input type="search" id="atQ" placeholder="Kurum ara…" style="min-width:170px" value="' +
    esc(ATL.q) + '">' +
    '<span style="display:inline-flex;gap:4px;margin-left:auto">' +
    '<button class="chip" id="atP" aria-pressed="' + ATL.parties + '">Partiler</button>' +
    '<button class="chip" id="atS" aria-pressed="' + ATL.sources + '">Yayınlar</button></span>' +
    "</div>";

  [].forEach.call(bar.querySelectorAll("[data-av]"), function (b) {
    b.onclick = function () { ATL.view = b.getAttribute("data-av"); renderAtlas(); };
  });
  ["axX", "axY", "axC", "axS"].forEach(function (id) {
    var e = document.getElementById(id); if (!e) return;
    e.onchange = function () {
      ATL[{ axX: "x", axY: "y", axC: "color", axS: "size" }[id]] = e.value; renderAtlas();
    };
  });
  var sw = document.getElementById("axSwap");
  if (sw) sw.onclick = function () { var t = ATL.x; ATL.x = ATL.y; ATL.y = t; renderAtlas(); };
  var tp = document.getElementById("atP");
  if (tp) tp.onclick = function () { ATL.parties = !ATL.parties; renderAtlas(); };
  var ts = document.getElementById("atS");
  if (ts) ts.onclick = function () { ATL.sources = !ATL.sources; renderAtlas(); };
  var qq = document.getElementById("atQ");
  if (qq) qq.oninput = function () { ATL.q = qq.value; paintAtlas(); };
  paintAtlas();
}

function paintAtlas() {
  var box = $("#atlBody"); if (!box) return;
  var legend = ATL.view === "neighbours" ? "" :
    ATL.color === "lean" ? legendHTML([{ c: "var(--left)", t: "sola yerleşik" },
      { c: "var(--mid)", t: "merkez" }, { c: "var(--right)", t: "sağa yerleşik" },
      { c: "var(--mid)", t: "eşkenar dörtgen = siyasi parti" }]) :
    ATL.color === "type" ? legendHTML([{ c: "var(--seq3)", t: "basılı" },
      { c: "var(--seq4)", t: "televizyon" }, { c: "var(--seq2)", t: "çevrimiçi" },
      { c: "var(--mid)", t: "parti" }]) :
    ATL.color === "trust" ? '<div class="fig-legend"><span class="lb">Açıklama</span>' +
      scaleHTML("düşük güven", "yüksek") +
      '<span class="k"><em style="background:var(--line2)"></em>veri yok</span></div>' :
      '<div class="fig-legend"><span class="lb">Açıklama</span>' +
      scaleHTML("az", "çok devlet reklamı") +
      '<span class="k"><em style="background:var(--line2)"></em>basılı değil / kayıt yok</span></div>';

  var take = ATL.view === "scatter" ?
    "İki eksen seçtiğinizde geri kalan dört boyut görünmez olur — bir kurumun bu " +
    "düzlemde merkezde durması, her boyutta merkezde olduğu anlamına gelmez. " +
    "<b>Tüm boyutlar</b> görünümü tam da bunu gösterir." :
    ATL.view === "parallel" ?
    "Kalın çizgiler her bloğun <b>ortanca</b> profilidir; ince çizgiler tek tek " +
    "kurumlar. Eksenler, yan yana duran çiftler en çok birlikte hareket edecek " +
    "şekilde sıralandı — bu, çizgilerin gereksiz yere kesişmesini önler. Bir " +
    "kurumun üzerine gelin, kendi çizgisi öne çıkar. <b>Kesikli bir ortanca " +
    "çizgi</b>, o bloğun kurumlarının çoğunun kayıt defterinde her eksende 50 " +
    "olarak kaydedildiği anlamına gelir: bu bir merkez ölçümü değil, " +
    "<b>yerleştirilmemiş</b> demektir — üç toplayıcı portal (Mynet, En Son " +
    "Haber, Haberler.com) altı eksenin hepsinde 50 taşıyor." :
    "Yakınlık altı boyutun tamamında ölçülür. Sağdaki liste, tek eksenli bir " +
    "haritanın uzak gösterdiği ama profili gerçekte benzeyen çiftleri verir.";

  box.innerHTML = ATL.view === "neighbours" ?
    '<div class="fig"><div class="fig-eb"><span>altı boyutlu yakınlık</span></div>' +
    '<div id="atlIn"></div><div class="fig-take">' + take + "</div></div>" :
    '<div class="fig"><div class="fig-eb"><span>' +
    (ATL.view === "scatter" ? "seçilen iki eksen" : "altı eksen · bloğa göre demetlenmiş") +
    "</span></div>" + '<div class="fig-body" id="atlIn"></div>' + legend +
    '<div class="fig-take">' + take + "</div></div>";

  var host = $("#atlIn");
  if (ATL.view === "neighbours") host.innerHTML = atlasNeighbours();
  else host.appendChild(ATL.view === "parallel" ? atlasParallel() : atlasScatter());
  paintAtlasSel();
}

function paintAtlasSel() {
  var box = $("#atlSel"); if (!box) return;
  if (!ATL.sel) { box.innerHTML = ""; return; }
  var e = atlasEntities().filter(function (x) { return x.id === ATL.sel; })[0];
  if (!e) { box.innerHTML = ""; return; }
  var st2 = STAT[e.id];
  var h = '<div class="card" style="margin-top:20px;border-left:3px solid ' + atlasColor(e) + '">' +
    '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">' +
    '<h3 style="font-size:22px">' + esc(e.n) + "</h3>" +
    '<span class="tag">' + (e.kind === "party" ? "siyasi parti" :
      e.kind === "tv" ? "televizyon" : e.kind === "online" ? "çevrimiçi" : "basılı") + "</span></div>" +
    (e.note ? '<p style="font-size:13.5px;color:var(--ink2);margin:10px 0 16px;line-height:1.6">' +
      esc(e.note) + "</p>" : "") +
    '<div style="display:flex;flex-direction:column;gap:9px">' +
    AXES6.map(function (a) {
      return '<div style="display:grid;grid-template-columns:150px 1fr 34px;gap:12px;' +
        'align-items:center;font-size:12.5px">' +
        '<span style="color:var(--ink2)">' + esc(a[1]) + "</span>" +
        '<span class="spec" style="height:6px"><i style="left:calc(' + e[a[0]] +
        '% - 1px);height:14px;top:-4px"></i></span>' +
        '<span class="num" style="text-align:right">' + e[a[0]] + "</span></div>";
    }).join("") + "</div>";
  if (st2) {
    h += '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);' +
      'font-size:13px;color:var(--ink2)">Bu dönemdeki toplamada <b>' + st2.n +
      "</b> haber, ortalama yoğunluk <b>" + (st2.mean == null ? "—" : st2.mean.toFixed(1)) +
      '</b>. <a class="lnk" href="#/kurum?s=' + e.id + '">Kurum sayfası →</a></div>';
  }
  h += '<div style="margin-top:12px"><button class="chip" id="atClr">Seçimi temizle</button></div></div>';
  box.innerHTML = h;
  var c = document.getElementById("atClr");
  if (c) c.onclick = function () { ATL.sel = null; renderAtlas(); };
}


var NARRVIEW = "flow";


/* A coded event carries an id from the corpus, so it can borrow the story's own
   least-loaded headline as its name. The four legacy hand-coded entries predate
   the corpus and keep their slugs. */
function narrName(key, max) {
  var nk = D.N[key], e = nk && nk.ev ? EV[nk.ev] : null;
  if (e) return storyLabel(e, max || 0);
  var n = D.N[key];
  return n && n.label ? tcase(n.label) : tcase(key);
}

function narrBox(key) {
  var n = D.N[key]; if (!n) return "";
  NFOC = n.focus || null; NCUR = key;
  var rows = n.rows || [];
  var box = $("#narrbox"); if (!box) return "";
  var div = divergentDims(rows);
  var top = NFOC ? NFOC.map(function (k) { return div.filter(function (d) { return d.k === k; })[0]; }).filter(Boolean)
    : div.slice(0, 3).filter(function (d) { return d.distinct > 1; });

  var h = '<div class="panel" style="padding:18px 20px">';
  h += '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:baseline;justify-content:space-between">' +
    "<h3 style=\"font-size:20px;max-width:56ch\">" + esc(narrName(key)) + "</h3>" +
    '<span class="tag' + (n.status === "machine_assisted" ? " b" : " g") + '">' +
    (n.status === "hand_coded" ? "elle kodlandı" : n.status === "headline_coded" ? "başlıklardan elle kodlandı" : "makine destekli · inceleme bekliyor") +
    "</span></div>";
  h += '<p style="margin-top:9px;font-size:14px;color:var(--ink2);max-width:74ch">' +
    rows.length + " kurum kodlandı." +
    (top.length ? " En çok ayrışılan boyut: <b>" + esc(top[0].label) + "</b> — " +
      top[0].distinct + " farklı değer." : "") +
    (n.kind === "topic" ? " <b>Bu bir konu kümesidir</b>: haberler aynı tek olayı değil, " +
      "aynı türden olayları anlatıyor, dolayısıyla farklar kısmen olayların kendisinden geliyor." : "") +
    "</p>";

  if (n.q) {
    h += '<div style="margin-top:6px">';
    [["01","Ne oldu?",n.q.happened],["02","Kaynaklar neyde uzlaşıyor?",n.q.agree],
     ["03","Nerede ayrışıyorlar?",n.q.differ],["04","Bu fark neden önemli?",n.q.care]]
      .forEach(function (r) {
        h += '<div class="q"><div class="q-n">' + r[0] + "</div><div><h3>" + r[1] +
          "</h3><p>" + esc(r[2] || "") + "</p></div></div>";
      });
    h += "</div>";
  }

  /* Which dimensions carry the disagreement — the reader's way in. */
  if (top.length) {
    h += '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
      top.slice(0, 5).map(function (d) {
        return '<span class="tag" style="border-color:var(--hot);color:var(--hot)">' +
          esc(d.label) + " · " + d.distinct + " farklı</span>"; }).join("") + "</div>";
  }
  h += "</div>";

  if (NARRVIEW === "cards") {
    h += '<div style="margin-top:16px">' + narrativeCards(rows) + "</div>";
  } else if (NARRVIEW === "table") {
    h += '<div style="margin-top:16px">' + pillMatrix(rows) + "</div>" +
      '<div class="fig-take" style="margin-top:14px">Bir sütunda <b>aynı renk</b>, ' +
      "o kurumların bu boyutta aynı yanıtı verdiği anlamına gelir. Tek başına duran " +
      "bir renk, o kurumun olayı kimsenin kurmadığı bir biçimde kurduğu yerdir. " +
      "Satırlar siyasi yerleşime göre sıralı: bir rengin yelpaze boyunca dağılması, " +
      "çerçevenin siyasi konumu takip etmediği anlamına gelir.</div>";
  } else {
    h += fig("nflow", narrCols().map(function (c) { return c[1].toLocaleLowerCase("tr"); }).join(" → "), {
      legend: legendHTML([{c:"var(--left)",t:"sola yerleşik"},{c:"var(--mid)",t:"merkez"},{c:"var(--right)",t:"sağa yerleşik"}]),
      take: "Her çizgi bir kurumun bu olayda kurduğu hikâyedir. Çizgiler ortada " +
        "birbirinden ayrılıyorsa, kurumlar aynı olguyu bildirip farklı sorumluluk " +
        "atfediyor demektir." }) +
      '<p style="font-size:12.5px;color:var(--muted);margin-top:9px;max-width:74ch">' +
      "Her çizgi bir kurumun bu olay için kurduğu yolu gösterir: olayı hangi tür hikâye " +
      "saydığı, kimi sorumlu tuttuğu, hangi çözümü meşrulaştırdığı. Çizgiler birleştiğinde " +
      "kurumlar aynı hikâyeyi anlatıyor; ayrıldığında aynı olaydan farklı sonuçlar " +
      "çıkarıyorlar. Bir çizginin üzerine gelin.</p>";
  }
  box.innerHTML = h;
  if (NARRVIEW === "flow") {
    var f = $("#nflow"); if (f) f.appendChild(narrativeFlow(rows));
  }
  return "";
}

/* ============================================================== /yanlilik */
/* ================================================ checklist results ======
   What the rule engine has actually been tested on. A tool that names biases
   in other people's writing should be able to say where it has been checked
   and where it fails, so this is published rather than kept in a repository. */
function checklistSection() {
  var C = D.CL;
  if (!C) return "";
  var TY = { MFT: ["Doğrudan yetenek testi",
      "Aracın belirli bir şeyi yapabildiğini doğrudan sınar."],
    INV: ["Değişmezlik testi",
      "Anlamı değiştirmeyen bir düzenleme sonucu değiştirmemeli."],
    DIR: ["Yönlü test",
      "Anlamı değiştiren bir ekleme sonucu belirli bir yönde değiştirmeli."] };
  var CAP = { literal_reporting: "Yalın aktarım", evaluative_language: "Değerlendirici dil",
    publisher_identity: "Yayıncı kimliği", quotation_scope: "Alıntı kapsamı",
    causality: "Nedensellik", turkish_negation: "Türkçe olumsuzlama",
    modality: "Kiplik / ihtimal", speaker_attribution: "Konuşmacıya atıf",
    sentence_order: "Cümle sırası", untrusted_text: "Güvenilmeyen metin",
    concept_boundary: "Kavram sınırı", reported_opinion: "Aktarılan görüş" };

  var h = '<section class="sec"><h2>Bu çözümleyici neyle sınandı</h2>' +
    '<p class="sub">Yanlılık saptadığını söyleyen bir aracın, nerede sınandığını ve ' +
    "nerede başarısız olduğunu da söylemesi gerekir. Aşağıdaki " + C.total +
    " vaka, kardeş proje <b>Mercek</b>'in Türkçe davranış testi dizisinden geliyor ve " +
    "kural motoru her yayından önce bunlara karşı çalıştırılıyor.</p>";

  h += '<div class="grid g3" style="margin-bottom:20px">' +
    '<div class="card" style="border-left:3px solid var(--ok)">' +
    '<div class="num" style="font-size:26px;color:var(--ok)">' + C.real + "</div>" +
    '<div class="eyebrow" style="margin-top:3px">gerçek geçiş</div>' +
    '<p style="margin-top:8px;font-size:13px;color:var(--ink2);line-height:1.55">' +
    "Motorun ilgili yeteneği var ve test edilen davranışı doğru sergiliyor.</p></div>" +
    '<div class="card"><div class="num" style="font-size:26px">' + C.trivial + "</div>" +
    '<div class="eyebrow" style="margin-top:3px">boş geçiş</div>' +
    '<p style="margin-top:8px;font-size:13px;color:var(--ink2);line-height:1.55">' +
    "Test bir kavramın <b>bulunmamasını</b> istiyor ve motorda o kavram için zaten " +
    "kural yok. Geçiyor ama hiçbir şey kanıtlamıyor — bu yüzden ayrı sayılıyor.</p></div>" +
    '<div class="card" style="border-left:3px solid ' + (C.fail ? "var(--hot)" : "var(--line2)") + '">' +
    '<div class="num" style="font-size:26px;color:' + (C.fail ? "var(--hot)" : "var(--ink)") + '">' +
    C.fail + "</div>" +
    '<div class="eyebrow" style="margin-top:3px">başarısız</div>' +
    '<p style="margin-top:8px;font-size:13px;color:var(--ink2);line-height:1.55">' +
    (C.fail ? "Aşağıdaki tabloda işaretli." :
      "Şu anda yok. Bu, motorun doğru olduğu anlamına gelmez — yalnızca bu " +
      C.total + " vakada yanlış davranmadığı anlamına gelir.") + "</p></div></div>";

  h += '<div class="note warn"><b>Bu bir doğruluk ölçüsü değildir.</b> Vakalar ' +
    "sentetiktir, uzman incelemesinden geçmemiştir ve dizinin kendisi bunu böyle " +
    "beyan eder. Gerçek Türkçe başlıklarda kaç saptamanın doğru olduğunu ölçmezler; " +
    "yalnızca sözlük eşleştiren bir motorun düşmeye en yatkın olduğu tuzakları — " +
    "olumsuzlama, ihtimal kipi, alıntı içindeki dil ve metni talimat sanma — " +
    "yayına çıkmadan önce yakalarlar. İnsan tarafından etiketlenmiş bir Türkçe " +
    "doğrulama kümesi hâlâ yok; bu yüzden sitede hiçbir yerde kesinlik yüzdesi verilmiyor.</div>";

  h += '<div class="scroller panel" style="margin-top:16px"><table><thead><tr>' +
    "<th>Sınanan yetenek</th><th>Test türü</th><th>Sonuç</th><th>Tetiklenen yapı</th>" +
    "</tr></thead><tbody>" +
    C.cases.map(function (c) {
      var ty = TY[c.type] || [c.type, ""];
      return "<tr><td><b>" + esc(CAP[c.capability] || c.capability) + "</b>" +
        '<div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:3px">' +
        esc(c.id) + "</div></td>" +
        '<td style="font-size:12.5px;color:var(--ink2)"><b>' + esc(c.type) + "</b> · " +
        esc(ty[0]) + '<div style="color:var(--muted);font-size:11.5px;margin-top:2px">' +
        esc(ty[1]) + "</div></td>" +
        "<td>" + (c.verdict === "FAIL" ?
          '<span class="tag b">başarısız</span>' :
          c.kind === "trivial" ? '<span class="tag">boş geçiş</span>' :
          '<span class="tag g">geçti</span>') +
        (c.why ? '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">' +
          esc(c.why) + "</div>" : "") + "</td>" +
        '<td class="mono" style="font-size:11.5px;color:var(--muted)">' +
        esc(c.keys || "—") + "</td></tr>";
    }).join("") + "</tbody></table></div>";

  h += '<div class="note" style="margin-top:14px"><b>Bu testler motoru değiştirdi.</b> ' +
    "İlk çalıştırmada dört vaka başarısız oldu ve hepsi gerçek kusurlara işaret " +
    "ediyordu: “vatandaşın cebine darbe” gibi ders kitabı örneği bir yüklü başlık " +
    "hiç saptanmıyordu, nedensellik iddiası için kural yoktu, alıntı içindeki dil " +
    "tümüyle görünmezdi ve 60 karakterden uzun bir alıntı kurumun kendi cümlesi " +
    "sayılıyordu. Dördü de düzeltildi. Düzeltme sırasında ayrıca sözlük eşleştirmesinin " +
    "kelime sınırı gözetmediği ortaya çıktı: “onlar” kalıbı <b>milyonların</b>, " +
    "<b>şampiyonlar</b> ve <b>fonlarında</b> içinde eşleşiyor, bu dönemdeki haberlerde 37 " +
    "in-group-bias saptamasının 30'unu uyduruyordu. Bunlar artık bu dönemdeki haberlerden kalktı." +
    '<br><span class="mono" style="font-size:11.5px;color:var(--muted)">Kaynak: ' +
    esc(C.source) + " · son çalıştırma " +
    esc(String(C.ran).slice(0, 16).replace("T", " ")) + " UTC</span></div>";
  return h + "</section>";
}

/* ====================================================== bias explorer ====
   The Yanlılık section, entered through the corpus instead of through a
   glossary. Picking a device shows what it did in this week's headlines: who
   reached for it, how often relative to everyone else, and every real example
   with the triggering words marked. The 127-concept library is still there,
   but as a reference behind the working view rather than as the front door. */
var EXPKEY = null, EXPQ = "";

function deviceStats() {
  var pol = D.A.filter(function (a) { return a.p; });
  var out = {};
  D.A.forEach(function (a) {
    a.k.forEach(function (k) {
      var r = (out[k] = out[k] || { k: k, n: 0, arts: [], byOutlet: {}, byBloc: { left: 0, mid: 0, right: 0 } });
      r.n++; r.arts.push(a);
      r.byOutlet[a.s] = (r.byOutlet[a.s] || 0) + 1;
      r.byBloc[bloc(a.s)]++;
    });
  });
  /* Rate per outlet against the corpus rate, so a big publisher does not top
     every list simply by publishing more. */
  var corpusPol = pol.length;
  Object.keys(out).forEach(function (k) {
    var r = out[k];
    r.rate = r.n / D.A.length;
    r.top = Object.keys(r.byOutlet).map(function (sl) {
      var mine = STAT[sl] ? STAT[sl].n : 0;
      return { s: sl, n: r.byOutlet[sl], rate: r.byOutlet[sl] / Math.max(1, mine),
        ratio: (r.byOutlet[sl] / Math.max(1, mine)) / Math.max(1e-9, r.rate) };
    }).filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return b.ratio - a.ratio; });
  });
  return out;
}

function pgExplorer() {
  var st = deviceStats();
  var keys = Object.keys(st).sort(function (a, b) { return st[b].n - st[a].n; });
  if (!EXPKEY || !st[EXPKEY]) EXPKEY = keys[0];
  var maxN = st[keys[0]] ? st[keys[0]].n : 1;

  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Çerçeveleme</div>' +
    "<h1>Bu dönem hangi araçlar kullanıldı</h1>" +
    '<p class="lede">Bir yanlılık sözlüğü değil, bir <b>çalışma tezgâhı</b>. Soldaki ' +
    "listeden bir araç seçin: o aracın bu dönemdeki haberlerde ne yaptığını, kimin ne " +
    "sıklıkta başvurduğunu ve tetiklendiği her gerçek başlığı işaretli kelimeleriyle " +
    "görürsünüz. Kavramın tanımını arıyorsanız, tam kütüphane en altta.</p></div>";

  h += '<div class="ctl"><input type="search" id="expq" placeholder="Araç ara…" ' +
    'style="min-width:240px" value="' + esc(EXPQ) + '">' +
    '<span class="mono" style="font-size:12px;color:var(--muted)">' + keys.length +
    " araç, bu dönem tetiklendi</span></div>";

  h += '<div class="exp-grid"><div class="exp-list" id="explist">' +
    keys.filter(function (k) {
      if (!EXPQ) return true;
      var b = BREG[k] || BIA[k] || {};
      return ((b.en || k) + " " + (b.tr || "")).toLocaleLowerCase("tr")
        .indexOf(EXPQ.toLocaleLowerCase("tr")) >= 0;
    }).map(function (k) {
      var b = BREG[k] || BIA[k] || {};
      return '<div class="exp-item' + (k === EXPKEY ? " on" : "") + '" data-exp="' + k + '">' +
        '<span class="nm"><b>' + esc(b.en || k) + "</b>" +
        "<span>" + esc(b.tr || "") + "</span></span>" +
        '<span class="exp-bar" style="width:' + Math.max(2, 44 * st[k].n / maxN) + 'px"></span>' +
        '<span class="ct">' + st[k].n + "</span></div>";
    }).join("") + "</div>";

  h += '<div class="exp-panel" id="exppanel"></div></div>';

  /* The full library, demoted to a reference. */
  h += '<section class="sec"><h2>Tam kavram kütüphanesi</h2>' +
    '<p class="sub">Yukarıdaki tezgâh yalnızca bu dönem <b>tetiklenen</b> araçları ' +
    "gösterir. Aşağıdaki liste, projenin tanıdığı " + (D.BR || []).length +
    " kavramın tamamıdır — çoğu bir başlıktan karara bağlanamaz ve hangi kümede " +
    "olduğu her kayıtta yazar.</p>" +
    '<div class="ctl"><input type="search" id="bq" placeholder="Kavram ara…" style="min-width:220px">' +
    '<label class="eyebrow">Küme</label>' +
    [["all", "Tümü"], ["detected", "Kural saptıyor"], ["codable", "İnsan kodlaması"],
     ["reference", "Okur davranışı"]].map(function (t) {
      return '<button class="chip" data-tier="' + t[0] + '" aria-pressed="' +
        (t[0] === "all") + '">' + t[1] + "</button>"; }).join("") + "</div>" +
    '<div id="blist"></div></section>';

  h += checklistSection();
  return h + "</div>";
}

/** The detail panel: what this device did in this corpus. */
function renderExpPanel() {
  var box = $("#exppanel"); if (!box) return;
  var st = deviceStats(), r = st[EXPKEY];
  if (!r) { box.innerHTML = ""; return; }
  var b = BREG[EXPKEY] || BIA[EXPKEY] || {};
  var tier = b.tier || "detected";

  var h = '<div class="eyebrow">' + esc(TIERL[tier] || tier) + "</div>" +
    '<h2 style="font-size:26px;margin-top:6px">' + esc(b.en || EXPKEY) + "</h2>" +
    '<div style="font-family:var(--ff-d);font-size:17px;color:var(--ink2);margin-top:2px">' +
    esc(b.tr || "") + "</div>";
  if (b.df) h += '<p class="lead">' + esc(b.df) + "</p>";

  /* What it looks like, in this outlet's own words, with the trigger marked. */
  var rule = (RULEDEF.filter(function (x) { return x[0] === EXPKEY; })[0] || [])[1];
  if (rule) {
    h += '<div class="note"><b>Kural ne arıyor.</b> ' + esc(rule) +
      ". Aynı metin her zaman aynı sonucu verir; bu bir model tahmini değildir.</div>";
  }

  h += '<div class="grid g3" style="margin-top:18px">' +
    kpi(r.n, "başlıkta tetiklendi") +
    kpi("%" + (100 * r.n / D.A.length).toFixed(1), "tüm haberlerin") +
    kpi(Object.keys(r.byOutlet).length, "farklı kurum kullandı") + "</div>";

  /* Who reaches for it more than everyone else does. */
  if (r.top.length) {
    h += '<section class="sec" style="margin-top:26px"><h3 style="font-size:18px">' +
      "Kim bu araca daha sık başvuruyor</h3>" +
      '<p class="sub" style="margin-bottom:14px">Kurumun kendi haberlerinde bu aracın ' +
      "görülme oranı, aynı oranın tüm haberlerdeki hâline bölünmüş. <b>2.0</b>, o kurumun " +
      "bu araca iki kat sık başvurduğu anlamına gelir.</p>" +
      '<div style="display:flex;flex-direction:column;gap:7px">' +
      r.top.slice(0, 8).map(function (x) {
        var wdt = Math.min(100, x.ratio / 3 * 100);
        return '<a href="#/kurum?s=' + x.s + '" style="display:grid;' +
          "grid-template-columns:130px 1fr 62px;gap:12px;align-items:center;" +
          'text-decoration:none;font-size:13px">' +
          "<span>" + esc(SRC[x.s] ? SRC[x.s].n : x.s) + "</span>" +
          '<span style="height:16px;background:var(--sunk);border-radius:3px;display:block;' +
          'position:relative"><span style="display:block;height:100%;width:' + wdt +
          '%;background:' + lean(SRC[x.s] ? SRC[x.s].lean : null) +
          ';border-radius:3px;opacity:.85"></span></span>' +
          '<span class="num" style="text-align:right;font-size:12.5px">' +
          x.ratio.toFixed(1) + "×</span></a>";
      }).join("") + "</div></section>";
  }

  /* Every real example, trigger words marked. This is the point of the page. */
  var ex = r.arts.slice().sort(function (a, b2) { return b2.v - a.v; });
  h += '<section class="sec" style="margin-top:26px"><h3 style="font-size:18px">' +
    'Bu dönemdeki gerçek örnekler <span class="mono" style="font-size:13px;' +
    'color:var(--muted)">' + ex.length + "</span></h3>" +
    '<p class="sub" style="margin-bottom:12px">İşaretli kelime kuralı tetikleyen ' +
    "kelimedir. Başlığa tıklayınca kurumun kendi sayfası açılır.</p>" +
    '<div class="panel" style="padding:4px 18px 14px" id="expex">' +
    ex.slice(0, 25).map(function (a) { return artRow(a); }).join("") + "</div>";
  if (ex.length > 25) {
    h += '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">İlk 25 örnek ' +
      "gösteriliyor; kalan " + (ex.length - 25) + " örnek için kurum sayfalarına bakın.</p>";
  }
  h += "</section>";

  /* What the tool cannot settle about this device. */
  if (b.bound) {
    h += '<div class="note warn" style="margin-top:20px"><b>Sınır.</b> ' + esc(b.bound) + "</div>";
  }
  box.innerHTML = h;
  wireDevices(box);
}

function pgBias(q) {
  var tab = tabOf(secFor("/yanlilik"), q);
  if (tab === "kesif") return pgExplorer();
  var h = '<div class="wrap page">';
  var count = {}; D.A.forEach(function (a) { a.k.forEach(function (k) { count[k] = (count[k] || 0) + 1; }); });

  if (tab === "kutuphane") {
    var T = D.BRM.tiers || {};
    h += '<div class="phead"><div class="eyebrow">Yapı kütüphanesi</div>' +
      "<h1>" + D.BR.length + " bilişsel yanlılık ve çerçeveleme yapısı</h1>" +
      '<p class="lede">Bilişsel yanlılık, düşünmenin sistematik ve öngörülebilir biçimde ' +
      "sapmasıdır — rastgele hata değil, aynı koşullarda aynı yöne kayan bir eğilim. " +
      "Haberde iki ayrı yerde iş görür: gazetecinin neyi haber değeri saydığında, ve " +
      "okurun o haberi nasıl anladığında. Bu kütüphane ikisini de kapsar, ama hangisinin " +
      "hangisi olduğunu ayırır.</p></div>";

    /* The three tier counts were three separate numbers in three boxes, with no
       indication of their relative size — the whole point being that most of the
       library is NOT machine-detectable. One bar says that instantly. */
    var tTot = (T.detected || 0) + (T.codable || 0) + (T.reference || 0);
    h += '<div style="margin-bottom:18px">' +
      '<div style="display:flex;height:26px;border:1px solid var(--line);border-radius:4px;' +
      'overflow:hidden;gap:2px;background:var(--sunk)">' +
      [["detected", T.detected || 0, "var(--hot)"], ["codable", T.codable || 0, "var(--right)"],
       ["reference", T.reference || 0, "var(--mid)"]].map(function (x) {
        return '<span title="' + x[1] + ' yapı" style="width:' + (100 * x[1] / tTot) +
          '%;background:' + x[2] + ';display:flex;align-items:center;justify-content:center;' +
          'font-family:var(--ff-m);font-size:10.5px;color:var(--paper)">' +
          (x[1] / tTot > .06 ? x[1] : "") + "</span>"; }).join("") + "</div>" +
      '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;' +
      'color:var(--ink2)">' +
      '<span><b style="color:var(--hot)">■</b> kural saptıyor</span>' +
      '<span><b style="color:var(--right)">■</b> insan kodlaması gerekir</span>' +
      '<span><b style="color:var(--mid)">■</b> okur davranışı — habere işlenemez</span>' +
      "</div></div>";
    h += '<div class="grid g3" style="margin-bottom:22px">' +
      '<div class="card" style="border-left:3px solid var(--hot)"><b style="font-size:15px">' +
      (T.detected || 0) + ' yapı · kural saptıyor</b><p style="margin-top:7px;font-size:13.5px;' +
      'color:var(--ink2);line-height:1.6">Başlığın yüzeyinde denetlenebilir bir testle ' +
      "saptanabiliyor. Bu dönemdeki bu dönemdeki haberlerde gerçek örnekleri var ve her biri tıklanabilir.</p></div>" +
      '<div class="card" style="border-left:3px solid var(--right)"><b style="font-size:15px">' +
      (T.codable || 0) + ' yapı · insan kodlaması</b><p style="margin-top:7px;font-size:13.5px;' +
      'color:var(--ink2);line-height:1.6">Bir haberin özelliği olabilir, ama tek bir dizeden ' +
      "karara bağlanamaz. Metnin bütününü ve çoğu zaman karşılaştırmayı gerektirir.</p></div>" +
      '<div class="card"><b style="font-size:15px">' + (T.reference || 0) +
      ' yapı · okur davranışı</b><p style="margin-top:7px;font-size:13.5px;color:var(--ink2);' +
      'line-height:1.6">Okurun, tüketicinin ya da karar vericinin davranışını anlatır; bir ' +
      "haber metninin özelliği değildir. Bütünlük için listede, ama makalelere işlenmez.</p></div></div>";

    h += '<div class="note warn" style="margin-bottom:20px"><b>Neden 127 yapının hepsi ' +
      "saptanmıyor.</b> Bir bilişsel yanlılık dizini, bir haber başlığında saptanabilecek " +
      "127 şey demek değildir. Listenin üçte birinden fazlası okurun ya da tüketicinin " +
      "davranışını tarif eder — bir makale onları <b>sergileyemez</b>. Hepsini " +
      "“saptanabilir” diye sunmak, aracın yerine getiremeyeceği bir iddia olurdu; bu yüzden " +
      "her kayıt hangi kümede olduğunu açıkça söyler.</div>";

    h += '<div class="ctl"><input type="search" id="bq" placeholder="Yapı ara…" style="min-width:220px">' +
      '<label class="eyebrow">Küme</label>' +
      [["all", "Tümü"], ["detected", "Kural saptıyor"], ["codable", "İnsan kodlaması"],
       ["reference", "Okur davranışı"]].map(function (t) {
        return '<button class="chip" data-tier="' + t[0] + '" aria-pressed="' +
          (t[0] === "all") + '">' + t[1] + "</button>"; }).join("") + "</div>";
    h += '<div id="blist"></div>';

    h += '<section class="sec"><h2>İşaretleme protokolü</h2>' +
      '<p class="sub">Her saptama, yüklenen ek açıklama dizininin protokolüne uyar. ' +
      "Protokolün üç kuralı bu sitenin tamamını bağlar.</p>" +
      '<div class="grid g2">' +
      [["Metin veri, talimat değil", "Analiz edilen haber metni bir girdi olarak işlenir; " +
        "içinde yer alan hiçbir ifade araca verilmiş bir komut gibi değerlendirilmez."],
       ["Niyet değil, örüntü", "“Saptandı”, metnin o örüntüyü <b>taşıdığı</b> anlamına gelir; " +
        "yazarın bir inanca sahip olduğu ya da anlatılan olayların doğrulandığı anlamına " +
        "gelmez. Alıntıdan yazarın onayı çıkarılmaz."],
       ["Kanıt alıntılanır", "Her saptama, metinden birebir alınmış bir ifadeye bağlanır. " +
        "Alıntısız saptama gösterilmez."],
       ["Kanıt yetersiz de bir sonuçtur", "Bağlam eksikse sonuç “kanıt yetersiz” olur. " +
        "Bir yapının bulunmaması, başka yapılar hakkında hiçbir şey söylemez."]]
      .map(function (r) {
        return '<div class="card"><b style="font-size:14px">' + r[0] + "</b>" +
          '<p style="margin-top:6px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
          r[1] + "</p></div>"; }).join("") + "</div>";
    h += '<details class="det" style="margin-top:14px"><summary>Protokolün özgün metni</summary>' +
      '<div class="detbody"><p class="mono" style="font-size:12px;color:var(--ink2);' +
      'line-height:1.7;white-space:pre-wrap">' + esc(D.BRM.protocol || "") + "</p></div></details>";
    h += "</section>";

    h += '<section class="sec"><h2>Kaynak ve durum</h2>' +
      '<div class="note"><b>' + esc(D.BRM.ontology.title) + "</b> · sürüm " +
      esc(D.BRM.ontology.version) + " · erişim " + esc(D.BRM.ontology.accessed) +
      ' · <a class="lnk" href="' + esc(D.BRM.ontology.url) + '" target="_blank" rel="noopener">' +
      esc(D.BRM.ontology.url) + "</a>" +
      '<p style="margin-top:9px">Dizin kendi durumunu şöyle tanımlıyor: “' +
      esc(D.BRM.ontology.status) + "” Bütün kayıtlar <b>bağımsız incelemeden geçmemiş</b> " +
      "olarak işaretli ve bütün örnekler sentetik. Bu yüzden dizin burada bir kavram " +
      "sözlüğü olarak kullanılıyor; bir doğrulama ölçütü olarak değil.</p>" +
      '<p style="margin-top:9px">Ek açıklama tohum dosyası ' + D.BRM.seed.rows +
      " satır içeriyor (" + Object.keys(D.BRM.seed.verdicts).map(function (k) {
        return D.BRM.seed.verdicts[k] + " " + k; }).join(", ") + "). " +
      "Metinlerin " + esc(String(D.BRM.seed.note)) + "</p></div></section>";
  }

  if (tab === "bicimler") {
    h += '<div class="phead"><div class="eyebrow">Hamborg biçimleri</div>' +
      "<h1>Çerçeveleme haberin hangi aşamasında oluşur</h1>" +
      '<p class="lede">Yapı kütüphanesi tek bir başlığın dilini inceler. Hamborg (2023) ' +
      "çerçevesi bir adım geri çekilir ve yanlılığın haber üretiminin hangi aşamasında " +
      "girdiğini sorar: hangi olayın habere değer görüldüğü, nasıl anlatıldığı, neyin öne " +
      "çıkarıldığı. Bir başlığın dili kusursuz olabilir; olayın seçilmiş olması yine de " +
      "bir tercihtir.</p></div>";
    var phases = [];
    D.F.forEach(function (f) { if (phases.indexOf(f.phase) < 0) phases.push(f.phase); });
    phases.forEach(function (ph) {
      var fs = D.F.filter(function (f) { return f.phase === ph; });
      h += '<section class="sec"><h2>' + esc(ph) + " aşaması</h2><div class=\"grid g2\">";
      fs.forEach(function (f) {
        h += '<div class="card"><div style="display:flex;gap:9px;align-items:baseline;flex-wrap:wrap">' +
          '<b style="font-size:15px">' + esc(f.en) + "</b>" +
          '<span style="color:var(--muted);font-size:13px">' + esc(f.tr) + "</span></div>" +
          '<p style="margin-top:8px;font-size:13.5px;color:var(--ink2);line-height:1.6">' + esc(f.df) + "</p>" +
          (f.ex ? '<p style="margin-top:9px;font-size:13px;color:var(--muted);border-left:2px solid var(--line2);padding-left:10px">' + esc(f.ex) + "</p>" : "") +
          (f.det ? '<p style="margin-top:9px;font-size:12.5px"><span class="eyebrow">Nasıl saptanır</span><br>' + esc(f.det) + "</p>" : "") +
          "</div>";
      });
      h += "</div></section>";
    });
  }

  if (tab === "cozumleyici") {
    h += '<div class="phead"><div class="eyebrow">Metin çözümleyici</div>' +
      "<h1>Bir başlığı kendiniz deneyin</h1>" +
      '<p class="lede">Türkçe bir haber başlığı yazın; bu dönemdeki haberleri işleyen kuralların aynısı ' +
      "çalışır ve hangi yapıların neden tetiklendiğini gösterir. Bu bir model tahmini değil, " +
      "açık ve denetlenebilir yüzey testleridir — aynı metin her zaman aynı sonucu verir.</p></div>";
    h += '<div class="card"><textarea class="an-in" id="anin" ' +
      'placeholder="Bir Türkçe haber başlığı yazın…"></textarea>' +
      '<div style="margin-top:12px"><span class="eyebrow">Bu dönemdeki haberlerden örnek dene</span></div>' +
      '<div style="margin-top:8px" id="anex"></div>' +
      '<div class="an-out" id="anout"></div></div>';
    h += '<div class="note" style="margin-top:18px"><b>Kuralların göremediği.</b> ' +
      "Bir başlıkta <b>olmayan</b> şeye dayanan yapılar — Confirmation Bias, Cherry Picking, " +
      "Base Rate Fallacy — tek bir dizeden karara bağlanamaz; bunlar için haberin gövdesini ve " +
      "karşılaştırma kümesini okumak gerekir. Tarayıcı kolay vakaları denetlenebilir kılmak " +
      "için vardır, okumanın yerine geçmek için değil.</div>";
    h += checklistSection();
  }

  if (tab === "turkiye") {
    h += '<div class="phead"><div class="eyebrow">Türkiye\'de yanlılık</div>' +
      "<h1>Beş alanda çerçeveleme kalıpları</h1>" +
      '<p class="lede">Akademik literatürün Türkiye medya sistemi için tanımladığı yapısal ' +
      "alanlar ve her birinde hükümete yakın, muhalif ve bağımsız yayınların tipik çerçeveleri. " +
      "Bunlar bu dönemdeki haberlerden sayılmış değil, literatürden alınmış <b>beklentilerdir</b>; " +
      "bu dönemdeki haberlerde doğrulanıp doğrulanmadıkları ayrı bir sorudur.</p></div>";
    D.I.forEach(function (it) {
      h += '<section class="sec"><h2>' + esc(it.n) + '</h2><p class="sub">' + esc(it.d) + "</p>" +
        '<div class="persp" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">' +
        '<div><div class="h" style="color:var(--right)">Hükümete yakın çerçeve</div><p>' + esc(it.pro) + "</p></div>" +
        '<div><div class="h" style="color:var(--left)">Muhalif çerçeve</div><p>' + esc(it.opp) + "</p></div>" +
        '<div><div class="h" style="color:var(--mid)">Bağımsız / mesafeli çerçeve</div><p>' + esc(it.ind) + "</p></div>" +
        "</div>";
      if (it.pat) h += '<div class="note" style="margin-top:12px"><b>Gözlenen kalıp.</b> ' + esc(it.pat) + "</div>";
      if (it.ref) h += '<p style="margin-top:9px;font-size:12px;color:var(--muted)">Kaynak: ' + esc(it.ref) + "</p>";
      h += "</section>";
    });

    /* Requirement: cite the underlying research, and keep documented structural
       conditions apart from evidence about an individual article. The second
       half of that is the harder discipline and gets its own block. */
    h += '<section class="sec"><h2>Yapısal koşul ile tekil habere ait kanıt</h2>' +
      '<div class="note warn"><b>Bu ayrım bu sitenin en önemli kuralıdır.</b> ' +
      "Türk medya sisteminin yapısal koşulları — mülkiyet yoğunlaşması, resmî ilan " +
      "gelirinin dağıtımı, düzenleyici kurum kararları — akademik olarak belgelenmiştir. " +
      "Ama <b>belgelenmiş bir yapısal koşul, tek bir haberin neden öyle yazıldığını " +
      "açıklamaz.</b> Bir yayının devlet reklamına bağımlı olması, o yayının belirli bir " +
      "başlığı o nedenle kurduğunu göstermez; bunun için o habere ait ayrı bir kanıt " +
      "gerekir.</div>" +
      '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><b style="font-size:14px">Yapısal kanıt</b>' +
      '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
      "Kurum düzeyinde, zaman içinde, dış kaynaklardan belgelenir: mülkiyet yapısı, " +
      "BİK resmî ilan geliri, tiraj, düzenleyici kararlar. Bu sitede <b>kurum " +
      "sayfalarında</b> gösterilir ve haber analizine girdi olarak kullanılmaz.</p></div>" +
      '<div class="card"><b style="font-size:14px">Habere ait kanıt</b>' +
      '<p style="margin-top:7px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
      "Tek bir metinde gözlenir: hangi kelime kullanılmış, kim sorumlu tutulmuş, hangi " +
      "çözüm önerilmiş, ne dışarıda bırakılmış. Bu sitede <b>olay sayfalarında</b> " +
      "gösterilir ve her zaman metinden alınmış bir alıntıya bağlanır.</p></div></div>" +
      '<p style="margin-top:14px;font-size:13.5px;color:var(--ink2)">Bir kurumun ' +
      "sayfasındaki BİK rakamı ile o kurumun bir başlığındaki yapı etiketi <b>aynı " +
      "kanıt türü değildir</b> ve site bunları hiçbir yerde birbirine bağlamaz. " +
      "İkisini birleştiren bir açıklama kurmak okurun kendi kararıdır; bunun için " +
      "gereken her iki veri de burada, ayrı ayrı duruyor.</p></section>";

    h += '<section class="sec"><h2>Bu bölümün dayandığı araştırmalar</h2>' +
      '<p class="sub">Yukarıdaki beş alandaki çerçeveler bu literatürden alınmıştır. ' +
      "Sayfa bu çalışmalardan sayısal bulgu aktarmıyor; kavramsal çerçeveyi ve " +
      "belgelenmiş yapısal koşulları adlandırıyor. Özgün metinler proje dosyalarındadır.</p>" +
      '<div class="scroller panel"><table><thead><tr><th>Çalışma</th><th>İlgili alan</th>' +
      "<th>Bu sitede ne için kullanılıyor</th></tr></thead><tbody>" +
      [["Yanatma (2021), <i>Advertising and Media Capture in Turkey</i>",
        "Medya bağımsızlığı · Ekonomik baskı",
        "Resmî ilan gelirinin dağıtımının yapısal bir bağımlılık mekanizması olarak " +
        "tanımlanması. Kurum sayfalarındaki BİK rakamının kaynağı ve yorum çerçevesi."],
       ["<i>Media Systems and Media Capture in Turkey: A Case Study</i> (MaC 12)",
        "Medya bağımsızlığı · Demokratik kurumlar",
        "Mülkiyet yoğunlaşması ve el değişimlerinin sistem düzeyinde tarif edilmesi; " +
        "kurum künyelerindeki sahiplik geçmişinin çerçevesi."],
       ["Marschall & Ünal (2021), GLD Working Paper 39",
        "Demokratik kurumlar · Toplumsal politikalar",
        "Yerel yönetim ve kurumsal işleyiş bağlamı."],
       ["Reuters Institute, <i>Digital News Report — Türkiye Eki</i>",
        "Medya bağımsızlığı · Siyasi çerçeveleme",
        "Kurum bazlı güven ve erişim verisi; “Güven” sekmesindeki kutuplaşma farkının " +
        "kaynağı. Anket verisidir, tarih taşır."],
       ["Hamborg (2023), medya yanlılığı biçimleri",
        "Siyasi çerçeveleme",
        "Yanlılığın haber üretiminin hangi aşamasında oluştuğunu ayıran çerçeve; " +
        "“Hamborg biçimleri” sekmesinin tamamı."],
       ["Global Disinformation Index (2023), Türkiye raporu",
        "Medya bağımsızlığı",
        "İçerik göstergeleri ve risk değerlendirme yaklaşımı."]]
      .map(function (r) {
        return "<tr><td style=\"min-width:230px\">" + r[0] + "</td>" +
          '<td style="color:var(--muted);min-width:150px">' + r[1] + "</td>" +
          '<td style="color:var(--ink2)">' + r[2] + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="note" style="margin-top:12px">Bu tablo, hangi iddianın hangi ' +
      "çalışmadan geldiğini gösterir. Bu sitede üretilen sayılar — yoğunluk puanları, " +
      "kapsama oranları, yapı sıklıkları — <b>bu çalışmalardan gelmez</b>; 1–8 Eylül 2026 " +
      "bu dönemdeki haberlerden hesaplanır. İkisi karıştırılmamalıdır.</div></section>";
  }
  return h + "</div>";
}

var BTIER = "all";
function renderBiasList() {
  var box = $("#blist"); if (!box) return;
  var qs = (($("#bq") && $("#bq").value) || "").toLocaleLowerCase("tr");
  var count = {}; D.A.forEach(function (a) { a.k.forEach(function (k) { count[k] = (count[k] || 0) + 1; }); });
  var best = {};
  D.A.forEach(function (a) { a.k.forEach(function (k) { if (!best[k] || a.v > best[k].v) best[k] = a; }); });

  var list = D.BR.filter(function (b) {
    if (BTIER !== "all" && b.tier !== BTIER) return false;
    if (!qs) return true;
    return (b.en + " " + (b.tr || "") + " " + (b.df || "") + " " + (b.opdef || ""))
      .toLocaleLowerCase("tr").indexOf(qs) >= 0;
  });

  box.innerHTML = '<p style="font-size:12.5px;color:var(--muted);margin-bottom:12px">' +
    list.length + " yapı gösteriliyor</p>" + list.map(function (b) {
    var n = count[b.k] || 0, real = best[b.k];
    return '<div class="card" style="margin-bottom:10px;cursor:pointer" data-bias="' + esc(b.k) + '">' +
      '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">' +
      '<b style="font-size:15.5px">' + esc(b.en) + "</b>" +
      '<span style="color:var(--muted);font-size:13.5px">' + esc(b.tr || "") + "</span>" +
      '<span class="tier-b ' + b.tier + '" style="margin-left:auto">' + esc(TIERL[b.tier]) + "</span>" +
      (n ? '<span class="tag b">' + n + " başlıkta</span>" : "") + "</div>" +
      '<p style="margin-top:8px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
      esc(b.df || "") + "</p>" +
      (real ? '<p style="margin-top:8px;font-size:12.5px;color:var(--muted)">' +
        "Bu dönemdeki haberlerden örnek: “" + esc(real.t.slice(0, 78)) + "…” — " +
        esc(SRC[real.s] ? SRC[real.s].n : real.s) + "</p>" : "") +
      '<p style="margin-top:9px;font-size:12.5px;color:var(--right)">Ayrıntı, kanıt ve ' +
      "örnek için tıklayın →</p></div>";
  }).join("") || '<div class="note">Eşleşen yapı yok.</div>';
  wireDevices(box);
}

function runAnalyzer() {
  var box = $("#anout"), inp = $("#anin"); if (!box || !inp) return;
  var txt = inp.value.trim();
  if (!txt) { box.innerHTML = ""; return; }
  var hits = runRules(txt);
  var keys = hits.map(function (r) { return r.key; });
  var v = runScore(txt, keys), b = bandOf(v);

  /* The protocol's verdict vocabulary, applied to a single submitted string.
     "No rule fired" is NOT "unbiased" — for a short fragment it is usually
     "not enough text to decide", and the two are kept apart. */
  var words = txt.split(/\s+/).filter(Boolean).length;
  var verdict = hits.length ? "supported" : (words < 6 ? "insufficient_evidence" : "not_supported");
  var VER = {
    supported: ["Yapı saptandı", "b", "Aşağıdaki yapılar metnin yüzeyinde tetiklendi. " +
      "Bu bir kanıt değil, incelenecek yer göstergesidir."],
    not_supported: ["Belirgin yapı saptanmadı", "", "Kuralların baktığı yüzey işaretleri " +
      "bu metinde yok. Bu, metnin yansız olduğu anlamına <b>gelmez</b>: kuralların " +
      "göremediği yapılar (Confirmation Bias, Cherry Picking, Base Rate Fallacy) " +
      "metnin bütününü ve karşılaştırmayı gerektirir."],
    insufficient_evidence: ["Kanıt yetersiz", "b", "Metin karar vermek için fazla kısa. " +
      "Yüzey testleri birkaç kelimelik bir parçada güvenilir çalışmaz."]
  }[verdict];

  var h = '<div style="border-top:1px solid var(--line);padding-top:16px;margin-top:16px">' +
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
    '<span class="tag ' + VER[1] + '">' + VER[0] + "</span>" +
    '<span class="mono" style="font-size:11.5px;color:var(--muted)">' + words + " kelime</span></div>";

  if (verdict === "supported") {
    h += '<div class="an-score"><div class="n" style="color:' +
      (v >= 45 ? "var(--hot)" : "var(--ink)") + '">' + v + "</div><div><b>" + esc(b.tr) +
      '</b><div style="font-size:12.5px;color:var(--muted)">0–100 kalibre edilmiş ' +
      "yanlılık yoğunluğu</div></div></div>" +
      '<div class="bar" style="margin-top:12px;height:8px"><i style="width:' + v +
      "%;background:" + seq(v) + '"></i></div>';
  }
  h += '<p style="margin-top:13px;font-size:13.5px;color:var(--ink2);line-height:1.6">' +
    VER[2] + "</p>";

  if (hits.length) {
    /* Same evidence-strength derivation the corpus uses, so a pasted headline and
       the same headline inside the corpus report identically. */
    var AMB = ["savaş", "kriz", "tehlike", "rekor", "tarihi", "bomba", "gözü", "herkes",
      "milyonlar", "bildirildi", "öğrenildi"];
    var stripped = unquoted(txt.toLocaleLowerCase("tr"));
    hits.forEach(function (r) {
      var bi = BREG[r.key] || BIA[r.key];
      var own = r.ev.some(function (t) { return stripped.indexOf(String(t).toLocaleLowerCase("tr")) >= 0; });
      var spec = r.ev.some(function (t) { return AMB.indexOf(String(t).toLocaleLowerCase("tr")) < 0; });
      var why = [own ? "own_voice" : "quoted_only"];
      if (r.ev.length > 1) why.push("multiple_triggers");
      why.push(spec ? "specific_term" : "ambiguous_term");
      var lvl = (own && spec && r.ev.length > 1) ? "güçlü" : (own && spec) ? "orta" : "zayıf";
      h += '<div class="hit"><div style="display:flex;gap:9px;align-items:baseline;flex-wrap:wrap">' +
        "<b>" + esc(bi ? bi.en : r.key) + "</b>" +
        '<span style="color:var(--ink2);font-size:13px">' + esc(bi ? bi.tr : "") + "</span>" +
        '<button class="devchip" data-bias="' + esc(r.key) + '" style="margin-left:auto">' +
        "ayrıntı</button></div>" +
        '<div style="font-size:13px;color:var(--ink2);margin-top:5px">' + esc(r.rule) + "</div>" +
        '<div class="ev">tetikleyen: ' + r.ev.map(function (e2) {
          return "“" + esc(e2) + "”"; }).join(", ") + "</div>" +
        '<div style="margin-top:8px">' + strengthBlock(lvl, why) + "</div></div>";
    });
  }

  h += '<div class="note" style="margin-top:16px"><b>Yalnızca bu metin elde varken ne ' +
    "söylenemez.</b> Tek bir metinden şunlar karara bağlanamaz: aynı olayın başka " +
    "kurumlarda nasıl verildiği, hangi bilginin dışarıda bırakıldığı, kurumun bu yapıyı " +
    "alışkanlık hâline getirip getirmediği, ve gazetecinin niyeti. Bunlar için " +
    'karşılaştırma gerekir — <a class="lnk" href="#/olaylar">olay karşılaştırmasına ' +
    "bakın</a>.</div>";
  box.innerHTML = h + "</div>";
  wireDevices(box);
}

/* ================================================================ /harita */

var NARRVIEW = "flow";

/* A coded event carries an id from the corpus, so it can borrow the story's own
   least-loaded headline as its name. The four legacy hand-coded entries predate
   the corpus and keep their slugs. */


/* ============================================================== /yanlilik */

var BTIER = "all";



/* ===================================================== narrative helpers ==
   The nine dimensions answer a different question from the intensity score.
   Intensity asks how loaded the wording is; the narrative map asks what STORY
   the outlet is telling — who is the subject, who is held responsible, what
   remedy is implied, and when the story is made to begin. Two outlets can agree
   on every fact and every adjective and still tell two different stories. */
var NDIMS = [["frame","Çerçeve"],["hero","Kahraman"],["blame","Sorumlu tutulan"],
  ["cause","Sunulan neden"],["cons","Öne çıkan sonuç"],["aff","Etkilenen kesim"],
  ["sol","Meşrulaştırılan çözüm"],["moral","Ahlaki çerçeve"],["start","Hikâyenin başlangıcı"]];
var UNSET = function (v) { return !v || /belirtilmiyor|yok|—/i.test(v); };

/** Which dimensions do the outlets actually disagree on? */
function divergentDims(rows) {
  return NDIMS.map(function (d) {
    var vals = {};
    rows.forEach(function (r) { var v = (r[d[0]] || "").trim(); if (v && !UNSET(v)) vals[v] = (vals[v] || 0) + 1; });
    var n = Object.keys(vals).length;
    return { k: d[0], label: d[1], distinct: n, share: n / Math.max(1, rows.length), vals: vals };
  }).sort(function (a, b) { return b.share - a.share; });
}

/** Parallel-sets flow: frame -> blame -> solution, one path per outlet. */
function narrativeFlow(rows) {
  var COLS = narrCols();
  var w = 860, padL = 12, padR = 12, padT = 44, padB = 26, colGap;
  var lanes = COLS.map(function (c) {
    var vals = {};
    rows.forEach(function (r) { var v = (r[c[0]] || "Belirtilmiyor").trim(); vals[v] = (vals[v] || 0) + 1; });
    return Object.keys(vals).sort(function (a, b) { return vals[b] - vals[a]; })
      .map(function (v) { return { v: v, n: vals[v] }; });
  });
  var maxNodes = Math.max.apply(null, lanes.map(function (l) { return l.length; }));
  var rowH = 34, h = padT + maxNodes * rowH + padB;
  var s = svg(w, h);
  var iw = w - padL - padR;
  colGap = iw / (COLS.length - 1);
  var X = function (i) { return padL + colGap * i; };
  var pos = {};
  COLS.forEach(function (c, i) {
    var lane = lanes[i];
    var t = mk("text", { x: X(i), y: 20, "text-anchor": i === 0 ? "start" : i === COLS.length - 1 ? "end" : "middle",
      fill: "var(--muted)", "font-size": 10.5, "font-family": "var(--ff-m)", "letter-spacing": ".08em" });
    t.textContent = c[1].toLocaleUpperCase("tr"); s.appendChild(t);
    var off = (maxNodes - lane.length) * rowH / 2;
    lane.forEach(function (nd, j) {
      var y = padT + off + j * rowH + rowH / 2;
      pos[c[0] + "||" + nd.v] = { x: X(i), y: y };
      var anchor = i === 0 ? "start" : i === COLS.length - 1 ? "end" : "middle";
      var g = mk("g", {});
      g.appendChild(mk("rect", {
        x: anchor === "start" ? X(i) - 4 : anchor === "end" ? X(i) - 4 : X(i) - 3,
        y: y - 12, width: 6, height: 24, rx: 3,
        fill: UNSET(nd.v) ? "var(--line2)" : "var(--ink2)" }));
      /* Paths run behind the middle column, so every label carries a halo of the
         surface colour. Without it the text sits under the lines and is unreadable
         exactly where the diagram is busiest. */
      var lab = mk("text", { x: anchor === "start" ? X(i) + 9 : anchor === "end" ? X(i) - 9 : X(i),
        y: anchor === "middle" ? y - 15 : y + 4, "text-anchor": anchor,
        fill: UNSET(nd.v) ? "var(--muted)" : "var(--ink)", "font-size": 11.5,
        stroke: "var(--surface)", "stroke-width": 3.5, "paint-order": "stroke fill" });
      lab.textContent = nd.v.length > 30 ? nd.v.slice(0, 29) + "…" : nd.v;
      g.appendChild(lab);
      var cnt = mk("text", { x: anchor === "start" ? X(i) + 9 : anchor === "end" ? X(i) - 9 : X(i),
        y: anchor === "middle" ? y + 20 : y + 17, "text-anchor": anchor,
        fill: "var(--muted)", "font-size": 10, "font-family": "var(--ff-m)",
        stroke: "var(--surface)", "stroke-width": 3, "paint-order": "stroke fill" });
      cnt.textContent = nd.n + " kurum"; g.appendChild(cnt);
      s.appendChild(g);
    });
  });
  var paths = [];
  rows.forEach(function (r) {
    var pf = SRC[r.s];
    var pts = COLS.map(function (c) { return pos[c[0] + "||" + ((r[c[0]] || "Belirtilmiyor").trim())]; })
      .filter(Boolean);
    if (pts.length < COLS.length) return;
    var d = "M" + pts[0].x + "," + pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      var x0 = pts[i - 1].x, x1 = pts[i].x, mx = (x0 + x1) / 2;
      d += " C" + mx + "," + pts[i - 1].y + " " + mx + "," + pts[i].y + " " + x1 + "," + pts[i].y;
    }
    var pth = mk("path", { d: d, class: "nflow-path", stroke: lean(pf ? pf.lean : null),
      "stroke-opacity": ".5" });
    bindTip(pth, "<span class='k'>" + esc(pf ? pf.n : r.s) + "</span>" +
      COLS.map(function (c) { return c[1] + ": " + esc(r[c[0]] || "—"); }).join("<br>"));
    pth.addEventListener("pointerenter", function () {
      paths.forEach(function (o) { if (o !== pth) o.classList.add("dim"); });
      pth.setAttribute("stroke-opacity", "1");
    });
    pth.addEventListener("pointerleave", function () {
      paths.forEach(function (o) { o.classList.remove("dim"); });
      pth.setAttribute("stroke-opacity", ".5");
    });
    paths.push(pth); s.appendChild(pth);
  });
  paths.forEach(function (p) { s.insertBefore(p, s.firstChild); });
  return s;
}

/** Prose cards: the same nine dimensions read as a sentence. */


/* ====================================================== framing ladder ==
   One event, outlets stacked plainest at the bottom. Each rung names what it
   adds to the rung below it, which is the clearest way to show that framing is
   built up in steps rather than being a property an outlet simply has. */
function framingLadder(e) {
  var arts = e.a.map(function (i) { return ART[i]; }).sort(function (a, b) { return a.v - b.v; });
  var seen = {};
  var h = '<div class="ladder">';
  arts.forEach(function (a, i) {
    var fresh = a.k.filter(function (k) { return !seen[k]; });
    a.k.forEach(function (k) { seen[k] = 1; });
    var pf = SRC[a.s];
    var cls = i === 0 ? " base" : i === arts.length - 1 ? " top" : "";
    h += '<div class="rung' + cls + '" data-aid="' + a.i + '"><div class="v" style="color:' +
      (a.v >= 45 ? "var(--hot)" : "var(--ink2)") + '">' + a.v + "</div><div>" +
      '<div class="hl-t">' + (a.u ? '<a class="hlnk" href="' + esc(a.u) +
        '" target="_blank" rel="noopener">' + hlTitle(a) + "</a>" : hlTitle(a)) + "</div>" +
      '<div class="who"><span class="dot" style="background:' + lean(pf ? pf.lean : null) +
      '"></span>' + esc(pf ? pf.n : a.s) + "<span>·</span>" + esc(bandOf(a.v).tr) + "</div>";
    if (i === 0) {
      h += '<div class="add" style="color:var(--muted)">Bu basamak olayı bildiriyor; ' +
        "karşılaştırma buradan başlıyor.</div>";
    } else if (fresh.length) {
      h += '<div class="add">Bir alttaki basamağa eklenen: ' +
        fresh.map(function (k) {
          return '<b>' + esc(BIA[k] ? BIA[k].en : k) + "</b>"; }).join(", ") +
        " <span style=\"color:var(--muted)\">(+" + (a.v - arts[i - 1].v) + " puan)</span></div>";
    } else {
      h += '<div class="add" style="color:var(--muted)">Yeni bir yapı eklemiyor; fark ' +
        "vurgu ve noktalamadan geliyor <span>(+" + (a.v - arts[i - 1].v) + " puan)</span></div>";
    }
    h += "</div></div>";
  });
  return h + "</div>";
}

/* ================================================== word-level divergence ==
   Vocabulary one bloc used for this event that the other never did. Blocs come
   from the supplied register placements, so this shows which words travel with
   which placement — not what "the left" or "the right" believes. */
function wordDivergence(e) {
  var byBloc = { left: [], right: [] };
  e.a.forEach(function (i) {
    var a = ART[i], b = bloc(a.s);
    if (v3on("echoChain") && e.rep && e.rep[i]) return;
    if (byBloc[b]) byBloc[b].push(a);
  });
  if (byBloc.left.length < 1 || byBloc.right.length < 1) return "";
  var tk = function (t) {
    return (t || "").toLocaleLowerCase("tr").replace(/['’‘"“”]/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
      .filter(function (w) { return w.length >= 4; });
  };
  var setOf = function (arr) {
    var s2 = {}; arr.forEach(function (a) { tk(a.t).forEach(function (w) { s2[w] = (s2[w] || 0) + 1; }); });
    return s2;
  };
  var L = setOf(byBloc.left), R = setOf(byBloc.right);
  var onlyL = Object.keys(L).filter(function (w) { return !R[w]; })
    .sort(function (a, b) { return L[b] - L[a]; }).slice(0, 16);
  var onlyR = Object.keys(R).filter(function (w) { return !L[w]; })
    .sort(function (a, b) { return R[b] - R[a]; }).slice(0, 16);
  if (!onlyL.length && !onlyR.length) return "";
  return '<div class="divg">' +
    '<div><div class="hd" style="color:var(--left)">Yalnızca sol yerleşimli kurumlarda (' +
    byBloc.left.length + " haber)</div>" +
    (onlyL.length ? onlyL.map(function (w) { return '<span class="wtag">' + esc(w) + "</span>"; }).join("")
      : '<span style="color:var(--muted);font-size:13px">Ayrışan kelime yok</span>') + "</div>" +
    '<div><div class="hd" style="color:var(--right)">Yalnızca sağ yerleşimli kurumlarda (' +
    byBloc.right.length + " haber)</div>" +
    (onlyR.length ? onlyR.map(function (w) { return '<span class="wtag">' + esc(w) + "</span>"; }).join("")
      : '<span style="color:var(--muted);font-size:13px">Ayrışan kelime yok</span>') + "</div></div>";
}

/* ======================================================== blame network ==
   Across every coded event: who gets named as responsible, and by whom. */
/* Who gets named as responsible, and by which bloc.
   A flat count of blamed actors answers the wrong question — the interesting
   one is whether outlets placed differently name DIFFERENT actors for the same
   events. So each row is one actor, split by the register placement of the
   outlets that named it. Only actors named by at least two outlets appear: a
   single naming cannot show agreement or disagreement, and a chart of
   singletons would manufacture a pattern the coding does not contain. */
function blameStats() {
  var actor = {}, rows = 0, attributed = 0;
  narrBlameKeys().forEach(function (k) {
    (D.N[k].rows || []).forEach(function (r) {
      rows++;
      if (r.note || UNSET(r.blame)) return;
      attributed++;
      var t = r.blame.trim();
      var a = (actor[t] = actor[t] || { n: 0, left: 0, mid: 0, right: 0, who: [], ev: [] });
      a.n++; a[bloc(r.s)]++;
      a.who.push((SRC[r.s] ? SRC[r.s].n : r.s) + " (" + BLOCL[bloc(r.s)] + ")");
      if (r.ev) a.ev.push(r.ev);
    });
  });
  var shared = Object.keys(actor).filter(function (t) { return actor[t].n >= (NCUR ? 1 : 2); })
    .sort(function (a, b) { return actor[b].n - actor[a].n; });
  return { actor: actor, shared: shared, rows: rows, attributed: attributed,
    distinct: Object.keys(actor).length };
}
var BLOCL = { left: "sol", mid: "merkez", right: "sağ", none: "yerleşimsiz" };

function blameChart() {
  var st = blameStats();
  if (!st.shared.length) return null;
  var rh = 30, padL = 232, padR = 104, padT = 36, padB = 28;
  var w = 720, h = G4(padT + st.shared.length * rh + padB);
  var s = svg(w, h), iw = w - padL - padR;
  var max = st.actor[st.shared[0]].n;
  var unit = iw / Math.max(4, max);

  tx(s, padL, 16, "kaç kurum sorumlu tuttu", { role: "eb", size: 9.5 });
  [0, 2, 4, 6].filter(function (v) { return v <= Math.max(4, max); }).forEach(function (v) {
    var x = G4(padL + unit * v);
    vrule(s, x, padT - 12, h - padB + 4);
    tx(s, x, h - padB + 18, v, { role: "val", anchor: "middle", size: 10, fill: "var(--muted)" });
  });

  st.shared.forEach(function (t, i) {
    var a = st.actor[t], y = G4(padT + i * rh), bh = 16;
    tx(s, padL - 12, y + bh / 2 + 4, clip(t, 34), { anchor: "end" });
    var x = padL;
    /* Segments in a fixed left→centre→right order so the eye can compare the
       composition of one row against another without re-reading a legend. */
    [["left", "var(--left)"], ["mid", "var(--mid)"], ["right", "var(--right)"]].forEach(function (b) {
      if (!a[b[0]]) return;
      var segw = unit * a[b[0]];
      var g = mk("g", {});
      /* A 2px paper gap between segments — abutting fills of different hues
         read as one blended mark without it. */
      g.appendChild(mk("rect", { x: x, y: y, width: Math.max(2, segw - 2), height: bh, rx: 3,
        fill: b[1], "fill-opacity": .85 }));
      bindTip(g, "<span class='k'>" + esc(t) + "</span>" + a[b[0]] + " " +
        BLOCL[b[0]] + " yerleşimli kurum sorumlu tuttu");
      s.appendChild(g);
      x += segw;
    });
    tx(s, w - padR + 12, y + bh / 2 + 4, a.n + " kurum", { role: "val", size: 10.5,
      fill: "var(--ink2)" });
  });
  return s;
}

/* ================================================ topic x outlet heatmap ==
   Where each outlet gets loud. An outlet can be sober on the economy and
   inflammatory on foreign news; a single average hides that completely. */
function topicHeat() {
  var SEC = ["gundem", "dunya", "ekonomi", "siyaset", "yorum", "egitim", "teknoloji"];
  var live = LIVE.slice().sort(function (a, b) { return (STAT[b].mean || 0) - (STAT[a].mean || 0); });
  var cw = 78, ch = 21, padL = 128, padT = 40;
  var w = padL + SEC.length * cw + 16, h = padT + live.length * ch + 16;
  var s = svg(w, h);
  var cell = {};
  D.A.forEach(function (a) {
    if (!a.p || SEC.indexOf(a.c) < 0) return;
    var k = a.s + "|" + a.c;
    (cell[k] = cell[k] || { n: 0, sum: 0 }).n++; cell[k].sum += a.v;
  });
  SEC.forEach(function (sec, j) {
    var t = mk("text", { x: padL + j * cw + cw / 2, y: padT - 12, "text-anchor": "middle",
      fill: "var(--muted)", "font-size": 10, "font-family": "var(--ff-m)",
      "letter-spacing": ".05em" });
    t.textContent = (SECT[sec] || sec).toLocaleUpperCase("tr"); s.appendChild(t);
  });
  live.forEach(function (k, i) {
    var y = padT + i * ch;
    var lb = mk("text", { x: padL - 9, y: y + ch / 2 + 3.5, "text-anchor": "end",
      fill: "var(--ink2)", "font-size": 11 });
    lb.textContent = SRC[k] ? SRC[k].n : k; s.appendChild(lb);
    SEC.forEach(function (sec, j) {
      var c = cell[k + "|" + sec];
      /* Every cell carries a hairline, not just the empty ones. The two
         lightest steps of the sequential ramp sit under 3:1 against paper, so
         without a border a low-value cell has no readable boundary at all. */
      var g = mk("rect", { x: padL + j * cw + 1, y: y + 1, width: cw - 3, height: ch - 3, rx: 2,
        fill: !c ? "var(--sunk)" : seq(Math.min(100, (c.sum / c.n) * 3.2)),
        stroke: "var(--line)", "stroke-width": .8 });
      bindTip(g, "<span class='k'>" + esc(SRC[k] ? SRC[k].n : k) + " · " +
        esc(SECT[sec] || sec) + "</span>" + (!c ? "Bu bölümde haber yok" :
        c.n + " haber · ortalama yoğunluk " + (c.sum / c.n).toFixed(1)));
      s.appendChild(g);
      /* The value is printed whenever there IS one. Hiding it below three
         articles left the palest cells carrying no information a reader could
         recover without hovering — which a touch device cannot do at all. */
      if (c) {
        tx(s, padL + j * cw + cw / 2, y + ch / 2 + 4, (c.sum / c.n).toFixed(0),
          { role: "val", anchor: "middle", size: 10,
            fill: (c.sum / c.n) >= 20 ? "var(--paper)" : "var(--ink2)",
            opacity: c.n < 3 ? .55 : 1 });
      }
    });
  });
  return s;
}


/* ================================================================ /bulgular
   Every number on this page is computed from the corpus at render time, so the
   page cannot drift away from the data behind it. Where a finding is a NULL
   result it is stated as one — a null is a finding, and hiding it would leave
   only the dramatic half of what the week actually showed. */

/* ==================================================== applied methods ====
   Three published methods, run against this corpus rather than cited at it.
   Each carries the limit its own author states — including, in two cases, the
   author's explicit warning against the thing a naive version would claim. */

/* ---------------------------------------------------------------- Hamborg
   Target-dependent analysis (Hamborg 2023, §5.3/§6.3). His argument: in news,
   what matters is not whether a sentence is negative but WHO it is negative
   ABOUT — and sentiment toward an actor is carried by described actions, not
   by adjectives. He also reports that dictionary-based sentiment on news is
   near useless, so no polarity score is produced here at all. What is produced
   is directed: which actor a flagged device is attached to, and whether that
   actor is named as the one acting or the one acted upon.

   Turkish makes the second half unusually tractable. Case is marked by suffix:
   the accusative (-ı/-i/-u/-ü, -yı/-yi/-yu/-yü) marks the patient, the ablative
   (-dan/-den/-tan/-ten) the source of an action. A name carrying an accusative
   suffix in a harm headline is the one harmed; a bare nominative name before a
   transitive verb is the one acting.

   Hamborg's warning is respected literally: §2.6 of his thesis tests headline-
   only slant estimation and finds it incoherent with full-text analysis. So
   nothing here is described as the outlet's or the article's slant. It is a
   cross-outlet DIFFERENTIAL on one event: given the same occurrence, which
   actor did each newsroom put in the acting position. */
var ACC = /['’]?(?:y)?[ıiuü]$/;                 // accusative
var ABL = /['’]?(?:t|d)[ae]n$/;                 // ablative
var DAT = /['’]?(?:y)?[ae]$/;                   // dative
var HARM = ["öldür", "vur", "saldır", "bombala", "yarala", "katlet", "vurdu", "gözaltı",
  "tutukla", "yıktı", "bastı", "kaçır", "tehdit", "suçla", "hedef al", "operasyon"];

function actorsOf(a) {
  /* Proper nouns by the Turkish orthographic convention: a suffix attached to
     a name is separated by an apostrophe (Netanyahu'dan, Bingöl'deki). That
     apostrophe is a far more reliable proper-noun marker than capitalisation,
     which Turkish headlines apply to every word. */
  var out = [];
  (a.t || "").split(/\s+/).forEach(function (w, i) {
    var clean = w.replace(/[^\wÇĞİÖŞÜçğıöşü'’]/g, "");
    if (!clean || clean.length < 3) return;
    var hasApos = /['’]/.test(clean);
    var capped = /^[A-ZÇĞİÖŞÜ]/.test(clean);
    if (!hasApos && !(capped && i > 0)) return;
    var base = clean.split(/['’]/)[0];
    if (base.length < 3) return;
    var role = ACC.test(clean) ? "patient" : ABL.test(clean) ? "source" :
      DAT.test(clean) ? "goal" : "agent";
    out.push({ name: base, role: role, raw: clean, pos: i });
  });
  return out;
}

/** Directed device attribution for one event: who is named as acting, who as
    acted upon, and which outlets flagged a device on which actor. */
function actorMatrix(e) {
  var arts = e.a.map(function (i) { return ART[i]; });
  var isHarm = arts.some(function (a) {
    return HARM.some(function (h) { return (a.t || "").toLocaleLowerCase("tr").indexOf(h) >= 0; }); });
  var actors = {};
  arts.forEach(function (a) {
    actorsOf(a).forEach(function (ac) {
      var k = ac.name.toLocaleLowerCase("tr");
      var r = (actors[k] = actors[k] || { name: ac.name, agent: [], patient: [], other: [], devices: {} });
      var bucket = ac.role === "patient" ? "patient" : ac.role === "agent" ? "agent" : "other";
      if (r[bucket].indexOf(a.s) < 0) r[bucket].push(a.s);
      /* A device flagged in this headline is attributed to this actor only when
         the headline names exactly one actor — with two or more, Hamborg's own
         error analysis puts 14-20% of attributions on the wrong target, and a
         rule engine has no way to do better. */
      if (actorsOf(a).length === 1) {
        a.k.forEach(function (dk) { (r.devices[dk] = r.devices[dk] || []).push(a.s); });
      }
    });
  });
  var rows = Object.keys(actors).map(function (k) { return actors[k]; })
    .filter(function (r) { return r.agent.length + r.patient.length >= 2; })
    .sort(function (x, y) {
      return (y.agent.length + y.patient.length) - (x.agent.length + x.patient.length); });
  /* The finding is a DISAGREEMENT: an actor some outlets put in the acting
     position and others put in the receiving position, for the same event. */
  var contested = rows.filter(function (r) { return r.agent.length && r.patient.length; });
  return { rows: rows, contested: contested, harm: isHarm, n: arts.length };
}

/* ---------------------------------------------------------------- ValuesML
   Value-topic salience, NOT values detection (ValuesML, Mirtsching et al.).
   The paper uses Schwartz's 19 refined values, annotated by trained value
   researchers on whole sentences WITH the article around them, and still
   reaches only Krippendorff alpha 0.46 on Turkish. Rules on isolated headlines
   cannot approach that, and the paper explicitly reports that dictionary
   methods fail on exactly the polysemous, ideologically loaded vocabulary this
   corpus is made of.

   So this measures something narrower and honestly nameable: which
   value-adjacent VOCABULARY an outlet reaches for when covering an event the
   others also covered. Only the five lexically anchored values are included;
   the ones the paper's own annotators most often confused (Self-direction
   Thought vs Action, Achievement vs Power) are left out entirely, and the
   attainment layer is not attempted — Turkish marks negation with a suffix,
   which a lexicon cannot see. */
var VALUES = [
  { k: "security", tr: "Güvenlik", en: "Security (Personal / Societal)",
    df: "Düzenin, kamu güvenliğinin ve tehdide karşı korunmanın öne çıkarılması.",
    w: ["terör", "güvenlik", "saldır", "tehdit", "tehlike", "asayiş", "operasyon",
        "şehit", "savun", "koru", "istikrar", "huzur", "sınır güvenliği"] },
  { k: "power", tr: "Kaynak ve güç", en: "Power — Resources",
    df: "Para, kaynak, ihale, piyasa ve maddi güç üzerinden kurulan çerçeve.",
    w: ["bütçe", "ihale", "zam", "dolar", "faiz", "enflasyon", "milyar", "yatırım",
        "kâr", "gelir", "servet", "piyasa", "borsa", "kaynak aktar"] },
  { k: "rules", tr: "Kural ve uyum", en: "Conformity — Rules",
    df: "Yasa, yönetmelik, denetim ve kurallara uyma ya da ihlal üzerinden çerçeve.",
    w: ["yasa", "yönetmelik", "ihlal", "ceza", "mahkeme", "yargı", "denetim",
        "soruşturma", "hüküm", "kural", "yasak", "düzenleme", "tutukla"] },
  { k: "tradition", tr: "Gelenek", en: "Tradition",
    df: "Din, millî kimlik, gelenek ve tarihsel süreklilik vurgusu.",
    w: ["bayram", "cami", "millî", "milli", "ecdat", "gelenek", "manevi", "dinî",
        "kutsal", "vatan", "şanlı", "tarihî miras", "aile değerleri"] },
  { k: "nature", tr: "Doğa ve çevre",  en: "Universalism — Nature",
    df: "Çevre, iklim ve doğal yaşamın korunmasına yapılan atıf.",
    w: ["çevre", "iklim", "karbon", "orman", "doğa", "kirlilik", "yeşil",
        "sürdürülebilir", "ekolojik", "su kaynak", "deprem riski"] }
];
function valueHits(text) {
  var t = (text || "").toLocaleLowerCase("tr");
  return VALUES.filter(function (v) {
    return v.w.some(function (w) { return t.indexOf(w) >= 0; });
  }).map(function (v) { return v.k; });
}
/** Per-outlet value vocabulary rate, restricted to shared events so the
    comparison is on the same occurrences rather than on different news diets. */
function valueProfile() {
  var shared = {};
  D.E.forEach(function (e) {
    if (e.k !== "event" || e.s.length < 3) return;
    e.a.forEach(function (i) { shared[i] = 1; });
  });
  var acc = {};
  D.A.forEach(function (a) {
    if (!shared[a.i]) return;
    var r = (acc[a.s] = acc[a.s] || { n: 0, v: {} });
    r.n++;
    valueHits(a.t).forEach(function (k) { r.v[k] = (r.v[k] || 0) + 1; });
  });
  return Object.keys(acc).filter(function (k) { return acc[k].n >= 8 && SRC[k]; })
    .map(function (k) {
      var r = acc[k], o = { s: k, n: r.n };
      VALUES.forEach(function (v) { o[v.k] = r.v[v.k] ? r.v[v.k] / r.n : 0; });
      return o;
    });
}

/* ---------------------------------------------------------------- Yanatma
   State advertising (Yanatma 2021). The figures on outlet pages are Table 1,
   2015 column, in US DOLLARS, obtained by the author under the Right to
   Information Act. They cover PRINT dailies only, so an online outlet has no
   figure by definition rather than a missing one.

   Yanatma's own position rules out the obvious chart. He writes that "it is not
   possible to produce a general model or formula to reveal any correlation
   between circulation and distribution", and the mechanism he documents runs
   through publishers replacing editors, not through payment for a given story.
   Money also follows coverage as often as it leads it: his clearest cases are
   outlets whose funding moved AFTER their line changed. A cross-sectional
   correlation between this money and this week's language would therefore be
   uninterpretable, and is not drawn.

   What IS defensible is his actual test: allocation per copy sold, compared
   WITHIN a circulation band, where the state's own stated rule says the figures
   should be alike. Where they are not alike, that is the paper's finding, and
   it can be shown without any claim about a headline. */
function yanatmaTest() {
  var rows = D.S.filter(function (p) { return p.own && p.own.bik && p.own.circ; })
    .map(function (p) {
      return { s: p.s, n: p.n, bik: p.own.bik, circ: p.own.circ,
        perCopy: p.own.bik / p.own.circ, grp: p.own.grp || "—", lean: p.lean };
    }).sort(function (a, b) { return b.perCopy - a.perCopy; });
  /* Circulation bands, so like is compared with like. */
  var band = function (c) { return c >= 250000 ? "250 bin ve üzeri" :
    c >= 100000 ? "100–250 bin" : c >= 50000 ? "50–100 bin" : "50 binin altında"; };
  var bands = {};
  rows.forEach(function (r) { (bands[band(r.circ)] = bands[band(r.circ)] || []).push(r); });
  /* Within each band, the spread between the best- and worst-funded outlet per
     copy. A stated circulation rule predicts a narrow spread. */
  var spreads = Object.keys(bands).map(function (b) {
    var g = bands[b].slice().sort(function (x, y) { return y.perCopy - x.perCopy; });
    return { band: b, rows: g, hi: g[0], lo: g[g.length - 1],
      ratio: g.length > 1 ? g[0].perCopy / g[g.length - 1].perCopy : null };
  }).filter(function (x) { return x.rows.length >= 2; })
    .sort(function (a, b) { return (b.ratio || 0) - (a.ratio || 0); });
  var noFigure = D.S.filter(function (p) {
    return LIVE.indexOf(p.s) >= 0 && (!p.own || !p.own.bik); });
  return { rows: rows, spreads: spreads, noFigure: noFigure };
}

/* =================================================== derived measures =====
   Three things the corpus can answer that a per-article score cannot. Each is
   computed here at render time from the shipped data, so the page cannot drift
   away from the numbers behind it, and each carries the reason it might be
   wrong alongside the result. */

/** 1. Deviation on shared stories.
    A single outlet's average mixes its own news diet into the number: an outlet
    that covers more crime will score higher without treating any one story
    differently. Restricting to stories MULTIPLE outlets covered removes that,
    because every comparison is then against the same underlying facts. The
    measure is the mean signed gap between an outlet's headline and the mean of
    the other outlets on the same story. */
function deviationProfile() {
  var acc = {};
  D.E.forEach(function (e) {
    if (e.k !== "event" || e.s.length < 3) return;
    var arts = e.a.map(function (i) { return ART[i]; });
    arts.forEach(function (a) {
      var others = arts.filter(function (o) { return o.s !== a.s; });
      if (!others.length) return;
      var om = others.reduce(function (t, o) { return t + o.v; }, 0) / others.length;
      var r = (acc[a.s] = acc[a.s] || { n: 0, sum: 0, hot: 0, cold: 0 });
      r.n++; r.sum += a.v - om;
      if (a.v === Math.max.apply(null, arts.map(function (x) { return x.v; })) && arts.length > 2) r.hot++;
      if (a.v === Math.min.apply(null, arts.map(function (x) { return x.v; })) && arts.length > 2) r.cold++;
    });
  });
  return Object.keys(acc).filter(function (k) { return acc[k].n >= 50 && SRC[k]; })
    .map(function (k) {
      return { s: k, n: acc[k].n, mean: acc[k].sum / acc[k].n,
        hot: acc[k].hot, cold: acc[k].cold };
    }).sort(function (a, b) { return b.mean - a.mean; });
}

/** 2. Publication order, and whether the first framing travels.
    Two questions from the same timestamps: which outlets tend to be first on a
    shared story, and — the interesting one — when the FIRST article on a story
    uses a device, are later articles on that story more likely to use it than
    the corpus baseline? A raised rate is consistent with framing spreading from
    the first mover, but it is equally consistent with the event itself simply
    inviting that device, and nothing here can separate the two. */
function timingProfile() {
  var rank = {}, cascade = { withDevice: 0, withDeviceFollowed: 0, base: 0, baseTotal: 0 };
  var corpusRate = {};
  D.A.forEach(function (a) { a.k.forEach(function (k) { corpusRate[k] = (corpusRate[k] || 0) + 1; }); });

  D.E.forEach(function (e) {
    if (e.k !== "event" || e.s.length < 3) return;
    var arts = e.a.map(function (i) { return ART[i]; })
      .filter(function (a) { return a.d; })
      .sort(function (a, b) { return a.d.localeCompare(b.d); });
    if (arts.length < 3) return;
    arts.forEach(function (a, i) {
      var r = (rank[a.s] = rank[a.s] || { n: 0, sum: 0, first: 0 });
      r.n++; r.sum += i / (arts.length - 1); if (i === 0) r.first++;
    });
    /* Did a device present in the first article show up again later? */
    var firstKeys = arts[0].k, rest = arts.slice(1);
    if (!rest.length) return;
    firstKeys.forEach(function (k) {
      cascade.withDevice++;
      if (rest.some(function (a) { return a.k.indexOf(k) >= 0; })) cascade.withDeviceFollowed++;
    });
    /* Baseline: how often does ANY device appear in the later articles at all? */
    Object.keys(corpusRate).forEach(function (k) {
      if (firstKeys.indexOf(k) >= 0) return;
      cascade.baseTotal++;
      if (rest.some(function (a) { return a.k.indexOf(k) >= 0; })) cascade.base++;
    });
  });
  var rows = Object.keys(rank).filter(function (k) { return rank[k].n >= 50 && SRC[k]; })
    .map(function (k) {
      return { s: k, n: rank[k].n, mean: rank[k].sum / rank[k].n, first: rank[k].first };
    }).sort(function (a, b) { return a.mean - b.mean; });
  return { rows: rows,
    followRate: cascade.withDevice ? cascade.withDeviceFollowed / cascade.withDevice : 0,
    baseRate: cascade.baseTotal ? cascade.base / cascade.baseTotal : 0,
    n: cascade.withDevice };
}

/** 3. Does how an outlet WRITES match where the register PLACES it?
    The register's political placements are supplied data this site repeatedly
    warns is unverified. This is the one test the corpus can run on them: build
    each outlet's behavioural profile from its own headlines — which devices it
    reaches for, at what rate — measure how similar each PAIR of outlets is, and
    ask whether behaviourally similar outlets are also placed near each other.
    A relationship would corroborate the register. Its absence does not refute
    the register: placement is about political position, and the device profile
    is about writing habit, which the corpus has already shown are different
    things. Either way the number belongs in the open. */
function registerCheck() {
  var keys = Object.keys(BIA);
  var prof = {};
  LIVE.forEach(function (k) {
    var mine = polOf(k);
    if (mine.length < 20 || !SRC[k] || SRC[k].lean == null) return;
    prof[k] = keys.map(function (kk) {
      return mine.filter(function (a) { return a.k.indexOf(kk) >= 0; }).length / mine.length;
    });
  });
  var slugs = Object.keys(prof), pairs = [];
  for (var i = 0; i < slugs.length; i++) {
    for (var j = i + 1; j < slugs.length; j++) {
      var a = prof[slugs[i]], b = prof[slugs[j]];
      var d = 0;
      for (var m = 0; m < a.length; m++) d += Math.pow(a[m] - b[m], 2);
      pairs.push({ a: slugs[i], b: slugs[j], dist: Math.sqrt(d),
        leanGap: Math.abs(SRC[slugs[i]].lean - SRC[slugs[j]].lean) });
    }
  }
  if (pairs.length < 8) return null;
  var mx = pairs.reduce(function (t, p) { return t + p.dist; }, 0) / pairs.length;
  var my = pairs.reduce(function (t, p) { return t + p.leanGap; }, 0) / pairs.length;
  var num = 0, dx = 0, dy = 0;
  pairs.forEach(function (p) {
    num += (p.dist - mx) * (p.leanGap - my);
    dx += Math.pow(p.dist - mx, 2); dy += Math.pow(p.leanGap - my, 2);
  });
  var r = num / Math.sqrt(dx * dy);
  pairs.sort(function (x, y) { return x.dist - y.dist; });
  return { r: r, pairs: pairs, n: slugs.length, closest: pairs.slice(0, 6),
    /* The pairs the register separates most but the writing separates least. */
    surprising: pairs.slice(0, 40).filter(function (p) { return p.leanGap >= 30; })
      .slice(0, 5) };
}

var FINDINGS = null;
function findings() {
  if (FINDINGS) return FINDINGS;
  FINDINGS = findingsCompute().filter(Boolean);
  FINDINGS.forEach(function (f, i) { f.id = f.n; f.n = (i < 9 ? "0" : "") + (i + 1); });
  return FINDINGS;
}
/* Display number of a finding by its fixed id (findings that do not apply are left out, so numbers shift). */
function findNo(id) { var f = findings().filter(function (x) { return x.id === id; })[0]; return f ? f.n : id; }
function findingsCompute() {
  var out = [];
  var pol = POL;

  /* 01 — one word, the widest gap in the corpus */
  var ev = D.E.filter(function (e) { return e.k === "event"; })
    .sort(function (a, b) { return b.p - a.p; })[0];
  var arts = ev.a.map(function (i) { return ART[i]; }).sort(function (a, b) { return b.v - a.v; });
  var words = {};
  arts[0].e.forEach(function (x) { String(x[1] || "").split(", ").forEach(function (w) { words[w.trim()] = 1; }); });
  out.push({ n: "01", big: ev.p, bigl: "puanlık fark",
    title: (Object.keys(words).length > 1 ? "Birkaç kelime, " : "Tek kelime, ") + ev.p + " puan",
    claim: "Aynı olayı veren " + ev.s.length + " kurumdan " +
      esc(SRC[arts[0].s].n) + " <b>" + arts[0].v + "</b>, " +
      esc(SRC[arts[arts.length - 1].s].n) + " <b>" + arts[arts.length - 1].v +
      "</b> puan aldı. Farkı yaratan olgu değil, " + (Object.keys(words).length > 1 ? "birkaç sözcük" : "tek bir sözcük") + ": <b>“" +
      esc(Object.keys(words).join("”, “")) + "”</b>. Bu sözcük iki yapıyı birden tetikliyor — " +
      "kurumun kendi sesiyle bir aktöre sıfat yakıştırması, ve o sıfatın arka plan olgusu " +
      "gibi tekrarlanması.",
    body: '<div class="panel" style="padding:4px 18px 14px">' +
      arts.map(function (a) { return artRow(a); }).join("") + "</div>" +
      '<p style="margin-top:12px"><a class="lnk" href="#/olay?e=' + ev.i +
      '">Bu olayın tam karşılaştırması →</a></p>' });

  /* 02 — loaded language is the exception */
  var band = {}; D.A.forEach(function (a) { band[a.b] = (band[a.b] || 0) + 1; });
  var plain = (band.wire || 0) + (band.idiom || 0);
  out.push({ n: "02", big: "%" + (100 * plain / D.A.length).toFixed(1), bigl: "olayı bildiriyor",
    title: "Yüklü dil kuraldışıdır, kural değil",
    claim: "Olaylara giren " + D.A.length.toLocaleString("tr") + " başlığının <b>%" +
      (100 * plain / D.A.length).toFixed(1) + "</b>'i en alttaki iki bantta: olayı bildiriyor, " +
      "yeniden çerçevelemiyor. Sürekli çerçeveleme ve üstü yalnızca <b>" +
      (D.A.length - plain) + " başlıkta</b> görülüyor. Rutin Türk haberciliği büyük ölçüde " +
      "ortak bir dil kullanıyor — ilginç olan istisnalar, ve onları ancak taban bu kadar " +
      "sakin olduğu için görebiliyoruz.",
    chart: "f2", draw: bandChart,
    take: "Her haberde yanlılık bulan bir ölçek işe yaramaz. Bu dağılımın bu kadar " +
      "sağa <b>ince</b> olması, üst bantlara çıkan o " + (D.A.length - plain) +
      " başlığın gerçekten ayrıksı olduğu anlamına gelir." });

  out.push(finding03());

  /* 04 — device signatures are outlet-specific and not one-sided */
  var cp = 0, cr = {};
  pol.forEach(function (a) { cp++; a.k.forEach(function (k) { cr[k] = (cr[k] || 0) + 1; }); });
  var sig = [];
  LIVE.forEach(function (sl) {
    var mine = polOf(sl);
    if (mine.length < 20 || !SRC[sl]) return; // the table shows name and placement: profiled outlets only
    var c = {}; mine.forEach(function (a) { a.k.forEach(function (k) { c[k] = (c[k] || 0) + 1; }); });
    Object.keys(c).forEach(function (k) {
      if (c[k] < 4) return;
      sig.push({ s: sl, k: k, r: (c[k] / mine.length) / (cr[k] / cp), n: c[k] });
    });
  });
  sig.sort(function (a, b) { return b.r - a.r; });
  out.push({ n: "04", big: sig[0].r.toFixed(1) + "×", bigl: "bütün haberlerin ortalaması",
    title: "Her kurumun kendine ait bir imzası var",
    claim: (function () { var sides = {}; sig.slice(0, 4).forEach(function (x) { sides[sideOf(x.s)] = 1; });
      return sides.left && sides.right ? "Ve bu imza yelpazenin bir tarafına ait değil. " :
        "En güçlü dört imza yelpazenin " + (sides.right ? "sağ" : sides.left ? "sol" : "merkez") + " tarafındaki kurumlarda. "; })() +
      sig.slice(0, 4).map(function (x) {
        return "<b>" + esc(SRC[x.s].n) + "</b> " + esc(BIA[x.k] ? BIA[x.k].en : x.k) +
          " yapısına bütün haberlerin ortalamasının <b>" + x.r.toFixed(1) + " katı</b> sıklıkta başvuruyor";
      }).join("; ") + ". Ana akım ve muhalif yayınların da kendi tercih ettiği araçları var; " +
      "fark aracın <b>hangisi</b> olduğunda.",
    body: '<div class="scroller panel"><table><thead><tr><th>Kurum</th><th>Yapı</th>' +
      '<th class="r">Korpusa oran</th><th class="r">Başlık</th><th>Yerleşim</th>' +
      "</tr></thead><tbody>" + sig.slice(0, 10).map(function (x) {
        return '<tr style="cursor:pointer" onclick="location.hash=\'/kurum?s=' + x.s + '\'">' +
          "<td><b>" + esc(SRC[x.s].n) + "</b></td><td>" +
          esc(BIA[x.k] ? BIA[x.k].en : x.k) + '</td><td class="r num" style="color:var(--hot)">' +
          x.r.toFixed(1) + '×</td><td class="r num">' + x.n + "</td>" +
          '<td style="min-width:110px"><div class="spec"><i style="left:calc(' +
          SRC[x.s].lean + "% - 1px);background:" + lean(SRC[x.s].lean) + '"></i></div></td></tr>';
      }).join("") + "</tbody></table></div>" });

  /* 05 — placement does not predict loudness */
  var pts = LIVE.map(function (k) {
    var m = polOf(k);
    return { x: SRC[k] ? SRC[k].lean : null, y: m.length ? m.reduce(function (t, a) { return t + a.v; }, 0) / m.length : null };
  }).filter(function (p) { return p.x != null && p.y != null; });
  var mx = pts.reduce(function (t, p) { return t + p.x; }, 0) / pts.length;
  var my = pts.reduce(function (t, p) { return t + p.y; }, 0) / pts.length;
  var num = 0, dx = 0, dy = 0;
  pts.forEach(function (p) { num += (p.x - mx) * (p.y - my); dx += Math.pow(p.x - mx, 2); dy += Math.pow(p.y - my, 2); });
  var r = num / Math.sqrt(dx * dy);
  /* 05 — the finding a straight line could not see.
     This replaces an earlier version that fitted a LINE, got r = 0.20, and
     reported "placement does not predict loudness". That reading was an
     artefact of the model: the relationship is a valley, and a line drawn
     through a valley is flat. */
  var PF = polarFit();
  if (PF) {
    var lift = PF.midMean ? PF.edgeMean / PF.midMean : 1;
    out.push({ n: "05", big: (PF.edgeMean >= PF.midMean ? "+" : "") + (PF.edgeMean - PF.midMean).toFixed(1),
      bigl: "puan · uçlardaki kurumlar, merkeze göre",
      title: PF.edgeMean > PF.midMean ? "Sertlik sağda ya da solda değil, uçlarda" : "Uçlardaki kurumlar merkezden daha sert değil",
      claim: (PF.edgeMean > PF.midMean ? "Yelpazenin <b>iki ucundaki</b> kurumlar, merkeze yakın kurumlardan daha yüklü " +
        "bir dil kullanıyor. " : "Bu dönemde yelpazenin uçlarındaki kurumlar merkeze yakın kurumlardan daha yüklü bir dil kullanmıyor. ") + "Uçlardaki " + PF.edge.length + " kurumun ortalaması <b>" +
        PF.edgeMean.toFixed(1) + "</b>, merkezdeki " + PF.mid.length + " kurumunki <b>" +
        PF.midMean.toFixed(1) + "</b> — aradaki fark " +
        ((lift - 1) * 100).toFixed(0) + "%." + (PF.edgeMean > PF.midMean ? " Bu, sol–sağ ekseninin kendisinin bir şey " +
        "söylemediği anlamına geliyor: <b>hangi</b> uçta durduğunuz değil, <b>ne kadar " +
        "uçta</b> durduğunuz sertliği öngörüyor. Aşağıdaki kesikli eğri noktalara " +
        "uydurulmuş bir <b>parabol</b>dur; çukur biçimi kutuplaşmanın imzasıdır." : " Aşağıdaki kesikli eğri noktalara uydurulmuş bir parabol."),
      note: polarNote(PF, r),
      chart: "f5", draw: polarChart, eb: "kurum yerleşimi × ortalama yoğunluk",
      legend: [{ c: "var(--left)", t: "sola yerleşik kurum" }, { c: "var(--mid)", t: "merkez" },
        { c: "var(--right)", t: "sağa yerleşik kurum" },
        { dash: 1, t: "noktalara uydurulmuş parabol" }],
      take: "Bir yayının <b>hangi tarafta</b> olduğunu bilmek, dilinin ne kadar sert " +
        "olacağını söylemiyor. <b>Merkeze ne kadar uzak</b> olduğunu bilmek söylüyor. " +
        "Kutuplaşmayı ölçmenin yolu tarafı saymak değil, mesafeyi ölçmektir." });
  }

  /* 06 — topic beats outlet, for some outlets */
  var SEC = ["gundem", "dunya", "ekonomi", "siyaset"];
  var swings = [];
  LIVE.forEach(function (k) {
    var m = {};
    SEC.forEach(function (sec) {
      var g = polOf(k).filter(function (a) { return a.c === sec; });
      if (g.length >= 5) m[sec] = g.reduce(function (t, a) { return t + a.v; }, 0) / g.length;
    });
    var ks = Object.keys(m); if (ks.length < 2) return;
    var hi = ks.reduce(function (a, b) { return m[a] > m[b] ? a : b; });
    var lo = ks.reduce(function (a, b) { return m[a] < m[b] ? a : b; });
    if (m[hi] - m[lo] >= 8) swings.push({ s: k, hi: hi, lo: lo, d: m[hi] - m[lo], hv: m[hi], lv: m[lo] });
  });
  swings.sort(function (a, b) { return b.d - a.d; });
  if (swings.length) {
    var t0 = swings[0];
    out.push({ n: "06", big: "+" + t0.d.toFixed(1), bigl: "puan, aynı kurum içinde",
      title: "Bir kurum konudan konuya sesini değiştiriyor",
      claim: "<b>" + esc(SRC[t0.s].n) + "</b> " + esc(SECT[t0.hi] || t0.hi).toLocaleLowerCase("tr") +
        " haberlerinde ortalama <b>" + t0.hv.toFixed(1) + "</b>, " +
        esc(SECT[t0.lo] || t0.lo).toLocaleLowerCase("tr") + " haberlerinde <b>" + t0.lv.toFixed(1) +
        "</b> puan alıyor — aynı kurum, <b>" + t0.d.toFixed(1) + " puanlık</b> iç fark. " +
        "Tek bir kurum ortalaması bunu tamamen gizler. Bir yayını “yanlı” ya da “ölçülü” diye " +
        "etiketlemek, hangi konuda olduğunu sormadan yanıltıcıdır. Aşağıda bunu yapan " +
        "<b>" + swings.length + " kurumun</b> her biri bir satır: soldaki nokta o kurumun en " +
        "sakin bölümü, sağdaki en sert bölümü, aradaki çizgi de kendi içindeki mesafesi.",
      chart: "f6",
      /* Purpose-built for this claim. The generic topic heatmap shows every
         outlet against every section at once; this finding is about the SPAN
         inside a single outlet, so the span is what gets drawn. */
      draw: function () {
        return dumbbellChart(swings.slice(0, 10).map(function (x, i) {
          return { label: SRC[x.s] ? SRC[x.s].n : x.s, focal: i === 0,
            a: { v: +x.lv.toFixed(1), c: "var(--mid)" },
            b: { v: +x.hv.toFixed(1), c: "var(--hot)" },
            gapLabel: "+" + x.d.toFixed(1),
            href: "/kurum?s=" + x.s,
            tip: "<span class='k'>" + esc(SRC[x.s] ? SRC[x.s].n : x.s) + "</span>" +
              esc(SECT[x.lo] || x.lo) + " " + x.lv.toFixed(1) + " · " +
              esc(SECT[x.hi] || x.hi) + " " + x.hv.toFixed(1) +
              "<br>Kendi içinde " + x.d.toFixed(1) + " puanlık fark" };
        }), { min: 0, max: Math.ceil(Math.max.apply(null, swings.map(function (x) { return x.hv; })) / 4) * 4,
          padL: 128, padR: 80, axis: "0–100 yoğunluk ölçeği" });
      },
      legend: [{ c: "var(--mid)", t: "kurumun en sakin bölümü" },
        { c: "var(--hot)", t: "kurumun en sert bölümü" },
        { line: 1, c: "var(--line2)", t: "aradaki fark" }],
      take: "Uzun çizgi, kurumun konuya göre ses değiştirdiği anlamına gelir. " +
        "Kısa çizgi, aynı dili her konuda kurduğu. İkisi de bir kurum ortalamasının " +
        "arkasında görünmez kalır." });
  }

  var f07 = finding07(); if (f07) out.push(f07);

  /* 08 — the same story, written hotter or cooler than the room */
  var dev = deviationProfile();
  if (dev.length >= 4) {
    var hottest = dev[0], coolest = dev[dev.length - 1];
    out.push({ n: "08", big: (hottest.mean > 0 ? "+" : "") + hottest.mean.toFixed(1),
      bigl: "puan, aynı olayları verenlere göre",
      title: "Aynı olay, odadakinden daha sert bir dille",
      claim: "Bir kurumun genel ortalaması onun haber karışımını da içerir: daha çok " +
        "asayiş haberi veren bir yayın, hiçbir olayı farklı kurmadan da yüksek puan alır. " +
        "Bu ölçü onu ortadan kaldırıyor — yalnızca <b>birden fazla kurumun verdiği</b> " +
        "olaylara bakıyor ve her kurumun başlığını, aynı olguyu bildiren diğerlerinin " +
        "ortalamasıyla karşılaştırıyor. <b>" + esc(SRC[hottest.s].n) + "</b> aynı olayları " +
        "veren kurumlardan ortalama <b>" + hottest.mean.toFixed(1) + " puan daha yüklü</b>, " +
        "<b>" + esc(SRC[coolest.s].n) + "</b> ise <b>" + Math.abs(coolest.mean).toFixed(1) +
        " puan daha yalın</b> yazıyor. Aradaki " + dev.length + " kurumdan <b>" +
        dev.filter(function (x) { return Math.abs(x.mean) <= 2; }).length +
        " tanesi</b> ±2 puanlık bir bandın içinde kalıyor: çoğu yayın ortak olayları " +
        "odanın geri kalanıyla hemen hemen aynı sıcaklıkta veriyor. Sıralamanın " +
        "siyasi yelpazeyi <b>takip etmediğine</b> dikkat edin — muhalif ve hükümete " +
        "yakın yayınlar listenin her iki ucunda da var.",
      chart: "f8", eb: "ortak olaylarda diğerlerine göre fark · puan",
      draw: function () {
        return divergingBar(dev.map(function (x, i) {
          return { label: SRC[x.s] ? SRC[x.s].n : x.s, value: +x.mean.toFixed(1),
            focal: i === 0 || i === dev.length - 1,
            color: x.mean >= 0 ? "var(--hot)" : "var(--mid)",
            href: "/kurum?s=" + x.s,
            tip: "<span class='k'>" + esc(SRC[x.s] ? SRC[x.s].n : x.s) + "</span>" +
              x.n + " ortak olay · ortalama fark " + (x.mean > 0 ? "+" : "") + x.mean.toFixed(1) +
              "<br>" + x.hot + " olayda en yüklü, " + x.cold + " olayda en yalın başlık" };
        }), { leftLabel: "daha yalın ←", rightLabel: "→ daha yüklü", padL: 128 });
      },
      legend: [{ c: "var(--hot)", t: "odadan daha yüklü" }, { c: "var(--mid)", t: "odadan daha yalın" }],
      take: "Sıfıra yakın bir çubuk, o kurumun ortak olayları herkesle aynı sıcaklıkta " +
        "verdiği anlamına gelir — genel ortalaması yüksek olsa bile. Fark buradan okunur, " +
        "kurum ortalamasından değil." });
  }

  /* 09 — who is first, and does the first framing travel
     The cascade half of this question does not survive contact with a one-week
     corpus: because 95% of headlines carry no device at all, only a handful of
     events have a device in the FIRST article to trace. The rate is reported as
     the raw count it is, and the finding leads with publication order, which
     does have a usable sample. */
  var tim = timingProfile();
  if (tim.rows.length >= 4) {
    var lead = tim.rows[0], last = tim.rows[tim.rows.length - 1];
    var followed = Math.round(tim.followRate * tim.n);
    out.push({ n: "09", big: lead.first, bigl: "olayda ilk yayınlayan: " + esc(SRC[lead.s].n),
      title: "Bir olayın dilini kim önce kuruyor",
      claim: "Ortak olaylarda haberler yayın saatine göre sıralandığında, kurumların " +
        "ortalama sırası birbirinden ayrışıyor. <b>" + esc(SRC[lead.s].n) + "</b> en sık " +
        "ilk sırada yer alan kurum (" + lead.first + " olayda ilk, " + lead.n +
        " ortak olayda görünüyor); <b>" + esc(SRC[last.s].n) + "</b> ise en sık " +
        "sonradan yayınlayanlardan. Bu bir hız yarışı tablosu değil: bir olayın " +
        "kamuya <b>ilk hangi dille</b> tarif edildiğini kimin belirlediğini gösterir, " +
        "çünkü sonradan yazılan her başlık zaten dolaşımda olan bir çerçevenin " +
        "üzerine yazılır.",
      note: "<b>Zaman damgaları yayıncının kendi akışından gelir.</b> Akışa düşme anı, " +
        "haberin yazılma ya da sitede yayımlanma anı değildir; kategori akışları " +
        "gecikmeli güncellenebilir. Sıralama bu yüzden bir gösterge, kesin bir " +
        "yayın kronolojisi değil." +
        /* The honest statement of the measure that did not survive its sample. */
        " Ayrıca ilk haberdeki bir yapının sonrakilerde de görülüp görülmediğini " +
        "ölçmeyi denedik: bu bu dönemdeki haberlerde ilk haberde yapı taşıyan yalnızca <b>" + tim.n +
        " gözlem</b> var (" + followed + " tanesinde yapı sonraki haberlerde de görüldü). " +
        "Bu sayı bir orana dönüştürülemeyecek kadar küçük olduğu için burada oran " +
        "olarak sunulmuyor — başlıkların büyük çoğunluğu zaten hiçbir " +
        "yapı taşımıyor.",
      chart: "f9", eb: "ortak olaylarda ortalama yayın sırası · 0 = hep ilk, 1 = hep son",
      draw: function () {
        return barChart(tim.rows.map(function (x, i) {
          return { label: SRC[x.s] ? SRC[x.s].n : x.s, value: +x.mean.toFixed(2),
            display: x.mean.toFixed(2), focal: i === 0,
            color: i === 0 ? "var(--hot)" : "var(--seq2)",
            tip: "<span class='k'>" + esc(SRC[x.s] ? SRC[x.s].n : x.s) + "</span>" +
              x.n + " ortak olay · " + x.first + " tanesinde ilk yayınlayan" };
        }), { padL: 128, max: 1, axis: "ortalama sıra (0 = ilk, 1 = son)" });
      },
      take: "Erken yayınlamak bir kalite ölçüsü değildir. Bu sıra yalnızca bir olayın " +
        "dilinin <b>kimin elinde kurulduğunu</b> gösterir; sonradan yazan kurum, " +
        "kabul etse de reddetse de o dile cevap veriyor olur." });
  }

  /* 10 — the corpus tested against the register it is warned about */
  var reg = registerCheck();
  if (reg) {
    var strong = Math.abs(reg.r) >= .3;
    out.push({ n: "10", big: "r = " + reg.r.toFixed(2), bigl: reg.n + " kurum · tüm çiftler",
      null: !strong,
      title: "Kurumların yazma biçimi, kayıt defterindeki yerleşimlerini doğruluyor mu",
      claim: "Bu sitedeki siyasi yerleşimler <b>projeye sağlanan</b> veridir ve burada " +
        "doğrulanmamıştır — site bunu her sayfada söylüyor. Korpusun bu iddiayı test " +
        "edebileceği tek yol şudur: her kurumun kendi başlıklarından bir <b>davranış " +
        "profili</b> çıkarmak (hangi yapıya ne sıklıkta başvuruyor), sonra her kurum " +
        "çiftinin bu profillerdeki yakınlığı ile kayıt defterindeki yerleşim farkını " +
        "karşılaştırmak. Aralarındaki ilişki <b>r = " + reg.r.toFixed(2) + "</b>. " +
        (strong ? "Yani benzer yazan kurumlar kayıt defterinde de birbirine yakın " +
          "konumlanıyor — bağımsız bir işaret." :
         "Yani <b>ilişki yok denecek kadar zayıf</b>: benzer yazan kurumlar kayıt " +
         "defterinde birbirine yakın konumlanmıyor.") ,
      note: "<b>Zayıf bir ilişki, kayıt defterini çürütmez.</b> Yerleşim siyasi konumu " +
        "ölçer, davranış profili ise yazma alışkanlığını — ve bu sitenin 05 numaralı " +
        "bulgusu bu ikisinin zaten farklı şeyler olduğunu gösteriyor. Buradaki sonuç " +
        "“kayıt defteri yanlış” demek değil, “bu dönemdeki haberler onu bağımsız olarak doğrulayamıyor” " +
        "demektir. İkisi aynı şey değildir ve tablo, hangi çiftlerin ayrıştığını " +
        "gizlemeden gösteriyor.",
      body: reg.surprising.length ? '<div class="scroller panel"><table><thead><tr>' +
        "<th>Kurum çifti</th><th class=\"r\">Yerleşim farkı</th>" +
        "<th class=\"r\">Yazma biçimi farkı</th><th>Okuma</th></tr></thead><tbody>" +
        reg.surprising.map(function (p) {
          return "<tr><td><b>" + esc(SRC[p.a].n) + "</b> ↔ <b>" + esc(SRC[p.b].n) + "</b></td>" +
            '<td class="r num">' + p.leanGap + " puan</td>" +
            '<td class="r num" style="color:var(--hot)">' + p.dist.toFixed(3) + "</td>" +
            '<td style="color:var(--ink2);font-size:12.5px">Kayıt defteri uzak ' +
            "konumlandırıyor, başlık davranışı ise en yakın çiftlerden</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Yazma biçimi ' +
        "farkı, iki kurumun yapı kullanım oranları arasındaki Öklid mesafesidir; " +
        "küçük değer benzer demektir.</p>" : "",
      take: strong ?
        "Bağımsız iki ölçü aynı yöne işaret ettiğinde, ikisine de biraz daha güvenilebilir." :
        "Bu sitedeki yerleşimlerin <b>bu dönemdeki haberlerden gelen bir desteği yok</b>. Sayfalarda " +
        "yerleşime dayanan her karşılaştırma bu sınırla birlikte okunmalı." });
  }


  /* 11 — Yanatma's own test, run on his own figures */
  var YT = yanatmaTest();
  if (YT.spreads.length) {
    var worst = YT.spreads[0];
    out.push({ n: "11", big: worst.ratio.toFixed(1) + "×",
      bigl: "aynı tiraj bandında, satılan kopya başına fark",
      title: "Devlet ilanı, aynı tirajdaki iki gazeteye aynı gelmiyor",
      claim: "Resmî ilanları dağıtan kurum kendi ölçütü olarak <b>tirajı</b> gösterir. " +
        "Öyleyse benzer tiraja sahip iki gazete, satılan kopya başına benzer pay " +
        "almalıdır. Yanatma'nın 2015 tablosundaki rakamlar bu siteye zaten " +
        "yüklüydü; buradaki tek yenilik, onları <b>tiraj bandına göre gruplayıp</b> " +
        "aynı bant içinde karşılaştırmak. <b>" + esc(worst.band) + "</b> bandında " +
        "<b>" + esc(worst.hi.n) + "</b> kopya başına <b>" + worst.ratio.toFixed(1) +
        " kat</b> daha fazla resmî ilan geliri alıyor: " +
        "$" + worst.hi.perCopy.toFixed(1) + " karşısında <b>" + esc(worst.lo.n) +
        "</b> için $" + worst.lo.perCopy.toFixed(1) + ".",
      note: "<b>Bu bir yolsuzluk iddiası değildir ve nedensellik göstermez.</b> " +
        "Yanatma'nın kendisi “tiraj ile dağıtım arasında bir korelasyon ortaya " +
        "koyacak genel bir model ya da formül üretmek mümkün değildir” diyor. " +
        "Belgelediği mekanizma yayıncıların editör değiştirmesinden geçiyor, tek tek " +
        "haberlerin satın alınmasından değil — üstelik para çoğu zaman çizgiyi " +
        "<b>izliyor</b>, yönlendirmiyor. Bu yüzden bu sayı ile bu dönemdeki dil " +
        "arasında hiçbir grafik çizilmedi: " + WIN.days + " günlük başlık verisi o yönü " +
        "ayırt edemez. Rakamlar <b>2015</b> yılına ait, <b>ABD doları</b> " +
        "cinsinden ve yalnızca <b>basılı</b> gazeteleri kapsıyor; " +
        "bu dönemdeki haberlerde " + YT.noFigure.length + " kurumun rakamı bu yüzden " +
        "<b>eksik değil, tanımı gereği yok</b>.",
      body: '<div class="scroller panel"><table><thead><tr><th>Tiraj bandı</th>' +
        "<th>Kopya başına en yüksek</th><th>Kopya başına en düşük</th>" +
        '<th class="r">Fark</th></tr></thead><tbody>' +
        YT.spreads.map(function (b2) {
          return "<tr><td><b>" + esc(b2.band) + "</b>" +
            '<div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:3px">' +
            b2.rows.length + " gazete</div></td>" +
            "<td>" + esc(b2.hi.n) + '<div class="mono" style="font-size:11px;color:var(--muted)">$' +
            b2.hi.perCopy.toFixed(1) + " / kopya</div></td>" +
            "<td>" + esc(b2.lo.n) + '<div class="mono" style="font-size:11px;color:var(--muted)">$' +
            b2.lo.perCopy.toFixed(1) + " / kopya</div></td>" +
            '<td class="r num" style="color:var(--hot)">' + b2.ratio.toFixed(1) + "×</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Kaynak: Yanatma ' +
        "(2021), Tablo 1, 2015 sütunu. Rakamlar yazarın 2016'da Bilgi Edinme Kanunu " +
        "yoluyla aldığı BİK verisidir; tiraj Yaysat ve Turkuvaz dağıtım rakamlarıdır. " +
        "Bantlar arası karşılaştırma yanıltıcıdır — düşük tirajlı bir gazetede kopya " +
        "başına pay yapısal olarak yüksek çıkar — bu yüzden yalnızca bant <b>içi</b> " +
        "karşılaştırma yapılıyor.</p>",
      take: "Devletin kendi ölçütü tirajsa, aynı bantta iki kat fark ölçütün tek " +
        "başına çalışmadığını gösterir. Bunun <b>neden</b> böyle olduğu bu bu dönemdeki haberlerin " +
        "cevaplayabileceği bir soru değil; Yanatma'nın kitabı o soruya bakıyor." });
  }

  /* 12 — value vocabulary, the ValuesML method at the resolution it survives */
  var VP = valueProfile();
  if (VP.length >= 6) {
    var spread = VALUES.map(function (v) {
      var vals = VP.map(function (r) { return r[v.k]; });
      var hi2 = VP.slice().sort(function (a, b2) { return b2[v.k] - a[v.k]; })[0];
      var lo2 = VP.slice().sort(function (a, b2) { return a[v.k] - b2[v.k]; })[0];
      return { v: v, hi: hi2, lo: lo2, gap: hi2[v.k] - lo2[v.k],
        mean: vals.reduce(function (t, x) { return t + x; }, 0) / vals.length };
    }).sort(function (a, b2) { return b2.gap - a.gap; });
    var topv = spread[0];
    out.push({ n: "12", big: "%" + Math.round(100 * topv.hi[topv.v.k]),
      bigl: "vs %" + Math.round(100 * topv.lo[topv.v.k]) + " — " + topv.v.tr + " sözcüğü",
      title: "Aynı olaylar, farklı değer sözcükleri",
      claim: "Kurumlar <b>aynı olayları</b> verirken farklı değer alanlarının " +
        "sözcüklerine uzanıyor. Yalnızca birden fazla kurumun verdiği haberlere " +
        "bakıldığında, <b>" + esc(topv.v.tr) + "</b> alanının sözcükleri " +
        "<b>" + esc(SRC[topv.hi.s] ? SRC[topv.hi.s].n : topv.hi.s) + "</b> başlıklarının " +
        "%" + Math.round(100 * topv.hi[topv.v.k]) + "'inde geçerken, " +
        "<b>" + esc(SRC[topv.lo.s] ? SRC[topv.lo.s].n : topv.lo.s) + "</b> için bu oran " +
        "%" + Math.round(100 * topv.lo[topv.v.k]) + ". Aynı olguyu bildiren iki başlıktan " +
        "biri bir alanın, diğeri başka bir alanın sözcükleriyle kuruluyor.",
      note: "<b>Bu bir “değer tespiti” değil, sözcük dağarcığı ölçümüdür.</b> " +
        "ValuesML çalışması Schwartz'ın 19 değerini <b>eğitimli değer " +
        "araştırmacılarına</b> tam makale bağlamında kodlattı ve Türkçe için " +
        "kodlayıcılar arası uyum yalnızca 0.46 çıktı — eşiğin altında. Çalışmanın " +
        "kendisi sözlük yöntemlerinin çok anlamlılıkta başarısız olduğunu " +
        "söylüyor. Burada bu yüzden yalnızca <b>sözlüksel olarak tutunabilir " +
        "beş alan</b> sayılıyor, kodlayıcıların en çok karıştırdığı ayrımlar " +
        "(Başarı–Güç, Öz-yönelim Düşünce–Eylem) hiç denenmiyor ve “değere " +
        "ulaşıldı mı” katmanı atlanıyor: Türkçe olumsuzlamayı ekle yapar, " +
        "sözlük bunu göremez.",
      body: '<div class="scroller panel"><table><thead><tr><th>Değer alanı</th>' +
        "<th>En çok kullanan</th><th>En az kullanan</th>" +
        '<th class="r">Fark</th></tr></thead><tbody>' +
        spread.map(function (x) {
          return "<tr><td><b>" + esc(x.v.tr) + "</b>" +
            '<div style="font-size:11.5px;color:var(--muted);margin-top:3px;max-width:34ch">' +
            esc(x.v.df) + "</div></td>" +
            "<td>" + esc(SRC[x.hi.s] ? SRC[x.hi.s].n : x.hi.s) +
            '<div class="mono" style="font-size:11px;color:var(--muted)">%' +
            Math.round(100 * x.hi[x.v.k]) + "</div></td>" +
            "<td>" + esc(SRC[x.lo.s] ? SRC[x.lo.s].n : x.lo.s) +
            '<div class="mono" style="font-size:11px;color:var(--muted)">%' +
            Math.round(100 * x.lo[x.v.k]) + "</div></td>" +
            '<td class="r num">' + Math.round(100 * x.gap) + " puan</td></tr>";
        }).join("") + "</tbody></table></div>",
      take: "Bir olayı hangi <b>alana</b> ait saydığınız, onun hakkında ne " +
        "düşünüleceğini büyük ölçüde belirler. Bir zammı güvenlik sorunu, kaynak " +
        "sorunu ya da kural sorunu olarak vermek, üç ayrı tartışma başlatır." });
  }

  return out;
}



/** Band distribution for finding 02 — the shape of a normal news week. */
function bandChart() {
  var band = {}; D.A.forEach(function (a) { band[a.b] = (band[a.b] || 0) + 1; });
  return barChart(BANDS.map(function (b, i) {
    var lo = i ? BANDS[i - 1].max + 1 : 0, n = band[b.k] || 0;
    return { label: b.tr, value: n, display: n + "  (%" + (100 * n / D.A.length).toFixed(1) + ")",
      color: seq(b.max),
      tip: "<span class='k'>" + esc(b.tr) + " · " + lo + "–" + b.max + "</span>" + n + " başlık" };
  }), { padL: 158 });
}


/* ===================================================== the bias modal ====
   For any named bias, anywhere on the site, a reader must be able to see:
   definition · detection method and boundary · the exact passage that triggered
   it · how it works in that passage · how much support the firing has and why
   that is uncertain · a real Turkish example from this corpus with its source,
   or an explicit statement that none exists.
   Where the corpus has no example the modal says so, rather than borrowing the
   ontology's synthetic English sentence and presenting it as Turkish reporting. */
var BREG = {}; (D.BR || []).forEach(function (b) { BREG[b.k] = b; });
var TIERL = { detected: "kural saptıyor", codable: "insan kodlaması gerekir",
  reference: "okur davranışı — habere işlenemez" };
var UNSET = function (v) { return !v || /belirtilmiyor|yok|^—$/i.test(String(v).trim()); };

function strengthBlock(level, why) {
  var n = level === "güçlü" ? 3 : level === "orta" ? 2 : 1;
  var WHY = { own_voice: "kurumun kendi sesinde", quoted_only: "yalnızca alıntı içinde",
    multiple_triggers: "birden çok tetikleyici", specific_term: "belirgin terim",
    ambiguous_term: "çok anlamlı terim" };
  var segs = "";
  for (var i = 0; i < 3; i++) segs += '<span class="stg-seg' + (i < n ? " on" : "") + '"></span>';
  return '<div class="stg"><span class="stg-bar" role="img" aria-label="Kanıt gücü ' +
    esc(level) + ', üç kademeden ' + n + '">' + segs + "</span>" +
    '<span class="stg-l">' + esc(level) + "</span>" +
    '<span class="stg-why">' + (why || []).map(function (w) { return esc(WHY[w] || w); })
      .join(" · ") + "</span></div>";
}

function corpusExample(key) {
  var best = null;
  for (var i = 0; i < D.A.length; i++) {
    var a = D.A[i];
    if (a.k.indexOf(key) < 0) continue;
    var lvl = (a.e.filter(function (x) { return x[0] === key; })[0] || [])[2];
    var rank = (lvl === "güçlü" ? 200 : lvl === "orta" ? 100 : 0) + a.v;
    if (!best || rank > best.rank) best = { a: a, rank: rank, lvl: lvl };
  }
  return best;
}

var MODAL = null;
function ensureModal() {
  if (MODAL) return MODAL;
  MODAL = el("div", "mdl");
  MODAL.innerHTML = '<div class="mdl-bg" data-close></div><div class="mdl-box">' +
    '<div class="mdl-hd"><button class="mdl-x" data-close aria-label="Kapat">×</button>' +
    '<h3 id="mdlT"></h3><div class="tr" id="mdlTr"></div>' +
    '<div style="margin-top:9px" id="mdlTier"></div></div>' +
    '<div class="mdl-b" id="mdlB"></div></div>';
  document.body.appendChild(MODAL);
  MODAL.addEventListener("click", function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute("data-close")) closeModal();
  });
  addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  return MODAL;
}
function closeModal() { if (MODAL) MODAL.classList.remove("on"); }

function openBias(key, hit) {
  var b = BREG[key] || BIA[key];
  if (!b) return;
  var m = ensureModal();
  m.querySelector("#mdlT").textContent = b.en;
  m.querySelector("#mdlTr").textContent = b.tr || "";
  var tier = b.tier || "codable";
  m.querySelector("#mdlTier").innerHTML =
    '<span class="tier-b ' + tier + '">' + esc(TIERL[tier]) + "</span>" +
    (b.no ? ' <span class="tier-b">Decision Lab #' + b.no + "</span>" : "") +
    (b.inOntology === false ? ' <span class="tier-b">medya-yanlılığı yazını</span>' : "");

  var h = '<div class="mdl-s"><h4>Tanım</h4><p>' + esc(b.df || "") + "</p>" +
    (b.opdef ? '<p class="en">İşlevsel tanım (özgün): “' + esc(b.opdef) + "”</p>" : "") +
    (b.use ? "<p>" + esc(b.use) + "</p>" : "") + "</div>";

  h += '<div class="mdl-s"><h4>Saptama ölçütü</h4>';
  if (tier === "detected") {
    h += "<p>Bu yapıyı kural tabanlı tarayıcı saptayabiliyor: başlığın yüzeyinde " +
      "denetlenebilir bir test uygulanır ve aynı metin her zaman aynı sonucu verir." +
      (hit && hit.rule ? " Tetiklenen kural: <b>" + esc(hit.rule) + "</b>." : "") + "</p>" +
      "<p>Kurallar kurumun <b>kendi sesini</b> alıntıdan ayırır: bir sıfat aktarılan " +
      "sözün içindeyse konuşana aittir, yayına değil.</p>";
  } else if (tier === "codable") {
    h += "<p>Bu yapı bir haberin özelliği olabilir, ama tek bir dizeden karara " +
      "bağlanamaz; metnin bütününü okumayı ve çoğu zaman başka haberlerle " +
      "karşılaştırmayı gerektirir. Sitede otomatik olarak işaretlenmez.</p>";
  } else {
    h += "<p>Bu kavram okurun, tüketicinin ya da karar vericinin davranışını anlatır; " +
      "bir haber metninin özelliği değildir. Kütüphanede bütünlük için yer alır, " +
      "makalelere işlenmez.</p>";
  }
  if (b.bound) h += '<p class="en">Sınır kuralı (özgün): “' + esc(b.bound) + "”</p>";
  h += "</div>";

  if (hit && hit.article) {
    var a = hit.article, pf = SRC[a.s];
    h += '<div class="mdl-s"><h4>Bu haberdeki kanıt</h4><div class="passage">' + hlTitle(a) +
      '<div class="src"><span class="dot" style="background:' + lean(pf ? pf.lean : null) +
      '"></span>' + esc(pf ? pf.n : a.s) + "<span>·</span>" + fmtDT(a.d) +
      "<span>·</span>yoğunluk " + a.v +
      (a.u ? '<span>·</span><a class="lnk" href="' + esc(a.u) +
        '" target="_blank" rel="noopener">özgün habere git</a>' : "") + "</div></div>";
    if (hit.terms && hit.terms.length) {
      h += '<p style="margin-top:11px">' + manifestation(key, hit.terms) + "</p>";
    }
    h += "</div>";
    h += '<div class="mdl-s"><h4>Kanıt gücü ve belirsizlik</h4>' +
      strengthBlock(hit.level || "orta", hit.why) +
      '<p style="margin-top:11px">Bu bir <b>olasılık değildir</b>. Türkçe haber ' +
      "başlıkları için insan tarafından etiketlenmiş bir doğrulama kümesi henüz yok, " +
      "dolayısıyla bu kurala ait bir hata oranı ya da kalibre edilmiş yüzde verilemez. " +
      "Gösterilen düzey yalnızca metnin kendisinden okunabilen üç şeyi özetler: ifade " +
      "kurumun kendi sesinde mi, birden çok bağımsız tetikleyici var mı, terim bu " +
      "bağlamda belirgin mi.</p>" +
      "<p>Bir kuralın tetiklenmesi <b>kanıt değil, bakılacak yer</b> gösterir. Metinden " +
      "gazetecinin niyeti ya da inancı çıkarılmaz; yalnızca gözlenebilir dil örüntüsü " +
      "betimlenir.</p></div>";
  }

  var ex = tier === "detected" ? corpusExample(key) : null;
  h += '<div class="mdl-s"><h4>Bu bu dönemdeki haberlerden gerçek örnek</h4>';
  if (ex && !(hit && hit.article && ex.a.i === hit.article.i)) {
    var pf2 = SRC[ex.a.s];
    h += '<div class="passage">' + hlTitle(ex.a) +
      '<div class="src"><span class="dot" style="background:' + lean(pf2 ? pf2.lean : null) +
      '"></span>' + esc(pf2 ? pf2.n : ex.a.s) + "<span>·</span>" + fmtDT(ex.a.d) +
      "<span>·</span>kanıt gücü " + esc(ex.lvl || "—") +
      (ex.a.u ? '<span>·</span><a class="lnk" href="' + esc(ex.a.u) +
        '" target="_blank" rel="noopener">özgün habere git</a>' : "") + "</div></div>";
  } else if (ex) {
    h += "<p>Yukarıdaki haber bu yapının bu dönemdeki haberlerde en güçlü örneğidir.</p>";
  } else {
    h += "<p>Bu yapı için 1–8 Eylül 2026 bu dönemdeki haberler arasında örnek yok" +
      (tier === "detected" ? " — kural bu pencerede hiç tetiklenmedi." :
        ". Otomatik saptanmadığı için bu dönemdeki haberlerden örnek eşleştirilmiyor.") +
      " Buraya uydurma bir örnek konmuyor.</p>";
  }
  h += "</div>";

  if (b.seed && b.seed.length) {
    h += '<div class="mdl-s"><h4>Kaynak dizinden örnek (İngilizce, sentetik)</h4>';
    b.seed.slice(0, 3).forEach(function (sd) {
      var V = { supported: ["örnek uyuyor", "g"], not_supported: ["örnek uymuyor", ""],
        insufficient_evidence: ["kanıt yetersiz", "b"] }[sd.verdict] || ["", ""];
      h += '<p style="margin-top:8px"><span class="tag ' + V[1] + '">' + esc(V[0]) +
        '</span> <span class="en" style="margin:0">“' + esc(sd.text) + "”</span></p>";
    });
    h += '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Bu cümleler ' +
      "yüklenen dizinin kendi <b>sentetik İngilizce</b> örnekleridir; Türk basınından " +
      "alınmamış ve bağımsız incelemeden geçmemiştir. Kavramın sınırını göstermek için " +
      "buradalar.</p></div>";
  }

  if (b.src) h += '<div class="mdl-s"><h4>Kaynak</h4><p><a class="lnk" href="' + esc(b.src) +
    '" target="_blank" rel="noopener">' + esc(b.src) + "</a>" +
    (b.seen ? ' <span style="color:var(--muted)">· erişim ' + esc(b.seen) + "</span>" : "") +
    "</p></div>";

  m.querySelector("#mdlB").innerHTML = h;
  m.classList.add("on");
  m.querySelector(".mdl-box").scrollTop = 0;
  wireDevices(m.querySelector("#mdlB"));
}

/** How the device works in this particular wording. */
function manifestation(key, terms) {
  var t = (terms || []).map(function (x) { return "“" + esc(x) + "”"; }).join(", ");
  var M = {
    "ad-hominem": "İfade tartışılan iddiaya değil, adı geçen aktörün kendisine yönelir: okur olayı değerlendirmeden önce aktör hakkında bir hüküm almış olur.",
    "illusory-truth": "Niteleme tartışmaya açık bir iddia olarak değil, bilinen bir arka plan olgusu gibi kullanılır; tekrarlandıkça sınanması gereken bir önerme olmaktan çıkar.",
    "in-group-bias": "Kimlik etiketi argümanın yerine geçer: kişinin ne söylediği değil, hangi gruba ait sayıldığı üzerinden konumlandırılır.",
    "fear-appeal": "Olasılık belirtilmeden tehdit sözcüğü kullanılır; olayın ne kadar olası olduğu değil, ne kadar korkutucu olduğu öne çıkar.",
    "bandwagon-effect": "Ölçüsü verilmeyen bir bütünlük iddiası kurulur; kaç kişi olduğu sayılmadan “herkes” denir.",
    "halo-effect": "Karşılaştırma noktası verilmeden üstünlük iddia edilir; neyin neye göre üstün olduğu belirsiz kalır.",
    "responsibility-framing": "Fiil, hukuki süreç tamamlanmadan niyeti varsayar; okur sorumluluğu karara bağlanmadan önce atfeder.",
    "metaphorical-framing": "Mecaz olayı betimlemekle kalmaz, onu başka bir olay türü gibi yeniden kurar ve o türün çağrışımlarını olaya taşır.",
    "authority-bias": "Kaynak adlandırılmadan otorite çağrılır; iddianın kim tarafından ileri sürüldüğü denetlenemez hâle gelir.",
    "anchoring-bias": "Nicelik cümlenin başına çekilir ve sonrasındaki her şey o sayıya göre okunur; büyüklüğün bağlamı verilmez."
  };
  return (t ? t + " ifadesi bu başlıkta şöyle işliyor: " : "") +
    (M[key] || "İfade olayın sunumunu değiştirecek biçimde kullanılmıştır.");
}

/* ============================================ source-by-source comparison ==
   Required on every most-covered story, and populated FROM the narrative coding
   so the table and the map can never disagree.

   OMISSIONS are derived, never asserted: a cell counts as an omission only when
   other outlets covering the same event did supply that dimension and this one
   did not. That is an omission measured against available source material, which
   is the only version of the claim the data supports — it is not evidence that
   anything was deliberately withheld, and the table says so. */
var CMPDIMS = [["frame", "Ana çerçeve"], ["blame", "Atfedilen sorumluluk"],
  ["cons", "Öne çıkarılan sonuç"], ["sol", "Meşrulaştırılan çözüm"]];

function comparisonTable(e) {
  var narr = NOF(e);
  var arts = e.a.map(function (i) { return ART[i]; }).sort(function (a, b) { return b.v - a.v; });
  var rows = {};
  if (narr) (narr.rows || []).forEach(function (r) { rows[r.s] = r; });
  var supplied = {}, modal = {};
  CMPDIMS.forEach(function (d) {
    var vals = Object.keys(rows).filter(function (sl) {
      return !rows[sl].note && !UNSET(rows[sl][d[0]]); })
      .map(function (sl) { return String(rows[sl][d[0]]).trim(); });
    supplied[d[0]] = vals.length;
    /* The pack's answer on this dimension. Coders write free text, so exact
       agreement is rare and a normalised comparison would invent agreement
       that is not there; the modal value is only used to mark which cells
       DEPART from the most common answer, never to claim the others are wrong. */
    var c = {};
    vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
    var best = null;
    Object.keys(c).forEach(function (v) { if (!best || c[v] > c[best]) best = v; });
    modal[d[0]] = (best && c[best] >= 2) ? best : null;
  });

  var h = '<div class="scroller panel"><table><thead><tr><th>Kurum</th><th>Manşet</th>' +
    CMPDIMS.map(function (d) { return "<th>" + d[1] + "</th>"; }).join("") +
    "<th>Eksik bırakılan</th><th>Kanıt</th></tr></thead><tbody>";
  arts.forEach(function (a) {
    var pf = SRC[a.s], r = rows[a.s];
    var missing = r ? CMPDIMS.filter(function (d) {
      return UNSET(r[d[0]]) && supplied[d[0]] >= 2; }).map(function (d) { return d[1]; }) : null;
    h += '<tr data-aid="' + a.i + '"><td style="white-space:nowrap">' +
      '<span class="dot" style="background:' + lean(pf ? pf.lean : null) + '"></span> <b>' +
      esc(pf ? pf.n : a.s) + "</b>" +
      '<div class="mono" style="font-size:10.5px;color:var(--muted);margin-top:3px">' +
      (pf && pf.lean != null ? "yerleşim " + pf.lean : "yerleşim —") + " · yoğunluk " + a.v +
      "</div></td>" +
      '<td style="min-width:250px"><div style="line-height:1.4">' +
      (a.u ? '<a class="hlnk" href="' + esc(a.u) + '" target="_blank" rel="noopener">' +
        hlTitle(a) + "</a>" : hlTitle(a)) + "</div>" +
      (a.k.length ? '<div class="devs">' + devChips(a) + "</div>" : "") + "</td>";
    if (r && r.note) {
      /* A coder reading the full text found this row is about a DIFFERENT
         occurrence. Kept visible rather than deleted: a mis-clustered member is
         itself a finding about the matcher, and hiding it would make the
         comparison look cleaner than it is. */
      h += '<td colspan="' + (CMPDIMS.length + 2) + '">' +
        '<span class="tag b">farklı olay</span> ' +
        '<span style="color:var(--muted)">Metnin tamamı okunduğunda bu haberin aynı olayı ' +
        "değil, ilişkili başka bir olayı anlattığı görüldü. Karşılaştırmaya dahil edilmiyor.</span></td>";
    } else if (r) {
      CMPDIMS.forEach(function (d) {
        var val = r[d[0]], empty = UNSET(val);
        var diverges = !empty && modal[d[0]] && String(val).trim() !== modal[d[0]];
        h += '<td class="cmp' + (diverges ? " div" : empty ? " nil" : "") + '">' +
          (empty ? '<span class="cmp-nil">—</span>' : esc(val)) +
          (diverges ? '<span class="cmp-tag">ayrışıyor</span>' : "") + "</td>";
      });
      h += "<td>" + (missing && missing.length ?
        '<span class="tag b">' + missing.map(esc).join(", ") + "</span>" :
        '<span style="color:var(--muted)">—</span>') + "</td>" +
        '<td style="color:var(--muted);min-width:190px;font-size:12.5px">' +
        (r.ev ? "“" + esc(r.ev) + "”" : "—") + "</td>";
    } else {
      h += '<td colspan="' + (CMPDIMS.length + 2) + '" style="color:var(--muted)">' +
        "Anlatı kodlaması yok — çerçeve, sorumluluk ve sonuç sütunları doldurulamıyor.</td>";
    }
    h += "</tr>";
  });
  h += "</tbody></table></div>";

  var coded = Object.keys(rows).length;
  h += legendHTML([{ c: "var(--hot)", t: "bu boyutta kurumların çoğunluğundan ayrışıyor" },
    { c: "var(--sunk)", ring: "var(--line2)", t: "kurumun bu boyutu hiç ele almadığı yer" }],
    "Nasıl okunur");
  h += '<div class="note" style="margin-top:12px"><b>Bu tablo nasıl doldu.</b> ' +
    "Çerçeve, sorumluluk, sonuç ve çözüm sütunları anlatı haritasındaki kodlamadan " +
    "gelir; tablo ile harita bu yüzden birbiriyle çelişemez. " +
    (coded ? coded + "/" + e.s.length + " kurum kodlanmış" +
      (coded < e.s.length ? "; kalanlar için sütunlar boş bırakıldı, tahmin edilmedi." : ".") :
      "Bu olay için henüz anlatı kodlaması yok; yalnızca manşet, yoğunluk ve saptanan " +
      "yapılar gösteriliyor.") +
    " <b>Ayrışıyor</b> etiketi, o kurumun ilgili boyutta diğerlerinin çoğunluğuyla " +
    "aynı yanıtı vermediğini gösterir; hangi yanıtın doğru olduğunu göstermez — " +
    "çoğunluk da yanılabilir ve kodlamalar serbest metindir." +
    " <b>“Eksik bırakılan”</b> sütunu, aynı olayı veren <b>başka kurumların doldurduğu</b> " +
    "ama bu kurumun doldurmadığı boyutları listeler; bilginin bilerek gizlendiği anlamına " +
    "gelmez — yayının o boyutu hiç ele almamış olması da aynı sonucu verir." +
    '<br><span class="mono" style="font-size:11.5px;color:var(--muted)">Son güncelleme: ' +
    esc(String(D.meta.built || "").slice(0, 16).replace("T", " ")) + " UTC</span></div>";
  return h;
}

/* Agreed elements, partial claims, and our own reading — kept visually apart,
   because conflating them is the failure mode of this whole genre. */
function factLayers(e) {
  var arts = e.a.map(function (i) { return ART[i]; });
  var cnt = {};
  arts.forEach(function (a) {
    var seen2 = {};
    a.t.toLocaleLowerCase("tr").replace(/['’‘"“”]/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/).forEach(function (w) {
        if (w.length >= 4 && !seen2[w]) { seen2[w] = 1; cnt[w] = (cnt[w] || 0) + 1; } });
  });
  return {
    n: arts.length,
    all: Object.keys(cnt).filter(function (w) { return cnt[w] === arts.length; }),
    some: Object.keys(cnt).filter(function (w) { return cnt[w] > 1 && cnt[w] < arts.length; })
      .sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 12),
  };
}

/* ================================================================ mount */
/* =====================================================================
   Çapraz Manşet 2.0 — reader layer
   Everything below sits on top of v1's engine. v1's pages are kept and
   wrapped (pgHomeV1, pgEventV1, pgEventsV1, pgMethodV1, pgSourceV1,
   pgAdminV1); the new pieces are the Ground News–style reading surfaces:
   story cards with a coverage bar, story pages, the Kör nokta feed, topics,
   Size özel, Haber dengem, search and the colour note.
   Personal state (follows, reading history, summary flags) lives only in
   this browser's localStorage, by design.
   ===================================================================== */

var EV = {}; D.E.forEach(function (e) { EV[e.i] = e; });
var TPX = {}; (D.TP || []).forEach(function (t) { TPX[t.k] = t; });
var V2 = D.meta.v2 || {};

/* ---------- local state (this browser only) ---------- */
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function follows() { var f = lsGet("cm2-follow", null); return f && f.t && f.s ? f : { t: [], s: [] }; }
function isFollowing(kind, k) { return follows()[kind].indexOf(k) >= 0; }
function toggleFollow(kind, k) {
  var f = follows(), i = f[kind].indexOf(k);
  if (i >= 0) f[kind].splice(i, 1); else f[kind].push(k);
  lsSet("cm2-follow", f); return i < 0;
}
function readLog() { var r = lsGet("cm2-read", null); return r && r.st && r.a ? r : { st: [], a: [] }; }
function logStory(id) {
  var r = readLog(); if (r.st.indexOf(id) < 0) { r.st.push(id); lsSet("cm2-read", r); }
}
function logArticle(id) {
  var r = readLog(); if (r.a.indexOf(id) < 0) { r.a.push(id); lsSet("cm2-read", r); }
}

/* ---------- shared bits ---------- */
var SIDE = { left: "Sol", mid: "Merkez", right: "Sağ", none: "Yerleşimsiz" };
function sideOf(slug) { return bloc(slug); }
function srcName(s) { return SRC[s] ? SRC[s].n : s; }
function covOf(e) { return e.cov || [0, 0, 0]; }
function covPct(e) {
  var c = covOf(e), t = c[0] + c[1] + c[2] || 1;
  return [Math.round(100 * c[0] / t), Math.round(100 * c[1] / t), Math.round(100 * c[2] / t)];
}
function domLine(e) {
  var p = covPct(e), i = p.indexOf(Math.max.apply(null, p));
  return "%" + p[i] + " " + ["Sol", "Merkez", "Sağ"][i] + " kapsama · " + e.s.length + " kurum";
}
/* The bar always carries numbers and words beside its colour, so colour is
   never the only carrier of meaning (see Yöntem › Renkler). */
function bbar(e, big) {
  var c = covOf(e), p = covPct(e), lab = ["Sol", "Merkez", "Sağ"], col = ["var(--left)", "var(--mid)", "var(--right)"];
  var h = '<div class="xbar' + (big ? " big" : "") + '" role="img" aria-label="Kapsama: Sol ' + c[0] +
    ", Merkez " + c[1] + ", Sağ " + c[2] + ' kurum">';
  for (var i = 0; i < 3; i++) {
    if (!c[i]) continue;
    h += '<i style="flex:' + c[i] + ';background:' + col[i] + '" title="' + lab[i] + " · " + c[i] + ' kurum">' +
      (p[i] >= (big ? 12 : 19) ? "<span>" + (big || i !== 1 ? lab[i] : "Mrk") + " %" + p[i] + "</span>" : "") + "</i>";
  }
  return h + "</div>";
}
function bsBadge(e, long) {
  if (!e.bs) return "";
  var side = e.bs === "left" ? "Sol" : "Sağ";
  return '<span class="xbs ' + e.bs + '">Kör nokta' + (long ? " · " + side + " az verdi" : ": " + side) + "</span>";
}
function tpChips(e, n) {
  return (e.tp || []).slice(0, n || 3).map(function (k) {
    return TPX[k] ? '<a class="xtp" href="#/konu?k=' + k + '">' + esc(TPX[k].n) + "</a>" : "";
  }).join("");
}
function storyDay(e) {
  var c = {}; e.a.forEach(function (i) { var d = ART[i].d.slice(0, 10); c[d] = (c[d] || 0) + 1; });
  return Object.keys(c).sort(function (x, y) { return c[y] - c[x] || y.localeCompare(x); })[0];
}
function origShare(list) {
  var n = 0, r = 0; list.forEach(function (e) { n += e.n; r += Object.keys(e.rep || {}).length; });
  return n ? Math.round(100 * (n - r) / n) : 100;
}


function cards(list, size) { return list.map(function (e) { return sCard(e, size); }).join(""); }

function followBtn(kind, k) {
  var on = isFollowing(kind, k);
  return '<button class="xfollow' + (on ? " on" : "") + '" data-fk="' + kind + '" data-fv="' + k +
    '" aria-pressed="' + on + '">' + (on ? "Takip ediliyor" : "+ Takip et") + "</button>";
}

/* ================================================================ HOME */
var BRIEFDAY = null;
function briefDays() {
  var by = {}; D.E.forEach(function (e) { if (v3isIlanEvent(e)) return; var d = storyDay(e); (by[d] = by[d] || []).push(e); });
  return by;
}
function briefHTML() {
  var by = briefDays(), days = Object.keys(by).filter(function (d) { return by[d].length >= 3; }).sort();
  if (!days.length) return "";
  var d = BRIEFDAY && by[BRIEFDAY] ? BRIEFDAY : days[days.length - 1];
  var list = by[d].slice().sort(function (a, b) { return b.s.length - a.s.length; }).slice(0, 8);
  var arts = list.reduce(function (t, e) { return t + e.n; }, 0);
  var words = list.reduce(function (t, e) { return t + (e.t + " " + e.sum).split(/\s+/).length; }, 0);
  var h = '<div class="xbrief" id="brief"><div class="xbrief-h"><div><div class="eyebrow">Günün özeti</div>' +
    '<h2>' + fmtD(d + "T00:00") + " 2026</h2></div>" +
    '<div class="xbrief-days">' +
      '<button class="chip" data-bday="' + (days[days.indexOf(d) - 1] || "") + '"' + (days.indexOf(d) > 0 ? "" : " disabled") + ' aria-label="Önceki gün">←</button>' +
      '<select id="bdaysel" aria-label="Gün seç">' + days.slice().reverse().map(function (x) {
        return '<option value="' + x + '"' + (x === d ? " selected" : "") + ">" + fmtD(x + "T00:00") + " · " + by[x].length + " olay</option>"; }).join("") + "</select>" +
      '<button class="chip" data-bday="' + (days[days.indexOf(d) + 1] || "") + '"' + (days.indexOf(d) < days.length - 1 ? "" : " disabled") + ' aria-label="Sonraki gün">→</button>' +
      "</div></div>" +
    '<div class="xbrief-stats mono">' + list.length + " olay · " + arts + " haber · ~" +
    Math.max(1, Math.round(words / 200)) + " dk okuma</div><ol class=\"xbrief-list\">";
  list.forEach(function (e) {
    h += '<li><a href="#/olay?e=' + e.i + '"><b>' + esc(e.t) + "</b></a>" +
      '<div class="xmini">' + bbar(e) + '<span class="xdom">' + e.s.length + " kurum " + bsBadge(e) + "</span></div></li>";
  });
  h += "</ol>" + '<div class="xbrief-foot"><span class="xshield">%' + origShare(list) +
    "</span> bu olaylardaki haberlerin özgün başlık; geri kalanı başka bir kurumun başlığının neredeyse aynısı.</div></div>";
  return h;
}





/* ================================================================ FEED */
var FEEDVIEW = "cards", FEEDN = 60;
function pgEvents(q) {
  var tab = tabOf(secFor("/olaylar"), q);
  if (tab === "kapsama") return pgEventsV1(q);
  var h = '<div class="wrap page">';
  if (tab === "liste") {
    h += '<div class="phead"><div class="eyebrow">Olaylar</div><h1>Aynı olayı kimler verdi</h1>' +
      '<p class="lede">' + WIN.range + ' arasında en az beş kurumun verdiği ' + D.E.length.toLocaleString("tr") + " olay. Her kartta olayın tarafsız başlığı, " +
      "onu veren kurumların yelpazedeki dağılımı ve kurum sayısı var. Kartı açınca özet, bütün başlıklar " +
      "ve olayın ayrıntılı analizi gelir. Tarih, haber türü, yanlılık türü, kapsama, taraf, kurum ve yoğunluk " +
      "süzgeçleri birlikte çalışır.</p></div>" +
      '<div class="ctl"><input type="search" id="fq" placeholder="Olay, kurum ya da konu ara…" style="min-width:220px" value="' + esc(FEEDF.q) + '">' +
      fSel("ftopic", "Bütün konular", v3topicList().slice().sort(function (a, b) { return a.n.localeCompare(b.n, "tr"); })
        .map(function (t) { return [t.k, t.n + " (" + t.e.length + ")"]; })) +
      fSel("fsort", null, [["s", "En çok kurumun verdiği"], ["l", "En yeni"], ["o", "En eski"], ["n", "En çok haber"],
        ["p", "En ayrışan (yoğunluk aralığı)"], ["m", "En yüklü (ortalama yoğunluk)"]]) +
      '<span style="display:inline-flex;gap:4px;margin-left:auto">' +
      ["cards:Kartlar", "spectrum:Şerit", "table:Tablo"].map(function (x) {
        var p = x.split(":"); return '<button class="chip" data-fv2="' + p[0] + '" aria-pressed="' +
          (FEEDVIEW === p[0]) + '">' + p[1] + "</button>"; }).join("") + "</span></div>" + feedFilters() +
      '<div class="ctl xfcount"><span id="fcount" class="mono" style="font-size:12px;color:var(--muted)"></span></div><div id="flist"></div>';
  }
  if (tab === "kor") h += blindspotPage(q) + v5BlindTable();
  if (tab === "konular") h += topicsIndex();
  if (tab === "ilan") h += v3noticeEventsPage();
  return h + "</div>";
}
function renderFeed() {
  var box = $("#flist"); if (!box) return;
  readFeedF();
  var F = FEEDF, q = F.q.toLocaleLowerCase("tr"), k = F.sort;
  var list = D.E.filter(function (e) {
    if (v3isIlanEvent(e)) return false;
    var x = evx(e);
    if (F.topic && e.tp.indexOf(F.topic) < 0) return false;
    if (F.from && x.d1 < F.from) return false;
    if (F.to && x.d0 > F.to) return false;
    if (F.sec && x.sec !== F.sec) return false;
    if (F.key && !x.keys[F.key]) return false;
    if (e.s.length < F.min) return false;
    if (F.side === "bs" ? !e.bs : F.side && x.side !== F.side) return false;
    if (F.src && e.s.indexOf(F.src) < 0) return false;
    if (e.m < F.vmin) return false;
    if (!q) return true;
    var hay = (e.t + " " + e.sum + " " + e.s.map(srcName).join(" ") + " " +
      e.tp.map(function (x) { return TPX[x] ? TPX[x].n : x; }).join(" ")).toLocaleLowerCase("tr");
    return hay.indexOf(q) >= 0;
  }).sort(function (a, b) {
    if (k === "l") return b.l.localeCompare(a.l);
    if (k === "o") return a.f.localeCompare(b.f);
    if (k === "n") return b.n - a.n;
    if (k === "p") return b.p - a.p;
    if (k === "m") return b.m - a.m;
    return b.s.length - a.s.length || b.l.localeCompare(a.l);
  });
  var sig = JSON.stringify(F);
  var c = $("#fcount"); if (c) c.textContent = list.length + " olay";
  if (renderFeed._q !== sig) { FEEDN = 60; renderFeed._q = sig; }
  feedChips();
  if (!list.length) { box.innerHTML = '<p class="xempty">Bu süzgeçlerle eşleşen olay yok. <button class="chip" data-freset>Süzgeçleri temizle</button></p>'; wireFeedReset(box); return; }
  box.innerHTML = FEEDVIEW === "table" ? evTable(list) : FEEDVIEW === "spectrum" ?
    '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">' +
    list.slice(0, FEEDN).map(spectrumCard).join("") + "</div>" : '<div class="xcards">' + cards(list.slice(0, FEEDN)) + "</div>";
  if (list.length > FEEDN && FEEDVIEW !== "table") box.innerHTML += '<button class="chip xmore" id="fmore">' +
    Math.min(60, list.length - FEEDN) + " olay daha göster (" + (list.length - FEEDN) + " kaldı)</button>";
  var fm = $("#fmore"); if (fm) fm.onclick = function () { FEEDN += 60; renderFeed(); };
  wireGo(box);
}

/* ---------- Olaylar süzgeçleri ----------
   Per-event facts the filters need, computed once: the days it spans, its main section
   (the section most of its headlines carry), the framing keys any of its headlines carry,
   and which side covered it more once each side is divided by its active outlets
   (e.ns, the blind-spot normalisation): ≥ 60 % left share is "left", ≤ 40 % is "right". */
var FEEDF = { q: "", topic: "", sort: "s", from: "", to: "", sec: "", key: "", min: 5, side: "", src: "", vmin: 0 };
var EVX = {};
function evx(e) {
  if (EVX[e.i]) return EVX[e.i];
  var sec = {}, keys = {};
  e.a.forEach(function (i) { var a = ART[i]; if (!a) return; sec[a.c] = (sec[a.c] || 0) + 1;
    a.k.forEach(function (k) { keys[k] = (keys[k] || 0) + 1; }); });
  var top = Object.keys(sec).sort(function (x, y) { return sec[y] - sec[x]; })[0] || "";
  var ns = e.ns ? e.ns[0] : null;
  return (EVX[e.i] = { d0: e.f.slice(0, 10), d1: e.l.slice(0, 10), sec: top, keys: keys,
    side: ns == null ? "" : ns >= 60 ? "left" : ns <= 40 ? "right" : "mid" });
}
function fSel(id, all, opts, label) {
  var v = FEEDF[{ ftopic: "topic", fsort: "sort", fsec: "sec", fkey: "key", fmin: "min", fside: "side", fsrc: "src", fvmin: "vmin" }[id]];
  return '<select id="' + id + '" aria-label="' + esc(label || all || "Sırala") + '">' + (all ? '<option value="">' + esc(all) + "</option>" : "") +
    opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
}
var FEEDIDS = ["#fq", "#ftopic", "#fsort", "#ffrom", "#fto", "#fsec", "#fkey", "#fmin", "#fside", "#fsrc", "#fvmin"];
function feedFilters() {
  var used = {}, secs = {}, keys = {};
  D.E.forEach(function (e) { if (v3isIlanEvent(e)) return; var x = evx(e);
    e.s.forEach(function (s) { used[s] = (used[s] || 0) + 1; }); secs[x.sec] = (secs[x.sec] || 0) + 1;
    Object.keys(x.keys).forEach(function (k) { keys[k] = (keys[k] || 0) + 1; }); });
  var d0 = DAYS[0], d1 = DAYS[DAYS.length - 1];
  var back = function (n) { var d = new Date(d1 + "T00:00Z"); d.setUTCDate(d.getUTCDate() - n + 1); return d.toISOString().slice(0, 10); };
  return '<details class="xfilters"' + (window.innerWidth > 700 ? " open" : "") + '><summary>Süzgeçler <span id="fchips"></span></summary>' +
    '<div class="xfgrid">' +
    '<div class="xf"><span class="xfl">Tarih</span><div class="xfr">' +
      '<input type="date" id="ffrom" aria-label="Başlangıç günü" min="' + d0 + '" max="' + d1 + '" value="' + FEEDF.from + '">' +
      '<span aria-hidden="true">–</span><input type="date" id="fto" aria-label="Bitiş günü" min="' + d0 + '" max="' + d1 + '" value="' + FEEDF.to + '"></div>' +
      '<div class="xfr">' + [["7", "Son 7 gün"], ["30", "Son 30 gün"], ["", "Tüm dönem"]].map(function (r) {
        return '<button class="chip" data-frange="' + (r[0] ? back(+r[0]) : "") + '">' + r[1] + "</button>"; }).join("") + "</div></div>" +
    '<div class="xf"><span class="xfl">Haber türü</span>' + fSel("fsec", "Bütün türler", Object.keys(secs).filter(Boolean)
      .sort(function (a, b) { return secs[b] - secs[a]; }).map(function (k) { return [k, (SECT[k] || k) + " (" + secs[k] + ")"]; }), "Haber türü") + "</div>" +
    '<div class="xf"><span class="xfl">Yanlılık türü</span>' + fSel("fkey", "Bütün yapılar", Object.keys(keys)
      .sort(function (a, b) { return keys[b] - keys[a]; }).map(function (k) { return [k, (BIA[k] ? BIA[k].tr : k) + " (" + keys[k] + ")"]; }), "Yanlılık türü") + "</div>" +
    '<div class="xf"><span class="xfl">Kapsama</span>' + fSel("fmin", null, [[5, "En az 5 kurum (hepsi)"], [8, "En az 8 kurum"], [10, "En az 10 kurum"], [14, "En az 14 kurum"]], "En az kurum") + "</div>" +
    '<div class="xf"><span class="xfl">Taraf</span>' + fSel("fside", "Bütün olaylar", [["left", "Solda daha çok verilen"], ["mid", "Dengeli verilen"],
      ["right", "Sağda daha çok verilen"], ["bs", "Yalnızca kör noktalar"]], "Taraf") + "</div>" +
    '<div class="xf"><span class="xfl">Kurum</span>' + fSel("fsrc", "Bütün kurumlar", Object.keys(used)
      .sort(function (a, b) { return srcName(a).localeCompare(srcName(b), "tr"); }).map(function (s) { return [s, srcName(s) + " (" + used[s] + ")"]; }), "Kurum") + "</div>" +
    '<div class="xf"><span class="xfl">Yoğunluk</span>' + fSel("fvmin", null, [[0, "Bütün yoğunluklar"], [10, "Ortalama ≥ 10"], [15, "Ortalama ≥ 15"], [25, "Ortalama ≥ 25"]], "En düşük ortalama yoğunluk") + "</div>" +
    '</div><p class="xsmall">Taraf, her tarafın verdiği kurum sayısı kendi etkin kurum sayısına bölündükten sonra ' +
    'hesaplanır (kör nokta kuralıyla aynı): sol payı %60 ve üstü “solda daha çok”, %40 ve altı “sağda daha çok”. ' +
    'Haber türü olaydaki başlıkların çoğunun bölümü; yanlılık türü, olaydaki en az bir başlıkta görülen yapı.</p></details>';
}
function readFeedF() {
  var v = function (id, d) { var n = $(id); return n ? n.value : d; };
  FEEDF = { q: v("#fq", FEEDF.q), topic: v("#ftopic", FEEDF.topic), sort: v("#fsort", FEEDF.sort) || "s",
    from: v("#ffrom", FEEDF.from), to: v("#fto", FEEDF.to), sec: v("#fsec", FEEDF.sec), key: v("#fkey", FEEDF.key),
    min: +v("#fmin", FEEDF.min) || 5, side: v("#fside", FEEDF.side), src: v("#fsrc", FEEDF.src), vmin: +v("#fvmin", FEEDF.vmin) || 0 };
  if (FEEDF.from && FEEDF.to && FEEDF.from > FEEDF.to) { var t = FEEDF.from; FEEDF.from = FEEDF.to; FEEDF.to = t; }
}
function feedChips() {
  var F = FEEDF, c = [], box = $("#fchips"); if (!box) return;
  var day = function (d) { return fmtD(d + "T00:00"); };
  if (F.from || F.to) c.push((F.from ? day(F.from) : "başından") + " – " + (F.to ? day(F.to) : "bugüne"));
  if (F.sec) c.push(SECT[F.sec] || F.sec);
  if (F.key) c.push(BIA[F.key] ? BIA[F.key].tr : F.key);
  if (F.min > 5) c.push("≥ " + F.min + " kurum");
  if (F.side) c.push({ left: "solda daha çok", mid: "dengeli", right: "sağda daha çok", bs: "kör nokta" }[F.side]);
  if (F.src) c.push(srcName(F.src));
  if (F.vmin) c.push("yoğunluk ≥ " + F.vmin);
  box.innerHTML = c.length ? c.map(function (x) { return '<span class="xfchip">' + esc(x) + "</span>"; }).join("") +
    '<button class="chip" data-freset>Temizle</button>' : "";
  wireFeedReset(box);
}
function wireFeedReset(root) {
  [].forEach.call(root.querySelectorAll("[data-freset]"), function (b) {
    b.onclick = function (ev) { ev.preventDefault();
      FEEDF = { q: "", topic: "", sort: FEEDF.sort, from: "", to: "", sec: "", key: "", min: 5, side: "", src: "", vmin: 0 };
      FEEDIDS.forEach(function (id) { var n = $(id); if (!n) return;
        if (id === "#fsort") return; n.value = id === "#fmin" ? "5" : id === "#fvmin" ? "0" : ""; });
      renderFeed(); };
  });
}

/* ---------- Kör noktalar ---------- */
var BSSIDE = "all";
function blindspotPage(q) {
  var act = V2.active || {};
  var all = D.E.filter(function (e) { return e.bs && !v3isIlanEvent(e); });
  var side = q.y === "left" || q.y === "right" ? q.y : "all";
  var list = all.filter(function (e) { return side === "all" || e.bs === side; })
    .sort(function (a, b) { return b.s.length - a.s.length; });
  var h = '<div class="phead"><div class="eyebrow">Kör noktalar</div>' +
    "<h1>Yelpazenin bir tarafının az verdiği olaylar</h1>" +
    '<p class="lede">' + D.E.length + " olaydan <b>" + all.length + "</b> tanesi kör nokta kuralına uyuyor: " +
    all.filter(function (e) { return e.bs === "left"; }).length + " olayı sol, " +
    all.filter(function (e) { return e.bs === "right"; }).length + " olayı sağ kurumlar, kendi sayılarına göre belirgin biçimde az verdi.</p></div>";
  h += '<div class="xtabs">' + [["all", "Hepsi"], ["left", "Solun az verdikleri"], ["right", "Sağın az verdikleri"]]
    .map(function (t) { return '<a class="xtab' + (t[0] === side ? " on" : "") + '" href="#/olaylar?t=kor' +
      (t[0] === "all" ? "" : "&y=" + t[0]) + '">' + t[1] + "</a>"; }).join("") + "</div>";
  h += '<div class="note"><b>Kural, Ground News’ün yayımladığı formülün bu kayıt defterine uyarlanmışıdır.</b> ' +
    "Kayıt defteri bu dönemde haber yayımlayan kurumlardan " + (act.right || "?") + " tanesini sağda, " +
    (act.left || "?") + " tanesini solda konumlandırıyor. Ham sayılarla bu dengesizlik neredeyse her olayı " +
    "“solun kör noktası” yapardı; bu yüzden her taraf kendi etkin kurum sayısına bölünür. " +
    '<a class="lnk" href="#/yontem?s=5">Kuralın tamamı →</a></div>';
  h += list.length ? '<div class="xcards" style="margin-top:18px">' + cards(list) + "</div>" :
    '<p class="xempty">Bu tarafta kör nokta yok.</p>';
  h += '<p class="xsmall" style="margin-top:18px">Kör nokta bir suçlama değildir: bir olayın bir tarafta az ' +
    "görünmesi editoryal tercihten, akış eksikliğinden ya da olayın bölgesel olmasından doğabilir. " +
    "Doğruluk (factuality) koşulu, doğruluk verisi eklenene kadar uygulanmıyor.</p>";
  return h;
}

/* ---------- Konular ---------- */
function topicsIndex() {
  var t = v3topicList().slice().sort(function (a, b) { return b.e.length - a.e.length; });
  return '<div class="phead"><div class="eyebrow">Konular</div><h1>Olayları konuya göre izleyin</h1>' +
    '<p class="lede">' + t.length + " konu. Takip ettiğiniz konular Size özel akışınızı oluşturur; " +
    "takip listesi yalnızca bu tarayıcıda saklanır.</p></div>" +
    '<div class="xtopics">' + t.map(function (x) {
      var fake = { cov: x.cov, s: { length: x.cov[0] + x.cov[1] + x.cov[2] } };
      return '<div class="xtopic"><div class="xtopic-h"><a href="#/konu?k=' + x.k + '"><b>' + esc(x.n) +
        "</b></a>" + followBtn("t", x.k) + "</div>" +
        '<div class="xsmall">' + x.e.length + " olay · " + x.top.slice(0, 3).map(srcName).join(", ") + "</div>" +
        bbar(fake) + "</div>";
    }).join("") + "</div>";
}
function pgTopic(q) {
  var t = TPX[q.k];
  if (!t) return '<div class="wrap page"><div class="phead"><h1>Konu bulunamadı</h1>' +
    '<p class="lede"><a class="lnk" href="#/olaylar?t=konular">Konulara dön</a></p></div></div>';
  var es = t.e.map(function (i) { return EV[i]; }).sort(function (a, b) { return b.s.length - a.s.length; });
  var bs = es.filter(function (e) { return e.bs; });
  var fake = { cov: t.cov, s: { length: t.cov[0] + t.cov[1] + t.cov[2] } };
  var tot = t.cov[0] + t.cov[1] + t.cov[2] || 1;
  var co = {}; es.forEach(function (e) { e.tp.forEach(function (k) { if (k !== t.k) co[k] = (co[k] || 0) + 1; }); });
  var srcCount = {}; es.forEach(function (e) { e.s.forEach(function (s) { srcCount[s] = (srcCount[s] || 0) + 1; }); });
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Konu</div>' +
    '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><h1>' + esc(t.n) + "</h1>" + followBtn("t", t.k) + "</div>" +
    '<p class="lede">' + es.length + " olay, " + es.reduce(function (s, e) { return s + e.n; }, 0) +
    " haber. Bu konudaki kapsamanın yelpazedeki dağılımı: Sol " + Math.round(100 * t.cov[0] / tot) +
    "%, Merkez " + Math.round(100 * t.cov[1] / tot) + "%, Sağ " + Math.round(100 * t.cov[2] / tot) +
    "% (kurum-olay sayısı üzerinden).</p></div>" + bbar(fake, true) +
    '<div class="xgrid" style="margin-top:22px"><div class="xmain"><div class="xsec-h"><h2>Bu konudaki olaylar</h2></div>' +
    '<div class="xcards">' + cards(es.slice(0, 90)) + "</div>" +
    (es.length > 90 ? '<p class="xsmall" style="margin-top:12px">En çok kurumun verdiği 90 olay gösteriliyor; tamamı için ' +
      '<a class="lnk" href="#/olaylar">Olaylar</a> sayfasında bu konuyu seçin.</p>' : "") + "</div>" +
    '<aside class="xaside"><div class="xside-card"><div class="eyebrow">En çok veren kurumlar</div><ol class="xrank">' +
    Object.keys(srcCount).sort(function (a, b) { return srcCount[b] - srcCount[a]; }).slice(0, 8).map(function (s) {
      return '<li><a href="#/kurum?s=' + s + '">' + esc(srcName(s)) + '</a><span class="xlean ' + sideOf(s) + '">' +
        SIDE[sideOf(s)] + '</span><b class="num">' + srcCount[s] + "</b></li>"; }).join("") + "</ol></div>" +
    (bs.length ? '<div class="xside-card"><div class="eyebrow">Bu konunun kör noktaları</div>' + cards(bs, "compact") + "</div>" : "") +
    (Object.keys(co).length ? '<div class="xside-card"><div class="eyebrow">İlgili konular</div><div class="xchips">' +
      Object.keys(co).sort(function (a, b) { return co[b] - co[a]; }).slice(0, 8).map(function (k) {
        return TPX[k] ? '<a class="xtp" href="#/konu?k=' + k + '">' + esc(TPX[k].n) + "</a>" : ""; }).join("") +
      "</div></div>" : "") + "</aside></div></div>";
  return h;
}

/* ================================================================ STORY */
var OWNTYPE = {
  ahaber: ["Holding", "Turkuvaz Medya"], sabah: ["Holding", "Turkuvaz Medya"], takvim: ["Holding", "Turkuvaz Medya"],
  hurriyet: ["Holding", "Demirören"], milliyet: ["Holding", "Demirören"], cnnturk: ["Holding", "Demirören"],
  haberturk: ["Holding", "Ciner"], ntv: ["Holding", "Doğuş"], yenisafak: ["Holding", "Albayrak"],
  turkiyegz: ["Holding", "İhlas"], trthaber: ["Kamu", "TRT"], cumhuriyet: ["Vakıf", "Cumhuriyet Vakfı"],
  birgun: ["Kooperatif", "BirGün"], halktv: ["Bağımsız", "Halk TV"], sozcu: ["Bağımsız", "Sözcü"],
  gercekgundem: ["Bağımsız", "Gerçek Gündem"], diken: ["Bağımsız", "Diken"], t24: ["Bağımsız", "T24"],
  karar: ["Bağımsız", "Karar"], haber7: ["Bağımsız", "Haber7"], yenicag: ["Bağımsız", "Yeni Çağ"],
  tv100: ["Bağımsız", "TV100"], aydinlik: ["Parti/hareket çevresi", "Vatan Partisi çevresi"],
  milligazete: ["Parti/hareket çevresi", "Millî Görüş çevresi"], akit: ["Diğer", "Anadolu Basın Birliği"]
};
function ownOf(s) { return OWNTYPE[s] || ["Belirsiz", SRC[s] && SRC[s].own ? SRC[s].own.grp : "—"]; }
function mixBar(counts, colors) {
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  var tot = keys.reduce(function (t, k) { return t + counts[k]; }, 0) || 1;
  return '<div class="xmix">' + keys.map(function (k, i) {
    return '<i style="flex:' + counts[k] + ";background:" + colors[i % colors.length] + '" title="' + esc(k) + " · " + counts[k] + '"></i>';
  }).join("") + '</div><div class="xmixleg">' + keys.map(function (k, i) {
    return '<span><em style="background:' + colors[i % colors.length] + '"></em>' + esc(k) + " <b class=\"num\">" +
      counts[k] + "</b> <span class=\"xsmall\">%" + Math.round(100 * counts[k] / tot) + "</span></span>";
  }).join("") + "</div>";
}
var OWNCOL = ["var(--ink2)", "var(--muted)", "var(--line2)", "#9a8f7a", "#7f8fa6", "#b7a99a", "#a3b1a1", "#c9c2d6"];

var ARTSIDE = "all", ARTSORT = "time";
function storyTop(e) {
  var c = covOf(e), act = V2.active || {};
  var arts = e.a.map(function (i) { return ART[i]; });
  var own = {}, grp = {};
  e.s.forEach(function (s) { var o = ownOf(s); own[o[0]] = (own[o[0]] || 0) + 1; grp[o[1]] = (grp[o[1]] || 0) + 1; });
  var nrep = Object.keys(e.rep || {}).length;
  var related = D.E.filter(function (x) { return x !== e && x.tp.some(function (k) { return e.tp.indexOf(k) >= 0; }); })
    .sort(function (a, b) {
      var sa = a.tp.filter(function (k) { return e.tp.indexOf(k) >= 0; }).length,
        sb = b.tp.filter(function (k) { return e.tp.indexOf(k) >= 0; }).length;
      return sb - sa || b.s.length - a.s.length; }).slice(0, 4);
  var flagged = (lsGet("cm2-sumflags", []) || []).some(function (f) { return f.e === e.i; });

  var h = '<div class="wrap page xstory"><div class="xcrumb"><a href="#/olaylar">Olaylar</a> › ' + tpChips(e, 4) + "</div>" +
    '<div class="xmeta" style="margin-top:10px"><span class="xpl">' + esc(e.pl) + '</span><span class="xdt">İlk haber ' +
    fmtDT(e.f) + " · son haber " + fmtDT(e.l) + "</span>" + bsBadge(e, true) + "</div>" +
    '<h1 class="xh1">' + esc(e.t) + "</h1>" +
    '<div class="xstory-grid"><div>' +
    '<div class="xsum"><div class="xsum-h"><span class="eyebrow">Özet</span>' +
    (e.sum ? '<button class="xflag' + (flagged ? " on" : "") + '" id="sumflag" data-e="' + e.i + '">' +
    (flagged ? "Bildirildi — teşekkürler" : "Bu özet yanlış mı?") + "</button>" : "") + "</div>" +
    (e.sum ? "<p>" + esc(e.sum) + "</p>" : '<p class="xsmall" style="font-size:14px">Bu olay için elle yazılmış bir özet yok. ' +
      "Özetler, en az 10 kurumun verdiği " + (V2.hand || 0) + " olay için yazıldı; bu olayın başlığı en az yüklü başlıktan alındı. " +
      "Aşağıda bütün başlıklar var.</p>") +
    '<div class="xflagform" id="flagform" hidden><label class="xsmall" for="flagnote">Neyin yanlış olduğunu kısaca yazın (isteğe bağlı)</label>' +
    '<textarea id="flagnote" rows="2" maxlength="400"></textarea><button class="chip" id="flagsend">Bildir</button></div>' +
    (e.sum ? '<p class="xsmall">Özet, bu olaydaki ' + e.n + " başlıktan yazıldı; haber metinleri okunmadı. " +
    "Kurumların farklı verdiği rakamlar özette ayrıca belirtilir.</p>" : "") + "</div>" +
    '<div class="xsec-h" style="margin-top:28px"><h2>Bütün haberler</h2><span class="mono xsmall">' + v3evCountLine(e) + "</span></div>" +
    '<div class="xtabs" id="atabs">' + [["all", "Hepsi", e.n], ["left", "Sol", 0], ["mid", "Merkez", 0], ["right", "Sağ", 0]]
      .map(function (t) {
        var n = t[0] === "all" ? t[2] : arts.filter(function (a) { return sideOf(a.s) === t[0]; }).length;
        return '<button class="xtab' + (t[0] === ARTSIDE ? " on" : "") + '" data-as="' + t[0] + '"' + (n ? "" : " disabled") + ">" +
          t[1] + ' <span class="num">' + n + "</span></button>"; }).join("") +
    '<select id="asort" style="margin-left:auto"><option value="time">Zamana göre</option>' +
    '<option value="lean">Yerleşime göre (sol → sağ)</option><option value="load">Yüklü dile göre</option></select></div>' +
    '<div id="alist"></div>' +
    "</div>" +
    '<aside class="xpanel"><div class="eyebrow">Kapsama ayrıntısı</div>' +
    '<div class="xkpis"><div><b class="num">' + v3newsOutletCount(e) + "</b><span>kurum</span></div>" +
    '<div><b class="num" style="color:var(--left)">' + c[0] + "</b><span>sol</span></div>" +
    '<div><b class="num" style="color:var(--mid)">' + c[1] + "</b><span>merkez</span></div>" +
    '<div><b class="num" style="color:var(--right)">' + c[2] + "</b><span>sağ</span></div></div>" +
    bbar(e, true) +
    '<p class="xsmall" style="margin-top:8px">Kendi kurum sayısına göre (sol ' + ((e.auto && D.meta.v3 ? D.meta.v3.active : act).left || "?") + ", sağ " + ((e.auto && D.meta.v3 ? D.meta.v3.active : act).right || "?") +
    " etkin kurum): sol %" + (e.ns ? e.ns[0] : "?") + ", sağ %" + (e.ns ? e.ns[1] : "?") + ". " +
    (e.bs ? "Bu fark kör nokta kuralını karşılıyor." : "Kör nokta kuralını karşılamıyor.") +
    ' <a class="lnk" href="#/yontem?s=5">Kural</a></p>' +
    '<div class="xstrip">' + ["left", "mid", "right"].map(function (sd) {
      var ss = e.s.filter(function (s) { return sideOf(s) === sd; });
      return ss.length ? '<div><span class="xlean ' + sd + '">' + SIDE[sd] + "</span>" + ss.map(function (s) {
        return '<a href="#/kurum?s=' + s + '">' + esc(srcName(s)) + "</a>"; }).join("") + "</div>" : "";
    }).join("") + "</div>" +
    '<div class="eyebrow" style="margin-top:20px">Sahiplik</div>' + mixBar(own, OWNCOL) +
    '<p class="xsmall" style="margin-top:6px">' + Object.keys(grp).filter(function (g) { return grp[g] > 1; })
      .map(function (g) { return "<b>" + esc(g) + "</b> grubundan " + grp[g] + " kurum"; }).join(" · ") +
    (Object.keys(grp).some(function (g) { return grp[g] > 1; }) ? ". " : "") +
    "Sahiplik bilgisi kayıt defterinden; tarihsiz ve doğrulanmamıştır.</p>" +
    '<div class="eyebrow" style="margin-top:20px">Özgün başlık</div>' +
    '<p style="margin-top:6px"><b class="num">%' + Math.round(100 * (e.n - nrep) / e.n) + "</b> " +
    (nrep ? "— " + nrep + " başlık başka bir kurumun başlığının neredeyse aynısı (ajans aktarımı ya da kopya)." :
      "— kopya başlık saptanmadı.") + "</p>" +
    '<div class="eyebrow" style="margin-top:20px">Yüklü dil</div><p style="margin-top:6px">Ortalama yoğunluk <b class="num">' + e.m +
    "</b>, başlıklar arası aralık <b class=\"num\">" + e.p + "</b> puan.</p>" +
    "</aside></div>";
  if (related.length) h += '<section class="sec"><h2>İlgili olaylar</h2><div class="xcards">' + cards(related) + "</div></section>";
  return h + "</div>";
}
/* Ledes are loaded on demand (window.cmLedes, see loader.js) and then shown under each headline. */
var LEDES5 = null;
function ledeButton5() {
  return LEDES5 ? "" : '<button class="chip" type="button" data-ledes5 style="margin:6px 0 10px">Spotları göster</button>';
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-ledes5]");
  if (!b || !window.cmLedes) return;
  b.disabled = true; b.textContent = "Spotlar yükleniyor…";
  window.cmLedes().then(function (m) { LEDES5 = m; route(); },
    function () { b.disabled = false; b.textContent = "Spotlar yüklenemedi, yeniden deneyin"; });
});
function artRows(e) {
  var arts = e.a.map(function (i) { return ART[i]; }).filter(function (a) {
    return ARTSIDE === "all" || sideOf(a.s) === ARTSIDE; });
  arts.sort(function (x, y) {
    if (ARTSORT === "lean") return (SRC[x.s] ? SRC[x.s].lean : 50) - (SRC[y.s] ? SRC[y.s].lean : 50);
    if (ARTSORT === "load") return y.v - x.v;
    return x.d.localeCompare(y.d);
  });
  var read = readLog().a;
  return arts.map(function (a) {
    var sd = sideOf(a.s), o = ownOf(a.s), rep = e.rep && e.rep[a.i];
    return '<div class="xart"><div class="xart-h"><a class="xsrc" href="#/kurum?s=' + a.s + '">' + esc(srcName(a.s)) + "</a>" +
      '<span class="xlean ' + sd + '">' + SIDE[sd] + (SRC[a.s] ? " · " + SRC[a.s].lean : "") + "</span>" +
      '<span class="xsmall">' + esc(o[1]) + "</span>" +
      '<span class="xsmall mono" style="margin-left:auto">' + fmtDT(a.d) + "</span></div>" +
      '<a class="xart-t" href="' + esc(a.u) + '" target="_blank" rel="noopener" data-a="' + a.i + '">' + esc(a.t) + "</a>" +
      (LEDES5 && LEDES5.get(a.i) ? '<p class="xsmall" style="margin:4px 0 0">' + esc(LEDES5.get(a.i)) + "</p>" : "") +
      '<div class="xart-f"><span class="tag' + (a.v >= 45 ? " b" : "") + '">' + esc(bandOf(a.v).tr) + " · " + a.v + "</span>" +
      (a.lv != null ? '<span class="tag" title="Aynı kurallarla spotun puanı">spot · ' + a.lv + "</span>" : "") +
      (rep ? '<span class="tag">' + esc(srcName(ART[rep].s)) + " başlığının neredeyse aynısı</span>" : "") + v3noticeTag(a) +
      (read.indexOf(a.i) >= 0 ? '<span class="tag g">okundu</span>' : "") + "</div></div>";
  }).join("") || '<p class="xempty">Bu tarafta haber yok.</p>';
}
function pgEventV2(q) {
  var e = EV[q.e];
  if (!e) return pgEventV1(q);
  logStory(e.i);
  var deep = pgEventV1(q);
  /* v1's own header repeats the title; drop it and keep its analysis. */
  deep = deep.replace(/^<div class="wrap page"><div class="phead">[\s\S]*?<\/p><\/div>/, '<div class="wrap page">');
  return storyTop(e) + '<div class="wrap"><div class="xdivider"><span>Derin analiz</span>' +
    "<p>Ortak unsurlar, ayrışan kelimeler ve tetiklenen çerçeveleme yapıları (v1 çözümleyicisi).</p></div></div>" + deep;
}

/* ================================================================ BENİM */
function forYou() {
  var f = follows();
  return D.E.filter(function (e) {
    return e.tp.some(function (k) { return f.t.indexOf(k) >= 0; }) || e.s.some(function (s) { return f.s.indexOf(s) >= 0; });
  }).sort(function (a, b) { return b.l.localeCompare(a.l) || b.s.length - a.s.length; });
}
function dietCounts(r) {
  var c = { left: 0, mid: 0, right: 0 }, src = {}, own = {}, bs = 0, load = [];
  var arts = r.a.map(function (i) { return ART[i]; }).filter(Boolean);
  arts.forEach(function (a) {
    var sd = sideOf(a.s); c[sd]++; src[a.s] = (src[a.s] || 0) + 1;
    var o = ownOf(a.s)[0]; own[o] = (own[o] || 0) + 1; load.push(a.v);
  });
  r.st.forEach(function (i) { if (EV[i] && EV[i].bs) bs++; });
  return { c: c, src: src, own: own, n: arts.length, bs: bs, st: r.st.length,
    load: load.length ? load.reduce(function (t, v) { return t + v; }, 0) / load.length : null };
}
function dietBar(dc) {
  var fake = { cov: [dc.c.left, dc.c.mid, dc.c.right], s: { length: dc.n } };
  return dc.n ? bbar(fake) : '<p class="xsmall">Henüz bir haber başlığına tıklamadınız; dağılım haber tıklamalarından hesaplanır.</p>';
}
function pgMine(q) {
  var tab = tabOf(secFor("/benim"), q);
  var h = '<div class="wrap page">';
  var f = follows();
  if (tab === "akis") {
    var list = forYou();
    h += '<div class="phead"><div class="eyebrow">Size özel</div><h1>Takip ettiklerinizden olaylar</h1>' +
      '<p class="lede">' + f.t.length + " konu ve " + f.s.length + " kurum takip ediyorsunuz. Liste bu tarayıcıda " +
      "tutulur; hesap yok, sunucuya bir şey gönderilmez.</p></div>";
    h += list.length ? '<div class="xcards">' + cards(list) + "</div>" :
      '<div class="note">Henüz bir şey takip etmiyorsunuz. Aşağıdaki konulardan seçin ya da bir kurum sayfasında ' +
      "“Takip et”e basın.</div>" + topicsIndex().replace(/<div class="phead">[\s\S]*?<\/p><\/div>/, "");
  }
  if (tab === "denge") {
    var r = readLog(), dc = dietCounts(r);
    var act = V2.active || {}, totAct = (act.left || 0) + (act.mid || 0) + (act.right || 0) || 1;
    h += '<div class="phead"><div class="eyebrow">Haber dengem</div><h1>Haberleri nereden okuyorsunuz</h1>' +
      '<p class="lede">Bu sitede açtığınız olaylardan ve tıkladığınız başlıklardan hesaplanır. Veri yalnızca bu ' +
      "tarayıcının yerel deposundadır; silmek için aşağıdaki düğme yeter.</p></div>";
    h += '<div class="grid g3">' + kpi(dc.st, "açılan olay") + kpi(dc.n, "tıklanan başlık") +
      kpi(dc.load == null ? "—" : dc.load.toFixed(1), "okunan başlıkların ortalama yoğunluğu") + "</div>";
    h += '<section class="sec"><h2>Yelpazedeki dağılım</h2><p class="sub">Tıkladığınız başlıkların kurumlarına göre. ' +
      "Karşılaştırma için: bu dönemde etkin kurumların %" + Math.round(100 * (act.left || 0) / totAct) + "'i solda, %" +
      Math.round(100 * (act.mid || 0) / totAct) + "'i merkezde, %" + Math.round(100 * (act.right || 0) / totAct) +
      "'i sağda.</p>" + dietBar(dc) + "</section>";
    if (dc.n) {
      h += '<section class="sec"><h2>Sahiplik</h2>' + mixBar(dc.own, OWNCOL) + "</section>";
      h += '<section class="sec"><h2>En çok okuduğunuz kurumlar</h2><ol class="xrank">' +
        Object.keys(dc.src).sort(function (a, b) { return dc.src[b] - dc.src[a]; }).slice(0, 10).map(function (s) {
          return '<li><a href="#/kurum?s=' + s + '">' + esc(srcName(s)) + '</a><span class="xlean ' + sideOf(s) + '">' +
            SIDE[sideOf(s)] + '</span><b class="num">' + dc.src[s] + "</b></li>"; }).join("") + "</ol></section>";
    }
    h += '<section class="sec"><h2>Kör noktalar</h2><p>Açtığınız ' + dc.st + " olaydan <b>" + dc.bs +
      "</b> tanesi kör nokta. " + (dc.st && dc.c.left + dc.c.right ?
      (dc.c.left > dc.c.right * 1.5 ? "Okumanız sola ağırlıklı; sağın daha çok verdiği olaylara göz atmak için " +
        '<a class="lnk" href="#/olaylar?t=kor&y=left">solun az verdikleri</a>.' :
       dc.c.right > dc.c.left * 1.5 ? "Okumanız sağa ağırlıklı; solun daha çok verdiği olaylar için " +
        '<a class="lnk" href="#/olaylar?t=kor&y=right">sağın az verdikleri</a>.' :
       "Okumanız iki taraf arasında görece dengeli.") : "") + "</p></section>";
    h += '<button class="chip" id="clearread">Okuma geçmişini sil</button>';
  }
  if (tab === "takip") {
    h += '<div class="phead"><div class="eyebrow">Takip</div><h1>Takip ettikleriniz</h1></div>';
    h += '<section class="sec"><h2>Konular</h2>' + (f.t.length ? '<div class="xtopics">' + f.t.map(function (k) {
      return TPX[k] ? '<div class="xtopic"><div class="xtopic-h"><a href="#/konu?k=' + k + '"><b>' + esc(TPX[k].n) +
        "</b></a>" + followBtn("t", k) + "</div></div>" : ""; }).join("") + "</div>" :
      '<p class="xsmall">Konu yok. <a class="lnk" href="#/olaylar?t=konular">Konulara göz atın</a>.</p>') + "</section>";
    h += '<section class="sec"><h2>Kurumlar</h2>' + (f.s.length ? '<div class="xtopics">' + f.s.map(function (s) {
      return '<div class="xtopic"><div class="xtopic-h"><a href="#/kurum?s=' + s + '"><b>' + esc(srcName(s)) +
        "</b></a>" + followBtn("s", s) + "</div></div>"; }).join("") + "</div>" :
      '<p class="xsmall">Kurum yok. Bir kurum sayfasında “Takip et”e basın.</p>') + "</section>";
  }
  return h + "</div>";
}

/* ================================================================ SEARCH */
function pgSearch(q) {
  return '<div class="wrap page"><div class="phead"><div class="eyebrow">Arama</div><h1>Olay, kurum, konu, başlık</h1></div>' +
    '<input type="search" id="sq" class="xsearch" placeholder="Örn. Girne, Sözcü, enflasyon…" value="' + esc(q.q || "") + '" autofocus>' +
    '<p class="xsmall" style="margin-top:8px">' + (LEDES5 ? "Başlıklarda ve spotlarda aranıyor." : "Yalnızca başlıklarda aranıyor. " + ledeButton5().replace("Spotları göster", "Spotlarda da ara")) +
    '</p><div id="sres"></div></div>';
}
/* Folded once on first search (same rule as the repo's search-index.ts): 139k headlines
   lowercased per keystroke would stall typing. */
var FOLD5 = null;
function fold5() {
  if (!FOLD5) FOLD5 = D.A.map(function (a) { return String(a.t).toLocaleLowerCase("tr"); });
  if (LEDES5 && !FOLD5.ledes) FOLD5.ledes = D.A.map(function (a) { var l = LEDES5.get(a.i); return l ? l.toLocaleLowerCase("tr") : ""; });
  return FOLD5;
}
function renderSearch() {
  var box = $("#sres"); if (!box) return;
  var q = (($("#sq") || {}).value || "").trim().toLocaleLowerCase("tr");
  if (q.length < 2) { box.innerHTML = '<p class="xsmall" style="margin-top:14px">En az iki harf yazın.</p>'; return; }
  var has = function (s) { return String(s).toLocaleLowerCase("tr").indexOf(q) >= 0; };
  var es = D.E.filter(function (e) { return !v3isIlanEvent(e) && (has(e.t) || has(e.sum)); });
  var ts = (D.TP || []).filter(function (t) { return has(t.n); });
  var ss = D.S.filter(function (s) { return has(s.n) && STAT[s.s]; });
  var F = fold5(), as = [];
  for (var j = 0; j < D.A.length && as.length < 40; j++)
    if (F[j].indexOf(q) >= 0 || (F.ledes && F.ledes[j].indexOf(q) >= 0)) as.push(D.A[j]);
  var h = "";
  if (ss.length || ts.length) h += '<div class="xchips" style="margin-top:16px">' +
    ss.map(function (s) { return '<a class="xtp" href="#/kurum?s=' + s.s + '">Kurum · ' + esc(s.n) + "</a>"; }).join("") +
    ts.map(function (t) { return '<a class="xtp" href="#/konu?k=' + t.k + '">Konu · ' + esc(t.n) + "</a>"; }).join("") + "</div>";
  h += '<section class="sec"><h2>Olaylar <span class="num xsmall">' + es.length + "</span></h2>" +
    (es.length ? '<div class="xcards">' + cards(es) + "</div>" : '<p class="xempty">Eşleşen olay yok.</p>') + "</section>";
  h += '<section class="sec"><h2>Başlıklar <span class="num xsmall">' + as.length + (as.length === 40 ? "+" : "") + "</span></h2>" +
    (as.length ? as.map(function (a) {
      return '<div class="xart"><div class="xart-h"><a class="xsrc" href="#/kurum?s=' + a.s + '">' + esc(srcName(a.s)) +
        '</a><span class="xlean ' + sideOf(a.s) + '">' + SIDE[sideOf(a.s)] + '</span><span class="xsmall mono" style="margin-left:auto">' +
        fmtDT(a.d) + "</span></div>" + (a.st ? '<a class="xart-t" href="#/olay?e=' + a.st + '">' : '<a class="xart-t" href="' +
        esc(a.u) + '" target="_blank" rel="noopener" data-a="' + a.i + '">') + esc(a.t) + "</a></div>";
    }).join("") : '<p class="xempty">Eşleşen başlık yok.</p>') + "</section>";
  box.innerHTML = h; wireGo(box);
}

/* ================================================================ OUTLET */
function pgSourceV2(q) {
  var v1 = pgSourceV1(q), k = q.s, om = (D.OM || {})[k], p = SRC[k];
  if (!p || !STAT[k]) return v1;
  var o = ownOf(k), sd = sideOf(k);
  var block = '<div class="xsrc-top"><span class="xlean ' + sd + '">' + SIDE[sd] + " · yerleşim " + p.lean + "/100</span>" +
    '<span class="xsmall">' + esc(o[0]) + " · " + esc(o[1]) + "</span>" + followBtn("s", k) + "</div>";
  if (om) {
    var mine = D.E.filter(function (e) { return e.s.indexOf(k) >= 0; });
    var missed = D.E.filter(function (e) { return e.bs === sd && e.s.indexOf(k) < 0; });
    block += '<section class="sec" style="margin-top:8px"><h2>Bu dönemde gözlenen davranış</h2>' +
      '<p class="sub">Altı eksenli profil kayıt defterinden gelir; aşağıdaki ölçüler bu dönemin haberlerinden hesaplandı ' +
      "ve profili gözlemle tamamlar.</p>" +
      '<div class="xobs">' +
      obs(om.share + "%", "olay kapsamı", D.E.length + " olaydan " + om.inS + " tanesini verdi") +
      obs(om.fr + "%", "çerçeveleme oranı", "en az bir yapının tetiklendiği başlıkların payı") +
      obs(om.load, "ortalama yoğunluk", "bütün başlıklarda (0–100)") +
      obs(om.rep, "kopya başlık", "başka bir kurumun başlığının neredeyse aynısı") +
      obs(om.bsIn, "kör noktada yer aldı", "verdiği olaylardan kör nokta olanlar") +
      obs(missed.length, "kendi tarafının kör noktası", "kendi tarafının az verdiği ve bu kurumun da vermediği olaylar") +
      "</div></section>";
    if (mine.length) block += '<section class="sec"><h2>Verdiği olaylar</h2><div class="xcards">' +
      cards(mine.sort(function (a, b) { return b.s.length - a.s.length; }).slice(0, 6)) + "</div></section>";
  }
  var i = v1.indexOf('<div class="grid g3">');
  return i < 0 ? v1 : v1.slice(0, i) + block + v1.slice(i);
}
function obs(v, l, d) { return '<div class="xob"><b class="num">' + v + "</b><span>" + l + "</span><em>" + d + "</em></div>"; }

/* ================================================================ METHOD */




/* ================================================================ ADMIN */
function pgAdminV2(q) {
  var tab = tabOf(ADMIN, q);
  if (tab !== "ozet") return pgAdminV1(q);
  var fl = lsGet("cm2-sumflags", []) || [];
  return '<div class="wrap page"><div class="phead"><div class="eyebrow">Özet bildirimleri</div>' +
    "<h1>Okurların yanlış bulduğu özetler</h1>" +
    '<p class="lede">Bir olay sayfasındaki “Bu özet yanlış mı?” düğmesiyle gelen bildirimler. Bu tarayıcıda saklanır.</p></div>' +
    (fl.length ? fl.slice().reverse().map(function (f) {
      var e = EV[f.e]; if (!e) return "";
      return '<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">' +
        '<a class="lnk" href="#/olay?e=' + e.i + '"><b>' + esc(e.t) + "</b></a>" +
        '<span class="xsmall mono" style="margin-left:auto">' + esc(f.at.slice(0, 16).replace("T", " ")) + "</span></div>" +
        '<p style="margin-top:8px">' + esc(e.sum) + "</p>" +
        (f.note ? '<p class="xsmall" style="margin-top:6px"><b>Not:</b> ' + esc(f.note) + "</p>" : "") +
        '<button class="chip" data-unflag="' + e.i + '" style="margin-top:8px">Çözüldü olarak işaretle</button></div>';
    }).join("") : '<p class="xempty">Bildirim yok.</p>') + "</div>";
}

/* ================================================================ wiring */
function wireGo(root) {
  [].forEach.call((root || document).querySelectorAll("[data-go]"), function (n) {
    if (n._go) return; n._go = 1;
    n.addEventListener("click", function (ev) {
      ev.stopPropagation(); if (ev.target.closest("button")) return;
      location.hash = n.getAttribute("data-go").replace(/^#/, "");
    });
    n.addEventListener("keydown", function (ev) { if (ev.key === "Enter") location.hash = n.getAttribute("data-go").replace(/^#/, ""); });
  });
  [].forEach.call((root || document).querySelectorAll("a[data-a]"), function (n) {
    if (n._la) return; n._la = 1;
    n.addEventListener("click", function () { logArticle(n.getAttribute("data-a")); });
  });
}
function wireFollow(root) {
  [].forEach.call((root || document).querySelectorAll("[data-fk]"), function (b) {
    if (b._f) return; b._f = 1;
    b.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var kind = b.getAttribute("data-fk"), k = b.getAttribute("data-fv");
      toggleFollow(kind, k);
      [].forEach.call(document.querySelectorAll('[data-fk="' + kind + '"][data-fv="' + k + '"]'), function (o) {
        var on = isFollowing(kind, k);
        o.classList.toggle("on", on); o.setAttribute("aria-pressed", on);
        if (o.classList.contains("xplus")) o.textContent = on ? "✓" : "+";
        else o.textContent = on ? "Takip ediliyor" : "+ Takip et";
      });
    });
  });
}
function v2After(path, tab, params) {
  wireGo(document); wireFollow(document);
  if (path === "/") {
    var redraw = function () { var box = $("#brief"); if (box) { box.outerHTML = briefHTML(); v2After("/", null, {}); } };
    [].forEach.call(document.querySelectorAll("[data-bday]"), function (b) {
      b.onclick = function () { if (!b.getAttribute("data-bday")) return; BRIEFDAY = b.getAttribute("data-bday"); redraw(); };
    });
    var bs = $("#bdaysel"); if (bs) bs.onchange = function () { BRIEFDAY = bs.value; redraw(); };
  }
  if (path === "/olaylar" && tab === "liste") {
    renderFeed();
    FEEDIDS.forEach(function (s) {
      var n = $(s); if (n) n[s === "#fq" ? "oninput" : "onchange"] = renderFeed; });
    [].forEach.call(document.querySelectorAll("[data-frange]"), function (b) {
      b.onclick = function () { $("#ffrom").value = b.getAttribute("data-frange"); $("#fto").value = ""; renderFeed(); };
    });
    [].forEach.call(document.querySelectorAll("[data-fv2]"), function (b) {
      b.onclick = function () {
        FEEDVIEW = b.getAttribute("data-fv2");
        [].forEach.call(document.querySelectorAll("[data-fv2]"), function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        renderFeed();
      };
    });
  }
  if (path === "/olay" && EV[params.e]) {
    var e = EV[params.e];
    var draw = function () { var b = $("#alist"); if (b) { b.innerHTML = artRows(e); wireGo(b); } };
    var as = $("#asort"); if (as) { as.value = ARTSORT; as.onchange = function () { ARTSORT = as.value; draw(); }; }
    [].forEach.call(document.querySelectorAll("[data-as]"), function (b) {
      b.onclick = function () {
        ARTSIDE = b.getAttribute("data-as");
        [].forEach.call(document.querySelectorAll("[data-as]"), function (o) { o.classList.toggle("on", o === b); });
        draw();
      };
    });
    ARTSIDE = "all";
    [].forEach.call(document.querySelectorAll("[data-as]"), function (o) { o.classList.toggle("on", o.getAttribute("data-as") === "all"); });
    draw();
    var fb = $("#sumflag");
    if (fb) fb.onclick = function () {
      var fl = lsGet("cm2-sumflags", []) || [];
      if (fl.some(function (f) { return f.e === e.i; })) return;
      var ff = $("#flagform"); if (ff) { ff.hidden = false; var ta = $("#flagnote"); if (ta) ta.focus(); }
    };
    var fs = $("#flagsend");
    if (fs) fs.onclick = function () {
      var fl = lsGet("cm2-sumflags", []) || [];
      fl.push({ e: e.i, at: new Date().toISOString(), note: (($("#flagnote") || {}).value || "").slice(0, 400) });
      var ok = lsSet("cm2-sumflags", fl), ff = $("#flagform");
      if (ff) ff.hidden = true;
      if (fb) { fb.textContent = ok ? "Bildirildi — teşekkürler" : "Bu tarayıcıda kaydedilemedi"; if (ok) fb.classList.add("on"); }
    };
  }
  if (path === "/benim" && tab === "denge") {
    var cr = $("#clearread");
    if (cr) cr.onclick = function () { lsSet("cm2-read", { st: [], a: [] }); route(); };
  }
  if (path === "/ara") {
    var sq = $("#sq"); if (sq) { sq.oninput = function () {
      renderSearch(); history.replaceState(null, "", "#/ara?q=" + encodeURIComponent(sq.value)); };
      renderSearch(); sq.focus(); sq.setSelectionRange(sq.value.length, sq.value.length); }
  }
  if (path === "/yonetim") {
    [].forEach.call(document.querySelectorAll("[data-unflag]"), function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-unflag");
        lsSet("cm2-sumflags", (lsGet("cm2-sumflags", []) || []).filter(function (f) { return f.e !== id; }));
        route();
      };
    });
  }
}

document.documentElement.setAttribute("lang", "tr");
/* ===================================================== 2.0 · olay örgüsü
   Selection: each week, the most-covered stories were screened and coded from
   headlines; only stories where outlets split on at least two dimensions that
   are actually filled in (≥ half the outlets) are shown, at most ten per week.
   Every view draws only those "focus" dimensions, so a column of
   "Belirtilmiyor" is never the picture. */
var NW = D.NW || [];
var NBYEV = {};
Object.keys(D.N).forEach(function (k) { if (D.N[k].ev) NBYEV[D.N[k].ev] = k; });
function NOF(e) { return e && NBYEV[e.i] ? D.N[NBYEV[e.i]] : null; }
function NKEY(e) { return e && NBYEV[e.i] ? NBYEV[e.i] : null; }
var NARRW = "w6", NFOC = null, NCUR = null;
var NDL = { frame: "Çerçeve", hero: "Merkezdeki aktör", blame: "Sorumlu tutulan", cause: "Sunulan neden",
  cons: "Öne çıkan sonuç", aff: "Etkilenen kesim", sol: "Meşrulaştırılan çözüm", moral: "Ahlaki çerçeve", start: "Hikâyenin başlangıcı" };
var NORD = ["frame", "hero", "blame", "cause", "cons", "aff", "sol", "moral", "start"];
function narrWeek(q) {
  q = q || {};
  if (q.n && D.N[q.n]) return D.N[q.n].w || "v1";
  if (q.w === "all") return "all";
  return NW.filter(function (w) { return w.k === q.w; }).length ? q.w : NW.length ? NW[NW.length - 1].k : "v1";
}
function narrWeekKeys(q) {
  var w = narrWeek(q || {});
  var W = NW.filter(function (x) { return x.k === w; })[0];
  return W ? W.keys : [];
}
function narrBlameKeys() { return NCUR && D.N[NCUR] ? [NCUR] : narrWeekKeys({ w: NARRW }); }
/* Columns for the flow: the story's top three focus dimensions, in reading order. */
function narrCols() {
  var f = (NFOC && NFOC.length >= 2 ? NFOC : ["frame", "blame", "sol"]).slice(0, 3);
  return NORD.filter(function (k) { return f.indexOf(k) >= 0; }).map(function (k) { return [k, NDL[k]]; });
}
var NPAL = ["#0F766E", "#7C3AED", "#B45309", "#0369A1", "#BE185D", "#4D7C0F", "#9333EA", "#C2410C", "#155E75", "#A16207"];
function pillMatrix(rows) {
  var dims = (NFOC && NFOC.length ? NFOC : ["frame", "blame", "sol"]);
  dims = NORD.filter(function (k) { return dims.indexOf(k) >= 0; });
  var col = {};
  dims.forEach(function (d) {
    var c = {}; rows.forEach(function (r) { var v = (r[d] || "").trim(); if (v && !UNSET(v)) c[v] = (c[v] || 0) + 1; });
    col[d] = {}; Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).forEach(function (v, i) { col[d][v] = NPAL[i % NPAL.length]; });
  });
  var rs = rows.slice().sort(function (a, b) { return (SRC[a.s] ? SRC[a.s].lean : 50) - (SRC[b.s] ? SRC[b.s].lean : 50); });
  return '<div class="scroller xpm"><table><thead><tr><th>Kurum</th>' + dims.map(function (d) { return "<th>" + esc(NDL[d]) + "</th>"; }).join("") +
    "</tr></thead><tbody>" + rs.map(function (r) {
      var pf = SRC[r.s];
      return '<tr><td><span class="xpm-s" style="--c:' + lean(pf ? pf.lean : null) + '">' + esc(pf ? pf.n : r.s) + "</span></td>" +
        dims.map(function (d) {
          var v = (r[d] || "").trim();
          return "<td>" + (v && !UNSET(v) ? '<span class="xpill" style="--c:' + col[d][v] + '">' + esc(v) + "</span>" :
            '<span class="xpill-e">başlıkta yok</span>') + "</td>";
        }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
}
function narrativeCards(rows) {
  var dims = NORD.filter(function (k) { return (NFOC || ["frame", "blame", "sol"]).indexOf(k) >= 0; });
  var rs = rows.slice().sort(function (a, b) { return (SRC[a.s] ? SRC[a.s].lean : 50) - (SRC[b.s] ? SRC[b.s].lean : 50); });
  return '<div class="ncards">' + rs.map(function (r) {
    var pf = SRC[r.s];
    return '<div class="ncard" style="border-top-color:' + lean(pf ? pf.lean : null) + '">' +
      "<h4>" + esc(pf ? pf.n : r.s) + "<span>yerleşim " + (pf && pf.lean != null ? pf.lean : "—") + "</span></h4>" +
      '<dl class="xdl">' + dims.map(function (d) {
        var v = (r[d] || "").trim();
        return "<dt>" + esc(NDL[d]) + "</dt><dd" + (v && !UNSET(v) ? "" : ' class="e"') + ">" + (v && !UNSET(v) ? esc(v) : "başlıkta yok") + "</dd>";
      }).join("") + "</dl>" +
      ((r.hl || r.ev) ? '<div class="quote">“' + esc(r.hl || r.ev) + "”</div>" : "") + "</div>";
  }).join("") + "</div>";
}

function pgNarrative(q) {
  q = q || {};
  NARRW = narrWeek(q);
  var weeks = NW.filter(function (w) { return w.k !== "v1"; });
  var shown = weeks.reduce(function (t, w) { return t + w.keys.length; }, 0);
  var pool = weeks.reduce(function (t, w) { return t + (w.pool || 0); }, 0);
  var h = '<div class="wrap page">';
  h += '<div class="phead"><div class="eyebrow">Anlatı haritası · olay örgüsü</div>' +
    "<h1>Aynı olay, farklı hikâye</h1>" +
    '<p class="lede">Yüklü dil yoğunluğu bir başlığın ne kadar yüklü olduğunu ölçer. Anlatı haritası başka bir ' +
    "şey sorar: kurum bu olayı <b>hangi hikâyenin parçası</b> sayıyor? Burada yalnızca kurumların " +
    "<b>en az iki boyutta</b> belirgin biçimde ayrıştığı olaylar var: elle ve makine desteğiyle kodlanan dönemde (1 Eylül – 10 Ekim) kodlanan " + pool +
    " olaydan " + shown + " tanesi. Her olayda yalnızca gerçekten ayrışılan boyutlar çiziliyor.</p></div>";
  /* week strip: overview first, then weeks, v1 archive last */
  var strip = [{ k: "all", l: "Tüm haftalar", n: shown + " olay" }].concat(weeks.map(function (w) {
    return { k: w.k, l: w.l, n: w.keys.length + " olay" }; })).concat(NW.filter(function (w) { return w.k === "v1"; }).map(function (w) {
    return { k: "v1", l: "1–8 Eylül arşivi", n: w.keys.length + " olay" }; }));
  h += '<div class="xweeks" role="tablist">' + strip.map(function (w) {
    return '<a class="xweek' + (w.k === NARRW ? " on" : "") + '" href="#/anlati?w=' + w.k + '" role="tab" aria-selected="' +
      (w.k === NARRW) + '"><b>' + esc(w.l) + "</b><span>" + w.n + "</span></a>";
  }).join("") + "</div>";
  if (NARRW === "all") return h + narrOverview() + v5NarrAuto() + "</div>";

  var W = NW.filter(function (x) { return x.k === NARRW; })[0] || { keys: [] };
  var keys = W.keys, isV1 = W.k === "v1";
  var cur = q.n && D.N[q.n] ? q.n : keys[0];
  var coded = keys.reduce(function (t, k) { return t + (D.N[k].rows || []).length; }, 0);
  h += '<div class="ctl">' + keys.map(function (k) {
    var nn = D.N[k];
    return '<button class="chip" data-narr="' + k + '" aria-pressed="' + (k === cur) + '">' +
      esc(narrName(k, 34)) + ' <span style="opacity:.6">' + (nn.focus || []).length + "×</span></button>"; }).join("") +
    '<span style="margin-left:auto;display:flex;gap:4px">' +
    '<button class="chip" id="vflow" aria-pressed="true">Akış</button>' +
    '<button class="chip" id="vcard" aria-pressed="false">Kartlar</button>' +
    '<button class="chip" id="vtable" aria-pressed="false">Tablo</button></span></div>';
  h += '<p class="xhint">Düğmedeki sayı, o olayda kurumların belirgin biçimde ayrıştığı boyut sayısıdır. Olaylar ayrışmanın gücüne göre sıralı.</p>';
  h += '<div id="narrbox"></div>';
  h += '<section class="sec"><h2>Sorumluluk kime yükleniyor</h2>' +
    '<p class="sub">Seçili olayda (<b id="cblame-t">' + esc(cur ? narrName(cur, 80) : "") + "</b>) haberlerin sorumlu olarak " +
    "gösterdiği aktörler ve onları gösteren kurumlar. Başka bir olay seçtiğinizde grafik o olaya göre yeniden çizilir. " +
    "Sorumlu göstermemek de bir tercihtir: başlığında sorumlu olmayan kurumlar grafikte görünmez, sayıları altta yazar.</p>" +
    fig("cblame", "sorumlu tutulan aktör × kurumun yerleşimi", {
      legend: legendHTML([{c:"var(--left)",t:"sola yerleşik"},{c:"var(--mid)",t:"merkez"},{c:"var(--right)",t:"sağa yerleşik"}]),
      take: "Bir satırda tek renk varsa, o aktörü yalnızca tek bir blok sorumlu tutuyor demektir." }) +
    '<p class="xhint" id="cblame-n"></p></section>';
  h += '<div class="note warn" style="margin-top:22px"><b>Kodlama.</b> ' +
    (isV1 ? "1–8 Eylül arşivi: dört olay elle, diğerleri makine desteğiyle kodlandı; burada yalnızca en az beş " +
      "kurumu olan ve iki boyutta ayrışan olaylar gösteriliyor. " :
      "Başlıklardan, tek kodlayıcıyla elle kodlandı; boş hücre “başlıkta yok” demektir. Seçim kuralı ve ölçüt için " +
      '<a class="lnk" href="#/yontem?s=6">Yöntem § 6</a>. ') +
    "Seçili haftada " + coded + " kurum-satırı. Bir <b>örnek</b>tir, genelleme değil.</div>";
  return h + v5NarrAuto() + "</div>";
}

/* "Haftalar boyunca" lives once, on the overview tab. */
function narrOverview() {
  var weeks = NW.filter(function (w) { return w.k !== "v1"; });
  var dimCount = {};
  var rowsH = weeks.map(function (w) {
    var n = w.keys.length, rowsN = 0, noBlame = 0, frames = 0;
    w.keys.forEach(function (k) {
      var rows = D.N[k].rows || []; rowsN += rows.length;
      rows.forEach(function (r) { if (UNSET(r.blame)) noBlame++; });
      var fr = {}; rows.forEach(function (r) { if (!UNSET(r.frame)) fr[r.frame] = 1; });
      frames += Object.keys(fr).length;
      (D.N[k].focus || []).forEach(function (d) { dimCount[d] = (dimCount[d] || 0) + 1; });
    });
    return '<tr><td><a class="lnk" href="#/anlati?w=' + w.k + '">' + esc(w.l) + '</a></td><td class="r num">' + (w.pool || n) +
      '</td><td class="r num">' + n + '</td><td class="r num">' + (n ? (frames / n).toFixed(1) : "—") +
      '</td><td class="r num">%' + Math.round(100 * noBlame / Math.max(1, rowsN)) + "</td></tr>";
  }).join("");
  var dims = Object.keys(dimCount).sort(function (a, b) { return dimCount[b] - dimCount[a]; });
  var tot = weeks.reduce(function (t, w) { return t + w.keys.length; }, 0);
  var h = '<section class="sec"><h2>Haftalar boyunca</h2><p class="sub">Her hafta için kodlanan aday olay sayısı, ' +
    "seçim kuralını geçen (en az iki boyutta ayrışan) olay sayısı, bir olayda ortalama kaç ayrı çerçeve kurulduğu ve " +
    "başlıkların ne kadarının kimseyi sorumlu göstermediği.</p>" +
    '<div class="scroller panel"><table><thead><tr><th>Hafta</th><th class="r">Aday</th><th class="r">Gösterilen</th>' +
    '<th class="r">Olay başına çerçeve</th><th class="r">Sorumlu yok</th></tr></thead><tbody>' + rowsH + "</tbody></table></div></section>";
  h += '<section class="sec"><h2>Kurumlar en çok nerede ayrışıyor</h2><p class="sub">Gösterilen ' + tot +
    " olayda, ayrışmanın taşındığı boyutlar (bir olay birden fazla boyutta ayrışabilir).</p>" +
    fig("nfoc", "boyut · kaç olayda belirgin ayrışma", { take: "Çerçeve neredeyse her olayda ayrışıyor; " +
      "sorumluluk ve ahlaki çerçeve daha az olayda ayrışıyor ama ayrıştığında hikâyeyi en çok değiştiren boyutlar onlar." }) + "</section>";
  h += '<section class="sec"><h2>Haftanın en çarpıcı ayrışması</h2><div class="xnbest">' + weeks.map(function (w) {
    var k = w.keys[0]; if (!k) return "";
    var n = D.N[k];
    return '<a class="xnb" href="#/anlati?n=' + k + '"><span class="eyebrow">' + esc(w.l) + "</span><b>" + esc(narrName(k, 80)) + "</b>" +
      "<span>" + (n.focus || []).slice(0, 3).map(function (d) { return esc(NDL[d]); }).join(" · ") + "</span></a>";
  }).join("") + "</div></section>";
  return h;
}
function narrFocusChart() {
  var weeks = NW.filter(function (w) { return w.k !== "v1"; }), c = {};
  weeks.forEach(function (w) { w.keys.forEach(function (k) { (D.N[k].focus || []).forEach(function (d) { c[d] = (c[d] || 0) + 1; }); }); });
  return barChart(NORD.filter(function (d) { return c[d]; }).sort(function (a, b) { return c[b] - c[a]; }).map(function (d, i) {
    return { label: NDL[d], value: c[d], display: c[d] + " olay", focal: i === 0, color: i === 0 ? "var(--cy)" : "var(--seq2)" };
  }), { padL: 168 });
}

var XTICK = null;
function tickerHTML() {
  if (!XTICK) {
    var ev = D.E.filter(function (e) { return e.s.length >= 9; }).sort(function (a, b) { return b.l.localeCompare(a.l); }).slice(0, 16);
    XTICK = ev.map(function (e) { return '<a href="#/olay?e=' + e.i + '"><b>' + e.s.length + " KRM</b>" + esc(storyLabel(e, 90)) + "</a>"; }).join("");
  }
  return '<div class="xtick" aria-label="Son sinyaller"><div class="xtick-l">SİNYAL</div><div class="xtick-t">' + XTICK + XTICK + "</div></div>";
}
function cyberChrome(path) {
  var vw = document.getElementById("view");
  if (vw && document.querySelector(".navbar") && !document.querySelector(".xtick")) vw.insertAdjacentHTML("afterbegin", tickerHTML());
}
function v2bAfter(path, tab, params) {
  cyberChrome(path);
  if (path === "/anlati" && NARRW === "all") { var nf = $("#nfoc"); if (nf) nf.appendChild(narrFocusChart()); }
  if (path === "/anlati" && NARRW !== "all") {
    var k = NKEY && params.n && D.N[params.n] ? params.n : null;
    var box = $("#narrbox");
    if (box) {
      var cur = k || narrWeekKeys(params)[0];
      var link = function () {
        var n = D.N[cur], a = $("#narrlink");
        if (a) a.remove();
        if (n && n.ev && EV[n.ev]) {
          var p = box.querySelector(".panel");
          if (p) p.insertAdjacentHTML("beforeend", '<p id="narrlink" style="margin-top:12px"><a class="lnk" href="#/olay?e=' +
            n.ev + '">Olayın bütün başlıkları ve kapsaması →</a></p>');
        }
      };
      var blame = function () {
        var cb = $("#cblame"); if (!cb) return;
        cb.innerHTML = "";
        var st = blameStats(), ch = blameChart();
        if (ch) cb.appendChild(ch);
        else cb.innerHTML = '<p style="color:var(--muted);font-size:13.5px">Bu olayda hiçbir başlık bir aktörü sorumlu göstermiyor.</p>';
        var t = $("#cblame-t"); if (t) t.textContent = narrName(cur, 80);
        var nn = $("#cblame-n");
        if (nn) nn.textContent = st.rows + " kurumdan " + st.attributed + " tanesi başlığında bir aktörü sorumlu gösteriyor; " +
          (st.rows - st.attributed) + " tanesi göstermiyor.";
      };
      link(); blame();
      [].forEach.call(document.querySelectorAll("[data-narr]"), function (bt) {
        var old = bt.onclick;
        bt.onclick = function () { cur = bt.getAttribute("data-narr"); if (old) old(); link(); blame(); };
      });
      ["#vflow", "#vcard", "#vtable"].forEach(function (s) {
        var bt = $(s); if (!bt) return; var old = bt.onclick;
        bt.onclick = function () { if (old) old(); link(); };
      });
    }
  }
  if (path === "/bulgular" && tab === "ileri") advDraw();
  if (path === "/bulgular" && tab === "hiz") v5Draw();
  if (path === "/yontem" && params.s) { var tg = document.getElementById("s" + params.s); if (tg) setTimeout(function () { tg.scrollIntoView({ block: "start" }); }, 30); }
}

/* ========================================================= 2.0 · bulgular
   v1's findings are recomputed at render time from the 40-day corpus; the
   claims that were hard-coded for one week are rewritten here so that every
   sentence follows the number above it. */
function pgFindings(q) {
  var tab = tabOf(secFor("/bulgular"), q || {});
  if (tab === "ileri") return pgAdvanced();
  if (tab === "hiz") return pgPace5();
  var F = findings();
  var m = D.meta.counts;
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Bulgular · temel</div>' +
    "<h1>" + WIN.days + " günün haberleri ne gösterdi</h1>" +
    '<p class="lede">' + WIN.range + ' arasında toplanan <b>' + m.articles.toLocaleString("tr") +
    "</b> başlık ve bunların en az beş kurumun verdiği <b>" + D.E.length.toLocaleString("tr") + " olayda</b> toplanan <b>" +
    D.E.reduce(function (t, e) { return t + e.n; }, 0).toLocaleString("tr") + "</b> tanesi üzerine " + F.length + " sonuç. Hepsi sayfa açıldığı anda bu " +
    "verilerden hesaplanıyor. Bazıları çarpıcı, bazıları <b>sıfır</b> — ve sıfır olanlar da bulgudur.</p></div>";
  F.forEach(function (f) {
    h += '<section class="find"><div class="find-h"><div class="find-n">' + f.n + "</div><div>" +
      "<h3>" + f.title + "</h3>" +
      '<div style="margin:14px 0 4px"><div class="bignum" style="color:' +
      (f.null ? "var(--ok)" : "var(--hot)") + '">' + f.big + "</div>" +
      '<div class="bignum-l">' + f.bigl + "</div></div>" +
      '<p class="claim">' + f.claim + "</p></div></div>";
    h += '<div class="body">';
    if (f.note) h += '<div class="note warn" style="margin-bottom:14px">' + f.note + "</div>";
    if (f.body) h += f.body;
    if (f.chart) h += fig(f.chart, f.eb || "bu bulgunun grafiği", {
      legend: f.legend ? legendHTML(f.legend) : "", take: f.take || "" });
    h += "</div></section>";
  });
  h += '<div class="note" style="margin-top:30px"><b>Bunlar ' + WIN.days + ' günün bulgularıdır.</b> ' +
    "Pencere " + WIN.range + ". Arşivlerine ulaşılan " + D.meta.sources.length + " kurumun " + V2.activeSet.length + "'" + CM3.trSuffix(V2.activeSet.length) + " dönemin en az " + WIN.half + " gününü " +
    "kapsıyor; seyrek arşivli kurumlar kurum karşılaştırmalı bulgulara alınmadı. Yöntem farkları için " +
    '<a class="lnk" href="#/yontem?s=5">Yöntem › Olaylar ve kör nokta →</a> · ' +
    'Kümeleme, temel bileşenler ve konu modeli için <a class="lnk" href="#/bulgular?t=ileri">İleri analiz →</a></div>';
  return h + "</div>";
}

/* Finding 03 — rewritten. v1 tested "is either bloc absent?" and found zero;
   on 40 days that raw test fires on many stories simply because the right has
   more outlets than the left. The 2.0 rule normalises by side and adds a
   binomial check, so both numbers are shown: the gap between them is the finding. */
function finding03() {
  var big = 0, raw = 0;
  D.E.forEach(function (e) {
    if (e.s.length < 4) return; big++;
    var c = evCoverage(e); if (!c.left || !c.right) raw++;
  });
  var bs = D.E.filter(function (e) { return e.bs; });
  var bl = bs.filter(function (e) { return e.bs === "left"; }).length, br = bs.length - bl;
  var act = V2.active || {};
  return { n: "03", big: bs.length, bigl: "kör nokta · " + big.toLocaleString("tr") + " olayda", null: bs.length / big < .03,
    title: "Kör nokta var, ama ham sayımın söylediğinin küçük bir kesri",
    claim: "Bir tarafın kurumlarından hiçbirinin vermediği olayları saymak, <b>" + raw + "</b> “kör nokta” " +
      "üretiyor. Ama kayıt defterindeki etkin kurumların " + act.right + sufNum(act.right) + " sağda, yalnızca " + act.left +
      sufNum(act.left) + " solda: sol taraf bir olayı tamamen kaçırmaya aritmetik olarak çok daha yatkın. Taraf başına " +
      "normalize edilip şansla açıklanabilecek durumlar (binom testi, p &lt; 0,10) çıkarıldığında geriye <b>" +
      bs.length + " olay</b> kalıyor — " + big.toLocaleString("tr") + " olayın %" + (100 * bs.length / big).toFixed(1).replace(".", ",") +
      sufNum((100 * bs.length / big).toFixed(1).replace(".", ",")) + ". <b>" + bl + "</b> tanesi sol kurumların, <b>" + br + "</b> tanesi sağ kurumların görmediği olaylar. " +
      (D.ADV && D.ADV.agenda && D.ADV.agenda.mantel_p < .05 ? "Kör noktalar seyrek; ama kurumların olay seçimi, yelpazedeki konumlarıyla zayıf da olsa ilişkili (İleri analiz A)." :
        "Ayrışma büyük ölçüde olayın <b>seçiminde</b> değil, <b>anlatımında</b>."),
    note: "<b>Ham sayım neden yanıltıcı:</b> " + act.left + " sol kuruma karşı " + act.right + " sağ kurum varken, sıradan bir olayın " +
      "solda hiç görünmemesi editoryal bir tercih olmadan da sık olur. Kural ve test için " +
      '<a class="lnk" href="#/yontem?s=5">Yöntem › Olaylar ve kör nokta</a>; olayların listesi ' +
      '<a class="lnk" href="#/olaylar?t=kor">Kör noktalar</a> sekmesinde.',
    body: '<div class="panel" style="padding:4px 18px 14px">' + bs.slice().sort(function (a, b) {
        return b.s.length - a.s.length; }).slice(0, 6).map(function (e) {
        return '<div class="arow" style="display:flex;gap:10px;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">' +
          '<a class="lnk" href="#/olay?e=' + e.i + '">' + esc(storyLabel(e, 90)) + "</a>" +
          '<span class="tag" style="white-space:nowrap">' + (e.bs === "left" ? "solun kör noktası" : "sağın kör noktası") + "</span></div>";
      }).join("") + "</div>" };
}

/* Finding 07 — rewritten. v1 caught RSS feeds that answered but had gone
   stale; 2.0 reads publisher sitemaps instead, and the failure mode there is
   different: whole archives that cannot be reached at all. */
function finding07() {
  var fd = D.FD || [];
  var dead = fd.filter(function (f) { return !f.ok || !f.n; });
  var thin = fd.filter(function (f) { return f.ok && f.n && f.w < WIN.half; });
  var ok = fd.filter(function (f) { return f.ok && f.n && f.w >= WIN.half; });
  if (!fd.length) return null;
  var rows = fd.slice().sort(function (a, b) { return (b.w || 0) - (a.w || 0) || (b.n || 0) - (a.n || 0); });
  return { n: "07", big: dead.length + " / " + fd.length, bigl: "kurumun arşivine ulaşılamadı",
    title: "Geriye dönük arşivler eşit açık değil",
    claim: WIN.days + " günü geriye dönük toplamak için " + fd.length + " kurumun site haritası okundu. <b>" + dead.length +
      "</b> kurumdan hiç başlık alınamadı, <b>" + thin.length + "</b> kurumun arşivi dönemin " + WIN.half + " gününden azını " +
      "kapsıyor; yalnızca <b>" + ok.length + "</b> kurum dönemin büyük bölümünü veriyor. Bu bir yanlılık bulgusu değil, " +
      "bir <b>ölçüm sınırı</b>: ulaşılamayan kurumlar kimseye “görmedi” denemez, ve kör nokta testi bu yüzden " +
      "yalnızca yeterli arşivi olan kurumlarla yapıldı.",
    chart: "f7", eb: "kurum başına kapsanan gün · " + WIN.days + " gün üzerinden",
    draw: function () {
      return barChart(rows.map(function (f) {
        var nm = SRC[f.s] ? SRC[f.s].n : f.s;
        return { label: nm, value: f.w || 0, display: f.w ? f.w + " gün" : "erişilemedi",
          color: !f.w ? "var(--line2)" : f.w >= WIN.half ? lean(SRC[f.s] ? SRC[f.s].lean : null) : "var(--seq1)",
          tip: "<span class='k'>" + esc(nm) + "</span>" + (f.n || 0).toLocaleString("tr") + " başlık · " + (f.w || 0) + " gün" };
      }), { padL: 128, max: WIN.days, axis: "kapsanan gün" });
    },
    legend: [{ c: "var(--left)", t: "sola yerleşik, yeterli arşiv" }, { c: "var(--mid)", t: "merkez" },
      { c: "var(--right)", t: "sağa yerleşik" }, { c: "var(--seq1)", t: "seyrek arşiv (<" + WIN.half + " gün)" }],
    take: "Sağdaki kurumların arşivleri soldakilerden daha erişilebilir. Kurum karşılaştırmalı her " +
      "sonuç bu dengesizlikle birlikte okunmalı." };
}

/* ======================================================= 2.0 · ileri analiz
   Three methods from the standard data-science toolbox (hierarchical
   clustering, PCA, a topic model), each run once in the build on the full
   corpus and shipped as numbers. Every result carries its permutation test,
   because 15 outlets is a small sample and an eye-pleasing picture of 15
   points is easy to over-read. */
var ADV = D.ADV || null;
function pgAdvanced() {
  if (!ADV) return '<div class="wrap page"><p>İleri analiz verisi yok.</p></div>';
  var A = ADV.agenda, P = ADV.pca, T = ADV.topics;
  var nm = function (s) { return SRC[s] ? SRC[s].n : s; };
  var sig = function (p) { return p < .05 ? "anlamlı" : "anlamlı değil"; };
  /* 5.0: every conclusion below follows the test result instead of fixed wording. */
  var agSig = A.mantel_p < .05, tpSig = T.mantel_p < .05, pcSig = P.p1 < .05, pc2Sig = P.p2 < .05;
  var agText = !agSig ? "Aynı olayları seçmek, yelpazede yakın olmakla ilişkili değil." :
    A.mantel_r > 0 ? "Yelpazede birbirinden uzak kurumların seçtiği olaylar daha az örtüşüyor." : "Yelpazede uzak kurumlar beklenenden çok aynı olayları seçiyor.";
  var tpText = tpSig ? "Konu ağırlıkları yerleşimle ilişkili." : "Hangi konulara ağırlık verildiği yerleşimi izlemiyor.";
  var pcSide = P.rho1 > 0 ? "sağa" : "sola";
  var pcText = pcSig ? "Yazma biçiminin ana ekseni yerleşimle ilişkili: " + pcSide + " yerleşik kurumlar bu yapılara daha sık başvuruyor." :
    "Yazma biçiminin ana ekseni yerleşimle anlamlı biçimde ilişkili değil.";
  var thin = A.order.filter(function (s) { var f = (D.FD || []).filter(function (x) { return x.s === s; })[0]; return f && f.w < WIN.days; });
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Bulgular · ileri analiz</div>' +
    "<h1>" + (!agSig && pcSig ? "Neyi haber yaptıkları değil, nasıl yazdıkları yerleşimi izliyor" :
      agSig && pcSig ? "Hem neyi haber yaptıkları hem nasıl yazdıkları yerleşimi izliyor" :
      agSig ? "Neyi haber yaptıkları yerleşimi izliyor, nasıl yazdıkları izlemiyor" : "Ne seçtikleri de nasıl yazdıkları da yerleşimi izlemiyor") + "</h1>" +
    '<p class="lede">Üç standart veri bilimi yöntemi, ' + WIN.days + ' günün verisine' + WIN.stored + ' bir kez uygulandı: kurumları ' +
    "<b>verdikleri olaylara göre kümeleme</b>, <b>yazma biçimlerinin temel bileşenleri</b> ve " +
    "<b>konu modeli</b>. Her sonuç bir permütasyon testiyle birlikte veriliyor: " + A.order.length + " kurum küçük bir örneklem ve " + A.order.length + " noktalık " +
    "güzel bir resim kolayca fazla okunur.</p></div>";
  /* summary strip */
  h += '<div class="xadvsum">' +
    advStat("Gündem seçimi", "r = " + A.mantel_r.toFixed(2), "p = " + A.mantel_p.toFixed(2) + " · " + sig(A.mantel_p),
      agText) +
    advStat("Konu karışımı", "r = " + T.mantel_r.toFixed(2), "p = " + T.mantel_p.toFixed(2) + " · " + sig(T.mantel_p),
      tpText) +
    advStat("Yazma biçimi", "ρ = " + P.rho1.toFixed(2), "p = " + P.p1.toFixed(3) + " · " + sig(P.p1),
      pcText) + "</div>";

  /* ---- A. agenda clustering */
  var ord = A.order, ov = A.phi;
  var pairs = [];
  ord.forEach(function (a, i) { ord.forEach(function (b, j) { if (j > i) pairs.push([a, b, ov[a][b]]); }); });
  pairs.sort(function (x, y) { return y[2] - x[2]; });
  var lo = pairs[pairs.length - 1], hi = pairs[0];
  h += '<section class="find"><div class="find-h"><div class="find-n">A</div><div>' +
    "<h3>Kim kiminle aynı olayları seçiyor</h3>" +
    '<div style="margin:14px 0 4px"><div class="bignum" style="color:var(--ok)">r = ' + A.mantel_r.toFixed(2) +
    '</div><div class="bignum-l">gündem benzerliği × yerleşim farkı · p = ' + A.mantel_p.toFixed(2) + "</div></div>" +
    '<p class="claim">Her kurum, verdiği olayların kümesiyle temsil edildi ve kurum çiftleri bu kümelerin ' +
    "benzerliğine göre <b>hiyerarşik olarak kümelendi</b> (ortalama bağlantı). En benzer çift <b>" +
    esc(nm(hi[0])) + " – " + esc(nm(hi[1])) + "</b> (φ = " + dec(hi[2], 2) + "), en farklı <b>" +
    esc(nm(lo[0])) + " – " + esc(nm(lo[1])) + "</b> (φ = " + dec(lo[2], 2) + "). Gündem benzerliği ile " +
    "kayıt defterindeki yerleşim farkı arasındaki ilişki <b>r = " + A.mantel_r.toFixed(2) + "</b> ve 9.999 " +
    "permütasyonluk Mantel testinde <b>" + sig(A.mantel_p) + "</b>. " + agText + "</p></div></div>" +
    '<div class="body"><div class="note warn" style="margin-bottom:14px"><b>Ölçüm:</b> iki kurumun olay kapsamının phi korelasyonu ' +
    "(φ; 0 = şanstan farksız, pozitif = beklenenden çok ortak olay). Örtüşme katsayısı ve Jaccard, en çok olay veren " +
    "kurumu herkese yakın gösterirdi; phi bunu kurum büyüklüğüne göre düzeltir. Yalnızca en az 150 olaya giren ya da en az 1.000 siyasi başlığı olan " + ord.length + " kurum dahil." +
    (thin.length ? " " + thin.map(function (s) { return esc(nm(s)); }).join(", ") + " için dönemin her gününden veri yok; kümelemedeki yerleri kısmen bundan etkilenebilir." : "") + "</div>" +
    fig("adv-a", "gündem benzerliği (φ) · kümeleme sırasına göre", {
      legend: legendHTML([{ c: "var(--seq4)", t: "φ ≥ 0,15 · çok benzer" }, { c: "var(--seq3)", t: "0,05 – 0,15" },
        { c: "var(--seq2)", t: "şanstan farksız" }, { c: "var(--seq1)", t: "φ < −0,05 · farklı" }]),
      take: "Kare bloklar birlikte kümelenen kurumlardır. Blokların içinde solun ve sağın kurumları " +
        "karışık duruyorsa, gündemi yerleşim değil başka bir şey (hız, kapsam, arşiv) belirliyor demektir." }) +
    "</div></section>";

  /* ---- B. PCA */
  var lname = function (k) { return BIA[k] ? BIA[k].en : k; };
  h += '<section class="find"><div class="find-h"><div class="find-n">B</div><div>' +
    "<h3>" + (pcSig ? "Yazma biçiminin ana ekseni sağ–sol eksenine oturuyor" : "Yazma biçiminin ana ekseni sağ–sol eksenini izlemiyor") + "</h3>" +
    '<div style="margin:14px 0 4px"><div class="bignum" style="color:var(--hot)">ρ = ' + P.rho1.toFixed(2) +
    '</div><div class="bignum-l">1. bileşen × yerleşim · p = ' + P.p1.toFixed(3) + "</div></div>" +
    '<p class="claim">Her kurumun siyasi başlıklarında ' + P.nkeys + " yanlılık yapısını ne sıklıkla kullandığı " +
    "standartlaştırıldı ve <b>temel bileşenler analizi</b> (PCA) uygulandı. İlk bileşen farkların <b>%" +
    Math.round(100 * P["var"][0]) + "</b>" + sufNum(Math.round(100 * P["var"][0]), 1) + " açıklıyor ve en çok " + P.load1.slice(0, 3).map(function (x) {
      return "<b>" + esc(lname(x[0])) + "</b>"; }).join(", ") + " yapılarından besleniyor. Bu eksen üzerindeki " +
    "sıralama, kayıt defterindeki yerleşimle <b>ρ = " + P.rho1.toFixed(2) + "</b> (Spearman, permütasyon p = " +
    P.p1.toFixed(3) + ")" + (pcSig ? " ilişkili: <b>" + pcSide + " yerleşik kurumlar bu yapılara daha sık başvuruyor</b>" : "; bu ilişki şansla açıklanabilir düzeyde") +
    ". İkinci bileşen (%" + Math.round(100 * P["var"][1]) + ") yerleşimle " + (pc2Sig ? "ilişkili" : "ilişkisiz") + " (ρ = " + P.rho2.toFixed(2) + ", p = " + P.p2.toFixed(3) + ").</p></div></div>" +
    '<div class="body"><div class="note warn" style="margin-bottom:14px"><b>Temel bulgular " + findNo("10") + " ile çelişiyor mu?</b> ' +
    "Bulgu " + findNo("10") + " bütün yapıları eşit ağırlıkla toplayıp çift mesafesine bakıyor. PCA ise yapıların <b>birlikte</b> değiştiği " +
    "yönü arıyor; iki ölçüm aynı veriyi farklı açılardan özetler, birbirinin yerine geçmez." + pcOdd() + "</div>" +
    fig("adv-b", "1. bileşen × 2. bileşen · nokta rengi yerleşim", {
      legend: legendHTML([{ c: "var(--left)", t: "sola yerleşik" }, { c: "var(--mid)", t: "merkez" }, { c: "var(--right)", t: "sağa yerleşik" }]),
      take: "Yatay eksende sağa gidildikçe yapı kullanımı artıyor. Renklerin soldan sağa kızardığını görüyorsanız, " +
        "bu yazma biçiminin yerleşimle hizalandığı anlamına gelir" + (agSig ? "; gündem seçimi de yerleşimi izliyor." : " — gündem seçiminde görülmeyen hizalanma.") }) +
    "</div></section>";

  /* ---- C. topics */
  var themes = T.themes, NT = themes.length;
  var lift = T.outlets.map(function (s) {
    var best = 0; T.prof[s].forEach(function (v, i) { if (v / T.pool[i] > T.prof[s][best] / T.pool[best]) best = i; });
    return { s: s, i: best, r: T.prof[s][best] / T.pool[best] };
  });
  var jsdS = T.outlets.slice().sort(function (a, b) { return T.jsd[b] - T.jsd[a]; });
  var w0 = T.weeks[0], wL = T.weeks[T.weeks.length - 1];
  var chg = themes.map(function (t, i) { return { i: i, d: wL.sh[i] - w0.sh[i] }; }).sort(function (a, b) { return b.d - a.d; });
  h += '<section class="find"><div class="find-h"><div class="find-n">C</div><div>' +
    "<h3>" + (tpSig ? "Konu karışımı yerleşimle birlikte değişiyor" : "Konu karışımı: kurumlar farklı, ama sağ–sol çizgisinde değil") + "</h3>" +
    '<div style="margin:14px 0 4px"><div class="bignum" style="color:var(--ok)">r = ' + T.mantel_r.toFixed(2) +
    '</div><div class="bignum-l">konu karışımı farkı × yerleşim farkı · p = ' + T.mantel_p.toFixed(2) + "</div></div>" +
    '<p class="claim">' + T.N.toLocaleString("tr") + " siyasi haber başlığına (yalnızca kısa metinler için " +
    "geliştirilmiş bir konu modeli ile) 40 konu atandı ve bunlar " + NT + " temaya toplandı. Kurumların konu karışımı " +
    "birbirinden belirgin biçimde ayrılıyor — en ayrıksı gündem <b>" + esc(nm(jsdS[0])) + "</b>" + sufGen(nm(jsdS[0])) + " (Jensen–Shannon " +
    T.jsd[jsdS[0]].toFixed(2) + "), ortalamaya en yakın <b>" + esc(nm(jsdS[jsdS.length - 1])) + "</b>" + sufGen(nm(jsdS[jsdS.length - 1])) + " (" +
    T.jsd[jsdS[jsdS.length - 1]].toFixed(2) + "). " + (tpSig ? "Bu farklar <b>yerleşimle ilişkili</b>" : "Ama bu farklar <b>yerleşimi izlemiyor</b>") + ": Mantel r = " +
    T.mantel_r.toFixed(2) + ", p = " + T.mantel_p.toFixed(2) + ". Dönem içinde en çok büyüyen tema <b>" +
    esc(themes[chg[0].i].l) + "</b> (ilk haftada %" + (100 * w0.sh[chg[0].i]).toFixed(1) + ", son haftada %" +
    (100 * wL.sh[chg[0].i]).toFixed(1) + ").</p></div></div>" +
    '<div class="body"><div class="note warn" style="margin-bottom:14px"><b>Neden LDA değil:</b> önce klasik LDA ' +
    "(Latent Dirichlet Allocation) denendi. LDA her belgenin birkaç konunun karışımı olduğunu varsayar; ortalama " +
    "sekiz kelimelik bir başlıkta bu varsayım çöküyor ve konuların ortalama tutarlılığı (NPMI) " + nfmt(T.lda_npmi) +
    " çıktı — anlamsız kelime yığınları. Aynı model ailesinin kısa metin sürümü olan <b>Dirichlet çok terimli " +
    "karışımı</b> (GSDMM; her başlığa tek konu) tutarlılığı " + nfmt(T.dmm_npmi) + "'a çıkardı. Her konu, sözcükleri en çok örtüşen referans temaya otomatik bağlandı. Her temanın kelimeleri aşağıda, kontrol edilebilir.</div>" +
    fig("adv-c1", "kurum × tema · ortalamaya göre fazla (koyu) ya da az (açık)", {
      take: "Bir hücre koyuysa o kurum bu temaya ortalamadan fazla yer veriyor. Sütunlarda sol ve sağ kurumlar " +
        "karışık koyulaşıyorsa, tema tercihi yerleşime bağlı değil demektir." }) +
    fig("adv-c2", "temaların haftalık payı · " + T.weeks.length + " hafta", {
      take: "Çizgiler çoğunlukla düz: gündemin bileşimi hafta hafta pek değişmiyor. Yükselen çizgiler dönemin " +
        "kendisine ait olaylardır." }) +
    '<div class="scroller panel" style="margin-top:16px"><table><thead><tr><th>Tema</th><th class="r">Pay</th>' +
    "<th>Konuların en sık kelimeleri</th><th class=\"r\">Yerleşimle ρ</th></tr></thead><tbody>" +
    themes.map(function (t, i) {
      return "<tr><td><b>" + esc(t.l) + "</b></td><td class=\"r num\">%" + (100 * T.pool[i]).toFixed(1) +
        '</td><td style="font-size:12px;color:var(--ink2);max-width:52ch">' + t.words.map(function (w) {
          return esc(w.slice(0, 6).join(" ")); }).join(" · ") + '</td><td class="r num">' + T.rho[i][0].toFixed(2) +
        (T.rho[i][1] < .05 ? "*" : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Pay: o temaya giren başlıkların oranı. ' +
    "Yerleşimle ρ: kurumların o temaya verdiği pay ile yerleşimleri arasındaki Spearman ilişkisi; * işareti p &lt; 0,05 " +
    "(permütasyon). " + (function () { var n = T.rho.filter(function (r) { return r[1] < .05; }).length;
      return n ? n + " tema bu eşiği geçiyor." : "Hiçbir tema bu eşiği geçmiyor."; })() + "</p>" +
    "</div></section>";

  h += '<div class="note" style="margin-top:30px"><b>Yöntemler.</b> Hiyerarşik kümeleme (ortalama bağlantı, ' +
    "phi korelasyonu), Mantel testi (9.999 permütasyon), temel bileşenler analizi (standartlaştırılmış yapı " +
    "oranları), Spearman sıra ilişkisi, Dirichlet çok terimli karışım (GSDMM, Yin ve Wang 2014), NPMI konu " +
    "tutarlılığı ve Jensen–Shannon ıraksaması. Hepsi scikit-learn ve SciPy ile, yöntem listesi " +
    '<a class="lnk" href="https://github.com/academic/awesome-datascience" target="_blank" rel="noopener">awesome-datascience</a> ' +
    "derlemesinin “Unsupervised Learning” bölümünden. Analiz yalnızca en az 1.000 haber başlığı ya da 150 olayı " +
    "olan kurumları kapsar.</div>";
  return h + "</div>";
}
/* The outlet that sits furthest from where its placement would put it on the PCA axis. */
function pcOdd() {
  var P = ADV.pca, ks = Object.keys(P.pts).filter(function (k) { return SRC[k] && SRC[k].lean != null; });
  if (ks.length < 4 || P.p1 >= .05) return "";
  var rank = function (f) { var o = ks.slice().sort(function (a, b) { return f(a) - f(b); }); var r = {}; o.forEach(function (k, i) { r[k] = i; }); return r; };
  var rp = rank(function (k) { return P.pts[k][0] * (P.rho1 > 0 ? 1 : -1); }), rl = rank(function (k) { return SRC[k].lean; });
  var odd = ks.slice().sort(function (a, b) { return Math.abs(rp[b] - rl[b]) - Math.abs(rp[a] - rl[a]); })[0];
  return " Eksen üzerindeki yeri yerleşiminden en çok sapan kurum: <b>" + esc(SRC[odd].n) + "</b>.";
}
function advStat(k, big, sub, txt) {
  return '<div class="xadvstat"><div class="eyebrow">' + esc(k) + '</div><div class="bignum" style="font-size:28px">' + big +
    '</div><div class="mono" style="font-size:11px;color:var(--muted);margin:2px 0 8px">' + sub + "</div><p>" + txt + "</p></div>";
}

function advDraw() {
  var put = function (id, node) { var t = document.getElementById(id); if (t && node) t.appendChild(node); };
  put("adv-a", advHeat());
  put("adv-b", advScatter());
  put("adv-c1", advThemeHeat());
  put("adv-c2", advWeekLines());
}
function advHeat() {
  var A = ADV.agenda, ord = A.order, n = ord.length;
  var cs = 30, padL = 128, padT = 112, w = padL + n * cs + 16, h = padT + n * cs + 12;
  var s = svg(w, h); s.style.maxWidth = w + "px";
  var col = function (v) { return v >= .15 ? "var(--seq4)" : v >= .05 ? "var(--seq3)" : v >= -.05 ? "var(--seq2)" : "var(--seq1)"; };
  ord.forEach(function (a, i) {
    var lab = tx(s, padL - 8, padT + i * cs + cs / 2 + 4, clip(SRC[a] ? SRC[a].n : a, 18), { anchor: "end" });
    s.appendChild(mk("rect", { x: padL - 6, y: padT + i * cs + 6, width: 3, height: cs - 12, fill: lean(SRC[a] ? SRC[a].lean : null) }));
    tx(s, padL + i * cs + cs / 2 + 4, padT - 8, clip(SRC[a] ? SRC[a].n : a, 16), { rotate: -55, anchor: "start" });
    ord.forEach(function (b, j) {
      var v = A.phi[a][b];
      var r = mk("rect", { x: padL + j * cs + 1, y: padT + i * cs + 1, width: cs - 2, height: cs - 2, rx: 3,
        fill: i === j ? "var(--line)" : col(v) });
      s.appendChild(r);
      if (i !== j) bindTip(r, "<span class='k'>" + esc(SRC[a] ? SRC[a].n : a) + " ↔ " + esc(SRC[b] ? SRC[b].n : b) +
        "</span>φ = " + dec(v, 2) + "<br>" + A.size[a] + " ve " + A.size[b] + " olay");
    });
  });
  return s;
}
function advScatter() {
  var P = ADV.pca, pts = P.pts, ks = Object.keys(pts);
  var xs = ks.map(function (k) { return pts[k][0]; }), ys = ks.map(function (k) { return pts[k][1]; });
  var x0 = Math.min.apply(null, xs) - .6, x1 = Math.max.apply(null, xs) + .6;
  var y0 = Math.min.apply(null, ys) - .6, y1 = Math.max.apply(null, ys) + .6;
  var w = 720, h = 420, pl = 40, pr = 20, pt = 20, pb = 44;
  var X = function (v) { return pl + (w - pl - pr) * (v - x0) / (x1 - x0); };
  var Y = function (v) { return h - pb - (h - pt - pb) * (v - y0) / (y1 - y0); };
  var s = svg(w, h);
  rule(s, pl, w - pr, Y(0)); vrule(s, X(0), pt, h - pb);
  tx(s, w - pr, h - pb + 30, "1. bileşen · %" + Math.round(100 * P["var"][0]) + " → daha çok yapı", { role: "eb", anchor: "end", size: 9.5 });
  tx(s, pl, pt - 6, "2. bileşen · %" + Math.round(100 * P["var"][1]), { role: "eb", size: 9.5 });
  var boxes = ks.map(function (k) { return { x0: X(pts[k][0]) - 8, x1: X(pts[k][0]) + 8, y0: Y(pts[k][1]) - 8, y1: Y(pts[k][1]) + 8 }; });
  var hit = function (b) { return boxes.some(function (o) { return b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0; }); };
  ks.sort(function (a, b) { return pts[a][0] - pts[b][0]; }).forEach(function (k) {
    var c = lean(SRC[k] ? SRC[k].lean : null), px = X(pts[k][0]), py = Y(pts[k][1]);
    var g = dotMark(s, px, py, 7, c, { opacity: .35 });
    var lab = SRC[k] ? SRC[k].n : k, lw = lab.length * 6.4;
    var cand = [[px + 11, py + 4, "start"], [px - 11, py + 4, "end"], [px + 8, py - 11, "start"], [px + 8, py + 20, "start"],
      [px - 8, py - 11, "end"], [px - 8, py + 20, "end"]];
    var pick = cand[0];
    for (var ci = 0; ci < cand.length; ci++) {
      var cx = cand[ci][0], cy = cand[ci][1], st = cand[ci][2] === "start";
      var b = { x0: st ? cx : cx - lw, x1: st ? cx + lw : cx, y0: cy - 11, y1: cy + 2 };
      if (!hit(b) && b.x0 > 0 && b.x1 < w) { pick = cand[ci]; boxes.push(b); break; }
    }
    tx(s, pick[0], pick[1], lab, { size: 11, halo: 3, anchor: pick[2] });
    bindTip(g, "<span class='k'>" + esc(SRC[k] ? SRC[k].n : k) + "</span>Yerleşim " + (SRC[k] ? SRC[k].lean : "—") +
      "<br>1. bileşen " + pts[k][0].toFixed(2) + " · 2. bileşen " + pts[k][1].toFixed(2) + "<br>" + P.n[k] + " siyasi başlık");
  });
  return s;
}
function advThemeHeat() {
  var T = ADV.topics, th = T.themes, os = T.outlets, nT = th.length;
  var cw = 58, rh = 26, padL = 128, padT = 96, w = padL + nT * cw + 70, h = padT + os.length * rh + 10;
  var s = svg(w, h); s.style.maxWidth = w + "px";
  th.forEach(function (t, j) { tx(s, padL + j * cw + cw / 2, padT - 8, clip(t.l, 22), { rotate: -40, size: 10.5 }); });
  os.forEach(function (o, i) {
    tx(s, padL - 10, padT + i * rh + rh / 2 + 4, SRC[o] ? SRC[o].n : o, { anchor: "end" });
    s.appendChild(mk("rect", { x: padL - 6, y: padT + i * rh + 5, width: 3, height: rh - 10, fill: lean(SRC[o] ? SRC[o].lean : null) }));
    th.forEach(function (t, j) {
      var r = T.prof[o][j] / T.pool[j];
      var f = r >= 1.5 ? "var(--seq4)" : r >= 1.15 ? "var(--seq3)" : r > .87 ? "var(--seq2)" : r > .67 ? "var(--seq1)" : "var(--line)";
      var rc = mk("rect", { x: padL + j * cw + 1, y: padT + i * rh + 1, width: cw - 2, height: rh - 2, rx: 3, fill: f });
      s.appendChild(rc);
      tx(s, padL + j * cw + cw / 2, padT + i * rh + rh / 2 + 4, Math.round(100 * T.prof[o][j]), { role: "val", anchor: "middle", size: 10,
        fill: r >= 1.15 ? "var(--surface)" : "var(--ink2)" });
      bindTip(rc, "<span class='k'>" + esc(SRC[o] ? SRC[o].n : o) + " · " + esc(t.l) + "</span>Başlıkların %" +
        (100 * T.prof[o][j]).toFixed(1) + "'i (ortalama %" + (100 * T.pool[j]).toFixed(1) + ")<br>Ortalamanın " + r.toFixed(2) + " katı");
    });
  });
  return s;
}
function advWeekLines() {
  var T = ADV.topics, wk = T.weeks, th = T.themes;
  var w = 720, h = 360, pl = 40, pr = 196, pt = 16, pb = 36;
  var max = 0; wk.forEach(function (x) { x.sh.forEach(function (v) { if (v > max) max = v; }); });
  max = Math.ceil(max * 20) / 20;
  var X = function (i) { return pl + (w - pl - pr) * i / (wk.length - 1); };
  var Y = function (v) { return h - pb - (h - pt - pb) * v / max; };
  var s = svg(w, h);
  [0, max / 2, max].forEach(function (v) { rule(s, pl, w - pr, Y(v)); tx(s, pl - 6, Y(v) + 4, "%" + Math.round(100 * v), { role: "val", anchor: "end", size: 10 }); });
  wk.forEach(function (x, i) { tx(s, X(i), h - pb + 18, x.l.replace(" Eylül", " Eyl").replace(" Ekim", " Eki"), { role: "val", anchor: "middle", size: 9.5 }); });
  var d = th.map(function (t, i) { return { i: i, d: wk[wk.length - 1].sh[i] - wk[0].sh[i] }; });
  var up = d.slice().sort(function (a, b) { return b.d - a.d; })[0].i;
  var labY = [];
  th.forEach(function (t, i) {
    var focal = i === up;
    var path = wk.map(function (x, k) { return (k ? "L" : "M") + X(k) + " " + Y(x.sh[i]); }).join(" ");
    var p = mk("path", { d: path, fill: "none", stroke: focal ? "var(--hot)" : "var(--line2)", "stroke-width": focal ? 2.4 : 1.2 });
    s.appendChild(p);
    bindTip(p, "<span class='k'>" + esc(t.l) + "</span>" + wk.map(function (x) { return esc(x.l) + ": %" + (100 * x.sh[i]).toFixed(1); }).join("<br>"));
    var y = Y(wk[wk.length - 1].sh[i]) + 4;
    labY.push({ y: y, i: i, focal: focal });
  });
  labY.sort(function (a, b) { return a.y - b.y; });
  for (var k = 1; k < labY.length; k++) if (labY[k].y - labY[k - 1].y < 12) labY[k].y = labY[k - 1].y + 12;
  labY.forEach(function (L) {
    tx(s, w - pr + 8, L.y, th[L.i].l, { size: 10.5, weight: L.focal ? 600 : 400, fill: L.focal ? "var(--hot)" : "var(--ink2)" });
  });
  return s;
}

/* Finding 05's note, computed rather than remembered: the linear fit, the
   curve, and how much of the curve rests on any single outlet. */
function polarNote(PF, r) {
  var lin = r * r, worst = null, allPos = true;
  PF.pts.forEach(function (p) {
    var f = polarFit(p.k); if (!f) return;
    if (!(f.co[0] > 0)) allPos = false;
    if (!worst || f.R2 < worst.R2) worst = { k: p.k, R2: f.R2 };
  });
  return "<b>Neden eğri, neden düz çizgi değil.</b> Aynı veriye <b>düz bir çizgi</b> uydurulduğunda R² = " +
    lin.toFixed(2) + "; parabol R² = " + PF.R2.toFixed(2) + ". Bir çukurun içinden geçen düz çizgi yataydır, " +
    "bu yüzden yalnızca düz çizgiye bakan bir test bu ilişkiyi “yok” diye okur. " +
    (worst ? "<b>Eğrinin en çok yaslandığı kurum " + esc(SRC[worst.k] ? SRC[worst.k].n : worst.k) +
      "</b>: o çıkarıldığında R² " + worst.R2.toFixed(2) + "'ye düşüyor. " : "") +
    (allPos ? "Yönü dayanıklı — hangi kurum çıkarılırsa çıkarılsın parabolün katsayısı pozitif kalıyor. " :
      "Yönü kırılgan — bazı kurumlar çıkarıldığında parabol tersine dönüyor. ") +
    "Yukarıdaki uç–merkez karşılaştırması hiçbir eğri uydurmasına dayanmaz; asıl güvenilecek sayı odur.";
}

function nfmt(x) { var v = x.toFixed(2); return v === "-0.00" ? "0.00" : v; }

/* ============================================================ 2.0 · yöntem
   One page, written as a methods chapter: numbered sections, equations where a
   rule is a formula, three diagrams where a rule is a flow, APA references. */
function methodPaper() {
  var m = D.meta.counts, act = V2.active || {}, totAct = (act.left || 0) + (act.mid || 0) + (act.right || 0);
  var weeks = NW.filter(function (w) { return w.k !== "v1"; });
  var pool = weeks.reduce(function (t, w) { return t + (w.pool || 0); }, 0);
  var shown = weeks.reduce(function (t, w) { return t + w.keys.length; }, 0);
  var bs = D.E.filter(function (e) { return e.bs; }), bsl = bs.filter(function (e) { return e.bs === "left"; }).length;
  var raw = D.E.filter(function (e) { var c = evCoverage(e); return e.s.length >= 4 && (!c.left || !c.right); }).length;
  var A = ADV || {}, P = A.pca || {}, T = A.topics || {}, G = A.agenda || {};
  var fmt = function (n) { return (+n).toLocaleString("tr"); };
  var sec = function (n, t) { return '<h2 id="s' + n + '"><span class="n">' + n + "</span> " + t + "</h2>"; };
  var toc = [[1, "Giriş"], [2, "Derlem"], [3, "Olay tespiti"], [4, "Yüklü dil"], [5, "Kapsama ve kör nokta"],
    [6, "Anlatı çözümlemesi"], [7, "İleri analizler"], [8, "Renk kodlaması"], [9, "Sınırlılıklar"], [10, "Etik"]];
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Yöntem</div>' +
    "<h1>Yöntem</h1>" +
    '<p class="lede">Çapraz Manşet’in veri toplama, olay tespiti, ölçüm ve çözümleme adımlarının akademik bir yöntem bölümü biçiminde dökümü.</p>' +
    '<nav class="xtoc">' + toc.map(function (t) { return '<a href="#/yontem?s=' + t[0] + '">' + t[0] + " · " + t[1] + "</a>"; }).join("") + "</nav></div>";
  h += '<article class="xpaper">';
  h += '<div class="abs"><p><b>Özet.</b> Bu çalışma, ' + WIN.range + ' döneminde ' + D.meta.sources.length + " Türk haber kuruluşunun " +
    "yayımladığı " + fmt(m.articles) + " başlığı inceler. Başlıklar site haritaları üzerinden geriye dönük olarak derlenmiş, sözcük ve karakter " +
    "n-gram benzerliğine dayalı bir kümeleme ile " + fmt(D.E.length) + " olaya ayrılmış, kural tabanlı bir sözlükçeyle yüklü dil " +
    "yoğunluğu bakımından puanlanmıştır. Kapsama asimetrisi, Ground News kör nokta kuralının taraf büyüklüğüne göre normalleştirilmiş ve " +
    "binom testiyle sınanmış bir uyarlamasıyla ölçülmüş (" + bs.length + " kör nokta); anlatı çerçeveleri dokuz boyutlu bir kodlama şemasıyla " +
    shown + " olayda incelenmiştir. Gözetimsiz yöntemler (hiyerarşik kümeleme, temel bileşenler analizi, Dirichlet çok terimli karışım) " +
    "kurumların <i>neyi</i> haber yaptığının siyasi yerleşimle ilişkisiz, <i>nasıl</i> yazdıklarının ise ilişkili olduğunu göstermektedir.</p></div>";

  h += sec(1, "Giriş ve araştırma soruları") +
    "<p>Haber yanlılığı literatürü yanlılığı genellikle üç düzeyde ele alır: olay seçimi (hangi olayların haber değeri taşıdığı), " +
    "sözcük seçimi (olayın hangi dille anlatıldığı) ve çerçeveleme (olayın hangi hikâyenin parçası sayıldığı) (Entman, 1993; Hamborg, 2023). " +
    "Çalışma bu üç düzeye karşılık gelen üç soruyu yanıtlamayı amaçlar:</p><ol>" +
    "<li><b>AS1 (seçim):</b> Siyasi yelpazenin farklı noktalarındaki kurumlar aynı olayları mı haber yapıyor?</li>" +
    "<li><b>AS2 (dil):</b> Aynı olayı veren kurumlar arasında yüklü dil kullanımı sistematik biçimde farklılaşıyor mu?</li>" +
    "<li><b>AS3 (anlatı):</b> Kurumlar aynı olguyu bildirirken farklı aktörleri sorumlu, farklı sonuçları öne çıkan, farklı değerleri " +
    "ilgili mi gösteriyor?</li></ol>";

  h += sec(2, "Derlem") +
    "<h3>2.1 Kaynak evreni</h3><p>Kaynak evreni, " + (D.FD || []).length + " kurumdan oluşan kayıt defteridir. Her kuruma " +
    "0 (sol) – 100 (sağ) arasında bir siyasi yerleşim değeri atanmıştır; bu değerler projeye <b>sağlanmış veridir</b> ve bu çalışmada " +
    "bağımsız olarak doğrulanmamıştır. Çözümlemelerde kurumlar yerleşime göre üç bloğa ayrılır: yerleşimi 45’in altı sol, 55’in üstü " +
    "sağ, arası merkez.</p>" +
    "<h3>2.2 Toplama</h3><p>RSS akışları yalnızca son birkaç saatin içeriğini taşıdığından, geriye dönük " + WIN.days + " günlük pencere yayıncıların " +
    "site haritaları (XML sitemap) üzerinden derlenmiştir. Her site haritasından pencereye düşen adresler seçilmiş, adres yolu haber dışı " +
    "bir bölümü (spor, magazin, burç, ilan vb.) gösteren kayıtlar dışlanmış, kalan sayfalardan başlık ve yayın zamanı okunmuştur. " +
    "Toplama robots.txt kurallarına uyularak ve istekler aralıklandırılarak yapılmıştır; gün sınırları Türkiye saatine (UTC+3) göredir. " +
    "12 karakterden kısa başlıklar ve aynı kurumda yinelenen adresler çıkarılmıştır.</p>" +
    '<figure class="fig" style="margin-top:20px">' + diaPipeline() + '<figcaption class="fig-take">Şekil 1. Veri hattı. Her kutudaki sayı o aşamadan sonra kalan birim sayısıdır.</figcaption></figure>' +
    "<h3>2.3 Kapsama</h3><p>" + (D.FD || []).length + " kurumdan " + D.meta.sources.length + " tanesinden veri alınabilmiştir. " +
    (V2.missing || []).length + " kurumun arşivine ulaşılamamıştır (sunucunun istekleri reddetmesi ya da bulunabilir bir arşiv site " +
    "haritası yayımlanmaması). Veri alınan kurumların " + totAct + " tanesi dönemin en az " + WIN.half + " gününü kapsamaktadır (" + act.left + " sol, " +
    act.mid + " merkez, " + act.right + " sağ); bu kurumlar “etkin” kabul edilmiş ve kurumlar arası karşılaştırmalar bunlarla sınırlandırılmıştır. " +
    "Kapsamanın sağa doğru çarpık olması (Tablo 1) bütün bulguların okunmasında hesaba katılmalıdır.</p>" +
    '<div class="scroller panel"><table><thead><tr><th>Kurum</th><th class="r">Yerleşim</th><th class="r">Başlık</th><th class="r">Gün (' + WIN.days + ')</th><th class="r">İlk gün</th></tr></thead><tbody>' +
    (D.FD || []).slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); }).map(function (f) {
      var pf = SRC[f.s];
      return '<tr><td><span class="xpm-s" style="--c:' + lean(pf ? pf.lean : null) + '">' + esc(pf ? pf.n : f.s) + "</span></td>" +
        '<td class="r num">' + (pf && pf.lean != null ? pf.lean : "—") + '</td><td class="r num">' + fmt(f.n || 0) + '</td><td class="r num">' + (f.w || 0) + '</td><td class="r num">' + (f.f ? fmtD(f.f + "T00:00") : "—") + "</td></tr>";
    }).join("") + '</tbody></table></div><p class="xsmall" style="margin-top:8px">Tablo 1. Kurum başına derlenen başlık, kapsanan gün sayısı ve ilk başlığın günü. ' +
    "Toplamaya sonradan katılan kurumlar (ör. yalnızca akışla toplananlar) dönemin yarısını kapsayana kadar etkin sayılmaz; kurumlar arası karşılaştırmalara bu yüzden girmez.</p>";

  h += sec(3, "Olay tespiti") +
    "<p>Başlıklar, sözcük (1–2 gram) ve karakter (3–5 gram) TF-IDF vektörleriyle temsil edilmiştir (Salton ve Buckley, 1988). " +
    "İki başlık arasındaki benzerlik kosinüs ölçüsüyle hesaplanmış, yalnızca 48 saat içinde yayımlanmış başlıklar arasında bağ kurulmuştur:</p>" +
    '<div class="eq">sim(a, b) = (v<sub>a</sub> · v<sub>b</sub>) / (‖v<sub>a</sub>‖ ‖v<sub>b</sub>‖),   |t<sub>a</sub> − t<sub>b</sub>| ≤ 48 sa</div>' +
    "<p>Kümeler en güçlü bağlardan başlanarak birleştirilmiş; zincirlenmeyi önlemek için iki küme ancak aralarındaki olası çiftlerin en az " +
    "%40’ı bağlıysa birleştirilmiş ve küme büyüklüğü 120 başlıkla sınırlandırılmıştır. En az beş farklı kurumun yer aldığı " +
    fmt(D.E.length) + " küme “olay” olarak kabul edilmiştir. En az on kurumun verdiği " + (V2.hand || 0) + " olayın başlığı ve tarafsız " +
    "özeti, yalnızca o olaydaki başlıklardan elle yazılmıştır. Kümeleme denetimsizdir; aynı olayın parçalara bölünmesi ya da iki olayın " +
    "birleşmesi mümkündür ve kümeler editoryal olarak doğrulanmamıştır.</p>";

  h += sec(4, "Yüklü dil ölçümü") +
    "<p>Her başlık sitenin kural tabanlı çözümleyicisiyle puanlanmıştır. Çözümleyici, bir sözlükçe ve sözdizimsel kalıplar aracılığıyla " +
    "başlıkta tetiklenen çerçeveleme yapılarını (ör. ad hominem, korku çağrısı, metaforik çerçeveleme) ve bunların kanıt sözcüklerini " +
    "belirler, ardından 0–100 arası bir yoğunluk puanı üretir. Puan altı banda ayrılır: haber dili (≤9), deyimsel (≤24), yüklü (≤44), " +
    "çerçevelenmiş (≤64), saldırı (≤84) ve sürekli (>84). Aynı kural dosyası sağlanan referans derlemdeki " + (D.meta.rules.refHeadlines || 0).toLocaleString("tr") + " kayıtlı puanın " +
    "tamamını birebir üretir. Sözlük tabanlı yöntemlerin haber dilinde sınırlı geçerliliği bilinmektedir (Hamborg, 2023); bu nedenle " +
    "puanlar kurumların mutlak yanlılığı olarak değil, <b>aynı olay içinde</b> karşılaştırma amacıyla kullanılmıştır.</p>";

  h += sec(5, "Kapsama asimetrisi ve kör nokta") +
    "<p>Ground News, bir olayı solun kör noktası sayar eğer (1) olayı 10’dan az sol kaynak vermişse, (2) sağın payı en az %33 ise ve " +
    "(3) solun payı (sağın payı − 33) × 30/37 değerini aşmıyorsa; sağ için ayna kural geçerlidir (Ground News, t.y.). Etkin kurum sayıları " +
    "dengesiz olduğundan (" + act.left + " sol, " + act.right + " sağ) kural iki değişiklikle uygulanmıştır. Birincisi, ham paylar yerine " +
    "her tarafın kendi etkin kurumlarının olayı verme oranı kullanılmıştır:</p>" +
    '<div class="eq">p̂<sub>L</sub> = k<sub>L</sub> / n<sub>L</sub>,   p̂<sub>R</sub> = k<sub>R</sub> / n<sub>R</sub>,   pay<sub>L</sub> = p̂<sub>L</sub> / (p̂<sub>L</sub> + p̂<sub>M</sub> + p̂<sub>R</sub>)</div>' +
    "<p>İkincisi, solun eksikliğinin şansla açıklanabilir olup olmadığı binom modeliyle sınanmıştır: olayın genel verilme oranı p ile, " +
    "n<sub>L</sub> sol kurumdan k<sub>L</sub> ya da daha azının olayı verme olasılığı %10’un altında olmalıdır.</p>" +
    '<div class="eq">P(X ≤ k<sub>L</sub>),  X ~ Binom(n<sub>L</sub>, p),   p = k / n<sub>etkin</sub>,   P &lt; 0,10</div>' +
    '<figure class="fig" style="margin-top:20px">' + diaBlind(raw, bs.length, bsl) + '<figcaption class="fig-take">Şekil 2. Kör nokta karar akışı. ' +
    "Ham sayım (bir bloğun hiç bulunmaması) " + raw + " olay işaretlerken normalleştirme ve binom testi bunu " + bs.length + "’ye indirir.</figcaption></figure>" +
    "<p>Ground News’in dördüncü koşulu (düşük doğruluklu kaynakların payı) doğruluk puanı bulunmadığından uygulanmamıştır.</p>";

  h += sec(6, "Anlatı çözümlemesi") +
    "<h3>6.1 Kodlama şeması</h3><p>Her kurumun bir olaydaki başlığı dokuz boyutta kodlanmıştır. Boyutlar, Entman’ın (1993) çerçevenin " +
    "dört işlevi (sorun tanımı, nedensel yorum, ahlaki değerlendirme, çözüm önerisi) ile Anlatı Politika Çerçevesi’nin karakter " +
    "kategorilerinden (kahraman, kötü, kurban; Shanahan vd., 2018) türetilmiştir (Şekil 3). Kodlama başlık düzeyinde ve tek kodlayıcıyla " +
    "yapılmıştır; başlığın desteklemediği boyut boş bırakılmış, boş hücre “başlıkta yok” olarak yorumlanmıştır.</p>" +
    '<figure class="fig" style="margin-top:20px">' + diaScheme() + '<figcaption class="fig-take">Şekil 3. Dokuz boyutun kuramsal kaynakları.</figcaption></figure>' +
    "<h3>6.2 Örneklem</h3><p>Her hafta için (i) en çok kurumun verdiği 10 olay ve (ii) kapsama sıralamasında 11–40. sıradaki olaylar " +
    "arasından, kurumlar arası puan farkı ile başlıkların sözcük örtüşmesizliğinin (1 − ortalama Jaccard) toplamına göre ön elemeden " +
    "geçen 8 aday birlikte değerlendirilmiş; bunların içinden anlatısal ayrışma potansiyeli taşıyanlar kodlanmıştır (toplam " + pool + " olay).</p>" +
    "<h3>6.3 Odak boyutlar ve seçim ölçütü</h3><p>Bir boyut, bir olay için ancak (a) kurumların en az yarısında doluysa ve (b) en az iki farklı " +
    "değer alıyorsa “odak boyut” sayılır. Odak boyutlar, dolu değerlerin normalleştirilmiş entropisi H, doluluk oranı c ve boyut ağırlığı w " +
    "(yorumlayıcı boyutlar için daha yüksek: sorumlu ve çözüm 1,2; çerçeve, neden ve ahlaki değer 1,0; başlangıç ve etkilenen 0,8; " +
    "kahraman 0,6; sonuç 0,5) ile puanlanır:</p>" +
    '<div class="eq">s<sub>d</sub> = w<sub>d</sub> · c<sub>d</sub> · H<sub>d</sub>,   H<sub>d</sub> = −Σ p<sub>v</sub> ln p<sub>v</sub> / ln N,   S = Σ<sub>en yüksek 3</sub> s<sub>d</sub></div>' +
    "<p>En az iki odak boyutu olan olaylar S’ye göre sıralanmış ve her hafta en fazla 10 olay gösterilmiştir (" + shown + " olay). " +
    "Görselleştirmeler yalnızca odak boyutları çizer; böylece çoğunluğu “belirtilmiyor” olan bir boyut görsel bir ayrışma gibi " +
    "sunulmaz. Bu seçim, yelpazenin bütününü değil, ayrışmanın en belirgin olduğu durumları temsil eder; amaç keşifseldir.</p>";

  h += sec(7, "İleri analizler") +
    "<p>Yalnızca en az 150 olaya giren ya da en az 1.000 haber başlığı olan kurumlar dahil edilmiştir. Bütün ilişki testleri permütasyonla yapılmıştır.</p>" +
    "<h3>7.1 Gündem kümelemesi</h3><p>Kurumlar, verdikleri olay kümeleri üzerinden phi korelasyonuyla karşılaştırılmıştır " +
    "(N olay sayısı; örtüşme katsayısının aksine en çok olay veren kurumu herkese yakın göstermez):</p>" +
    '<div class="eq">φ(A, B) = (|E<sub>A</sub> ∩ E<sub>B</sub>|·N − |E<sub>A</sub>|·|E<sub>B</sub>|) / √(|E<sub>A</sub>|·|E<sub>B</sub>|·(N − |E<sub>A</sub>|)·(N − |E<sub>B</sub>|))</div>' +
    "<p>Uzaklık matrisi (1 − φ) ortalama bağlantılı hiyerarşik kümelemeye girdi olarak verilmiş; gündem uzaklığı ile yerleşim farkı " +
    "arasındaki ilişki Mantel testiyle (Mantel, 1967; 9.999 permütasyon) sınanmıştır: r = " + (G.mantel_r != null ? G.mantel_r.toFixed(2) : "—") +
    ", p = " + (G.mantel_p != null ? G.mantel_p.toFixed(2) : "—") + ".</p>" +
    "<h3>7.2 Yazma biçiminin temel bileşenleri</h3><p>Her kurum için, siyasi başlıklarda her çerçeveleme yapısının görülme oranından oluşan bir " +
    "vektör standartlaştırılmış ve temel bileşenler analizi uygulanmıştır (Jolliffe ve Cadima, 2016). Birinci bileşenin yerleşimle Spearman " +
    "ilişkisi ρ = " + (P.rho1 != null ? P.rho1.toFixed(2) : "—") + " (permütasyon p = " + (P.p1 != null ? P.p1.toFixed(3) : "—") + ").</p>" +
    "<h3>7.3 Konu modeli</h3><p>Önce Latent Dirichlet Allocation (Blei vd., 2003) denenmiştir. Ortalama sekiz sözcüklük başlıklarda belge başına " +
    "konu karışımı varsayımı işlemediğinden konu tutarlılığı düşük kalmıştır (ortalama NPMI " + (T.lda_npmi != null ? nfmt(T.lda_npmi) : "—") +
    "; Bouma, 2009). Kısa metinler için önerilen Dirichlet çok terimli karışım modeli (GSDMM; Yin ve Wang, 2014) her başlığa tek konu " +
    "atar ve tutarlılığı " + (T.dmm_npmi != null ? nfmt(T.dmm_npmi) : "—") + " düzeyine çıkarmıştır. 40 konu, sözcük listeleri incelenerek 10 temaya " +
    "elle toplanmıştır. Kurumların tema dağılımları Jensen–Shannon ıraksamasıyla (Lin, 1991) karşılaştırılmış, ıraksama ile yerleşim farkı " +
    "yine Mantel testiyle sınanmıştır.</p>" +
    '<div class="eq">JSD(P‖Q) = ½ KL(P‖M) + ½ KL(Q‖M),   M = ½ (P + Q)</div>' +
    "<p>Bütün hesaplar scikit-learn (Pedregosa vd., 2011) ve SciPy (Virtanen vd., 2020) ile yapılmıştır.</p>";

  h += sec(8, "Renk kodlaması") +
    "<p>Sitede sol kırmızı, sağ mavi gösterilir; bu, ABD medyasının ve Ground News’in kullandığı eşleşmenin tersidir. Kırmızının solla " +
    "ilişkisi Avrupa siyasi geleneğinde 19. yüzyıla uzanır; ABD’deki “kırmızı Cumhuriyetçi” eşleşmesi ise 2000 seçim gecesi yayınlarıyla " +
    "yerleşmiştir (Lippiatt, 2014). İspanya’da yapılan bir deneyde yalnızca rengi değişen bir parti logosu, kırmızı olduğunda 1–10 " +
    "ölçeğinde ortalama 3,31, mavi olduğunda 7,44 konumuna yerleştirilmiştir (Losada Maestre ve Sánchez Medero, 2024). İkiye bölünmüş " +
    "renk haritalarının algılanan kutuplaşmayı artırdığı bulgusu (Furrer vd., 2023) nedeniyle yerleşim sürekli bir renk geçişiyle " +
    "gösterilmiş, renk hiçbir yerde tek bilgi taşıyıcısı olarak kullanılmamıştır. Türkiye’de parti renklerinin bu eksene oturmadığı " +
    "(kırmızının aynı zamanda ulusal bayrağın rengi olması) bir gözlemdir; bunu ölçen hakemli bir çalışmaya rastlanmamıştır.</p>";

  h += v5Method();
  h += sec(9, "Sınırlılıklar") + "<ol>" +
    "<li><b>Başlık düzeyi:</b> Ölçümler başlıklara ve spotlara dayanır; haber metninin tamamı incelenmemiştir. Başlık-tek yanlılık tahmininin tam metin " +
    "çözümlemesiyle tutarsız olabildiği bilinmektedir (Hamborg, 2023).</li>" +
    "<li><b>Güvenirlik:</b> Anlatı kodlaması tek kodlayıcıyla yapılmıştır; kodlayıcılar arası güvenirlik (ör. Krippendorff’un α’sı; " +
    "Krippendorff, 2018) ölçülmemiştir.</li>" +
    "<li><b>Yerleşim verisi:</b> Kurumların siyasi yerleşimi dışarıdan sağlanmıştır ve doğrulanmamıştır; yerleşime dayanan her bulgu bu varsayıma bağlıdır.</li>" +
    limits5() +
    "<li><b>Seçim yanlılığı:</b> Anlatı haritası ayrışmanın en belirgin olduğu olayları bilerek seçer; bu olaylar tipik değildir.</li></ol>";

  h += sec(10, "Etik ve veri koruma") +
    "<p>Toplama yalnızca kamuya açık başlıkları kapsar ve robots.txt kurallarına uyar. Okur tarafındaki kişiselleştirme (takip listesi, " +
    "okuma geçmişi, özet bildirimleri) yalnızca tarayıcının yerel deposunda tutulur; sunucuya veri gönderilmez.</p>";

  var R = [
    "Blei, D. M., Ng, A. Y., & Jordan, M. I. (2003). Latent Dirichlet allocation. <i>Journal of Machine Learning Research, 3</i>, 993–1022.",
    "Bouma, G. (2009). Normalized (pointwise) mutual information in collocation extraction. <i>Proceedings of GSCL</i>, 31–40.",
    "Entman, R. M. (1993). Framing: Toward clarification of a fractured paradigm. <i>Journal of Communication, 43</i>(4), 51–58.",
    "Furrer, R. A., Schloss, K. B., Lupyan, G., Niedenthal, P. M., & Wood, A. (2023). Red and blue states: Dichotomized maps mislead and reduce perceived voting influence. <i>Cognitive Research: Principles and Implications</i>.",
    "Ground News. (t.y.). <i>Rating system</i>. https://ground.news/rating-system",
    "Hamborg, F. (2023). <i>Revealing media bias in news articles: NLP techniques for automated frame analysis</i>. Springer.",
    "Jolliffe, I. T., & Cadima, J. (2016). Principal component analysis: A review and recent developments. <i>Philosophical Transactions of the Royal Society A, 374</i>(2065), 20150202.",
    "Krippendorff, K. (2018). <i>Content analysis: An introduction to its methodology</i> (4. bs.). Sage.",
    "Lin, J. (1991). Divergence measures based on the Shannon entropy. <i>IEEE Transactions on Information Theory, 37</i>(1), 145–151.",
    "Lippiatt, G. (2014). Liberal Party colours. <i>Journal of Liberal History, 84</i>, 36–40.",
    "Losada Maestre, R., & Sánchez Medero, R. (2024). Color war: Does color influence the perception of political messages? <i>Psychological Reports, 127</i>(1), 235–255.",
    "Mantel, N. (1967). The detection of disease clustering and a generalized regression approach. <i>Cancer Research, 27</i>(2), 209–220.",
    "Pedregosa, F., vd. (2011). Scikit-learn: Machine learning in Python. <i>Journal of Machine Learning Research, 12</i>, 2825–2830.",
    "Salton, G., & Buckley, C. (1988). Term-weighting approaches in automatic text retrieval. <i>Information Processing & Management, 24</i>(5), 513–523.",
    "Shanahan, E. A., Jones, M. D., & McBeth, M. K. (2018). How to conduct a Narrative Policy Framework study. <i>The Social Science Journal, 55</i>(3), 332–345.",
    "Virtanen, P., vd. (2020). SciPy 1.0: Fundamental algorithms for scientific computing in Python. <i>Nature Methods, 17</i>, 261–272.",
    "Yin, J., & Wang, J. (2014). A Dirichlet multinomial mixture model-based approach for short text clustering. <i>Proceedings of the 20th ACM SIGKDD</i>, 233–242."
  ];
  h += '<h2 id="sref"><span class="n">—</span> Kaynakça</h2><ul class="refs">' + R.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>";
  return h + "</article></div>";
}

/* ---- diagrams: drawn as SVG strings so they inherit the theme tokens */
function dBox(x, y, w, h, t, sub, o) {
  o = o || {};
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="var(--surface)" stroke="' +
    (o.hi ? "var(--cy)" : "var(--line2)") + '" stroke-width="' + (o.hi ? 1.6 : 1) + '"/>' +
    '<text x="' + (x + 12) + '" y="' + (y + 22) + '" font-size="13" font-weight="600" fill="var(--ink)">' + t + "</text>" +
    (sub ? '<text x="' + (x + 12) + '" y="' + (y + 40) + '" font-size="11" fill="var(--muted)" font-family="var(--ff-m)">' + sub + "</text>" : "");
}
function dArrow(x1, y1, x2, y2) {
  return '<path d="M' + x1 + " " + y1 + " L" + x2 + " " + y2 + '" stroke="var(--ink2)" stroke-width="1.2" fill="none" marker-end="url(#ah)"/>';
}
var DDEFS = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
  '<path d="M0 0 L10 5 L0 10 z" fill="var(--ink2)"/></marker></defs>';
function diaPipeline() {
  var m = D.meta.counts, f = function (n) { return (+n).toLocaleString("tr"); };
  var W = 760, bw = 155, bh = 54, g = 40;
  var r1 = [["Site haritaları", (D.FD || []).length + " kurum"], ["Pencere + filtre", fmtD(DAYS[0] + "T00:00") + " – " + fmtD(DAYS[DAYS.length - 1] + "T00:00")],
    ["Başlık + zaman", f(m.articles) + " başlık"], ["Puanlama", "0–100 · yapılar"]];
  var s = '<svg class="xdia" viewBox="0 0 ' + W + ' 330" role="img" aria-label="Veri hattı">' + DDEFS;
  r1.forEach(function (b, i) { var x = 10 + i * (bw + g); s += dBox(x, 20, bw, bh, b[0], b[1]); if (i) s += dArrow(x - g + 4, 47, x - 4, 47); });
  var px = 10 + 3 * (bw + g) + bw / 2;
  s += '<path d="M' + px + " 78 L" + px + " 104 L" + (10 + bw / 2) + " 104 L" + (10 + bw / 2) + ' 176" stroke="var(--ink2)" stroke-width="1.2" fill="none" marker-end="url(#ah)"/>';
  s += dBox(10, 180, bw, bh, "Kümeleme", "TF-IDF · 48 sa") + dArrow(10 + bw + 4, 207, 10 + bw + g - 4, 207) +
    dBox(10 + bw + g, 180, bw, bh, "Olaylar", f(D.E.length) + " · ≥5 kurum", { hi: 1 });
  var outs = [["Kör nokta", D.E.filter(function (e) { return e.bs; }).length + " olay", 120],
    ["Anlatı", NW.filter(function (w) { return w.k !== "v1"; }).reduce(function (t, w) { return t + w.keys.length; }, 0) + " olay", 190],
    ["İleri analiz", "kümeleme · PCA · konu", 260]];
  var ox = 480, sx = 10 + 2 * bw + g + 4;
  outs.forEach(function (o) {
    s += '<path d="M' + sx + " 207 C" + (sx + 60) + " 207 " + (ox - 60) + " " + (o[2] + 27) + " " + (ox - 4) + " " + (o[2] + 27) +
      '" stroke="var(--ink2)" stroke-width="1.2" fill="none" marker-end="url(#ah)"/>' + dBox(ox, o[2], 230, bh, o[0], o[1]);
  });
  return s + "</svg>";
}
function diaBlind(raw, fin, finL) {
  var W = 760, s = '<svg class="xdia" viewBox="0 0 ' + W + ' 300" role="img" aria-label="Kör nokta karar akışı">' + DDEFS;
  s += dBox(10, 20, 190, 54, "Olay", "≥4 kurum · " + D.E.length.toLocaleString("tr"));
  s += dArrow(204, 47, 246, 47) + dBox(250, 20, 230, 54, "Taraf oranları normalleştir", "p̂ = k / n etkin");
  s += dArrow(484, 47, 526, 47) + dBox(530, 20, 220, 54, "GN koşulları 1–3", "az kaynak · pay eşiği");
  s += dArrow(640, 78, 640, 124) + dBox(530, 128, 220, 54, "Binom testi", "P(X ≤ k) < 0,10");
  s += dArrow(640, 186, 640, 228) + dBox(530, 232, 220, 54, "Kör nokta", fin + " olay · " + finL + " sol, " + (fin - finL) + " sağ", { hi: 1 });
  s += dArrow(526, 155, 300, 155) + dBox(80, 128, 216, 54, "Kör nokta değil", "şansla açıklanabilir");
  s += '<rect x="10" y="232" width="350" height="54" rx="10" fill="none" stroke="var(--hot)" stroke-dasharray="4 4"/>' +
    '<text x="24" y="254" font-size="12.5" font-weight="600" fill="var(--hot)">Karşılaştırma: ham sayım</text>' +
    '<text x="24" y="272" font-size="11" fill="var(--muted)" font-family="var(--ff-m)">bir blok hiç yoksa → ' + raw + " olay</text>";
  return s + "</svg>";
}
function diaScheme() {
  var W = 760, s = '<svg class="xdia" viewBox="0 0 ' + W + ' 250" role="img" aria-label="Kodlama şeması">' + DDEFS;
  var groups = [["Entman · sorun tanımı", ["frame", "cons"], 10], ["Entman · nedensel yorum", ["cause", "blame", "start"], 200],
    ["Entman · ahlak + çözüm", ["moral", "sol"], 390], ["APÇ · karakterler", ["hero", "aff"], 580]];
  s += dBox(255, 10, 250, 46, "Kurumun başlığı", "bir olay × bir kurum", { hi: 1 });
  groups.forEach(function (g) {
    s += '<path d="M380 56 C380 80 ' + (g[2] + 85) + " 70 " + (g[2] + 85) + ' 96" stroke="var(--ink2)" stroke-width="1" fill="none" marker-end="url(#ah)"/>';
    s += '<text x="' + g[2] + '" y="116" font-size="10.5" fill="var(--cy)" font-family="var(--ff-m)" letter-spacing=".06em">' + g[0].toLocaleUpperCase("tr") + "</text>";
    g[1].forEach(function (d, i) {
      s += '<rect x="' + g[2] + '" y="' + (126 + i * 40) + '" width="170" height="32" rx="8" fill="var(--surface)" stroke="var(--line2)"/>' +
        '<text x="' + (g[2] + 10) + '" y="' + (147 + i * 40) + '" font-size="12" fill="var(--ink)">' + NDL[d] + "</text>";
    });
  });
  return s + "</svg>";
}

/* ====================================================== 2.0 · brand layer
   Implements the accepted proposal ("Route Aylin" + rebrand deck):
   newsprint & ink, Newsreader headlines, Plex for interface and numbers,
   three devices (the seam, the marked word, the shared band), five-section
   navigation, the split card on home / event / compare, six-axis rows on
   outlet pages, a visible "Düzeltme iste" everywhere, and v1 linked, never
   edited. Logo files are the deck's own outlined SVGs. */
var V1URL = "https://claude.ai/artifact/NPsSsUWZJU5uQaY2Q6TRzs";
var LOGO = window.CM_LOGO || {};
function svgURI(s) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s); }

/* ---------------------------------------------------------------- nav */
var NAV = [["/olaylar", "Olaylar", ["/olay", "/konu", "/anlati"]], ["/kurumlar", "Kurumlar", ["/kurum", "/harita"]],
  ["/bulgular", "Bulgular", []], ["/yanlilik", "Çerçeveleme", []], ["/yontem", "Yöntem", []]];
var SUB = {
  "/olaylar": [["/olaylar", "liste", "Tüm olaylar"], ["/olaylar", "kor", "Kör noktalar"], ["/olaylar", "konular", "Konular"], ["/anlati", null, "Anlatı Haritası"]],
  "/kurumlar": [["/kurumlar", "genel", "Genel bakış"], ["/kurumlar", "liste", "Kurum listesi"], ["/kurumlar", "karsilastir", "Karşılaştır"],
    ["/kurumlar", "kayit", "Kayıt defteri"], ["/kurumlar", "guven", "Güven"], ["/harita", null, "Harita"]],
  "/bulgular": [["/bulgular", "temel", "Temel bulgular"], ["/bulgular", "ileri", "İleri analiz"]],
  "/yanlilik": [["/yanlilik", "kesif", "Yapılar"], ["/yanlilik", "cozumleyici", "Başlık çözümleyici"],
    ["/yanlilik", "bicimler", "Üretim aşamaları"], ["/yanlilik", "turkiye", "Türkiye bağlamı"]],
  "/benim": [["/benim", "akis", "Size özel"], ["/benim", "denge", "Haber dengem"], ["/benim", "takip", "Takip ettiklerim"]]
};
var DETAILP = ["/olay", "/kurum", "/konu", "/ara"];
function navGroup(path) {
  if (path === "/benim") return "/benim";
  for (var i = 0; i < NAV.length; i++) if (NAV[i][0] === path || NAV[i][2].indexOf(path) >= 0) return NAV[i][0];
  return null;
}
function navHTML(path, over, tab) {
  var g = navGroup(path);
  var items = NAV.map(function (n) {
    return '<li><a class="xnav-a' + (n[0] === g ? " on" : "") + '" href="#' + n[0] + '"' + (n[0] === g ? ' aria-current="page"' : "") + ">" + n[1] + "</a></li>";
  }).join("");
  var mob = NAV.map(function (n) { return '<a href="#' + n[0] + '" class="' + (n[0] === g ? "is-active" : "") + '">' + n[1] + "</a>"; }).join("") +
    '<a href="#/benim" class="' + (g === "/benim" ? "is-active" : "") + '">Benim</a><a href="#/ara">Ara</a>';
  var h = '<header class="navbar xnav" id="nav"><div class="navrow">' +
    '<a class="brand" href="#/" aria-label="Çapraz Manşet, giriş"><img class="xlogo xlogo-l" src="' + (LOGO.h || "") + '" alt="Çapraz Manşet">' +
    '<img class="xlogo xlogo-d" src="' + (LOGO.hd || "") + '" alt="" aria-hidden="true"></a>' +
    '<nav class="pill-nav" aria-label="Ana gezinme"><ul class="xnav-l">' + items + "</ul></nav>" +
    '<div class="navtools">' +
      '<a class="xutil' + (g === "/benim" ? " on" : "") + '" href="#/benim">Benim</a>' +
      '<a class="icobtn" href="#/ara" aria-label="Ara"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="4.3"/><path d="m9.8 9.8 3.4 3.4"/></svg></a>' +
      '<button class="icobtn" id="theme" aria-label="Açık/koyu tema"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7.5 1.6a5.9 5.9 0 1 0 5.9 5.9 4.6 4.6 0 0 1-5.9-5.9Z"/></svg></button>' +
      '<button class="icobtn burger" id="burger" aria-label="Menü" aria-expanded="false"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5h11M2 10.5h11"/></svg></button>' +
    "</div></div>" + '<div class="mobmenu" id="mobmenu">' + mob + "</div></header>";
  var sub = g && v3sub(g, SUB[g]);
  if (sub && DETAILP.indexOf(path) < 0) {
    h += '<div class="subnav"><div class="subrow">' + sub.map(function (s) {
      var on = s[0] === path && (s[1] === null || s[1] === tab);
      return '<a class="subtab' + (on ? " on" : "") + '" href="#' + s[0] + (s[1] ? "?t=" + s[1] : "") + '"' + (on ? ' aria-current="page"' : "") + ">" + s[2] + "</a>";
    }).join("") + "</div></div>";
  }
  return h;
}

/* --------------------------------------------------------- the devices */
var TRSTOP = {};
("ve ile de da ki mi mı mu mü bir bu şu o için gibi daha çok en ne ya veya hem değil var yok olan oldu olarak sonra önce son " +
 "dakika flaş flas yeni haber haberi haberleri açıklandı açıklama açıkladı belli oldu gelişme gündem işte nedir nasıl kim neden " +
 "kimdir kaç hangi ne zaman tüm iki üç kadar göre ilk büyük video galeri canlı izle aldı verdi etti eden yaptı geldi").split(" ")
  .forEach(function (w) { TRSTOP[w] = 1; });
function trLow(s) { return String(s).toLocaleLowerCase("tr"); }
function htoks(t) {
  return String(t || "").split(/\s+/).map(function (raw) {
    var core = raw.replace(/^[^0-9A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû'’]+|[^0-9A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû'’]+$/g, "");
    core = core.replace(/^['’]+|['’]+$/g, "");
    var base = core.split(/['’]/)[0];
    var norm = trLow(base).replace(/[^a-zçğıöşüâîû0-9]/g, "");
    return { raw: raw, core: core, norm: norm, stem: v3on("stemMatch") ? CM3.stemTR(core) : norm.length > 5 ? norm.slice(0, 5) : norm,
      content: norm.length >= 3 && /[a-zçğıöşü]/.test(norm) && !TRSTOP[norm] };
  }).filter(function (t) { return t.core; });
}
/* Shared words and the words that differ, suffix-aware: an apostrophe suffix
   is stripped (İspanya’da = İspanya’nın) and words are compared on a
   five-letter stem, so case endings do not count as framing. */
function compareHeads(a, b) {
  var A = htoks(a.t), B = htoks(b.t);
  var sa = {}, sb = {};
  A.forEach(function (t) { if (t.content) sa[t.stem] = 1; });
  B.forEach(function (t) { if (t.content) sb[t.stem] = 1; });
  var shared = [], seen = {};
  A.forEach(function (t) { if (t.content && sb[t.stem] && !seen[t.stem]) { seen[t.stem] = 1; shared.push(t.core); } });
  var ev = function (x) { var w = {}; (x.e || []).forEach(function (e) { String(e[1] || "").split(/,\s*/).forEach(function (s) { w[trLow(s).trim()] = 1; }); }); return w; };
  var pick = function (T, other, src) {
    var evw = ev(src), seenS = {};
    return T.filter(function (t) { if (!t.content || other[t.stem] || seenS[t.stem]) return false; seenS[t.stem] = 1; return true; })
      .map(function (t) {
        var isEv = Object.keys(evw).some(function (w) { return w && (trLow(t.core).indexOf(w) >= 0 || w.indexOf(t.norm) >= 0); });
        return { t: t, s: (isEv ? 100 : 0) + t.norm.length };
      }).sort(function (x, y) { return y.s - x.s; }).slice(0, 2).map(function (x) { return x.t.core; });
  };
  return { shared: shared.slice(0, 5), markA: pick(A, sb, a), markB: pick(B, sa, b) };
}
function markText(t, words) {
  var out = esc(t);
  (words || []).forEach(function (w) {
    var ew = esc(w), i = out.indexOf(ew);
    if (i >= 0) out = out.slice(0, i) + '<mark class="mw">' + ew + "</mark>" + out.slice(i + ew.length);
  });
  return out;
}
function artOf(e, s) {
  var as = e.a.map(function (i) { return ART[i]; }).filter(function (a) { return a && a.s === s; });
  return as.sort(function (x, y) { return x.d.localeCompare(y.d); })[0];
}
function defaultPair(e) {
  var ss = e.s.filter(function (s) { return SRC[s] && SRC[s].lean != null && artOf(e, s); })
    .sort(function (x, y) { return SRC[x].lean - SRC[y].lean; });
  return ss.length >= 2 ? [ss[0], ss[ss.length - 1]] : null;
}
var SPLITPAIR = {};
function splitCard(e, pair, opt) {
  opt = opt || {};
  pair = pair || SPLITPAIR[e.i] || defaultPair(e);
  if (!pair) return "";
  var a = artOf(e, pair[0]), b = artOf(e, pair[1]);
  if (!a || !b) return "";
  var cmp = compareHeads(a, b);
  var side = function (s) { var sd = bloc(s); return { sd: sd, w: SIDE[sd], c: sd === "left" ? "var(--left)" : sd === "right" ? "var(--right)" : "var(--mid)" }; };
  var sa = side(a.s), sb = side(b.s);
  var nm = function (s) { return srcName(s).toLocaleUpperCase("tr"); };
  var panel = function (art, sd, marks, cls) {
    return '<div class="xsp-p ' + cls + '" style="--lean:' + sd.c + '" aria-label="' + esc(srcName(art.s) + ", " + sd.w.toLocaleLowerCase("tr") + ": " + art.t) + '">' +
      '<p class="xsp-o">' + esc(nm(art.s)) + " · " + esc(sd.w.toLocaleUpperCase("tr")) + (SRC[art.s] && SRC[art.s].lean != null ? ' <span class="num">' + SRC[art.s].lean + "</span>" : "") + "</p>" +
      '<p class="xsp-h">' + (opt.link === false ? markText(art.t, marks) :
        '<a href="' + esc(art.u) + '" target="_blank" rel="noopener">' + markText(art.t, marks) + "</a>") + "</p></div>";
  };
  var band = '<div class="xsp-band" aria-label="' + esc("Ortak kelimeler: " + (cmp.shared.join(" ") || "yok")) + '">' +
    '<span class="xsp-bl">ORTAK OLAN</span><span class="xsp-bw">' + (cmp.shared.length ? esc(cmp.shared.join(" ")) : "ortak kelime yok") + "</span></div>";
  return '<div class="xsplit' + (opt.small ? " small" : "") + '" data-e="' + e.i + '">' + panel(a, sa, cmp.markA, "top") + band + panel(b, sb, cmp.markB, "bot") + "</div>";
}
function splitBlock(e) {
  var pair = SPLITPAIR[e.i] || defaultPair(e);
  if (!pair) return "";
  var opts = e.s.filter(function (s) { return SRC[s] && artOf(e, s); }).sort(function (x, y) { return (SRC[x].lean == null ? 999 : SRC[x].lean) - (SRC[y].lean == null ? 999 : SRC[y].lean); });
  var sel = function (id, cur) {
    return '<select id="' + id + '" aria-label="' + (id === "spA" ? "Üstteki kurum" : "Alttaki kurum") + '">' + opts.map(function (s) {
      return '<option value="' + s + '"' + (s === cur ? " selected" : "") + ">" + esc(srcName(s)) + " · " + SIDE[bloc(s)] + "</option>"; }).join("") + "</select>";
  };
  var flagged = (lsGet("cm2-markflags", []) || []).some(function (f) { return f.e === e.i; });
  return '<section class="xspwrap" id="spwrap"><div class="xsp-ctl"><span class="eyebrow">Çapraz oku</span>' +
    '<label class="xsmall">Üst ' + sel("spA", pair[0]) + '</label><label class="xsmall">Alt ' + sel("spB", pair[1]) + "</label></div>" +
    '<div id="spcard">' + splitCard(e, pair) + "</div>" +
    '<div class="xsp-leg"><span><mark class="mw">İşaretli kelime</mark>: kurumlar arasında ayrışan</span>' +
    '<span>Varsayılan çift, olayı veren en soldaki ve en sağdaki kurum. Başlıklar kısaltılmadan, olduğu gibi.</span>' +
    '<button class="xflag' + (flagged ? " on" : "") + '" id="markflag">' + (flagged ? "Bildirildi — teşekkürler" : "Bu işaret yanlış mı?") + "</button></div></section>";
}

/* -------------------------------------------------------- spectrum strip */
function specStrip(e) {
  var dots = e.s.filter(function (s) { return SRC[s]; }).map(function (s) {
    var sd = bloc(s);
    return '<i class="' + sd + '" style="left:' + SRC[s].lean + '%" title="' + esc(srcName(s) + " · " + SIDE[sd] + " · " + SRC[s].lean) + '"></i>';
  }).join("");
  return '<div class="xspec" role="img" aria-label="' + esc("Veren kurumlar: " + e.s.map(srcName).join(", ")) + '">' +
    '<span class="xspec-l">Sol</span><div class="xspec-t">' + dots + '</div><span class="xspec-r">Sağ</span></div>';
}
function sCard(e, size) {
  var href = "#/olay?e=" + e.i;
  var tl = function (tag) { return "<" + tag + '><a class="xstretch" href="' + href + '">' + esc(e.t) + "</a></" + tag + ">"; };
  if (size === "compact") {
    return '<div class="xcard compact">' + tl("h4") + '<div class="xdom">' + domLine(e) + " " + bsBadge(e) + "</div></div>";
  }
  var meta = '<div class="xmeta">' + tpChips(e, 2) + '<span class="xpl">' + esc(e.pl || "") + "</span>" +
    '<span class="xdt">' + fmtD(e.l) + "</span></div>";
  return '<div class="xcard' + (size === "lead" ? " lead" : "") + '">' + meta +
    (size === "lead" ? tl("h2") + "<p>" + esc(e.sum) + "</p>" : tl("h3")) +
    v3diffLine(e) + specStrip(e) + '<div class="xdom">' + domLine(e) + " " + bsBadge(e) + "</div></div>";
}

/* ---------------------------------------------------------------- home */
function leadEvent() {
  var by = briefDays(), days = Object.keys(by).filter(function (d) { return by[d].length >= 3; }).sort();
  for (var i = days.length - 1; i >= 0; i--) {
    var c = by[days[i]].filter(function (e) { var v = covOf(e); return v[0] && v[2] && defaultPair(e); })
      .sort(function (a, b) { return b.s.length - a.s.length; });
    if (c.length) return c[0];
  }
  return D.E[0];
}
function pgHome() {
  var m = D.meta.counts, lead = leadEvent();
  var es = D.E.slice().sort(function (a, b) { return b.s.length - a.s.length || b.l.localeCompare(a.l); }).filter(function (e) { return e !== lead; });
  var bs = D.E.filter(function (e) { return e.bs; }).sort(function (a, b) { return b.s.length - a.s.length; });
  var h = '<div class="wrap page xhome3"><section class="xhero">' +
    '<div class="xhero-l"><p class="eyebrow">' + WIN.range + '</p>' +
    '<p class="xwm">Çapraz oku.</p>' +
    '<h1 class="xhero-h">Aynı olay, <mark class="mw">farklı</mark> manşet.</h1>' +
    '<p class="lede">Aynı olguyu bildiren başlıklar yan yana durur; farkı yaratan kelime işaretlenir. Manşet bütün kalır.</p>' +
    '<a class="xbtn" href="#/olay?e=' + lead.i + '">Çapraz oku →</a>' +
    '<p class="xcount"><span class="num">' + m.articles.toLocaleString("tr") + '</span> başlık · <span class="num">' + D.E.length.toLocaleString("tr") +
    '</span> olay · <span class="num">' + D.meta.sources.length + "</span> kurum</p></div>" +
    '<div class="xhero-r"><p class="eyebrow">Günün olayı · ' + fmtD(storyDay(lead) + "T00:00") + ' · <a class="lnk" href="#/olay?e=' + lead.i + '">' + esc(lead.t) + "</a></p>" +
    splitCard(lead) + '<p class="xsp-leg"><span><mark class="mw">İşaretli kelime</mark>: kurumlar arasında ayrışan</span></p></div></section>';
  h += '<section class="sec"><div class="xsec-h"><h2>Öne çıkan olaylar</h2><a class="lnk" href="#/olaylar">Tümü →</a></div>' +
    '<div class="xcards three">' + cards(es.slice(0, 6)) + "</div></section>";
  h += '<section class="sec xink"><div class="xsec-h"><h2>Kör noktalar</h2><a class="lnk" href="#/olaylar?t=kor">Tümü →</a></div>' +
    '<p class="sub">Yelpazenin bir tarafının, kendi kurum sayısına göre beklenenden belirgin biçimde az verdiği olaylar.</p>' +
    '<div class="xrail">' + cards(bs.slice(0, 8), "compact") + "</div></section>";
  h += '<section class="sec">' + briefHTML() + "</section>";
  ["siyaset", "yargi", "ekonomi", "dunya"].forEach(function (k) {
    var t = TPX[k]; if (!t) return;
    var tes = t.e.map(function (i) { return EV[i]; }).sort(function (a, b) { return b.s.length - a.s.length; });
    h += '<section class="sec xtopic-mod"><div class="xsec-h"><h2>' + esc(t.n) + "</h2>" + followBtn("t", k) +
      '<a class="lnk" href="#/konu?k=' + k + '">Konuya git →</a></div><div class="xcards three">' + cards(tes.slice(0, 3)) + "</div></section>";
  });
  return h + "</div>";
}

/* ---------------------------------------------------------------- event */
function pgEvent(q) {
  var e = EV[q.e];
  var h = pgEventV2(q);
  if (!e) return h;
  h = h.replace("</h1>", "</h1>" + splitBlock(e));
  h = h.replace('<div id="alist"></div>', ledeButton5() + '<div id="alist"></div>' + fixLink("olay", e.i, e.t));
  return h;
}

/* --------------------------------------------------------------- outlet */
function sixRows(list) {
  /* list: [[slug, colour]] — one or two outlets on the same six bipolar rows */
  return '<div class="xsix">' + AXES6.map(function (ax) {
    var dots = list.map(function (o, i) {
      var p = SRC[o[0]], v = p ? p[ax[0]] : null;
      return v == null ? "" : '<i style="left:' + v + "%;--c:" + o[1] + '" class="d' + i + '" title="' + esc(srcName(o[0]) + " · " + v) + '"></i>';
    }).join("");
    var vals = list.map(function (o) { var p = SRC[o[0]]; return p && p[ax[0]] != null ? p[ax[0]] : "—"; }).join(" · ");
    return '<div class="xsix-r"><div class="xsix-n">' + esc(ax[1]) + '</div><span class="xsix-p">' + esc(ax[2]) + '</span>' +
      '<div class="xsix-t">' + dots + '</div><span class="xsix-p r">' + esc(ax[3]) + '</span><span class="num xsix-v">' + vals + "</span></div>";
  }).join("") + "</div>";
}
function pgSource(q) {
  var h = pgSourceV2(q), k = q.s, p = SRC[k];
  if (!p) return h;
  var blk = '<section class="sec" style="margin-top:18px"><h2>Altı eksenli profil</h2>' +
    '<p class="sub">Kayıt defterindeki yerleşim (0–100), her eksen kendi iki ucuyla. Bu bir yerleşimdir, hüküm değil; kaynağı ' +
    '<a class="lnk" href="#/yontem?s=2">Yöntem § 2</a>. ' + fixLink("kurum", k, p.n) + "</p>" +
    sixRows([[k, "var(--ink)"]]) + "</section>" + v5Profile(k);
  var i = h.indexOf('<section class="sec" style="margin-top:8px">');
  return i < 0 ? h.replace('<div class="grid g3">', blk + '<div class="grid g3">') : h.slice(0, i) + blk + h.slice(i);
}

/* -------------------------------------------------------------- compare */
function compareMark(a, b) {
  var col = function (s) { var sd = bloc(s); return sd === "left" ? "#E8556B" : sd === "right" ? "#4586EE" : "#8A93B0"; };
  return '<img class="xcmp-mark" alt="Karşılaştırma işareti: üst yarı ' + esc(srcName(a)) + ", alt yarı " + esc(srcName(b)) + '" src="' +
    svgURI((LOGO.cmp || "").replace("#E8556B", col(a)).replace("#4586EE", col(b))) + '">';
}
function renderCompare() {
  var box = $("#cmpbox"); if (!box) return;
  var A = $("#cmpA").value, B = $("#cmpB").value;
  if (A === B) { box.innerHTML = '<div class="note">İki farklı kurum seçin.</div>'; return; }
  var rows = [];
  D.E.forEach(function (e) {
    if (e.s.indexOf(A) < 0 || e.s.indexOf(B) < 0) return;
    var a = artOf(e, A), b = artOf(e, B);
    if (a && b) rows.push({ e: e, a: a, b: b, d: Math.abs(a.v - b.v) });
  });
  rows.sort(function (x, y) { return y.e.s.length - x.e.s.length || y.d - x.d; });
  var nA = srcName(A), nB = srcName(B);
  if (!rows.length) {
    box.innerHTML = '<div class="note"><b>' + esc(nA) + "</b> ve <b>" + esc(nB) + "</b> bu pencerede ortak bir olay vermedi.</div>"; return;
  }
  var mA = rows.reduce(function (t, r) { return t + r.a.v; }, 0) / rows.length, mB = rows.reduce(function (t, r) { return t + r.b.v; }, 0) / rows.length;
  var h = '<div class="xcmp-sum panel">' + compareMark(A, B) + '<div class="xcmp-k"><b class="num">' + rows.length + "</b><span>ortak olay</span></div>" +
    '<div class="xcmp-k"><b class="num">' + mA.toFixed(1) + " · " + mB.toFixed(1) + "</b><span>ortalama yoğunluk, " + esc(nA) + " · " + esc(nB) + "</span></div>" +
    '<div class="xcmp-six"><div class="xcmp-leg"><span><i style="background:var(--ink)"></i>' + esc(nA) + '</span><span><i class="o"></i>' + esc(nB) + "</span></div>" +
    sixRows([[A, "var(--ink)"], [B, "var(--muted)"]]) + "</div></div>";
  h += '<div class="xcmp-list">' + rows.slice(0, 14).map(function (r) {
    return '<section class="xcmp-i"><p class="eyebrow"><a class="lnk" href="#/olay?e=' + r.e.i + '">' + esc(r.e.t) + "</a> · " + r.e.s.length + " kurum</p>" +
      splitCard(r.e, [A, B], { small: 1 }) + "</section>";
  }).join("") + "</div>";
  if (rows.length > 14) h += '<p class="xsmall">' + (rows.length - 14) + " ortak olay daha var; en çok kurumun verdiği 14 olay gösteriliyor.</p>";
  box.innerHTML = h;
}

/* ------------------------------------------------------------ corrections */
function fixLink(kind, id, label) {
  return '<button class="xfixlink" data-fix="' + kind + "|" + esc(id) + "|" + esc(label || "") + '">Düzeltme iste</button>';
}
function openFix(kind, id, label) {
  var old = $("#xfix"); if (old) old.remove();
  var target = { olay: "Olay", kurum: "Kurum profili", ozet: "Özet", genel: "Genel" }[kind] || "Genel";
  var d = document.createElement("div");
  d.id = "xfix"; d.className = "xfix"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "xfix-h");
  d.innerHTML = '<form class="xfix-f" novalidate><h2 id="xfix-h">Bir olgu yanlış mı?</h2>' +
    '<p class="xsmall">Hedef: <b>' + esc(target) + "</b>" + (label ? " · " + esc(label) : "") + "</p>" +
    '<label>Ne yanlış? <span class="xsmall">(zorunlu)</span><textarea name="what" rows="4" maxlength="1200" required></textarea></label>' +
    '<label>Kanıt bağlantısı <span class="xsmall">(isteğe bağlı, https://)</span><input name="url" type="url" inputmode="url" placeholder="https://"></label>' +
    '<div class="xfix-2"><label>Ad <span class="xsmall">(isteğe bağlı)</span><input name="name" maxlength="80"></label>' +
    '<label>E-posta <span class="xsmall">(isteğe bağlı)</span><input name="mail" type="email" maxlength="120"></label></div>' +
    '<p class="xsmall">Düzeltme talebi göndermek bir değişikliği garanti etmez ve kaydı kendiliğinden değiştirmez. ' +
    "Bu sürümde talep yalnızca bu tarayıcıda saklanır; sunucuya gönderilmez.</p>" +
    '<p class="xfix-err" role="alert"></p><div class="xfix-b"><button type="button" class="chip" data-x>Vazgeç</button><button type="submit" class="xbtn">Gönder</button></div></form>';
  document.body.appendChild(d);
  var f = d.querySelector("form"), err = d.querySelector(".xfix-err");
  var close = function () { d.remove(); };
  d.querySelector("[data-x]").onclick = close;
  d.addEventListener("click", function (ev) { if (ev.target === d) close(); });
  d.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
  f.onsubmit = function (ev) {
    ev.preventDefault();
    var what = f.what.value.trim(), url = f.url.value.trim(), mail = f.mail.value.trim();
    if (what.length < 5) { err.textContent = "Neyin yanlış olduğunu birkaç kelimeyle yazın."; f.what.focus(); return; }
    if (url && !/^https:\/\/\S+\.\S+/.test(url)) { err.textContent = "Kanıt bağlantısı https:// ile başlamalı."; f.url.focus(); return; }
    if (mail && !/^\S+@\S+\.\S+$/.test(mail)) { err.textContent = "E-posta adresi geçerli görünmüyor."; f.mail.focus(); return; }
    var list = lsGet("cm2-fixes", []) || [];
    list.push({ kind: kind, id: id, label: label, what: what, url: url, name: f.name.value.trim(), mail: mail, at: new Date().toISOString(), status: "alındı" });
    lsSet("cm2-fixes", list);
    f.innerHTML = '<h2 id="xfix-h">Talebiniz alındı.</h2><p>Durum: <b>alındı</b>. Talep bir değişikliği garanti etmez.</p>' +
      '<div class="xfix-b"><button type="button" class="xbtn" data-x>Kapat</button></div>';
    f.querySelector("[data-x]").onclick = close;
  };
  setTimeout(function () { f.what.focus(); }, 20);
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-fix]");
  if (!b) return;
  var p = b.getAttribute("data-fix").split("|");
  openFix(p[0], p[1], p.slice(2).join("|"));
});

/* -------------------------------------------------------------- method */
function exampleEvent() {
  var c = D.E.filter(function (e) { var v = covOf(e); return v[0] >= 3 && v[2] >= 3 && e.sum && defaultPair(e); })
    .sort(function (a, b) { return b.p - a.p; });
  return c[0] || leadEvent();
}
function pgMethod(q) {
  var h = methodPaper(), e = exampleEvent(), c = covOf(e), pair = defaultPair(e);
  var arts = e.a.map(function (i) { return ART[i]; });
  var lo = arts.slice().sort(function (x, y) { return x.v - y.v; })[0], hi = arts.filter(function (x) { return x.s !== lo.s; }).sort(function (x, y) { return y.v - x.v; })[0] || lo;
  var cmp = compareHeads(artOf(e, pair[0]), artOf(e, pair[1]));
  var step = function (n, t, body) { return '<li class="xwalk-s"><span class="num xwalk-n">' + n + "</span><div><h3>" + t + "</h3>" + body + "</div></li>"; };
  var ex = '<section class="sec xwalk"><h2>Bir olayın yolculuğu</h2>' +
    '<p class="sub">Yöntem, kurallar listesinden önce bir örnekle: “' + esc(e.t) + "” olayı, toplamadan split karta kadar.</p><ol class=\"xwalk-l\">" +
    step("01", "Toplama", "<p>Kurumların site haritalarından " + e.n + " başlık, " + e.s.length + " kurum. İlk haber " + fmtDT(e.f) + ", son haber " + fmtDT(e.l) + ".</p>") +
    step("02", "Kümeleme", "<p>Başlıklar ortak kelimeleriyle aynı olaya bağlandı: <span class=\"mono\">" + esc((e.c || []).join(" · ")) + "</span>. 48 saat içinde, en az beş kurum.</p>") +
    step("03", "Puanlama", "<p>En yalın başlık " + esc(srcName(lo.s)) + " (<span class=\"num\">" + lo.v + "</span>), en yüklü başlık " + esc(srcName(hi.s)) +
      " (<span class=\"num\">" + hi.v + "</span>): aralık <span class=\"num\">" + e.p + "</span> puan.</p>") +
    step("04", "Kapsama", "<p>Sol <span class=\"num\">" + c[0] + "</span>, merkez <span class=\"num\">" + c[1] + "</span>, sağ <span class=\"num\">" + c[2] + "</span> kurum. " +
      (e.bs ? "Kör nokta kuralını karşılıyor." : "Kör nokta kuralını karşılamıyor.") + "</p>") +
    step("05", "Split kart", "<p>Varsayılan çift en soldaki (" + esc(srcName(pair[0])) + ") ve en sağdaki (" + esc(srcName(pair[1])) + ") kurum. Ortak kelimeler: <b>" +
      esc(cmp.shared.join(" ") || "yok") + "</b>. İşaretli kelimeler ekler alınarak karşılaştırılır (İspanya’da = İspanya’nın).</p>" + splitCard(e) +
      '<p class="xsmall" style="margin-top:8px"><a class="lnk" href="#/olay?e=' + e.i + '">Olayın sayfası →</a></p>') + "</ol>" +
    '<div class="xpromise"><p class="xwm">Manşet bütün kalır.</p><p>Hiçbir başlık kısaltılmaz, hiçbir kelime silinmez.</p></div></section>';
  var fix = '<section class="sec" id="sfix"><h2>Düzeltme iste</h2><p class="sub">Hatalı bir küme, yanlış bir yerleşim, yanlış bir işaret ya da yanlış bir özet gördüğünüzde bildirin: ' +
    "ne yanlış, neye dayanarak. Düzeltme talebi göndermek bir değişikliği garanti etmez ve kaydı kendiliğinden değiştirmez.</p>" + fixLink("genel", "yontem", "Yöntem") + "</section>";
  var i = h.indexOf('<article class="xpaper">');
  h = i < 0 ? h : h.slice(0, i) + ex + h.slice(i);
  var j = h.lastIndexOf("</div>");
  return h.slice(0, j) + fix + h.slice(j);
}

/* ============================================================ 5.0 views
   Analyses computed by the pipeline (D.V5, D.meta.validation; ADR-0002). The page only
   displays them; every number below is read from the data. */
var V5 = D.V5 || {};
var ACT5 = (V2.activeSet || []).slice();
var dec = function (x, n) { return x == null ? "—" : (+x).toFixed(n == null ? 1 : n).replace(".", ","); };
var pc5 = function (x) { return x == null ? "—" : "%" + dec(100 * x, 1); };
function dur5(m) { return m == null ? "—" : m < 60 ? m + " dk" : dec(m / 60, m < 600 ? 1 : 0) + " sa"; }
function median5(xs) { var s = xs.filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }

/* Turkish suffixes. Numbers: possessive by how the number is read ("%37'si", "99,2" -> "…iki" -> "'si").
   Names: genitive by vowel harmony ("Sabah'ın", "Diken'in", "NTV'nin": an all-caps name is read letter by letter). */
function sufNum(str, acc) {
  var t = String(str).replace(/[^0-9,]/g, ""), dec = t.split(",")[1], n = dec ? parseInt(dec, 10) : parseInt(t.replace(/,/g, ""), 10);
  var poss = CM3.trSuffix(n || 0);
  return "'" + poss + (acc ? "n" + poss.slice(-1) : "");
}
var LETTER5 = { b: "be", c: "ce", ç: "çe", d: "de", f: "fe", g: "ge", ğ: "yumuşak ge", h: "he", j: "je", k: "ka", l: "le", m: "me", n: "ne", p: "pe", r: "re", s: "se", ş: "şe", t: "te", v: "ve", y: "ye", z: "ze" };
function sufGen(name) {
  var w = String(name).trim().split(/\s+/).pop(), low = w.toLocaleLowerCase("tr");
  if (w.length <= 4 && w === w.toLocaleUpperCase("tr") && LETTER5[low.slice(-1)]) low = LETTER5[low.slice(-1)];
  var v = (low.match(/[aıoueiöü]/g) || ["e"]).pop(), end = /[aıoueiöü]$/.test(low) ? "n" : "";
  return "'" + end + ({ a: "ın", ı: "ın", o: "un", u: "un", e: "in", i: "in", ö: "ün", ü: "ün" })[v];
}
/* One row per active outlet: every 5.0 measure side by side. */
function rank5Rows() {
  var LL = (V5.leadLag || {}).outlets || {}, GP = (V5.gap || {}).outlets || {}, SM = V5.similarity || {};
  return ACT5.map(function (s) {
    var o = (D.OM || {})[s] || {}, l = LL[s] || {}, g = GP[s] || {};
    var own = D.E.filter(function (e) { return e.bs && e.bs === sideOf(s); });
    return { s: s, load: o.load, pol: o.pol, share: o.share, first: l.firstShare, lag: l.medLag,
      gap: g.mean, hot: g.hotter, bsOwn: own.length ? own.filter(function (e) { return e.s.indexOf(s) >= 0; }).length / own.length : null,
      nb: (SM.neighbours || {})[s] || [] };
  });
}
var RANK5 = [
  ["load", "Yüklü dil", "siyasi başlıklarda ortalama yoğunluk (0–100)", function (v) { return dec(v); }],
  ["share", "Olay payı", "dönemin olaylarından verdiklerinin payı", function (v) { return v == null ? "—" : "%" + v; }],
  ["first", "İlk veren", "verdiği olaylarda ilk yayınlayan olduğu pay", pc5],
  ["lag", "Gecikme", "ilk değilse, ilk habere göre medyan gecikme", dur5],
  ["gap", "Başlık–spot", "başlık puanı eksi kendi spotunun puanı, ortalama", function (v) { return dec(v); }],
  ["hot", "Sert başlık", "başlığı spotundan en az 15 puan yüklü haberlerin payı", pc5],
  ["bsOwn", "Kör noktayı kırma", "kendi bloğunun kör noktası sayılan olaylardan verdiği pay", pc5]
];
function pgRanking5(q) {
  var key = (q && q.o) || "load", col = RANK5.filter(function (c) { return c[0] === key; })[0] || RANK5[0];
  var rows = rank5Rows().sort(function (a, b) { return (b[col[0]] == null ? -1e9 : b[col[0]]) - (a[col[0]] == null ? -1e9 : a[col[0]]); });
  var h = '<div class="phead"><div class="eyebrow">Kurum sıralaması</div><h1>Bütün ölçüler, yan yana</h1>' +
    '<p class="lede">Dönemin en az ' + WIN.half + " gününde verisi olan " + rows.length + " kurum, " + WIN.range +
    ". Her sütun kurumun <b>kendi</b> haberlerinin payı ya da ortalamasıdır; toplanan haber sayısı kurumdan kuruma değiştiği için ham sayılar karşılaştırılmaz. " +
    "Sıralama bir kalite sıralaması değildir.</p></div>";
  h += '<div class="xtabs">' + RANK5.map(function (c) {
    return '<a class="xtab' + (c[0] === col[0] ? " on" : "") + '" href="#/kurumlar?t=siralama&o=' + c[0] + '" title="' + esc(c[2]) + '">' + esc(c[1]) + "</a>"; }).join("") + "</div>";
  h += '<p class="xsmall" style="margin:8px 0 12px">Sıralayan ölçü: <b>' + esc(col[1]) + "</b> — " + esc(col[2]) + ".</p>";
  h += '<div class="scroller panel"><table><thead><tr><th>Kurum</th>' + RANK5.map(function (c) {
    return '<th class="r"' + (c[0] === col[0] ? ' style="color:var(--ink)"' : "") + ">" + esc(c[1]) + "</th>"; }).join("") +
    "<th>En benzer kurumlar</th></tr></thead><tbody>" + rows.map(function (r) {
      return '<tr><td><a class="xpm-s" style="--c:' + lean(SRC[r.s] ? SRC[r.s].lean : null) + '" href="#/kurum?s=' + r.s + '">' + esc(srcName(r.s)) + "</a></td>" +
        RANK5.map(function (c) { return '<td class="r num">' + c[3](r[c[0]]) + "</td>"; }).join("") +
        '<td class="xsmall">' + r.nb.map(function (s) { return esc(srcName(s)); }).join(", ") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  return h + '<p class="xsmall" style="margin-top:8px">Tanımlar ve hesaplama: <a class="lnk" href="#/yontem?s=v5">Yöntem › Veri hattı ve analizler</a>.</p>';
}

/* Outlet profile: the same measures against the median active outlet. */
function v5Profile(k) {
  var r = rank5Rows().filter(function (x) { return x.s === k; })[0];
  if (!r) return "";
  var all = rank5Rows();
  return '<section class="sec" style="margin-top:18px"><h2>Kurumun ölçüleri</h2><p class="sub">Bu kurumun değeri ve etkin kurumların medyanı. ' +
    '<a class="lnk" href="#/kurumlar?t=siralama">Bütün kurumlarla sıralama →</a></p><div class="scroller panel"><table><tbody>' +
    RANK5.map(function (c) {
      return "<tr><td>" + esc(c[1]) + '<div class="xsmall">' + esc(c[2]) + '</div></td><td class="r num"><b>' + c[3](r[c[0]]) +
        '</b></td><td class="r num xsmall">medyan ' + c[3](median5(all.map(function (x) { return x[c[0]]; }))) + "</td></tr>";
    }).join("") + (r.nb.length ? '<tr><td>En benzer kurumlar<div class="xsmall">aynı olayları seçme + başlıkta benzer sözcükler</div></td><td colspan="2" class="r">' +
      r.nb.map(function (s) { return '<a class="lnk" href="#/kurum?s=' + s + '">' + esc(srcName(s)) + "</a>"; }).join(", ") + "</td></tr>" : "") +
    "</tbody></table></div></section>";
}

/* Bulgular › Hız, spot, benzerlik */
function pgPace5() {
  var LL = V5.leadLag || {}, GP = V5.gap || {}, SM = V5.similarity || {};
  var B = LL.blocs || {}, b = function (k) { return B[k] || {}; };
  var h = '<div class="wrap page"><div class="phead"><div class="eyebrow">Bulgular · hız, spot, benzerlik</div>' +
    "<h1>Kim önce yazıyor, başlık spotu ne kadar aşıyor, kim kime benziyor</h1>" +
    '<p class="lede">' + WIN.range + " arasındaki " + D.E.length.toLocaleString("tr") + " olay ve " +
    ((GP.n || 0)).toLocaleString("tr") + " spotlu haber üzerinde üç ölçüm. Ölçümler kurumun kendi haberlerinin payıdır; yorum değil, sayımdır.</p></div>";
  h += '<section class="find"><div class="find-h"><div class="find-n">A</div><div><h3>Gündemi kim açıyor, kim izliyor</h3>' +
    '<p class="claim">Bir olayın ilk haberini veren kurum ve diğerlerinin ilk habere göre gecikmesi. Sol kurumların açtığı olayların <b>' +
    pc5(b("left>right").coveredShare) + "</b>" + sufNum(pc5(b("left>right").coveredShare), 1) + " sağdan en az bir kurum verdi (medyan " + dur5(b("left>right").medLag) +
    " sonra); sağın açtığı olayların <b>" + pc5(b("right>left").coveredShare) + "</b>" + sufNum(pc5(b("right>left").coveredShare), 1) + " soldan en az bir kurum verdi (medyan " +
    dur5(b("right>left").medLag) + " sonra).</p></div></div><div class=\"body\">" +
    fig("v5lead", "verdiği olaylarda ilk yayınlayan olduğu pay", { take: "Bir kurumun çok sayıda olayı ilk vermesi daha hızlı olduğunu da, daha çok haber yayımladığını da gösterebilir; aynı olaydaki sıralamaya bakılır, toplam habere değil." }) +
    fig("v5lag", "ilk habere göre medyan gecikme · eksen dakika", { take: "Gecikme yalnızca kurumun ilk olmadığı olaylarda ölçülür; " + (LL.horizonHours || 48) + " saatten sonraki haberler zaten olaya bağlanmaz." }) +
    "</div></section>";
  h += '<section class="find"><div class="find-h"><div class="find-n">B</div><div><h3>Başlık, kendi spotundan daha mı yüklü</h3>' +
    '<p class="claim">Aynı kural kümesi başlığa ve haberin kendi spotuna ayrı ayrı uygulandı. Fark pozitifse başlık, haberin kendi ilk cümlesinden daha yüklü bir dil kuruyor. ' +
    "Spotlar başlıktan uzun olduğu için çoğu zaman daha çok kural tetikler; ortalama fark bu yüzden " +
    ACT5.filter(function (k) { return (GP.outlets || {})[k] && GP.outlets[k].mean < 0; }).length + " kurumda negatif. Asıl ölçü, başlığın spotundan en az " +
    (GP.threshold || 15) + " puan yüklü olduğu haberlerin payı:</p></div></div><div class=\"body\">" +
    fig("v5gap", "başlığı spotundan en az " + (GP.threshold || 15) + " puan yüklü haberlerin payı", { take: "Spotu olmayan ya da başlıkla aynı olan haberler ölçüme girmez. Puanlar aynı kuralla üretildiği için fark kuraldan değil metinden gelir." }) +
    '<h4 style="margin:18px 0 6px">En büyük farklar</h4><div class="xcmp-list">' + (GP.top || []).slice(0, 12).map(function (x) {
      var a = ART[x.i]; if (!a) return "";
      return '<section class="xcmp-i"><p class="eyebrow">' + esc(srcName(a.s)) + " · " + fmtDT(a.d) + " · başlık " + a.v + ", spot " + a.lv + "</p>" +
        '<p><a class="hlnk" href="' + esc(a.u) + '" target="_blank" rel="noopener">' + esc(a.t) + '</a></p><p class="xsmall">' + esc(x.l) + "</p></section>";
    }).join("") + "</div></div></section>";
  h += '<section class="find"><div class="find-h"><div class="find-n">C</div><div><h3>Benzerlik haritası</h3>' +
    '<p class="claim">Kurumlar, <b>aynı olayları seçme</b> (phi korelasyonu; çok olay veren kurumu herkese yakın göstermez) ve <b>aynı olayda benzer sözcüklerle başlık atma</b> (karakter n-gram kosinüsü) ' +
    "ortalamasına göre yerleştirildi. Yakın duran kurumlar benzer haber davranışı gösteriyor; bu bir siyasi yerleşim değildir. Benzerlik ile kayıt defterindeki yerleşim farkı arasındaki ilişki " +
    "<b>r = " + dec(SM.mantel_r, 2) + "</b> (Mantel, p = " + dec(SM.mantel_p, 3) + "): " +
    (SM.mantel_p < .05 ? "yerleşimde yakın kurumlar haber davranışında da biraz daha yakın; ilişki anlamlı ama zayıf." : "yerleşimde yakın olmak, haber davranışında yakın olmakla anlamlı biçimde ilişkili değil.") +
    "</p></div></div><div class=\"body\">" +
    fig("v5sim", "benzerlik haritası · nokta rengi kayıt defterindeki yerleşim", {
      legend: legendHTML([{ c: "var(--left)", t: "sola yerleşik" }, { c: "var(--mid)", t: "merkez" }, { c: "var(--right)", t: "sağa yerleşik" }]),
      take: "Çizgiler her kurumu en benzer üç kurumuna bağlar. Eksenlerin kendi anlamı yoktur; yalnızca uzaklıklar okunur." }) + "</div></section>";
  return h + "</div>";
}
function simMap5(SM) {
  var keys = SM.outlets || [], xy = SM.xy || {};
  if (!keys.length) return null;
  var xs = keys.map(function (k) { return xy[k][0]; }), ys = keys.map(function (k) { return xy[k][1]; });
  var W = 720, H = 460, P = 60, x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var X = function (v) { return P + (W - 2 * P) * (v - x0) / ((x1 - x0) || 1); }, Y = function (v) { return P + (H - 2 * P) * (v - y0) / ((y1 - y0) || 1); };
  var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Kurum benzerlik haritası">';
  keys.forEach(function (a) { (SM.neighbours[a] || []).forEach(function (b) { if (xy[b]) s += '<line x1="' + X(xy[a][0]) + '" y1="' + Y(xy[a][1]) + '" x2="' + X(xy[b][0]) + '" y2="' + Y(xy[b][1]) + '" stroke="var(--line2)" stroke-width="1"/>'; }); });
  keys.forEach(function (k) {
    s += '<a href="#/kurum?s=' + k + '"><circle cx="' + X(xy[k][0]) + '" cy="' + Y(xy[k][1]) + '" r="7" fill="' + lean(SRC[k] ? SRC[k].lean : null) + '"><title>' + esc(srcName(k)) + "</title></circle>" +
      '<text x="' + (X(xy[k][0]) + 10) + '" y="' + (Y(xy[k][1]) + 4) + '" font-size="12" fill="var(--ink)">' + esc(srcName(k)) + "</text></a>";
  });
  var box = document.createElement("div"); box.innerHTML = s + "</svg>"; return box.firstChild;
}
function v5Draw() {
  var put = function (id, node) { var t = document.getElementById(id); if (t && node) t.appendChild(node); };
  var LL = (V5.leadLag || {}).outlets || {}, GP = (V5.gap || {}).outlets || {};
  var row = function (s, v, disp) { return { label: srcName(s), value: v, display: disp, color: lean(SRC[s] ? SRC[s].lean : null) }; };
  var by = function (o, f) { return ACT5.filter(function (s) { return o[s] && f(o[s]) != null; }); };
  put("v5lead", barChart(by(LL, function (o) { return o.firstShare; }).map(function (s) { return row(s, LL[s].firstShare * 100, pc5(LL[s].firstShare)); })
    .sort(function (a, b) { return b.value - a.value; }), { padL: 132 }));
  put("v5lag", barChart(by(LL, function (o) { return o.medLag; }).map(function (s) { return row(s, LL[s].medLag, dur5(LL[s].medLag)); })
    .sort(function (a, b) { return a.value - b.value; }), { padL: 132 }));
  put("v5gap", barChart(by(GP, function (o) { return o.hotter; }).map(function (s) { return row(s, GP[s].hotter * 100, pc5(GP[s].hotter)); })
    .sort(function (a, b) { return b.value - a.value; }), { padL: 132 }));
  put("v5sim", simMap5(V5.similarity || {}));
}

/* Olaylar › Kör noktalar: which outlets break their own bloc's blind spots. */
function v5BlindTable() {
  var rows = rank5Rows().filter(function (r) { return r.bsOwn != null; }).sort(function (a, b) { return b.bsOwn - a.bsOwn; });
  if (!rows.length) return "";
  return '<section class="sec"><h2>Kendi bloğunun kör noktasını kim kırıyor</h2><p class="sub">Bir olay solun kör noktası sayıldığında sol kurumların çoğu onu vermemiştir. ' +
    "Aşağıdaki pay, kurumun kendi bloğunun kör noktası sayılan olaylardan kaçını yine de verdiğidir.</p>" +
    '<div class="scroller panel"><table><thead><tr><th>Kurum</th><th class="r">Blok</th><th class="r">Pay</th></tr></thead><tbody>' +
    rows.map(function (r) { return '<tr><td><a class="lnk" href="#/kurum?s=' + r.s + '">' + esc(srcName(r.s)) + '</a></td><td class="r">' + SIDE[sideOf(r.s)] + '</td><td class="r num">' + pc5(r.bsOwn) + "</td></tr>"; }).join("") +
    "</tbody></table></div></section>";
}

/* Anlatı › otomatik: per event, how differently the two blocs worded the same story. */
function v5NarrAuto() {
  var rows = [];
  D.E.forEach(function (e) {
    var g = { left: [], right: [] };
    e.a.forEach(function (i) { var a = ART[i], sd = a && sideOf(a.s); if (g[sd] && !(e.rep && e.rep[i])) g[sd].push(a); });
    if (g.left.length < 2 || g.right.length < 2) return;
    var m = function (xs) { return xs.reduce(function (t, a) { return t + a.v; }, 0) / xs.length; };
    var keys = function (xs) { var c = {}; xs.forEach(function (a) { a.k.forEach(function (k) { c[k] = (c[k] || 0) + 1 / xs.length; }); }); return c; };
    rows.push({ e: e, l: m(g.left), r: m(g.right), kl: keys(g.left), kr: keys(g.right) });
  });
  rows.sort(function (a, b) { return Math.abs(b.l - b.r) - Math.abs(a.l - a.r); });
  var top = function (c) { return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 2).map(function (k) { return BIA[k] ? BIA[k].tr : k; }).join(", ") || "—"; };
  var louder = { l: rows.filter(function (r) { return r.l - r.r >= 5; }).length, r: rows.filter(function (r) { return r.r - r.l >= 5; }).length };
  return '<section class="sec"><div class="eyebrow">Otomatik · ' + WIN.range + '</div><h2>Bütün dönem: iki blok aynı olayı ne kadar farklı dille verdi</h2>' +
    '<p class="sub">Elle kodlanan anlatı haritasının yanında, her iki bloktan en az ikişer kurumun verdiği <b>' + rows.length.toLocaleString("tr") +
    "</b> olayda blokların ortalama yoğunluğu ve en sık yapıları karşılaştırıldı. Sol bloğun en az 5 puan daha yüklü verdiği " + louder.l +
    ", sağ bloğun en az 5 puan daha yüklü verdiği " + louder.r + " olay var. Bu karşılaştırma kodlanmış anlatı değil, kural tabanlı puanların farkıdır.</p>" +
    '<div class="scroller panel"><table><thead><tr><th>Olay</th><th class="r">Sol</th><th class="r">Sağ</th><th>Sol: en sık yapı</th><th>Sağ: en sık yapı</th></tr></thead><tbody>' +
    rows.slice(0, 25).map(function (r) {
      return '<tr><td><a class="lnk" href="#/olay?e=' + r.e.i + '">' + esc(clip(r.e.t, 90)) + '</a><div class="xsmall">' + fmtD(r.e.f) + " · " + r.e.s.length + ' kurum</div></td><td class="r num">' +
        dec(r.l) + '</td><td class="r num">' + dec(r.r) + '</td><td class="xsmall">' + esc(top(r.kl)) + '</td><td class="xsmall">' + esc(top(r.kr)) + "</td></tr>";
    }).join("") + "</tbody></table></div></section>";
}

/* Yöntem › 5.0: the pipeline, its validation and the new measures. */
/* Limitations that depend on the data: written from it. */
function limits5() {
  var miss = (V2.missing || []).concat(LIVE.filter(function (s) { return V2.activeSet && V2.activeSet.indexOf(s) < 0; }));
  var mb = { left: 0, mid: 0, right: 0 }, none = 0; miss.forEach(function (s) { var b = sideOf(s); if (mb[b] != null && SRC[s] && SRC[s].lean != null) mb[b]++; else none++; });
  var big = Object.keys(mb).sort(function (a, b) { return mb[b] - mb[a]; });
  var T = ADV && ADV.topics, nT = T ? T.rho.length : 0, sigT = T ? T.rho.filter(function (r) { return r[1] < .05; }).length : 0;
  var nU = ADV && ADV.agenda ? ADV.agenda.order.length : ACT5.length;
  return "<li><b>Kapsama dengesizliği:</b> Verisi olmayan ya da dönemin yarısından azını kapsayan " + miss.length + " kurumun " + mb.left + "'" + CM3.trSuffix(mb.left) + " sol, " +
      mb.mid + "'" + CM3.trSuffix(mb.mid) + " merkez, " + mb.right + "'" + CM3.trSuffix(mb.right) + " sağ yerleşimli" + (none ? ", " + none + "'" + CM3.trSuffix(none) + " yerleşimsiz" : "") + (mb[big[0]] > mb[big[2]] ? " (ağırlık " + { left: "solda", mid: "merkezde", right: "sağda" }[big[0]] + ")" : "") +
      "; kör nokta ve gündem bulguları bundan etkilenebilir.</li>" +
    "<li><b>Küçük örneklem:</b> Kurum düzeyindeki testler " + nU + " birime dayanır; anlamlı olmayan sonuçlar “ilişki yok” değil “saptanamadı” biçiminde okunmalıdır.</li>" +
    (nT ? "<li><b>Çoklu karşılaştırma:</b> Tema–yerleşim ilişkileri " + nT + " ayrı test içerir ve düzeltme uygulanmamıştır; " +
      (sigT ? sigT + " tanesi %5 eşiğini geçiyor; " + (sigT > 1 ? "bunlar" : "bu sonuç") + " bu nedenle temkinle okunmalıdır." : "hiçbiri zaten %5 eşiğini geçmemiştir.") + "</li>" : "");
}
function v5Method() {
  var V = D.meta.validation || {}, C = V.classify || {}, K = V.cluster || {}, T = V.eventTopics || {}, P = D.meta.params || {}, c = D.meta.counts;
  return '<section class="sec" id="sv5"><h2>Veri hattı ve analizler</h2>' +
    "<p>Site, toplanan <b>bütün</b> haberleri kullanır: " + c.articles.toLocaleString("tr") + " haber (" + c.ledes.toLocaleString("tr") + " tanesinin spotuyla), " +
    D.meta.sources.length + " kurum, " + WIN.range + ". Örneklem alınmadı. Bütün analizler açık kaynaklı, yeniden üretilebilir bir veri hattıyla hesaplanır " +
    "(aylinunel/caprazmanset-oct26 · <span class=\"mono\">pipeline/</span>, ADR-0002): toplama çıktısı gün gün saklanır, yeni veri geldiğinde her aşama yalnızca değişen günleri yeniden hesaplar.</p>" +
    "<p><b>Toplama hacmi.</b> Kurumdan kuruma ve günden güne toplanan haber sayısı farklıdır. Bu yüzden kurumlar arasındaki bütün karşılaştırmalar kurumun kendi haberlerinin payı ya da ortalaması üzerinden yapılır; ham sayılar karşılaştırılmaz.</p>" +
    "<p><b>Puanlama.</b> Başlıklar ve spotlar, sitedeki çözümleyicinin <b>aynı</b> kural dosyasıyla puanlandı (shared/analysis/rules.cjs). Dosya, sağlanan referans derlemdeki " +
    (D.meta.rules.refHeadlines || 0).toLocaleString("tr") + " kayıtlı puanın tamamını birebir üretir. Kanıt gücü (güçlü / orta / zayıf), belirsiz sözcükleri (ör. “tarihi”, “rekor”) ayıran çözümleyici kuralıyla hesaplanır.</p>" +
    "<p><b>Bölüm ve siyasi etiketler.</b> Sağlanan referans derlemin etiketli " + (C.trainedOn || 0).toLocaleString("tr") + " başlığı üzerinde eğitilen TF-IDF + lojistik regresyon (kurum, adres yolu, başlık sözcükleri ve karakter n-gramları). " +
    P.cv_folds + " katlı çapraz doğrulama: bölüm doğruluğu <b>" + pc5((C.section || {}).accuracy) + "</b> (makro F1 " + dec((C.section || {}).macroF1, 2) + "; çok az örnekli bölümler düşürüyor), siyasi/siyasi değil <b>" +
    pc5((C.political || {}).accuracy) + "</b>. Referans etiketler de bir sınıflandırıcının çıktısı olduğu için bağımsız insan etiketi değildir; etiketli başlıklar kendi etiketlerini korur.</p>" +
    "<p><b>Olaylar.</b> Başlıklar karakter ve kelime n-gramlarının kosinüs benzerliğiyle kümelenir (eşik " + dec(P.cluster_threshold, 2) + ", " + P.cluster_window_hours + " saat, %" + Math.round(100 * P.cluster_merge_link_share) + " bağ koşulu, en çok " + P.cluster_max_size +
    " başlık, en az " + P.event_min_outlets + " kurum). Elle denetlenen " + c.eventsHand + " olay girdi olarak olduğu gibi korundu; " + c.eventsAuto.toLocaleString("tr") + " olay otomatik. Kural, elle denetlenmiş referans olaylarla çift düzeyinde doğrulandı: kesinlik " +
    dec(K.pair_precision, 3) + ", duyarlılık " + dec(K.pair_recall, 3) + ", F1 <b>" + dec(K.pair_f1, 3) + "</b>. Veri güncellendiğinde, önceki derlemedeki bir olayın en az yarısını sürdüren olay onun kimliğini taşır; bağlantılar bu yüzden kırılmaz. " +
    "Olay konuları, referans olayların konularıyla eğitilen sınıflandırıcıyla atandı (mikro F1 " + dec(T.microF1, 3) + ").</p>" +
    "<p><b>Hız.</b> Her olayda kurumun ilk başlığının saati; ilk yayınlayan kurum ve diğerlerinin ilk habere göre gecikmesi. Blok geçişi: bir bloğun açtığı olayı öbür bloktan en az bir kurumun vermesi.</p>" +
    "<p><b>Başlık–spot farkı.</b> Başlık puanı eksi aynı haberin spot puanı; ≥ 15 puan “başlık spotundan sert” sayıldı. Spotu olmayan ya da başlıkla aynı olan haberler dışarıda. Örnek listesi yalnızca bir olaya giren haberlerden seçilir.</p>" +
    "<p><b>Benzerlik haritası.</b> Etkin ve en az " + P.similarity_min_events + " olaya giren kurumlar. İki bileşen: olay kapsamının phi korelasyonu (kurum büyüklüğüne duyarsız; örtüşme katsayısı en çok olay veren kurumu herkese en yakın gösterir) ve en az 10 ortak olayda başlıkların ortalama karakter n-gram kosinüsü. İkisi 0–1 aralığına ölçeklenip ortalandı; konum klasik çok boyutlu ölçeklemeyle, ilişki testi 9.999 permütasyonlu Mantel testiyle.</p>" +
    "<p><b>Konu modeli.</b> 40 konulu Dirichlet çok terimli karışım (GSDMM) siyasi başlıklara uygulandı; her konu, sözcükleri en çok örtüşen referans temanın adını alır. Temaların kelimeleri İleri analiz sayfasında, kontrol edilebilir.</p></section>";
}

/* ---------------------------------------------------------------- footer */
function footer2() {
  var m = D.meta.counts;
  return '<footer class="foot xfoot"><div class="wrap"><div class="xfoot-g">' +
    '<div><img class="xfoot-logo" src="' + (LOGO.hd || "") + '" alt="Çapraz Manşet"><p class="xfoot-d">Aynı olay, farklı manşet.</p>' +
    '<p class="xwm">Manşet bütün kalır.</p><p class="xsmall">Hiçbir başlık kısaltılmaz, hiçbir kelime silinmez.</p>' +
    '<a class="xv1" href="' + V1URL + '" target="_blank" rel="noopener">Çapraz Manşet v1 · değişmeden kalır →</a></div>' +
    '<div><h4>Site</h4><a href="#/olaylar">Olaylar</a><a href="#/olaylar?t=kor">Kör noktalar</a><a href="#/anlati">Anlatı Haritası</a><a href="#/kurumlar">Kurumlar</a>' +
    '<a href="#/kurumlar?t=karsilastir">Karşılaştır</a><a href="#/bulgular">Bulgular</a><a href="#/yanlilik">Çerçeveleme</a><a href="#/yontem">Yöntem</a></div>' +
    '<div><h4>Veri</h4><p><span class="num">' + m.articles.toLocaleString("tr") + "</span> başlık · <span class=\"num\">" + D.E.length.toLocaleString("tr") +
    '</span> olay · <span class="num">' + D.meta.sources.length + "</span> kurum<br>" + WIN.range + "</p>" +
    "<p>Yerleşim ve sahiplik: sağlanan kayıt defteri, doğrulanmamış. Site doğruluk denetimi yapmaz; çerçevelemeyi ölçer.</p>" +
    fixLink("genel", "site", "") + "</div></div>" +
    '<div class="xfoot-b"><span class="mono">' + esc(D.meta.version || "") + ' · statik anlık görüntü · ' + esc(D.meta.built || "") + '</span><a class="footlink-adm" href="#/yonetim">Yönetim →</a></div></div></footer>';
}

function v2cAfter(path, tab, params) {
  if (path === "/olay" && EV[params.e]) {
    var e = EV[params.e];
    var draw = function () {
      var a = $("#spA"), b = $("#spB"), box = $("#spcard"); if (!a || !b || !box) return;
      SPLITPAIR[e.i] = [a.value, b.value];
      box.innerHTML = a.value === b.value ? '<p class="note">İki farklı kurum seçin.</p>' : splitCard(e, [a.value, b.value]);
    };
    var a = $("#spA"), b = $("#spB");
    if (a) a.onchange = draw; if (b) b.onchange = draw;
    var mf = $("#markflag");
    if (mf) mf.onclick = function () {
      var l = lsGet("cm2-markflags", []) || [];
      if (!l.some(function (f) { return f.e === e.i; })) { l.push({ e: e.i, pair: SPLITPAIR[e.i] || defaultPair(e), at: new Date().toISOString() }); lsSet("cm2-markflags", l); }
      mf.textContent = "Bildirildi — teşekkürler"; mf.classList.add("on");
    };
  }
}

function pgAdmin(q) {
  if (v3on("reviewDesk") && (q || {}).t === "dogrulama") return v3deskPage();
  var h = pgAdminV2(q);
  if (tabOf(ADMIN, q || {}) !== "ozet") return h;
  var fx = (lsGet("cm2-fixes", []) || []).slice().reverse();
  var blk = '<section class="sec"><h2>Düzeltme talepleri</h2><p class="sub">“Düzeltme iste” formundan gelenler. Bu sürümde yalnızca bu tarayıcıda saklanır; ' +
    "kaydı kendiliğinden değiştirmez.</p>" + (fx.length ? '<div class="scroller panel"><table><thead><tr><th>Tarih</th><th>Hedef</th><th>Ne yanlış</th><th>Kanıt</th><th>Durum</th></tr></thead><tbody>' +
    fx.map(function (f) {
      return '<tr><td class="mono">' + esc(f.at.slice(0, 16).replace("T", " ")) + "</td><td>" + esc(f.kind) + (f.label ? " · " + esc(f.label) : "") + "</td><td>" + esc(f.what) +
        "</td><td>" + (f.url ? '<a class="lnk" href="' + esc(f.url) + '" target="_blank" rel="noopener">bağlantı</a>' : "—") + "</td><td>" + esc(f.status) + "</td></tr>";
    }).join("") + "</tbody></table></div>" : '<p class="xempty">Talep yok.</p>') + "</section>";
  var j = h.lastIndexOf("</div>");
  return h.slice(0, j) + blk + h.slice(j);
}



/* First article of each outlet in an event, in e.a order (the order the old filter()[0] used). */
var FIRSTBY = {};
function firstBy(e) {
  var m = FIRSTBY[e.i]; if (m) return m;
  m = FIRSTBY[e.i] = {};
  e.a.forEach(function (i) { var a = ART[i]; if (!m[a.s]) m[a.s] = a; });
  return m;
}
/* =====================================================================
   Çapraz Manşet 3.0 — interface layer. Runs inside the 2.0 app scope and
   only displays what cm3-core.js computes. Every element it adds carries
   data-cm3, so tests can scan exactly the 3.0 text.

   Feature flags: CM3.FLAGS. A flag set to true shows the feature to every
   reader; anything else shows it only in the preview (?shadow=1).
   ===================================================================== */
var V3 = { shadow: false };
function t3(k, o) { return o ? CM3.fill(CM3.TR[k], o) : CM3.TR[k]; }
function v3readShadow() {
  var s = location.search + "&" + location.hash.replace(/^#[^?]*\?/, "");
  var on = /(^|[?&])shadow=1(&|$)/.test(s), off = /(^|[?&])shadow=0(&|$)/.test(s);
  try {
    if (on) sessionStorage.setItem("cm3-shadow", "1");
    if (off) sessionStorage.removeItem("cm3-shadow");
    V3.shadow = sessionStorage.getItem("cm3-shadow") === "1";
  } catch (e) { V3.shadow = on; }
}
function v3on(name) { var f = CM3.FLAGS[name]; return f === true || (V3.shadow && f !== true); }

/* ------------------------------------------------- F4 · notice split */
function v3N() { return CM3.notices(D); }
function v3isIlanEvent(e) { return v3on("noticeSplit") && v3N().events[e.i].isIlan; }
function v3isIlanArt(a) { return v3on("noticeSplit") && !!v3N().byArt[a.i]; }
function v3haberCount(s, n) { var o = v3on("noticeSplit") && v3N().byOutlet[s]; return o ? o.haber : n; }
function v3noticeBeside(s) {
  var o = v3on("noticeSplit") && v3N().byOutlet[s];
  return o && o.ilan ? ' <span class="cm3-sub" data-cm3>' + esc(t3("noticeShort", { n: o.ilan })) + "</span>" : "";
}
function v3newsOutletCount(e) { return v3on("noticeSplit") ? v3N().events[e.i].newsOutlets.length : e.s.length; }
function v3evCountLine(e) {
  var x = v3on("noticeSplit") && v3N().events[e.i];
  // Without notices the line stays exactly as 2.0 wrote it.
  if (!x || !x.ilan) return e.n + " başlık · " + e.s.length + " kurum";
  return esc(t3("evCountsSplit", { h: x.haber, i: x.ilan, k: x.newsOutlets.length }));
}
function v3noticeTag(a) { return v3isIlanArt(a) ? '<span class="tag cm3-ntag" data-cm3>' + esc(t3("notice")) + "</span>" : ""; }
function v3sub(g, list) {
  if (g !== "/olaylar" || !v3on("noticeSplit") || !list) return list;
  return list.slice(0, 3).concat([["/olaylar", "ilan", t3("noticeEvents")]], list.slice(3));
}
function v3noticeLines() {
  return '<div class="cm3-lines" data-cm3><p>' + esc(t3("noticeLine1")) + "</p><p>" + esc(t3("noticeLine2")) + "</p><p>" +
    esc(t3("noticeLine3")) + "</p></div>";
}
/* Resmî ilanlar page: notices listed one by one, grouped by issuing body, site and day.
   Notices are never events; the old notice clusters are described, not shown. */
var V3_KIND = { asliyeHukuk: "kAsliyeHukuk", sulhHukuk: "kSulhHukuk", asliyeCeza: "kAsliyeCeza", agirCeza: "kAgirCeza", sulhCeza: "kSulhCeza",
  aile: "kAile", is: "kIs", ticaret: "kTicaret", tuketici: "kTuketici", kadastro: "kKadastro", idare: "kIdare", mahkeme: "kMahkeme",
  icra: "kIcra", belediye: "kBelediye", kurum: "kKurum", diger: "kDiger" };
var V3_FAM = { court: "famCourt", enforcement: "famEnforcement", public: "famPublic", other: "famOther" };
var V3_FAMS = ["court", "enforcement", "public", "other"];
V3.nl = { fam: "all", outlet: "", q: "", shown: 60 };
function v3noticeRows() {
  if (V3.nlRows) return V3.nlRows;
  var n = v3N();
  V3.nlRows = D.A.filter(function (a) { return n.byArt[a.i]; }).map(function (a) {
    var k = CM3.noticeKind(a.t);
    return { a: a, kind: k.kind, fam: k.family, place: CM3.noticePlace(a.t) };
  }).sort(function (x, y) { return CM3.cmp(y.a.d, x.a.d) || CM3.cmp(x.a.t, y.a.t); });
  return V3.nlRows;
}
function v3bars(rows, total) {
  return '<div class="cm3-bars">' + rows.map(function (r) {
    return '<div class="cm3-bar' + (r.sub ? " sub" : "") + '"><span class="lb">' + esc(r.label) + '</span><span class="tr" aria-hidden="true"><i style="width:' +
      Math.max(1, Math.round(100 * r.n / total)) + '%"></i></span><span class="num">' + r.n.toLocaleString("tr") + "</span></div>";
  }).join("") + "</div>";
}
function v3noticeEventsPage() {
  if (!v3on("noticeSplit")) return "";
  var n = v3N(), rows = v3noticeRows(), total = rows.length;
  var outlets = {}, days = {}, places = {}, fam = {}, kind = {};
  rows.forEach(function (r) {
    outlets[r.a.s] = (outlets[r.a.s] || 0) + 1; days[r.a.d.slice(0, 10)] = (days[r.a.d.slice(0, 10)] || 0) + 1;
    if (r.place) places[r.place] = 1;
    fam[r.fam] = (fam[r.fam] || 0) + 1; kind[r.kind] = (kind[r.kind] || 0) + 1;
  });
  var h = '<div class="phead" data-cm3><div class="eyebrow">' + esc(t3("nlEyebrow")) + "</div><h1>" + esc(t3("nlHead")) + "</h1>" +
    '<p class="lede">' + esc(t3("nlLede", { n: total.toLocaleString("tr"), x: CM3.pct1(total / D.A.length) })) + " " + v3est() + "</p></div>";
  h += '<div class="cm3-nl" data-cm3><p class="cm3-nl-tiles"><b class="num">' + total.toLocaleString("tr") + "</b> " +
    esc(t3("nlTiles", { o: Object.keys(outlets).length, d: Object.keys(days).length, p: Object.keys(places).length })) + "</p>" + v3noticeLines();
  // 1. issuing body: families, then kinds inside each family
  var kr = [];
  V3_FAMS.forEach(function (f) {
    if (!fam[f]) return;
    kr.push({ label: t3(V3_FAM[f]), n: fam[f] });
    Object.keys(V3_KIND).filter(function (k) { return kind[k] && rows.some(function (r) { return r.kind === k && r.fam === f; }); })
      .sort(function (a, b) { return kind[b] - kind[a]; })
      .forEach(function (k) { kr.push({ label: t3(V3_KIND[k]), n: kind[k], sub: true }); });
  });
  h += '<section class="sec"><h2>' + esc(t3("nlKindHead")) + '</h2><p class="sub">' + esc(t3("nlKindSub")) + "</p>" + v3bars(kr, total) + "</section>";
  // 2. sites, alphabetical (no ranking by share)
  var os = Object.keys(outlets).sort(function (a, b) { return srcName(a).localeCompare(srcName(b), "tr"); });
  h += '<section class="sec"><h2>' + esc(t3("nlSiteHead")) + '</h2><p class="sub">' + esc(t3("nlSiteSub")) + "</p>" +
    '<div class="scroller panel"><table><thead><tr><th>' + esc(t3("nlSite")) + '</th><th class="r">' + esc(t3("nlCount")) + '</th><th class="r">' + esc(t3("nlNews")) +
    '</th><th class="r">' + esc(t3("nlShare")) + "</th></tr></thead><tbody>" + os.map(function (s) {
      var o = n.byOutlet[s];
      return '<tr><td><a class="lnk" href="#/kurum?s=' + s + '">' + esc(srcName(s)) + '</a></td><td class="r num">' + o.ilan + '</td><td class="r num">' + o.haber +
        '</td><td class="r num">%' + CM3.pct1(o.ilan / o.all) + "</td></tr>";
    }).join("") + "</tbody></table></div><p class=\"xsmall\" style=\"margin-top:6px\">" + v3est() + "</p></section>";
  // 3. days
  var dk = DAYS.filter(function (d) { return d >= "2026-09-01" && d <= "2026-10-10"; }), max = Math.max.apply(null, dk.map(function (d) { return days[d] || 0; }).concat([1]));
  h += '<section class="sec"><h2>' + esc(t3("nlDayHead")) + '</h2><div class="cm3-days" role="img" aria-label="' + esc(t3("nlDayHead")) + '">' + dk.map(function (d) {
    var v = days[d] || 0, lab = fmtD(d + "T00:00");
    return '<span class="cm3-day" title="' + esc(t3("nlDayTip", { d: lab, n: v })) + '"><i style="height:' + Math.round(100 * v / max) + '%"></i></span>';
  }).join("") + '</div><div class="cm3-days-ax xsmall mono"><span>' + fmtD(dk[0] + "T00:00") + "</span><span>" + fmtD(dk[dk.length - 1] + "T00:00") + "</span></div></section>";
  // 4. every notice
  h += '<section class="sec" id="cm3nl-list"><h2>' + esc(t3("nlListHead")) + '</h2><div class="cm3-nl-ctl">' +
    '<div class="cm3-chiprow" role="group">' + ["all"].concat(V3_FAMS.filter(function (f) { return fam[f]; })).map(function (f) {
      return '<button type="button" class="chip" data-nlf="' + f + '" aria-pressed="' + (V3.nl.fam === f) + '">' + esc(f === "all" ? t3("nlAll") : t3(V3_FAM[f])) +
        ' <span class="num">' + (f === "all" ? total : fam[f]) + "</span></button>";
    }).join("") + "</div>" +
    '<label class="cm3-field"><span class="visually-hidden">' + esc(t3("nlSite")) + '</span><select id="cm3nl-o"><option value="">' + esc(t3("nlOutletAll")) + "</option>" +
    os.map(function (s) { return '<option value="' + s + '"' + (V3.nl.outlet === s ? " selected" : "") + ">" + esc(srcName(s)) + "</option>"; }).join("") + "</select></label>" +
    '<label class="cm3-field"><span class="visually-hidden">' + esc(t3("nlSearch")) + '</span><input type="search" id="cm3nl-q" placeholder="' + esc(t3("nlSearch")) + '" value="' + esc(V3.nl.q) + '"></label></div>' +
    '<p class="xsmall mono" id="cm3nl-count" aria-live="polite"></p><ol class="cm3-nl-list" id="cm3nl-rows"></ol></section>';
  // 5. what changed from 2.0
  var old = D.E.filter(function (e) { return n.events[e.i].isIlan; }).sort(function (a, b) { return b.a.length - a.a.length; });
  if (old.length) {
    var big = old[0], bodies = {};
    big.a.forEach(function (i) { bodies[ART[i].t] = 1; });
    h += '<section class="sec"><h2>' + esc(t3("nlOldHead")) + "</h2><p>" + esc(t3("nlOld", { n: old.length, m: Object.keys(bodies).length, k: big.a.length })) +
      '</p><p class="xsmall" style="margin-top:8px">' + esc(t3("nlRule")) + ' <a class="lnk" href="#/yonetim?t=dogrulama">' + esc(t3("nlReview")) + "</a></p></section>";
  }
  return h + "</div>";
}
function v3noticeList() {
  var box = document.getElementById("cm3nl-rows"); if (!box) return;
  var q = CM3.trLower(V3.nl.q.trim());
  var rows = v3noticeRows().filter(function (r) {
    return (V3.nl.fam === "all" || r.fam === V3.nl.fam) && (!V3.nl.outlet || r.a.s === V3.nl.outlet) &&
      (!q || CM3.trLower(r.a.t).indexOf(q) >= 0 || (r.place && CM3.trLower(r.place).indexOf(q) >= 0));
  });
  var shown = rows.slice(0, V3.nl.shown);
  box.innerHTML = shown.length ? shown.map(function (r) {
    return '<li class="cm3-nl-row"><span class="cm3-kind f-' + r.fam + '">' + esc(t3(V3_KIND[r.kind])) + "</span>" +
      '<a href="' + esc(r.a.u) + '" target="_blank" rel="noopener">' + esc(r.a.t) + "</a>" +
      '<span class="xsmall">' + esc(srcName(r.a.s)) + " · " + esc(r.place || t3("nlPlaceNone")) + '</span><span class="mono xsmall">' + v3time(r.a) + "</span></li>";
  }).join("") : '<li class="xempty">' + esc(t3("nlNone")) + "</li>";
  if (rows.length > shown.length) box.insertAdjacentHTML("beforeend", '<li><button type="button" class="chip xmore" id="cm3nl-more">' +
    esc(t3("nlMore", { n: Math.min(60, rows.length - shown.length) })) + "</button></li>");
  var c = document.getElementById("cm3nl-count"); if (c) c.textContent = t3("nlShown", { a: shown.length, n: rows.length });
}
function v3noticeWire(view) {
  var sec = view.querySelector("#cm3nl-list"); if (!sec) return;
  sec.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-nlf")) {
      V3.nl.fam = b.getAttribute("data-nlf"); V3.nl.shown = 60;
      [].forEach.call(sec.querySelectorAll("[data-nlf]"), function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
      v3noticeList();
    } else if (b.id === "cm3nl-more") { V3.nl.shown += 60; v3noticeList(); }
  });
  sec.querySelector("#cm3nl-o").onchange = function () { V3.nl.outlet = this.value; V3.nl.shown = 60; v3noticeList(); };
  sec.querySelector("#cm3nl-q").oninput = function () { V3.nl.q = this.value; V3.nl.shown = 60; v3noticeList(); };
  v3noticeList();
}
/* Notices are not news: with the split on, their clusters leave topic lists, and the notices carry the "İlan" section.
   Done once per page load; switching the flag off (preview) restores the originals. */
function v3scrub() {
  var on = v3on("noticeSplit");
  if (V3.scrubbed === on) return;
  V3.scrubbed = on;
  var n = v3N();
  if (!V3.topicOrig) { V3.topicOrig = {}; Object.keys(TPX).forEach(function (k) { V3.topicOrig[k] = TPX[k]; }); V3.secOrig = {}; }
  Object.keys(V3.topicOrig).forEach(function (k) {
    var t = V3.topicOrig[k];
    if (!on) { TPX[k] = t; return; }
    var c = {}; Object.keys(t).forEach(function (f) { c[f] = t[f]; });
    c.e = t.e.filter(function (i) { return !(n.events[i] && n.events[i].isIlan); });
    TPX[k] = c;
  });
  D.A.forEach(function (a) {
    if (!n.byArt[a.i]) return;
    if (!(a.i in V3.secOrig)) V3.secOrig[a.i] = a.c;
    a.c = on ? "ilan" : V3.secOrig[a.i];
  });
}
function v3topicList() { return (D.TP || []).map(function (x) { return TPX[x.k] || x; }); }
function v3outletNoticeTabs(k) {
  var n = v3N(), o = n.byOutlet[k]; if (!o) return "";
  var mine = D.A.filter(function (a) { return a.s === k; }).sort(function (x, y) { return CM3.cmp(y.d, x.d); });
  function row(a) {
    return '<li><a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + esc(a.t) + '</a><span class="mono">' + v3time(a) + "</span></li>";
  }
  var news = mine.filter(function (a) { return !n.byArt[a.i]; }).slice(0, 12);
  var ilan = mine.filter(function (a) { return n.byArt[a.i]; });
  return '<section class="sec cm3-nt" data-cm3 id="cm3nt"><div class="xtabs" role="tablist" aria-label="' + esc(t3("news") + " / " + t3("notice")) + '">' +
    '<button class="xtab on" role="tab" aria-selected="true" aria-controls="cm3nt-h" id="cm3nt-th" data-nt="h">' + esc(t3("news")) + ' <span class="num">' + o.haber + "</span></button>" +
    '<button class="xtab" role="tab" aria-selected="false" aria-controls="cm3nt-i" id="cm3nt-ti" data-nt="i">' + esc(t3("notice")) + ' <span class="num">' + o.ilan + "</span></button>" +
    '<span class="xsmall cm3-share">' + esc(t3("noticeShare", { x: CM3.pct1(o.all ? o.ilan / o.all : 0) })) + ' ' + v3est() + "</span></div>" +
    '<div role="tabpanel" id="cm3nt-h" aria-labelledby="cm3nt-th"><ul class="cm3-list">' + news.map(row).join("") + "</ul></div>" +
    '<div role="tabpanel" id="cm3nt-i" aria-labelledby="cm3nt-ti" hidden>' + v3noticeLines() +
    (ilan.length ? '<ul class="cm3-list">' + ilan.map(row).join("") + "</ul>" : '<p class="xempty">' + esc(t3("noNotices")) + "</p>") + "</div></section>";
}
function v3wireTabs(root) {
  var tabs = root.querySelectorAll("[data-nt]");
  [].forEach.call(tabs, function (b) {
    b.onclick = function () {
      [].forEach.call(tabs, function (o) {
        var on = o === b; o.classList.toggle("on", on); o.setAttribute("aria-selected", on ? "true" : "false");
        document.getElementById(o.getAttribute("aria-controls")).hidden = !on;
      });
    };
  });
}

/* ---------------------------------------------- F2 · panel health */
var V3_BLOC_KEY = { left: "blocLeft", mid: "blocMid", right: "blocRight" };
function v3chip(r, admitted) {
  if (r.noData) {
    return '<a class="cm3-chip ghost" href="' + v3ghostHref() + '"><span class="nm">' + esc(r.name) + '</span><span class="lb">' + esc(t3("noData")) + "</span></a>";
  }
  var w = Math.max(2, Math.round(r.eventShare * 100));
  return '<span class="cm3-chip' + (admitted ? "" : " thin") + '" title="' + esc(t3("eventShareTip", { x: CM3.pct1(r.eventShare), days: r.days, n: r.headlines })) + '">' +
    '<span class="nm">' + esc(r.name) + '</span><span class="bar" aria-hidden="true"><i style="width:' + w + '%"></i></span>' +
    '<span class="lb">' + (admitted ? "%" + CM3.pct1(r.eventShare) : esc(t3("thinData"))) + "</span></span>";
}
// Register outlets the site has no profile for: a fourth row of ghost chips, no placement.
function v3noneRow() {
  if (!v3on("register")) return "";
  var ex = CM3.registerExtras(D); if (!ex.length) return "";
  return '<div class="cm3-ph-row none"><div class="cm3-ph-h"><span class="xlean mid">' + esc(t3("blocNone")) + "</span>" +
    '<span class="num">' + esc(t3("activeOutlets", { a: 0, n: ex.length })) + '</span></div><div class="cm3-chips">' +
    ex.map(function (r) { return v3chip({ noData: true, name: r.name }, false); }).join("") + "</div></div>";
}
function v3ghostHref() { return v3on("register") ? "#/yontem?s=kayit" : "#/yontem?s=2"; }
function v3panelRows(rule) {
  var rows = CM3.panel(D), key = rule === "new" ? "admittedNew" : "admittedOld";
  return ["left", "mid", "right"].map(function (b) {
    var rs = rows.filter(function (r) { return r.bloc === b; })
      .sort(function (x, y) { return (y[key] - x[key]) || (y.eventShare - x.eventShare) || (x.name < y.name ? -1 : 1); });
    var adm = rs.filter(function (r) { return r[key]; }).length;
    return '<div class="cm3-ph-row ' + b + '"><div class="cm3-ph-h"><span class="xlean ' + b + '">' + esc(t3(V3_BLOC_KEY[b])) + "</span>" +
      '<span class="num">' + esc(t3("activeOutlets", { a: adm, n: rs.length })) + "</span></div>" +
      '<div class="cm3-chips">' + rs.map(function (r) { return v3chip(r, r[key]); }).join("") + "</div></div>";
  }).join("") + v3noneRow();
}
function v3criteria(rule) {
  var P = CM3.PARAMS, o = { days: P.minDays, share: CM3.pct1(P.minEventShare), perDay: P.minPerDay };
  return esc(t3(rule !== "new" ? "criteriaDays" : P.minPerDay == null ? "criteriaShare" : "criteriaAll", o));
}
function v3panelHealth() {
  var adm = CM3.panel(D).filter(function (r) { return r.admittedOld; });
  var low = adm.slice().sort(function (a, b) { return a.eventShare - b.eventShare; })[0];
  var h = '<section class="cm3-ph" data-cm3 aria-labelledby="cm3ph-h"><div class="cm3-ph-top"><h2 id="cm3ph-h">' + esc(t3("panelHealth")) + "</h2>" +
    '<p class="xsmall mono">' + v3criteria("old") + "</p></div>" + v3panelRows("old") +
    (low ? '<p class="cm3-ph-low">' + esc(t3("lowestShare", { outlet: low.name, x: CM3.pct1(low.eventShare) })) + "</p>" : "");
  if (V3.shadow) {
    h += '<div class="cm3-ph-shadow"><div class="cm3-ph-top"><h3>' + esc(t3("shadowRule")) + '</h3><p class="xsmall mono">' + v3criteria("new") + "</p></div>" +
      v3panelRows("new") + "</div>";
  }
  return h + "</section>";
}
function v3panelLine() {
  var c = { left: 0, right: 0 };
  CM3.panel(D).forEach(function (r) { if (r.admittedOld && c[r.bloc] != null) c[r.bloc]++; });
  return '<span class="cm3-n mono" data-cm3>' + esc(t3("panelLine", { l: c.left, r: c.right })) + "</span>";
}

/* ---------------------------------------------- F1 · owner voices */
function v3voices(e) {
  var adm = CM3.admittedSet(D, "old"), groups = CM3.ownerGroups(D);
  var outs = v3N().events[e.i].newsOutlets.filter(function (s) { return adm.indexOf(s) >= 0; });
  var k = outs.length, v = CM3.voices(outs, groups, true);
  var present = groups.map(function (g) {
    return { g: g, m: g.members.filter(function (s) { return outs.indexOf(s) >= 0; }) };
  }).filter(function (x) { return x.m.length; });
  var grouped = {};
  present.forEach(function (x) { x.m.forEach(function (s) { grouped[s] = 1; }); });
  var anyCited = present.some(function (x) { return x.g.source; });
  var label = anyCited ? t3("counter", { k: k, v: v, voice: CM3.LBL.voice }) : t3("counterOutletsOnly", { k: k });
  var body = present.map(function (x) {
    return '<li><b>' + esc(x.g.label) + "</b>: " + esc(x.m.map(srcName).join(", ")) + "<br>" +
      (x.g.source ? '<a class="lnk" href="' + esc(x.g.source.url) + '" target="_blank" rel="noopener">' +
        esc(t3("sourceLine", { title: x.g.source.title, date: x.g.source.date })) + "</a>" : '<span class="xsmall">' + esc(t3("ownerPending")) + "</span>") + "</li>";
  }).join("") + outs.filter(function (s) { return !grouped[s]; }).map(function (s) {
    return "<li><b>" + esc(srcName(s)) + '</b>: <span class="xsmall">' + esc(t3("noGroup")) + "</span></li>";
  }).join("");
  return '<details class="cm3-voices" data-cm3><summary>' + esc(label) + "</summary><div><p class=\"eyebrow\">" + esc(t3("ownerPanelHead")) + "</p>" +
    "<ul>" + body + '</ul><p class="xsmall">' + esc(t3("voiceScope", { k: k })) + "</p><p class=\"xsmall\">" + esc(t3("ownerLine")) + "</p></div></details>";
}

/* ---------------------------------------------- F5 · echo chain */
function v3time(a) {
  return CM3.timeQuality(a.d) === "real" ? fmtDT(a.d) : fmtD(a.d.slice(0, 10) + "T00:00") + " · " + esc(t3("noTime"));
}
function v3echo(e) {
  var cl = CM3.clusters(D).byEvent[e.i] || [];
  if (!cl.length) return "";
  return '<section class="cm3-echo" data-cm3><h2>' + esc(t3("similar")) + "</h2>" + cl.map(function (c) {
    var first = c.order[0];
    return '<div class="cm3-cl"><p class="eyebrow">' + esc(c.known ? t3("firstSeen") : t3("orderUnknown")) + "</p>" +
      (c.known ? '<div class="cm3-cl-h"><b>' + esc(srcName(first.s)) + '</b><span class="mono">' + v3time(first) + "</span>" +
        '<p><a href="' + esc(first.u) + '" target="_blank" rel="noopener">' + esc(first.t) + "</a></p></div>" :
        '<p class="cm3-cl-t">' + esc(c.members[0].t) + "</p>") +
      '<ul class="cm3-list">' + c.order.slice(c.known ? 1 : 0).map(function (a) {
        return '<li><a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + esc(srcName(a.s)) + '</a><span class="mono">' + v3time(a) + "</span></li>";
      }).join("") + "</ul></div>";
  }).join("") + '<p class="xsmall">' + esc(t3("similarLine")) + "</p></section>";
}
function v3flowTable() {
  var rows = CM3.rankFlows(CM3.clusters(D).flowsKnown);
  return '<section class="sec" data-cm3 id="cm3flows"><h2>' + esc(t3("flowHead")) + '</h2><p class="sub">' + esc(t3("flowLimit")) + "</p>" +
    '<div class="scroller panel"><table><thead><tr><th>' + esc(t3("flowEarlier")) + "</th><th>" + esc(t3("flowLater")) + '</th><th class="r">' +
    esc(t3("flowCount")) + "</th></tr></thead><tbody>" + rows.map(function (r) {
      return "<tr><td>" + esc(srcName(r.from)) + "</td><td>" + esc(srcName(r.to)) + '</td><td class="r num">' + r.n + "</td></tr>";
    }).join("") + "</tbody></table></div></section>";
}

/* ---------------------------------------------- F12 · marked-word appeal */
function v3decorateSplits(root) {
  if (!v3on("appeal")) return;
  [].forEach.call((root || document).querySelectorAll(".xsplit"), function (sp) {
    if (!sp.querySelector("mark.mw")) return;
    var nx = sp.nextElementSibling;
    if (nx && nx.classList.contains("cm3-appeal")) return;
    sp.insertAdjacentHTML("afterend", '<button type="button" class="cm3-appeal" data-cm3>' + esc(t3("appealBtn")) + "</button>");
  });
}
function v3openAppeal(btn) {
  var sp = btn.previousElementSibling; if (!sp || !sp.classList.contains("xsplit")) return;
  var side = function (p) { return { outlet: (p.querySelector(".xsp-o") || {}).textContent || "", title: (p.querySelector(".xsp-h") || {}).textContent || "" }; };
  var ps = sp.querySelectorAll(".xsp-p"), A = side(ps[0]), B = side(ps[1]);
  var words = [], seen = {};
  [].forEach.call(sp.querySelectorAll("mark.mw"), function (m) { if (!seen[m.textContent]) { seen[m.textContent] = 1; words.push(m.textContent); } });
  var d = document.createElement("div");
  d.className = "cm3-dlg"; d.setAttribute("data-cm3", "");
  d.innerHTML = '<form role="dialog" aria-modal="true" aria-labelledby="cm3a-h" novalidate>' +
    '<h2 id="cm3a-h">' + esc(t3("appealTitle")) + "</h2>" +
    '<p class="xsmall">' + esc(t3("appealScope")) + "</p>" +
    '<div class="cm3-a-pair"><p><b>' + esc(A.outlet) + "</b> " + esc(A.title) + "</p><p><b>" + esc(B.outlet) + "</b> " + esc(B.title) + "</p></div>" +
    '<fieldset><legend>' + esc(t3("appealWords")) + "</legend>" + words.map(function (w, i) {
      return '<label class="cm3-wchip"><input type="radio" name="word" value="' + esc(w) + '"' + (i ? "" : " checked") + "> " + esc(w) + "</label>";
    }).join("") + "</fieldset>" +
    '<label>' + esc(t3("appealName")) + '<input name="name" autocomplete="name" maxlength="160" required></label>' +
    '<label>' + esc(t3("appealEmail")) + '<input name="email" type="email" autocomplete="email" maxlength="320" required></label>' +
    '<label>' + esc(t3("appealText")) + '<textarea name="text" rows="4" maxlength="12000" required aria-describedby="cm3a-c"></textarea></label>' +
    '<p class="xsmall mono" id="cm3a-c" aria-live="polite">' + esc(t3("appealCount", { n: 0 })) + "</p>" +
    '<label>' + esc(t3("appealLink")) + '<input name="link" type="url" inputmode="url" placeholder="https://"></label>' +
    '<label class="cm3-hp" aria-hidden="true">Web<input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<label class="cm3-consent"><input type="checkbox" name="consent"> ' + esc(t3("appealConsent")) + "</label>" +
    '<p class="xsmall">' + esc(t3("appealNoPromise")) + "</p>" +
    '<p class="cm3-err" role="alert"></p>' +
    '<div class="cm3-a-b"><button type="button" class="chip" data-x>' + esc(t3("appealCancel")) + '</button><button type="submit" class="xbtn">' + esc(t3("appealSend")) + "</button></div></form>";
  document.body.appendChild(d);
  var f = d.querySelector("form"), err = d.querySelector(".cm3-err"), cnt = d.querySelector("#cm3a-c");
  var close = function () { d.remove(); btn.focus(); };
  d.querySelector("[data-x]").onclick = close;
  d.addEventListener("click", function (ev) { if (ev.target === d) close(); });
  d.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { ev.preventDefault(); close(); return; }
    if (ev.key !== "Tab") return;
    var fo = [].filter.call(f.querySelectorAll("input,textarea,button,a[href]"), function (x) { return !x.disabled && x.tabIndex >= 0 && x.offsetParent !== null; });
    var first = fo[0], last = fo[fo.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });
  f.text.oninput = function () { cnt.textContent = t3("appealCount", { n: f.text.value.trim().length }); };
  var ERR = { name: "errName", email: "errEmail", text: "errText", link: "errLink", consent: "errConsent", word: "errWord" };
  function failMessage(r, first) {
    if (first) return t3(ERR[first]);
    if (r.disabled) return t3("appealDisabled");
    if (r.cooldown) return t3("appealWait");
    if (r.errors) return "";
    return t3("appealFailed");
  }
  f.onsubmit = function (ev) {
    ev.preventDefault();
    var w = f.querySelector('input[name="word"]:checked');
    var inp = { name: f.name.value, email: f.email.value, text: f.text.value, link: f.link.value, consent: f.consent.checked,
      word: w ? w.value : "", honeypot: f.website.value, eventId: sp.getAttribute("data-e"), a: A, b: B };
    var storage = null; try { storage = window.localStorage; } catch (e) {}
    CM3.appeal.submit(inp, { fetch: window.fetch && window.fetch.bind(window), endpoint: CM3.CONFIG.correctionEndpoint, storage: storage }).then(function (r) {
      if (r.ok) {
        f.innerHTML = '<h2 id="cm3a-h">' + esc(t3("appealOk", { id: r.id })) + '</h2><div class="cm3-a-b"><button type="button" class="xbtn" data-x>' + esc(t3("close")) + "</button></div>";
        var x = f.querySelector("[data-x]"); x.onclick = close; x.focus();
        return;
      }
      var first = r.errors && r.errors.filter(function (k) { return ERR[k]; })[0];
      err.textContent = failMessage(r, first);
      if (first && f[first] && f[first].focus) f[first].focus();
    });
  };
  setTimeout(function () { f.name.focus(); }, 20);
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest(".cm3-appeal");
  if (b) v3openAppeal(b);
});

/* ------------------------------------------- evidence gate and reading list */
var V3_GRADE = { A: "gradeA", B: "gradeB", C: "gradeC", D: "gradeD", E: "gradeE" };
var V3_RULE = { owner: "ruleOwner", absence: "ruleAbsence", panel: "rulePanel", context: "ruleContext" };
function v3cell(v) { return v === "" || v == null || /^Not captured/.test(String(v)) ? t3("notOnRecord") : String(v); }
function v3literature() {
  var L = CM3.literature(); if (!L.length) return "";
  return '<section class="sec cm3-lit" data-cm3 id="cm3lit"><h2>' + esc(t3("litHead")) + '</h2><p class="sub">' + esc(t3("litSub", { n: L.length })) + "</p>" +
    '<div class="scroller panel"><table><thead><tr><th>' + esc(t3("litSource")) + "</th><th>" + esc(t3("litGrade")) + "</th><th>" + esc(t3("litScope")) +
    "</th><th>" + esc(t3("litRule")) + "</th></tr></thead><tbody>" + L.map(function (x) {
      var s = x.src;
      return '<tr><td class="cm3-lit-src"><b>' + esc(v3cell(s.authors)) + "</b> · " + esc(v3cell(s.year)) + "<br>" +
        '<a class="lnk" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a><br><span class="xsmall">' + esc(s.venue) + "</span></td>" +
        '<td><span class="cm3-grade g' + x.grade + '">' + esc(t3(V3_GRADE[x.grade])) + '</span><br><span class="xsmall">' +
        esc(t3(x.eligible ? "eligible" : "notEligible")) + "</span></td>" +
        '<td class="cm3-lit-scope">' + esc(s.kapsam) + "</td><td>" + esc(t3(V3_RULE[s.rule])) + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    (CM3.ownerGroups(D).some(function (g) { return !g.source; }) ? '<p class="xsmall" style="margin-top:10px">' + esc(t3("litOwnerNote")) + "</p>" : "") + "</section>";
}
function v3gate() {
  var L = CM3.literature(); if (!L.length) return "";
  var by = {}; L.forEach(function (x) { by[x.grade] = (by[x.grade] || 0) + 1; });
  var ok = L.filter(function (x) { return x.eligible; }).length;
  return '<div class="cm3-gate" data-cm3><h3>' + esc(t3("gateHead")) + '</h3><p class="sub">' + esc(t3("gateSub")) + "</p>" +
    '<div class="cm3-ladder" role="list">' + ["A", "B", "C", "D", "E"].map(function (g) {
      var n = by[g] || 0, el = L.filter(function (x) { return x.grade === g && x.eligible; }).length;
      return '<div class="cm3-rung g' + g + '" role="listitem"><span class="lb">' + esc(t3(V3_GRADE[g])) + '</span>' +
        '<span class="bar" aria-hidden="true"><i style="width:' + Math.round(100 * n / L.length) + '%"></i><i class="ok" style="width:' + Math.round(100 * el / L.length) + '%"></i></span>' +
        '<span class="num">' + esc(t3("gateSources", { n: n })) + "</span></div>";
    }).join("") + '</div><p class="cm3-gate-n num">' + esc(t3("gateCount", { a: ok, n: L.length })) + "</p></div>";
}
function v3pipeline() {
  var cited = CM3.ownerGroups(D).some(function (g) { return g.source; });
  var st = function (flag) { return flag == null ? "stFixed" : v3on(flag) ? "stOn" : "stOff"; };
  var main = [["p1", null], ["p2", "noticeSplit"], ["p3", null], ["p4", "shadow"], ["p5", "echoChain"], ["p6", "echoChain"], ["p7", "stemMatch"], ["p8", "owner"]];
  var side = [["p9", "audit"], ["p10", "audit"]];
  var state = function (k) { return k === "shadow" ? "stShadow" : k === "owner" ? (cited ? (v3on("ownerVoices") ? "stOn" : "stOff") : "stPending") : k === "audit" ? "stOn" : st(k); };
  var box = function (s) {
    var sk = state(s[1]);
    return '<li class="cm3-step ' + sk + '"><b>' + esc(t3(s[0])) + "</b><span>" + esc(t3(s[0] + "d")) + '</span><em>' + esc(t3(sk)) + "</em></li>";
  };
  return '<div class="cm3-pipe" data-cm3><p class="sub">' + esc(t3("pipeSub")) + "</p>" +
    '<p class="eyebrow">' + esc(t3("pipeMain")) + '</p><ol class="cm3-steps">' + main.map(box).join("") + "</ol>" +
    '<p class="eyebrow">' + esc(t3("pipeSide")) + '</p><ul class="cm3-steps side">' + side.map(box).join("") + "</ul></div>";
}
function v3methodSection() {
  return '<section class="sec cm3-method" data-cm3 id="cm3method"><h2>' + esc(t3("pipeHead")) + "</h2>" + v3pipeline() + v3gate() + "</section>";
}

/* ------------------------------------------- review desk (ADR-001) */
var V3_COLL = { ilan: "review/ilan/items", yanki: "review/yanki/items", isaret: "review/isaret/items",
  registry: "decisions/registry/items", owners: "decisions/owners/items" };
V3.store = { ilan: {}, yanki: {}, isaret: {}, registry: {}, owners: {} };
V3.storeState = "pending"; V3.desk = "ilan"; V3.onlyOpen = false; V3.queue = {};
// The "tahmini" tag stays until the notice review passes.
function v3est() { return v3gates().ilan.pass ? "" : '<span class="cm3-tag">' + esc(t3("estimated")) + "</span>"; }
function v3withStem(on, fn) {
  var keep = CM3.FLAGS.stemMatch, keepShadow = V3.shadow;
  CM3.FLAGS.stemMatch = on; V3.shadow = false;
  try { return fn(); } finally { CM3.FLAGS.stemMatch = keep; V3.shadow = keepShadow; }
}
function v3marks(a, b) { var c = compareHeads(a, b); return c.markA.concat(c.markB); }
function v3sets(withMarks) {
  if (withMarks && !V3.setsM) {
    V3.setsM = CM3.reviewSets(D, { old: function (a, b) { return v3withStem(false, function () { return v3marks(a, b); }); },
      "new": function (a, b) { return v3withStem(true, function () { return v3marks(a, b); }); } });
    V3.sets = V3.setsM;
  }
  return V3.sets || (V3.sets = CM3.reviewSets(D));
}
function v3answers(k) { var m = {}, st = V3.store[k]; Object.keys(st).forEach(function (id) { m[id] = k === "isaret" ? st[id] : st[id].answer; }); return m; }
function v3gates() {
  var sets = v3sets(), ilan = CM3.scoreIlan(sets.ilan, v3answers("ilan")), yanki = CM3.scoreYanki(sets.yanki, v3answers("yanki"));
  var isaret = Object.keys(V3.store.isaret).length ? CM3.scoreIsaret(v3sets(true).isaret, v3answers("isaret")) : { total: 100, done: 0, pass: false };
  return { ilan: ilan, yanki: yanki, isaret: isaret };
}
function v3bindStore() {
  if (V3.bound) return; V3.bound = true;
  var cl = window.claude;
  if (!cl || typeof cl.use !== "function") { V3.storeState = "none"; return; }
  Promise.all([cl.use("db"), cl.use("user")]).then(function (r) {
    V3.db = r[0]; V3.user = r[1];
    if (!V3.db) { V3.storeState = "none"; v3storeChanged(); return; }
    V3.storeState = "ok";
    if (V3.user) {
      V3.user.id().then(function (id) { V3.uid = id; });
      V3.user.can("data.write").then(function (v) { V3.canWrite = v; v3deskSync(); });
      V3.user.canEdit().then(function (v) { V3.canEdit = v; v3deskSync(); });
    }
    Object.keys(V3_COLL).forEach(function (k) {
      V3.db.collection(V3_COLL[k]).onSnapshot(function (snap) {
        var m = {}; snap.docs.forEach(function (d) { if (d.exists) m[d.id] = d.data(); });
        V3.store[k] = m; v3storeChanged();
      }, function () { V3.storeState = "none"; v3storeChanged(); });
    });
    v3storeChanged();
  }, function () { V3.storeState = "none"; v3storeChanged(); });
}
function v3sig() {
  return JSON.stringify([v3gates().ilan.pass, Object.keys(CM3.OWNER_SOURCES).sort()]);
}
function v3storeChanged() {
  CM3.applyOwnerSources(D, V3.store.owners);
  var sig = v3sig(), path = location.hash.replace(/^#/, "").split("?")[0];
  if (V3.lastSig != null && sig !== V3.lastSig && !document.getElementById("cm3desk")) { V3.lastSig = sig; route(); return; }
  V3.lastSig = sig;
  v3deskSync();
  var st = document.getElementById("cm3status"); if (st) st.outerHTML = v3statusTable();
}
function v3write(coll, id, body) {
  if (!V3.db) return Promise.resolve(false);
  var b = {}; Object.keys(body).forEach(function (k) { b[k] = body[k]; });
  b.by = V3.uid || null; b.at = new Date().toISOString();
  V3.store[coll] = Object.assign({}, V3.store[coll]); V3.store[coll][id] = b; v3deskSync();
  var key = coll + "/" + id, prev = V3.queue[key] || Promise.resolve();
  // One write at a time per document.
  var p = prev.then(function () { return V3.db.doc(V3_COLL[coll] + "/" + id).set(b); }).then(function () { return true; }, function (e) {
    var code = e && e.code;
    if (code === "invalid_argument") V3.readOnly = true;
    v3deskMsg(code === "invalid_argument" ? "deskSaveDenied" : code === "quota_exceeded" ? "deskQuota" : "deskSaveFail");
    return false;
  });
  V3.queue[key] = p;
  return p;
}
function v3deskMsg(k) { var m = document.getElementById("cm3desk-msg"); if (m) m.textContent = k ? t3(k) : ""; }
function v3stateWord(sc) { return sc.pass ? "stPass" : sc.done === 0 ? "stNotStarted" : sc.done < sc.total ? "stRunning" : "stFail"; }
function v3pctOrDash(x) { return x == null ? "—" : CM3.pct1(x); }
function v3scoreLine(k) {
  var g = v3gates()[k];
  if (!g.done) return t3("noScore");
  if (k === "ilan") return t3("scoreIlan", { p: v3pctOrDash(g.precision), m: v3pctOrDash(g.miss) });
  if (k === "yanki") return t3("scoreYanki", { a: g.flaggedSame, b: g.flagged, c: g.plainSame, d: g.plain });
  return t3("scoreIsaret", { o: v3pctOrDash(g.oldShare), n: v3pctOrDash(g.newShare) });
}
function v3passLine(k) {
  return t3("passLine", { line: k === "ilan" ? t3("lineIlan", { x: CM3.pct1(CM3.PARAMS.noticePrecisionPass) }) : k === "yanki" ? t3("lineYanki") :
    k === "isaret" ? t3("lineIsaret", { x: CM3.pct1(CM3.PARAMS.markRealPass) }) : k === "kayit" ? t3("lineRegistry") : t3("lineOwner") });
}
function v3deskCounts() {
  var sets = v3sets(), aud = CM3.registryAudit(D).filter(function (r) { return r.agrees === false; }), groups = CM3.ownerGroups(D);
  return { ilan: [v3gates().ilan.done, sets.ilan.length], yanki: [v3gates().yanki.done, sets.yanki.length],
    isaret: [Object.keys(V3.store.isaret).filter(function (id) { var a = V3.store.isaret[id]; return a.realX != null && a.realY != null; }).length, 100],
    kayit: [aud.filter(function (r) { return V3.store.registry[r.slug]; }).length, aud.length],
    sahip: [groups.filter(function (g) { return g.source; }).length, groups.length] };
}
function v3deskPage() {
  v3bindStore();
  var panels = [["ilan", "panelIlan"], ["yanki", "panelYanki"], ["isaret", "panelIsaret"], ["kayit", "panelKayit"], ["sahip", "panelSahip"]];
  return '<div class="wrap page cm3-desk" id="cm3desk" data-cm3><div class="phead"><div class="eyebrow">' + esc(t3("deskTab")) + "</div><h1>" + esc(t3("deskHead")) + "</h1>" +
    '<p class="lede">' + esc(t3("deskLede")) + "</p></div>" +
    '<p class="cm3-desk-state" id="cm3desk-state" role="status"></p><p class="cm3-err" id="cm3desk-msg" role="alert"></p>' +
    '<div class="xtabs cm3-desk-tabs" role="tablist">' + panels.map(function (p) {
      return '<button class="xtab' + (V3.desk === p[0] ? " on" : "") + '" role="tab" aria-selected="' + (V3.desk === p[0]) + '" data-desk="' + p[0] + '">' + esc(t3(p[1])) +
        ' <span class="num" data-count="' + p[0] + '"></span></button>';
    }).join("") + '</div><section id="cm3desk-panel"></section></div>';
}
function v3ansButtons(coll, id, cur) {
  return '<div class="cm3-ans" role="group">' + [["e", "yes"], ["h", "no"]].map(function (o) {
    return '<button type="button" data-ans="' + coll + "|" + id + "|" + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(t3(o[1])) + "</button>";
  }).join("") + "</div>";
}
function v3headline(a) {
  return '<p class="cm3-q-h"><b>' + esc(srcName(a.s)) + '</b> <a href="' + esc(a.u) + '" target="_blank" rel="noopener">' + esc(a.t) + "</a></p>";
}
function v3deskPanel() {
  var k = V3.desk, h = "";
  if (k === "ilan" || k === "yanki" || k === "isaret") {
    var items = k === "isaret" ? v3sets(true).isaret : v3sets()[k];
    h += '<div class="cm3-score" data-score="' + k + '"></div><p class="xsmall">' + esc(t3("deskBlind")) + "</p>" +
      '<label class="xcheck"><input type="checkbox" id="cm3open"' + (V3.onlyOpen ? " checked" : "") + "> " + esc(t3("onlyOpen")) + "</label>" +
      '<p class="eyebrow" style="margin-top:12px">' + esc(t3(k === "ilan" ? "qIlan" : k === "yanki" ? "qYanki" : "qIsaret")) + '</p><ol class="cm3-qs">';
    items.forEach(function (it) {
      var st = V3.store[k][it.id];
      if (k === "ilan") h += '<li class="cm3-q" data-q="' + it.id + '"><span class="mono">' + it.id + "</span>" + v3headline(it.a) + v3ansButtons("ilan", it.id, st && st.answer) + "</li>";
      else if (k === "yanki") h += '<li class="cm3-q" data-q="' + it.id + '"><span class="mono">' + it.id + "</span>" + v3headline(it.a) + v3headline(it.b) + v3ansButtons("yanki", it.id, st && st.answer) + "</li>";
      else {
        var box = function (lab, list, f) {
          return '<div class="cm3-set"><span class="eyebrow">' + esc(t3(lab)) + "</span><span>" + (list.length ? list.map(esc).join(" · ") : esc(t3("noMarks"))) + "</span>" +
            (list.length ? '<label class="cm3-num"><input type="number" min="0" max="' + list.length + '" inputmode="numeric" data-mark="' + it.id + "|" + f + '" value="' +
              (st && st[f] != null ? st[f] : "") + '" aria-label="' + esc(t3(lab)) + '"> / ' + list.length + "</label>" : "") + "</div>";
        };
        h += '<li class="cm3-q" data-q="' + it.id + '"><span class="mono">' + it.id + "</span>" + v3headline(it.a) + v3headline(it.b) +
          box("setX", it.X, "realX") + box("setY", it.Y, "realY") + "</li>";
      }
    });
    h += "</ol>";
  } else if (k === "kayit") {
    var B = { left: "blocLeft", mid: "blocMid", right: "blocRight" };
    h += '<div class="cm3-score" data-score="kayit"></div><p class="xsmall">' + esc(t3("deskAdminOnly")) + " " + esc(t3("regNoEffect")) + "</p>";
    CM3.registryAudit(D).filter(function (r) { return r.agrees === false; }).forEach(function (r) {
      var st = V3.store.registry[r.slug] || {};
      h += '<div class="cm3-card" data-reg="' + r.slug + '"><h3>' + esc(r.name) + '</h3><p class="xsmall mono">' +
        esc(t3("regRow", { label: r.label, p: r.placement, rule: t3(B[r.blocByRule]), lbl: t3(B[r.blocByLabel]) })) + "</p>" +
        '<fieldset><label><input type="radio" name="reg-' + r.slug + '" value="placement"' + (st.decision === "placement" ? " checked" : "") + "> " + esc(t3("regKeep")) + "</label>" +
        '<label><input type="radio" name="reg-' + r.slug + '" value="label"' + (st.decision === "label" ? " checked" : "") + "> " + esc(t3("regLabel")) + "</label></fieldset>" +
        '<label class="cm3-field">' + esc(t3("regNote")) + '<textarea rows="2" maxlength="1000" id="reg-note-' + r.slug + '">' + esc(st.note || "") + "</textarea></label>" +
        '<button type="button" class="xbtn" data-savereg="' + r.slug + '">' + esc(t3("save")) + "</button>" +
        (st.at ? '<p class="xsmall">' + esc(t3("savedAt", { at: st.at.slice(0, 16).replace("T", " ") })) + "</p>" : "") + "</div>";
    });
  } else {
    var lit = CM3.literature().filter(function (x) { return x.eligible; });
    h += '<div class="cm3-score" data-score="sahip"></div><p class="xsmall">' + esc(t3("deskAdminOnly")) + "</p>";
    CM3.ownerGroups(D).forEach(function (g) {
      var sid = CM3.safeId(g.key), st = V3.store.owners[sid] || {};
      h += '<div class="cm3-card" data-own="' + sid + '"><h3>' + esc(g.label) + '</h3><p class="xsmall">' + esc(t3("ownMembers", { m: g.members.map(srcName).join(", ") })) + "</p>" +
        (g.source ? '<p class="cm3-ok">' + esc(t3("ownAccepted", { title: g.source.title })) + "</p>" : "") +
        '<label class="cm3-field">' + esc(t3("ownPick")) + '<select id="own-lit-' + sid + '"><option value="">' + esc(t3("ownNone")) + "</option>" +
        lit.map(function (x) { return '<option value="' + x.src.n + '"' + (+st.lit === +x.src.n ? " selected" : "") + ">" + esc(x.src.authors + " · " + x.src.year + " · " + x.src.title) + "</option>"; }).join("") +
        "</select></label><p class=\"xsmall\">" + esc(t3("ownManual")) + "</p>" +
        '<div class="cm3-grid3"><label class="cm3-field">' + esc(t3("ownTitle")) + '<input id="own-title-' + sid + '" value="' + esc(st.title || "") + '"></label>' +
        '<label class="cm3-field">' + esc(t3("ownUrl")) + '<input id="own-url-' + sid + '" type="url" inputmode="url" value="' + esc(st.url || "") + '"></label>' +
        '<label class="cm3-field">' + esc(t3("ownDate")) + '<input id="own-date-' + sid + '" value="' + esc(st.date || "") + '"></label></div>' +
        '<button type="button" class="xbtn" data-saveown="' + sid + '">' + esc(t3("save")) + '</button><p class="cm3-err" id="own-err-' + sid + '"></p></div>';
    });
  }
  var box2 = document.getElementById("cm3desk-panel"); if (box2) box2.innerHTML = h;
  v3deskSync();
}
function v3deskSync() {
  var desk = document.getElementById("cm3desk"); if (!desk) return;
  var st = document.getElementById("cm3desk-state");
  if (st) st.textContent = V3.storeState === "pending" ? t3("deskConnecting") : V3.storeState === "none" ? t3("deskNoStore") :
    (V3.readOnly || V3.canWrite === false) ? t3("deskReadOnly") : "";
  var counts = v3deskCounts();
  [].forEach.call(desk.querySelectorAll("[data-count]"), function (n) { var c = counts[n.getAttribute("data-count")]; n.textContent = t3("progress", { d: c[0], n: c[1] }); });
  var sc = desk.querySelector("[data-score]");
  if (sc) {
    var k = sc.getAttribute("data-score"), word;
    if (k === "kayit" || k === "sahip") word = counts[k][0] === counts[k][1] ? "stDecided" : "stAwait";
    else word = v3stateWord(v3gates()[k]);
    sc.innerHTML = '<p><span class="cm3-state ' + word + '">' + esc(t3(word)) + '</span> <span class="num">' + esc(t3("progress", { d: counts[k][0], n: counts[k][1] })) + "</span></p>" +
      (k === "kayit" || k === "sahip" ? "" : "<p>" + esc(v3scoreLine(k)) + "</p>") + '<p class="xsmall">' + esc(v3passLine(k)) + "</p>";
  }
  [].forEach.call(desk.querySelectorAll("[data-ans]"), function (b) {
    var p = b.getAttribute("data-ans").split("|"), cur = V3.store[p[0]][p[1]];
    b.setAttribute("aria-pressed", cur && cur.answer === p[2] ? "true" : "false");
  });
  var lockAll = V3.storeState !== "ok" || V3.readOnly || V3.canWrite === false, lockAdmin = lockAll || V3.canEdit === false;
  [].forEach.call(desk.querySelectorAll("[data-ans],[data-mark]"), function (b) { b.disabled = lockAll; });
  [].forEach.call(desk.querySelectorAll("[data-savereg],[data-saveown],[data-reg] input,[data-reg] textarea,[data-own] input,[data-own] select"), function (b) { b.disabled = lockAdmin; });
  [].forEach.call(desk.querySelectorAll(".cm3-q"), function (li) {
    var id = li.getAttribute("data-q"), coll = V3.desk, cur = V3.store[coll] && V3.store[coll][id];
    var done = coll === "isaret" ? cur && cur.realX != null && cur.realY != null : cur && cur.answer;
    li.classList.toggle("done", !!done); li.hidden = V3.onlyOpen && !!done;
  });
}
function v3deskWire() {
  var desk = document.getElementById("cm3desk"); if (!desk) return;
  desk.addEventListener("click", function (ev) {
    var t = ev.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-desk")) {
      V3.desk = t.getAttribute("data-desk"); v3deskMsg("");
      [].forEach.call(desk.querySelectorAll("[data-desk]"), function (o) { var on = o === t; o.classList.toggle("on", on); o.setAttribute("aria-selected", on); });
      v3deskPanel(); return;
    }
    if (t.hasAttribute("data-ans")) { var p = t.getAttribute("data-ans").split("|"); v3write(p[0], p[1], { answer: p[2] }); return; }
    if (t.hasAttribute("data-savereg")) {
      var slug = t.getAttribute("data-savereg"), r = desk.querySelector('input[name="reg-' + slug + '"]:checked');
      if (!r) return;
      v3write("registry", slug, { decision: r.value, note: (document.getElementById("reg-note-" + slug).value || "").trim() }).then(function (ok) { if (ok) v3deskPanel(); });
      return;
    }
    if (t.hasAttribute("data-saveown")) {
      var sid = t.getAttribute("data-saveown"), err = document.getElementById("own-err-" + sid);
      var litv = document.getElementById("own-lit-" + sid).value, ref;
      if (litv) ref = { lit: +litv };
      else ref = { title: document.getElementById("own-title-" + sid).value.trim(), url: document.getElementById("own-url-" + sid).value.trim(),
        date: document.getElementById("own-date-" + sid).value.trim() };
      var bad = ref.lit != null ? !CM3.citation(ref) : !(ref.title && /^https:\/\/\S+\.\S+/.test(ref.url) && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(ref.date));
      err.textContent = bad ? t3(ref.lit != null ? "ownRefusedLit" : "ownRefusedDoc") : "";
      if (!bad) v3write("owners", sid, ref).then(function (ok) { if (ok) v3deskPanel(); });
    }
  });
  desk.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "cm3open") { V3.onlyOpen = t.checked; v3deskSync(); return; }
    if (t.hasAttribute("data-mark")) {
      var p = t.getAttribute("data-mark").split("|"), cur = V3.store.isaret[p[0]] || {};
      var v = t.value === "" ? null : Math.max(0, Math.min(+t.max, Math.round(+t.value)));
      if (v != null && isNaN(v)) return;
      var body = { realX: cur.realX != null ? cur.realX : null, realY: cur.realY != null ? cur.realY : null };
      body[p[1]] = v;
      v3write("isaret", p[0], body);
    }
  });
}
function v3adminTabs(tabs) { return v3on("reviewDesk") ? tabs.concat([["dogrulama", t3("deskTab")]]) : tabs; }
function v3tabsOf(sec) { return sec === ADMIN ? v3adminTabs(sec.tabs) : sec.tabs; }

/* -------------------------------------------- Yöntem: verification status */
function v3statusTable() {
  var g = v3gates(), known = V3.storeState === "ok";
  var aud = CM3.registryAudit(D).filter(function (r) { return r.agrees === false; });
  var regDone = aud.filter(function (r) { return V3.store.registry[r.slug]; }).length;
  var flips = CM3.sensitivity(D).flips.length;
  var row = function (chk, line, word, res) {
    return "<tr><td>" + esc(chk) + '</td><td class="xsmall">' + esc(line) + '</td><td><span class="cm3-state ' + word + '">' + esc(t3(word)) + "</span></td><td class=\"num\">" + esc(res || "") + "</td></tr>";
  };
  var rv = function (k) { return known || g[k].done ? v3stateWord(g[k]) : "stUnknown"; };
  var h = row(t3("chkIlan"), t3("lineIlan", { x: CM3.pct1(CM3.PARAMS.noticePrecisionPass) }), rv("ilan"), t3("progress", { d: g.ilan.done, n: g.ilan.total })) +
    row(t3("chkYanki"), t3("lineYanki"), rv("yanki"), t3("progress", { d: g.yanki.done, n: g.yanki.total })) +
    row(t3("chkIsaret"), t3("lineIsaret", { x: CM3.pct1(CM3.PARAMS.markRealPass) }), rv("isaret"), t3("progress", { d: g.isaret.done, n: g.isaret.total })) +
    row(t3("chkRegistry"), t3("lineRegistry"), known ? (regDone === aud.length ? "stDecided" : "stAwait") : "stUnknown", t3("resRegistry", { d: regDone, n: aud.length })) +
    CM3.ownerGroups(D).map(function (gr) { return row(t3("chkOwner", { g: gr.label }), t3("lineOwner"), gr.source ? "stPass" : known ? "stAwait" : "stUnknown", gr.source ? gr.source.title : ""); }).join("") +
    row(t3("chkPanel"), t3("linePanel"), flips ? "stFail" : "stPass", t3("resPanel", { n: flips })) +
    row(t3("chkReaders"), t3("lineReaders"), "stNotRun", "");
  return '<section class="sec" data-cm3 id="cm3status"><h2>' + esc(t3("statusHead")) + '</h2><p class="sub">' + esc(t3("statusSub")) + "</p>" +
    '<div class="scroller panel"><table><thead><tr><th>' + esc(t3("stCheck")) + "</th><th>" + esc(t3("stLine")) + "</th><th>" + esc(t3("stState")) +
    "</th><th>" + esc(t3("stResult")) + "</th></tr></thead><tbody>" + h + "</tbody></table></div></section>";
}

/* -------------------------------------------- Yöntem: register and collection */
var V3_NOTE = { noSitemap: "noteNoSitemap", host: "noteHost", extraSitemap: "noteExtraSitemap", listing: "noteListing" };
function v3coverage() {
  var rows = CM3.coverage(D); if (!rows.length) return "";
  var has = rows.filter(function (r) { return r.state === "data"; }).length, placed = rows.filter(function (r) { return r.profiled; }).length;
  var order = { data: 0, noData: 1, pending: 2 };
  rows = rows.slice().sort(function (a, b) { return order[a.state] - order[b.state] || b.headlines - a.headlines || a.name.localeCompare(b.name, "tr"); });
  return '<section class="sec" data-cm3 id="skayit"><h2>' + esc(t3("covHead")) + '</h2><p class="sub">' + esc(t3("covSub", { n: rows.length, range: WIN.range })) + "</p>" +
    '<p class="cm3-gate-n num">' + esc(t3("covSummary", { a: has, p: placed, n: rows.length })) + "</p>" +
    '<div class="scroller panel"><table><thead><tr><th>' + esc(t3("covOutlet")) + "</th><th>" + esc(t3("covWindow")) + '</th><th class="r">' + esc(t3("covPlace")) +
    '</th><th class="r">' + esc(t3("covFeeds")) + "</th><th>" + esc(t3("covNote")) + "</th></tr></thead><tbody>" + rows.map(function (r) {
      var w = r.state === "data" ? t3("covHas", { n: r.headlines.toLocaleString("tr") }) : r.state === "noData" ? t3("noData") : t3("covPending");
      return '<tr><td><a class="lnk" href="' + esc(r.website) + '" target="_blank" rel="noopener">' + esc(r.name) + "</a></td>" +
        '<td><span class="cm3-state ' + (r.state === "data" ? "stPass" : r.state === "noData" ? "stAwait" : "stNotRun") + '">' + esc(w) + "</span></td>" +
        '<td class="r num">' + (r.placement == null ? "—" : r.placement) + '</td><td class="r num">' + r.feeds + "</td>" +
        '<td class="xsmall">' + r.notes.map(function (n) { return esc(t3(V3_NOTE[n.k], n.h ? { h: n.h } : null)); }).join(" ") + "</td></tr>";
    }).join("") + "</tbody></table></div></section>";
}

/* ------------------------------------------- attention: iridescent foil sticker
   Port of the IridescentFoil component (React + CSS module) to this page: the same layers
   (foil, film, pearl, content, shine, glare) and the same custom properties, updated from
   scroll and pointer in one requestAnimationFrame. Yellow is left out of the foil, because
   on this site yellow only ever marks a differing word. Reduced motion: static foil. */
function v3clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
function v3foilHTML(inner) {
  return '<div class="cm3-foil" data-foil><span aria-hidden="true" class="cm3-foil-l foil"></span><span aria-hidden="true" class="cm3-foil-l film"></span>' +
    '<span aria-hidden="true" class="cm3-foil-l pearl"></span><div class="cm3-foil-c">' + inner + '</div>' +
    '<span aria-hidden="true" class="cm3-foil-l shine"></span><span aria-hidden="true" class="cm3-foil-l glare"></span></div>';
}
function v3foilStart(el, mode) {
  if (V3.foilStop) V3.foilStop();
  if (!el) return;
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ptr = { x: 0.5, y: 0.5 }, frame = null;
  function set(k, v) { el.style.setProperty(k, v); }
  function progress() {
    if (mode === "document") {
      var se = document.scrollingElement || document.documentElement, range = se.scrollHeight - innerHeight;
      return range > 0 ? v3clamp(se.scrollTop / range, 0, 1) : 0;
    }
    var r = el.getBoundingClientRect(), span = innerHeight + r.height;
    return span > 0 ? v3clamp((innerHeight - r.top) / span, 0, 1) : 0;
  }
  function apply() {
    var p = progress(), x = ptr.x, y = ptr.y;
    set("--foil-shift", (p * 0.82 + (x - 0.5) * 0.18) * 100 + "%");
    set("--foil-y-shift", (p * 0.28 + (y - 0.5) * 0.12) * 100 + "%");
    set("--glare-x", x * 100 + "%"); set("--glare-y", y * 100 + "%");
    set("--pointer-x", x * 100 + "%"); set("--pointer-y", y * 100 + "%");
    set("--shine-angle", 105 + p * 80 + (x - 0.5) * 28 + "deg");
    set("--shine-opacity", String(0.56 + Math.abs(x - 0.5) * 0.24 + p * 0.12));
    frame = null;
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(apply); }
  function onMove(ev) {
    var r = el.getBoundingClientRect();
    ptr = { x: r.width ? v3clamp((ev.clientX - r.left) / r.width, 0.08, 0.92) : 0.5, y: r.height ? v3clamp((ev.clientY - r.top) / r.height, 0.08, 0.92) : 0.5 };
    schedule();
  }
  apply();
  if (still) { V3.foilStop = null; return; }
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  V3.foilStop = function () {
    removeEventListener("pointermove", onMove); removeEventListener("scroll", schedule); removeEventListener("resize", schedule);
    if (frame !== null) cancelAnimationFrame(frame);
    V3.foilStop = null;
  };
}

/* ------------------------------------------- attention: home hero */
function v3heroPool() {
  if (V3.heroPool) return V3.heroPool;
  var lead = leadEvent();
  var pool = D.E.filter(function (e) { var c = covOf(e); return e !== lead && !v3isIlanEvent(e) && c[0] && c[2] && defaultPair(e); })
    .sort(function (a, b) { return CM3.cmp(storyDay(b), storyDay(a)) || b.s.length - a.s.length; });
  // one event per day, most recent first, so the switcher walks back through the period
  var seen = {}, out = [lead];
  pool.forEach(function (e) { var d = storyDay(e); if (!seen[d] && out.length < 20) { seen[d] = 1; out.push(e); } });
  return (V3.heroPool = out);
}
function v3sticker(e) {
  var c = covOf(e);
  return v3foilHTML('<span class="k">' + esc(t3("stickerKicker")) + '</span><b class="d">' + esc(fmtD(storyDay(e) + "T00:00")) + "</b>" +
    '<span class="n num">' + esc(t3("stickerCount", { k: e.s.length })) + '</span><span class="n num">' + esc(t3("stickerBlocs", { l: c[0], r: c[2] })) + "</span>");
}
function v3heroShow(i) {
  var pool = v3heroPool(), n = pool.length;
  V3.heroI = (i + n) % n;
  var e = pool[V3.heroI], r = document.querySelector(".xhero-r"); if (!r) return;
  r.innerHTML = v3sticker(e) + '<p class="eyebrow">' + esc(fmtD(storyDay(e) + "T00:00")) + ' · <a class="lnk" href="#/olay?e=' + e.i + '">' + esc(e.t) + "</a></p>" +
    splitCard(e) + '<div class="cm3-hero-nav"><button type="button" class="chip" data-hero="-1" aria-label="' + esc(t3("heroPrev")) + '">←</button>' +
    '<span class="mono xsmall">' + esc(t3("heroPos", { i: V3.heroI + 1, n: n })) + '</span><button type="button" class="chip" data-hero="1">' + esc(t3("heroNext")) + " →</button>" +
    '<span class="cm3-legend xsmall"><mark class="mw">' + esc(t3("diffLabel")) + '</mark></span></div><p class="visually-hidden" aria-live="polite">' + esc(t3("heroLive", { t: e.t })) + "</p>";
  var cta = document.querySelector(".xhero-l .xbtn"); if (cta) cta.setAttribute("href", "#/olay?e=" + e.i);
  v3decorateSplits(r);
  v3foilStart(r.querySelector("[data-foil]"), "element");
}
function v3heroWire() {
  var r = document.querySelector(".xhero-r"); if (!r || r.getAttribute("data-wired")) return;
  r.setAttribute("data-wired", "1");
  r.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-hero]"); if (!b) return;
    v3heroShow(V3.heroI + +b.getAttribute("data-hero"));
    var nb = r.querySelector('[data-hero="' + b.getAttribute("data-hero") + '"]'); if (nb) nb.focus();
  });
  v3heroShow(V3.heroI || 0);
}

/* ------------------------------------------- attention: differing words on event cards */
function v3diffLine(e) {
  if (!v3on("attention")) return "";
  var pair = defaultPair(e); if (!pair) return "";
  var a = artOf(e, pair[0]), b = artOf(e, pair[1]); if (!a || !b) return "";
  var c = compareHeads(a, b); if (!c.markA.length && !c.markB.length) return "";
  var side = function (art, marks) {
    return '<span class="cm3-diff-s"><b>' + esc(srcName(art.s)) + "</b> " + (marks.length ? marks.map(function (w) { return '<mark class="mw">' + esc(w) + "</mark>"; }).join(" ") : "—") + "</span>";
  };
  return '<p class="cm3-diff" aria-label="' + esc(t3("diffLabel")) + '">' + side(a, c.markA) + side(b, c.markB) + "</p>";
}

/* ------------------------------------------------- after each render */
// Re-decorate the split view after 2.0's own onchange handler on a pair selector has run.
function v3redecorateOnChange(sel, view) {
  var s = $(sel); if (!s) return;
  var old = s.onchange;
  s.onchange = function () { if (old) old(); v3decorateSplits(view); };
}
/* ---------- Extended data (ADR-002). Present only when the page carries pipeline/extend.py's
   output (D.meta.v3); with 2.0's data nothing below draws. */
var V3MONTH = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
function v3day(d, add) {
  var t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + (add || 0)));
  return t.getUTCDate() + " " + V3MONTH[t.getUTCMonth()];
}
function v3ext() { return D.meta && D.meta.v3 && D.meta.v3.storedEnd ? D.meta.v3 : null; }
function v3extEventNote(e) {
  var x = v3ext(); if (!x) return "";
  if (e.auto) return '<div class="note" data-cm3 style="margin-top:14px"><b>Otomatik olay.</b> ' + v3day(x.storedEnd, 1) +
    " sonrasının başlıklarından, 2.0'ın belgelenmiş kümeleme kuralının yeniden kurulmuş hâliyle oluşturuldu. Elle yazılmış özet ve " +
    "anlatı kodlaması yok; başlık olaydaki en az yüklü başlık, konu en yakın kayıtlı konudan otomatik atandı, kör nokta işareti " +
    'belgelenmiş kuraldan, bu dönemin etkin kurumlarıyla (' + v3day(x.storedEnd, 1) + " sonrası " + x.activeDays + " günün en az yarısında verisi olan: " +
    (x.active.left || 0) + " sol, " + (x.active.mid || 0) + " merkez, " + (x.active.right || 0) + ' sağ) hesaplandı. <a class="lnk" href="#/yontem?s=2">Yöntem</a></div>';
  if (e.joined) return '<p class="xsmall" data-cm3 style="margin-top:8px">' + e.joined + " başlık bu olaya 2.0'dan sonra, aynı bağ kuralıyla " +
    "katıldı (2.0'da verisi olmayan kurumlardan ya da " + v3day(x.storedEnd, 1) + "–" + v3day(x.seamEnd) + " arasından). " +
    "Olayın 2.0 rakamları (yük, kör nokta) kayıtlı hâliyle duruyor.</p>";
  return "";
}
function v3extFeedNote() {
  var x = v3ext(); if (!x) return "";
  var auto = D.E.filter(function (e) { return e.auto; }).length;
  return '<div class="note" data-cm3 style="margin-top:14px">' + v3day(D.meta.v2.target.start) + " – " + v3day(x.storedEnd) +
    " arası olaylar 2.0'da kaydedildiği gibi duruyor; " + v3day(x.storedEnd, 1) + " – " + v3day(D.meta.v2.target.end) + " arası <b>" +
    auto.toLocaleString("tr") + " olay otomatik</b> kümelendi. " + v3day(x.storedEnd) + " sonrasında kurum başına günde en çok " +
    x.perDayCap + " haber toplandı ve spor, magazin, yaşam bölümleri alınmadı: günlük olay sayıları önceki günlerle bire bir karşılaştırılamaz.</div>";
}
function v3extMethod() {
  var x = v3ext(); if (!x) return "";
  var v = x.validation || {}, pct = function (r) { return r ? r[0].toLocaleString("tr") + " / " + r[1].toLocaleString("tr") : "—"; };
  var c = v.clustering || {}, un = x.unplaced || [];
  var got = {}; D.meta.sources.forEach(function (s) { got[s] = 1; });
  var zero = (D.R || []).filter(function (r) { return !got[r[0]]; }).map(function (r) { return r[1]; });
  var dec = function (n, k) { return n.toLocaleString("tr", { minimumFractionDigits: k, maximumFractionDigits: k }); };
  var rows = [["Başlık puanı ve kural eşleşmeleri (2.0'ın kendi kodu)", pct(v.headlineScore)],
    ["Olay başlığı: en az yüklü başlık, eşitlikte kısa olan", pct(v.eventTitle)],
    ["Olay anahtar kelimeleri", pct(v.eventWords)], ["Olay yük ortalaması", pct(v.eventLoad)],
    ["Neredeyse aynı başlık eşleşmeleri", pct(v.repeats)], ["Sol/sağ payları", pct(v.sideShares)], ["Kör nokta işareti", pct(v.blindSpot)],
    ["Bölüm (çapraz doğrulama)", v.sectionCV ? "%" + dec(100 * v.sectionCV, 1) : "—"],
    ["Siyasi haber işareti (çapraz doğrulama)", v.politicalCV ? "%" + dec(100 * v.politicalCV, 1) : "—"],
    ["Konu: tahmin kayıtlı konulardan biri (çapraz doğrulama)", v.topicCV ? "%" + dec(100 * v.topicCV, 1) : "—"],
    ["Kümeleme, başlık çifti F1 (eşik " + dec(x.threshold, 2) + ")", c.pair_f1 != null ? dec(c.pair_f1, 3) + " (kesinlik " + dec(c.pair_precision, 3) + ", duyarlılık " + dec(c.pair_recall, 3) + ")" : "—"]];
  return '<section class="sec" data-cm3><h3>2.4 Verinin ' + v3day(D.meta.v2.target.end) + "'e genişletilmesi</h3>" +
    "<p>2.0'ın verisi " + v3day(D.meta.v2.target.start) + " – " + v3day(x.storedEnd) + " arasını kapsıyordu. Bu sürümde toplayıcının güncel kaydındaki " +
    "kurumlar " + v3day(D.meta.v2.target.end) + "'e kadar eklendi. 2.0'ın olayları, özetleri, anlatı kodlaması ve konuları değiştirilmedi. " +
    "2.0'da verisi olmayan kurumların başlıkları ve " + v3day(x.storedEnd, 1) + "–" + v3day(x.seamEnd) + " başlıkları kayıtlı olaylara yalnızca " +
    "kümelemenin bağ kuralıyla katılabildi (" + x.joined.toLocaleString("tr") + " başlık). " + v3day(x.storedEnd, 1) + " sonrası, 2.0'ın belgelenmiş " +
    "kümeleme yönteminin yeniden kurulmuş hâliyle kümelendi (" + x.newEvents.toLocaleString("tr") + " olay). Belgelenmemiş bağ eşiği, yeniden kurulumun 2.0'ın " +
    "kayıtlı olaylarını en iyi verdiği değere ayarlandı.</p>" +
    '<div class="scroller panel"><table><thead><tr><th>Yeniden kurulan kural · 2.0\'ın kayıtlı değerleriyle uyum</th><th class="r">Uyum</th></tr></thead><tbody>' +
    rows.map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td class="r num">' + esc(r[1]) + "</td></tr>"; }).join("") +
    '</tbody></table></div><p class="xsmall" style="margin-top:8px">Tablo 2. Her kural, 2.0\'ın kayıtlı verisinde, hiçbir şey eklenmeden önce sınandı.</p>' +
    "<p>Kayıt defterinin yerleştirmediği " + un.length + " kurum (" + esc(un.map(srcName).join(", ")) + ") olay sayılarına girer ama hiçbir bloğa " +
    "konmaz: sol/merkez/sağ sayımlarına, kör nokta testine ve blok karşılaştırmalarına alınmaz. " +
    (zero.length ? "Kayıttaki " + zero.length + " kurumdan bu dönem için hiç başlık alınamadı (" + esc(zero.join(", ")) + "): sunucu toplayıcının " +
    "isteklerini reddetti, site haritası bulunamadı ya da yalnızca dönem dışı günleri listeliyor (kurum kurum durum: <a class=\"lnk\" href=\"#/yontem?s=kayit\">kayıt tablosu</a>). " : "") +
    "Yük ve kural değerleri her başlık için 2.0'ın sayfadaki kodu çalıştırılarak hesaplandı; İleri analiz ve anlatı kodlaması " +
    v3day(D.meta.v2.target.start) + " – " + v3day(x.storedEnd) + " verisine aittir.</p></section>";
}

function v3After(path, tab, params) {
  var view = document.getElementById("view"); if (!view) return;
  if (V3.foilStop && path !== "/") V3.foilStop();
  document.body.classList.toggle("cm3-attn", v3on("attention"));
  if (v3on("attention") && path === "/") v3heroWire();
  function add(node, where, html) { if (node && html) node.insertAdjacentHTML(where, html); }

  if (v3on("panelHealth")) {
    if (path === "/olaylar" && tab === "kor") add(view.querySelector(".note"), "afterend", v3panelHealth());
    if (path === "/") add(view.querySelector(".xink .sub"), "beforeend", " " + v3panelLine());
    if (path === "/olay" && EV[params.e]) add(view.querySelector(".xpanel .xsmall"), "beforeend", " " + v3panelLine());
    if (path === "/bulgular" && tab === "temel") {
      [].forEach.call(view.querySelectorAll(".find"), function (s) {
        var n = s.querySelector(".find-n"); if (n && n.textContent === "03") add(s.querySelector(".bignum-l"), "beforeend", " · " + v3panelLine());
      });
    }
    if (path === "/yontem") add(document.getElementById("s5"), "afterend", "<p>" + v3panelLine() + "</p>");
  }

  if (v3on("noticeSplit") && path === "/olaylar" && tab === "ilan") v3noticeWire(view);
  if (v3on("noticeSplit") && path === "/kurum" && params.s && v3N().byOutlet[params.s]) {
    var g = view.querySelector(".grid.g3");
    if (g) { add(g, "afterend", v3outletNoticeTabs(params.s)); v3wireTabs(view.querySelector("#cm3nt")); }
  }

  if (v3ext()) {
    if (path === "/olay" && EV[params.e]) add(view.querySelector(".xh1"), "afterend", v3extEventNote(EV[params.e]));
    if (path === "/olaylar" && (!tab || tab === "liste")) add(view.querySelector(".phead"), "beforeend", v3extFeedNote());
    if (path === "/yontem") add(document.getElementById("s3"), "beforebegin", v3extMethod());
  }

  if (path === "/olay" && EV[params.e]) {
    var e = EV[params.e];
    if (v3on("ownerVoices")) add(view.querySelector(".xh1"), "afterend", v3voices(e));
    if (v3on("echoChain")) {
      add(view.querySelector("#alist"), "afterend", v3echo(e));
      add(view.querySelector(".divg"), "afterend", '<p class="xsmall" data-cm3>' + esc(t3("countedOnce")) + "</p>");
    }
    if (v3on("appeal")) {
      var mf = document.getElementById("markflag"); if (mf) mf.hidden = true;
      v3redecorateOnChange("#spA", view); v3redecorateOnChange("#spB", view);
    }
  }
  if (path === "/kurumlar" && tab === "karsilastir" && v3on("appeal")) {
    v3redecorateOnChange("#cmpA", view); v3redecorateOnChange("#cmpB", view);
  }
  if (path === "/yanlilik" && tab === "turkiye" && v3on("echoChain")) {
    var hs = [].filter.call(view.querySelectorAll("section.sec"), function (s) { return s.querySelector(".note.warn"); })[0];
    add(hs, "beforebegin", v3flowTable());
  }
  if (v3on("evidence") && path === "/yanlilik" && tab === "turkiye") {
    var lit = [].filter.call(view.querySelectorAll("section.sec"), function (s) { return /Bu bölümün dayandığı araştırmalar/.test(s.textContent); })[0];
    add(lit || view.lastElementChild, "afterend", v3literature());
  }
  if (v3on("evidence") && path === "/yontem") add(view.querySelector("section.xwalk"), "afterend", v3methodSection());
  if (v3on("register") && path === "/yontem") {
    add(document.getElementById("cm3status") || document.getElementById("cm3method") || view.querySelector("section.xwalk"), "afterend", v3coverage());
    if (params.s === "kayit") { var kt = document.getElementById("skayit"); if (kt) setTimeout(function () { kt.scrollIntoView({ block: "start" }); }, 40); }
  }
  if (v3on("reviewDesk")) {
    v3bindStore();
    if (path === "/yontem") add(document.getElementById("cm3method") || view.querySelector("section.xwalk"), "afterend", v3statusTable());
    if (path === "/yonetim" && params.t === "dogrulama") {
      // The 2.0 admin banner says notes stay in this browser; on the desk that is not true.
      var bar = document.querySelector(".admbar .wrap"); if (bar) bar.textContent = t3("deskBar");
      v3deskWire(); v3deskPanel();
    }
  }
  v3decorateSplits(view);

  // The artifact link cannot carry ?shadow=1, so the footer offers the preview as an in-page link.
  var fb = document.querySelector(".xfoot-b");
  if (fb && !V3.shadow && CM3.CONFIG.previewLink) fb.insertAdjacentHTML("beforeend", '<a class="footlink-adm" data-cm3 href="#/?shadow=1">' + esc(t3("previewOn")) + "</a>");
  var bar = document.getElementById("cm3pv");
  if (V3.shadow && !bar) {
    document.body.insertAdjacentHTML("beforeend", '<div id="cm3pv" class="cm3-pv" data-cm3 role="status">' + esc(t3("preview")) +
      ' <a href="#/?shadow=0">' + esc(t3("previewOff")) + "</a></div>");
  } else if (!V3.shadow && bar) bar.remove();
}

function route() {
  v3readShadow();
  v3scrub();
  var raw = location.hash.replace(/^#/, "") || "/";
  var qi = raw.indexOf("?"), params = {}, path = raw;
  if (qi >= 0) {
    path = raw.slice(0, qi);
    raw.slice(qi + 1).split("&").forEach(function (pair) {
      var kv = pair.split("=");
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });
  }
  var det = DETAIL[path];
  var sec = secFor(path);
  var fn = det ? det.fn : sec.fn;
  var tab = det ? null : tabOf(sec, params);
  var home = false;
  var admin = path === ADMIN.p;
  document.body.classList.toggle("admin", admin);

  var skip = '<a class="skip visually-hidden focusable" href="#view">İçeriğe atla</a>';
  document.getElementById("app").innerHTML = skip + (admin
    ? adminShell(tab) + '<main id="view" tabindex="-1">' + fn(params) + "</main>" + adminFoot()
    : navHTML(path, home, tab) + '<main id="view" tabindex="-1">' + fn(params) + "</main>" + footer2());
  closeModal();
  scrollTo(0, 0);
  if (!admin) layoutPills();
  if (home) { var cv = document.getElementById("acid"); if (cv) startAcid(cv); }
  else if (acid) { acid.stop(); acid = null; }

  var put = function (id, node) { var t = document.getElementById(id); if (t && node) t.appendChild(node); };

  if (home) {
    var pick = $("#pick");
    var first = topStories(14)[0];
    if (first) renderStory(first.i);
    if (pick) {
      [].forEach.call(pick.querySelectorAll("[data-e]"), function (btn) {
        btn.onclick = function () {
          [].forEach.call(pick.querySelectorAll("[data-e]"), function (o) {
            o.setAttribute("aria-pressed", o === btn ? "true" : "false"); });
          renderStory(btn.getAttribute("data-e"));
        };
      });
    }
  }

  if (path === "/olaylar" && tab === "liste") {
    renderEvents();
    var es = $("#esort"); if (es) es.onchange = renderEvents;
    var eq = $("#esearch"); if (eq) eq.oninput = renderEvents;
    [].forEach.call(document.querySelectorAll("[data-ev]"), function (b) {
      b.onclick = function () {
        EVVIEW = b.getAttribute("data-ev");
        [].forEach.call(document.querySelectorAll("[data-ev]"), function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        renderEvents();
      };
    });
  }

  if (path === "/kurumlar" && tab === "genel") {
    put("cmean", barChart(LIVE.map(function (k) {
      return { label: SRC[k] ? SRC[k].n : k, value: +(STAT[k].mean || 0).toFixed(1),
        color: seq((STAT[k].mean || 0) * 3),
        tip: "<span class='k'>" + esc(SRC[k] ? SRC[k].n : k) + "</span>Ortalama " +
          (STAT[k].mean || 0).toFixed(1) + " · " + STAT[k].pol + " siyasi haber" }; })
      .sort(function (x, y) { return y.value - x.value; }), { padL: 132 }));
    var kk = {}; D.A.forEach(function (x) { x.k.forEach(function (k) { kk[k] = (kk[k] || 0) + 1; }); });
    put("ckeys", barChart(Object.keys(kk).sort(function (x, y) { return kk[y] - kk[x]; })
      .map(function (k) {
        return { label: BIA[k] ? BIA[k].en : k, value: kk[k],
          tip: "<span class='k'>" + esc(BIA[k] ? BIA[k].en : k) + " · " +
            esc(BIA[k] ? BIA[k].tr : "") + "</span>" + esc(BIA[k] ? BIA[k].df : "") }; }),
      { padL: 210 }));
    put("cheat", topicHeat());
    put("cspread", spreadChart(D.E.slice().sort(function (x, y) { return y.p - x.p; }).slice(0, 26)));
  }
  /* The coverage matrix answers a collection question, not a framing one, so it
     sits with the rest of the collection evidence on the method page. */
  if (path === "/yontem") {
    put("cmat", matrixChart(LIVE.slice().sort(function (x, y) { return STAT[y].n - STAT[x].n; })));
  }
  if (path === "/kurumlar" && tab === "liste") {
    renderSources();
    $("#ssearch").oninput = renderSources; $("#ssort").onchange = renderSources;
  }
  if (path === "/kurumlar" && tab === "karsilastir") {
    var selA = $("#cmpA"), selB = $("#cmpB");
    if (selA && selB) {
      /* Open on a pair that actually has shared stories and a real gap, so the
         view demonstrates itself instead of starting empty. */
      var best = null;
      LIVE.forEach(function (x) {
        LIVE.forEach(function (y) {
          if (x >= y) return;
          var n = 0, gap = 0;
          D.E.forEach(function (e) {
            if (e.s.indexOf(x) < 0 || e.s.indexOf(y) < 0) return;
            var fb = firstBy(e), ax = fb[x], ay = fb[y];
            if (ax && ay) { n++; gap += Math.abs(ax.v - ay.v); }
          });
          if (n >= 3 && (!best || gap > best.gap)) best = { x: x, y: y, gap: gap };
        });
      });
      if (best) { selA.value = best.x; selB.value = best.y; }
      selA.onchange = renderCompare; selB.onchange = renderCompare;
      renderCompare();
    }
  }
  if (path === "/kurumlar" && tab === "guven") {
    /* One figure, not two. The polarisation gap is a DISTANCE between two
       numbers, so it is drawn as one: the left dot is what the general public
       gives the outlet, the right dot what its own readers give it, and the
       line between them is the gap itself. Two bar charts made the reader hold
       one ranking in memory while scanning the other. */
    var wt = D.S.filter(function (x) { return x.risj && x.risj.trustUsed != null &&
      x.risj.trust != null; }).sort(function (x, y) {
        return (y.risj.trustUsed - y.risj.trust) - (x.risj.trustUsed - x.risj.trust); });
    put("ctrust", dumbbellChart(wt.map(function (x, i) {
      return { label: x.n, focal: i === 0,
        a: { v: x.risj.trust, c: "var(--muted)" },
        b: { v: x.risj.trustUsed, c: lean(x.lean) },
        gapLabel: "+" + (x.risj.trustUsed - x.risj.trust).toFixed(2),
        href: "/kurum?s=" + x.s,
        tip: "<span class='k'>" + esc(x.n) + "</span>Herkesin verdiği güven " +
          x.risj.trust.toFixed(2) + " · kendi okurunun verdiği " + x.risj.trustUsed.toFixed(2) +
          "<br>Aradaki fark " + (x.risj.trustUsed - x.risj.trust).toFixed(2) + " puan" };
    }), { min: 4, max: 8, ticks: [4, 5, 6, 7, 8], padL: 128, padR: 88,
      axis: "eksen 4–8 arasına kırpıldı — tam ölçek 0–10" }));
  }

  if (path === "/kurum") {
    var st2 = STAT[params.s];
    if (st2) {
      var corpusPol = 0, corpusRate = {};
      D.A.forEach(function (x) {
        if (!x.p) return; corpusPol++;
        x.k.forEach(function (k) { corpusRate[k] = (corpusRate[k] || 0) + 1; });
      });
      var mine = {};
      D.A.forEach(function (x) {
        if (x.s !== params.s || !x.p) return;
        x.k.forEach(function (k) { mine[k] = (mine[k] || 0) + 1; });
      });
      var fp = Object.keys(mine).map(function (k) {
        var mr = mine[k] / Math.max(1, st2.pol), ar = corpusRate[k] / Math.max(1, corpusPol);
        return { label: BIA[k] ? BIA[k].en : k, value: ar ? +(mr / ar).toFixed(2) : 0,
          display: (ar ? (mr / ar).toFixed(1) : "0") + "×",
          color: (ar && mr / ar >= 1.6) ? "var(--seq4)" : (ar && mr / ar >= 1) ? "var(--seq3)" : "var(--seq2)",
          tip: "<span class='k'>" + esc(BIA[k] ? BIA[k].en : k) + "</span>" +
            mine[k] + " başlıkta · bütün haberlerin ortalamasının " +
            (ar ? (mr / ar).toFixed(1) : "0") + " katı" };
      }).sort(function (x, y) { return y.value - x.value; });
      if (fp.length) put("cfp", barChart(fp, { padL: 200, ref: 1,
        refLabel: "1.0× bütün haberlerin ortalaması", axis: "bütün haberlerin ortalamasına oran" }));
      put("sdays", barChart(DAYS.map(function (d) {
        return { label: fmtD(d + "T00:00"), value: st2.days[d] || 0 }; }), { padL: 66 }));
    }
    var sa = $("#srcarts"); if (sa) wireDevices(sa);
  }

  if (path === "/olay") { var vw = $("#view"); if (vw) wireDevices(vw); }

  if (path === "/harita") renderAtlas();
  if (path === "/harita" && tab === "atlas") {
    put("pcoord", parallelCoords());
    var nnBox = $("#nn");
    if (nnBox) {
      var pairs = [];
      for (var i = 0; i < D.S.length; i++) for (var j = i + 1; j < D.S.length; j++) {
        var aS = D.S[i], bS = D.S[j], d2 = 0, okAll = true;
        PCAX.forEach(function (ax) {
          if (aS[ax[0]] == null || bS[ax[0]] == null) okAll = false;
          else d2 += Math.pow(aS[ax[0]] - bS[ax[0]], 2);
        });
        if (okAll) pairs.push({ a: aS, b: bS, d: Math.sqrt(d2) });
      }
      pairs.sort(function (x, y) { return x.d - y.d; });
      nnBox.innerHTML = '<div class="scroller panel"><table><thead><tr><th>Kurum</th>' +
        '<th>En yakın kurum</th><th class="r">Mesafe</th><th>Yerleşim farkı</th>' +
        "</tr></thead><tbody>" + pairs.slice(0, 14).map(function (pr) {
          return "<tr><td><b>" + esc(pr.a.n) + "</b></td><td><b>" + esc(pr.b.n) + "</b></td>" +
            '<td class="r num">' + pr.d.toFixed(1) + "</td>" +
            '<td class="num" style="color:var(--muted)">' + pr.a.lean + " → " + pr.b.lean +
            " (" + Math.abs(pr.a.lean - pr.b.lean) + ")</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
  }
  if (path === "/anlati") {
    var keysN = narrWeekKeys(params);
    var cur = params.n && D.N[params.n] ? params.n : keysN[0];
    NARRVIEW = "flow";
    narrBox(cur);
    [].forEach.call(document.querySelectorAll("[data-narr]"), function (bt) {
      bt.setAttribute("aria-pressed", bt.getAttribute("data-narr") === cur ? "true" : "false");
      bt.onclick = function () {
        cur = bt.getAttribute("data-narr");
        [].forEach.call(document.querySelectorAll("[data-narr]"), function (o) {
          o.setAttribute("aria-pressed", o === bt ? "true" : "false"); });
        narrBox(cur);
      };
    });
    [["#vflow", "flow"], ["#vcard", "cards"], ["#vtable", "table"]].forEach(function (pair) {
      var bt = $(pair[0]); if (!bt) return;
      bt.onclick = function () {
        NARRVIEW = pair[1];
        ["#vflow", "#vcard", "#vtable"].forEach(function (sel) {
          var o = $(sel); if (o) o.setAttribute("aria-pressed", sel === pair[0] ? "true" : "false");
        });
        narrBox(cur);
      };
    });
    var bch = blameChart(); if (bch) put("cblame", bch);
    else { var cb = $("#cblame");
      if (cb) cb.innerHTML = '<p style="color:var(--muted);font-size:13.5px">' +
        "Kodlanmış olaylarda sorumluluk atfı yeterince az; grafik çizilmedi.</p>"; }
  }

  if (path === "/bulgular") {
    /* Each finding carries its own draw function, so a figure on this page is
       always built for the claim above it rather than borrowed from another
       page and left for the reader to reinterpret. */
    findings().forEach(function (f) { if (f.chart && f.draw) put(f.chart, f.draw()); });
  }

  if (path === "/yanlilik" && tab === "kutuphane") {
    BTIER = "all";
    renderBiasList();
    var bq = $("#bq"); if (bq) bq.oninput = renderBiasList;
    [].forEach.call(document.querySelectorAll("[data-tier]"), function (bt) {
      bt.onclick = function () {
        BTIER = bt.getAttribute("data-tier");
        [].forEach.call(document.querySelectorAll("[data-tier]"), function (o) {
          o.setAttribute("aria-pressed", o === bt ? "true" : "false"); });
        renderBiasList();
      };
    });
  }
  if (path === "/yanlilik" && tab === "kesif") {
    renderExpPanel();
    renderBiasList();
    var xq = $("#expq");
    if (xq) xq.oninput = function () { EXPQ = xq.value; route(); };
    [].forEach.call(document.querySelectorAll("[data-exp]"), function (el2) {
      el2.onclick = function () {
        EXPKEY = el2.getAttribute("data-exp");
        [].forEach.call(document.querySelectorAll("[data-exp]"), function (o) {
          o.classList.toggle("on", o === el2); });
        renderExpPanel();
        var pn = $("#exppanel"); if (pn) pn.scrollIntoView({ block: "nearest" });
      };
    });
    var bq2 = $("#bq"); if (bq2) bq2.oninput = renderBiasList;
    [].forEach.call(document.querySelectorAll("[data-tier]"), function (c) {
      c.onclick = function () {
        BTIER = c.getAttribute("data-tier");
        [].forEach.call(document.querySelectorAll("[data-tier]"), function (o) {
          o.setAttribute("aria-pressed", o === c ? "true" : "false"); });
        renderBiasList();
      };
    });
  }

  if (path === "/yanlilik" && tab === "cozumleyici") {
    var inp = $("#anin");
    if (inp) inp.oninput = runAnalyzer;
    var ex = $("#anex");
    if (ex) {
      var picks = [];
      [80, 45, 25, 9].forEach(function (floor) {
        var c2 = D.A.filter(function (x) {
          return x.v >= floor && x.v < floor + 40 && x.t.length < 92; })
          .sort(function (x, y) { return y.v - x.v; })[0];
        if (c2 && picks.indexOf(c2) < 0) picks.push(c2);
      });
      ex.innerHTML = picks.map(function (x, i) {
        return '<button class="ex-btn" data-ex="' + i + '">' +
          esc(SRC[x.s] ? SRC[x.s].n : x.s) + " · " + x.v + "</button>"; }).join("");
      [].forEach.call(ex.querySelectorAll("[data-ex]"), function (bt) {
        bt.onclick = function () {
          inp.value = picks[+bt.getAttribute("data-ex")].t; runAnalyzer(); };
      });
      if (picks.length) { inp.value = picks[0].t; runAnalyzer(); }
    }
  }

  if (path === "/yonetim" && tab === "inceleme") {
    renderQueue();
    ["#qsearch", "#qstat", "#qpri"].forEach(function (sel) {
      var e2 = $(sel); if (!e2) return;
      e2[sel === "#qsearch" ? "oninput" : "onchange"] = renderQueue;
    });
  }

  v2After(path, tab, params); v2bAfter(path, tab, params); v2cAfter(path, tab, params); v3After(path, tab, params);
  var b3 = document.getElementById("burger"), mm = document.getElementById("mobmenu");
  if (b3) b3.onclick = function () {
    var open = mm.classList.toggle("open");
    b3.setAttribute("aria-expanded", open ? "true" : "false");
  };
  var th = document.getElementById("theme");
  if (th) th.onclick = function () {
    var cur2 = document.documentElement.getAttribute("data-theme");
    var next = cur2 === "dark" ? "light" : cur2 === "light" ? "dark" :
      matchMedia("(prefers-color-scheme:dark)").matches ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("yh-theme", next); } catch (e) {}
  };
}

/* The measures are exposed for inspection. This is a research tool: anyone
   who wants to check a published number should be able to recompute it in the
   console against the same data the page used, rather than take it on trust. */
window.CM = { data: D, actorMatrix: actorMatrix, actorsOf: actorsOf,
  valueProfile: valueProfile, valueHits: valueHits, VALUES: VALUES,
  yanatmaTest: yanatmaTest, deviationProfile: deviationProfile,
  timingProfile: timingProfile, registerCheck: registerCheck,
  blameStats: blameStats, findings: findings, runRules: runRules };

try { var t = localStorage.getItem("yh-theme");
  document.documentElement.setAttribute("data-theme", t || "light"); } catch (e) { document.documentElement.setAttribute("data-theme", "light"); }
addEventListener("hashchange", route);
addEventListener("resize", function () { clearTimeout(window._lt); window._lt = setTimeout(layoutPills, 120); });
route();
})();
