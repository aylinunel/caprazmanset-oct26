/* Çapraz Manşet headline rules — the single scorer shared by the public analyser and the
   analysis pipeline (ADR-0002). Moved verbatim from the 4.0 renderer; any change here is a
   versioned change that re-scores the corpus (bump RULES_VERSION).

   The same surface tests as src/rules.mjs, so the live analyser and the corpus
   agree. Quoted spans are stripped before outlet-voice tests: an outlet that
   reports someone else's epithet has not adopted it. The boundary-aware pattern
   matters in Turkish, where an apostrophe marks a suffix (Suriye'nin) and a
   naive quote-pair regex swallows whole clauses. */
var RULES_VERSION = "4.0";
var RULEDEF = [
  ["ad-hominem", "Kurumun kendi sesiyle bir aktöre yönelttiği sıfat", 1,
    ["haydut","katil","soykırımcı","fırıldak","hain","satılmış","sözde","densiz","zavallı","işgalci","diktatör","terörist"]],
  ["illusory-truth", "Arka plan olgusu gibi kullanılan kalıcı niteleme", 1,
    ["katil","soykırımcı","işgalci","terörist"]],
  ["in-group-bias", "Argüman yerine kimlik etiketi", 0,
    ["gezi kafası","gezi kafasından","zihniyeti","yandaş","besleme","dış güçler","yerli ve milli"]],
  ["fear-appeal", "Olasılık belirtmeden tehdit ya da felaket sözcüğü", 0,
    ["tabut","felaket","facia","cehennem","kabus","yıkım","çöküş","tehlike","savaş","panik","kriz","tırmanıyor"]],
  ["bandwagon-effect", "Ölçüsü verilmeyen bütünlük iddiası", 0,
    ["tüm dünya","dünyanın gözü","herkes","milyonlar","büyük çoğunluk","kimse itiraz","el pençe divan"]],
  ["halo-effect", "Karşılaştırma noktası olmayan üstünlük iddiası", 0,
    ["geride bıraktı","dev atılım","zirvede","rekor","tarihi"]],
  ["responsibility-framing", "Süreç bitmeden niyet varsayan fiil", 0,
    ["kaçarken","kaçan","itiraf","çelişkili","pes dedirten","yakayı ele verdi"]],
  ["metaphorical-framing", "Olayı yeniden düzenleyen mecaz", 0,
    ["tabut","cehennem","kabus","çark","zehir zemberek","bomba","el pençe divan","geliyorum demiş","gözü"]],
  ["authority-bias", "Adı verilmeyen otoriteye atıf", 0,
    ["yetkililer","kaynaklar","kulis","iddia edildi","öğrenildi","bildirildi","baskı arttı","dikkat çeken"]]
];
function unquoted(t) {
  return t.replace(/(^|[\s(:,–—-])['‘"“]([^'‘’"“”]{1,60})['’"”](?=[\s).,:;!?]|$)/g, "$1 ");
}
function runRules(headline) {
  var t = (headline || "").toLocaleLowerCase("tr");
  var voice = unquoted(t), out = [];
  RULEDEF.forEach(function (r) {
    var src = r[2] ? voice : t;
    var hits = r[3].filter(function (w) { return src.indexOf(w) >= 0; });
    if (hits.length) out.push({ key: r[0], rule: r[1], ev: hits });
  });
  var lead = (headline || "").split(/[:\-–—]/)[0];
  if (/\d[\d.,]*\s*(milyon|milyar|bin|tl|kişi|sayfa|saat)/i.test(lead))
    out.push({ key: "anchoring-bias", rule: "Öne çekilmiş nicelik", ev: [lead.trim()] });
  var m = {};
  out.forEach(function (r) { if (m[r.key]) m[r.key].ev = m[r.key].ev.concat(r.ev); else m[r.key] = r; });
  return Object.keys(m).map(function (k) { return m[k]; });
}
var WEIGHTS = { "ad-hominem": 34, "illusory-truth": 32, "strawman": 28, "in-group-bias": 16,
  "fear-appeal": 15, "responsibility-framing": 14, "metaphorical-framing": 13,
  "consequence-framing": 10, "halo-effect": 12, "bandwagon-effect": 12, "cherry-picking": 12,
  "just-world": 10, "anchoring-bias": 9, "authority-bias": 6 };
function runScore(text, keys) {
  var VOICE = ["ad-hominem", "illusory-truth", "strawman"];
  var REORG = ["fear-appeal","responsibility-framing","metaphorical-framing","consequence-framing","in-group-bias","just-world"];
  var INFL = ["bandwagon-effect", "halo-effect", "cherry-picking"];
  var has = function (l) { return keys.some(function (k) { return l.indexOf(k) >= 0; }); };
  var v = 5;
  keys.forEach(function (k) { v += WEIGHTS[k] == null ? 8 : WEIGHTS[k]; });
  if (has(VOICE) && has(REORG)) v += 14;
  if (has(INFL) && keys.length >= 2) v += 14;
  v += Math.min(2, (text.match(/!/g) || []).length) * 5;
  if (/['‘’"“”].{2,40}['‘’"“”]/.test(text)) v += 4;
  return Math.max(0, Math.min(100, Math.round(v)));
}

var BANDS = [
  { max: 9, k: "wire", tr: "Ajans aktarımı" }, { max: 24, k: "idiom", tr: "Haber kalıbı" },
  { max: 44, k: "loaded", tr: "Tek yüklü unsur" }, { max: 64, k: "framed", tr: "Sürekli çerçeveleme" },
  { max: 84, k: "attack", tr: "Saldırgan çerçeveleme" }, { max: 100, k: "sustained", tr: "Sürekli saldırı" }
];
function bandOf(v) { for (var i = 0; i < BANDS.length; i++) if (v <= BANDS[i].max) return BANDS[i]; return BANDS[5]; }

/* Evidence strength, derived the same way for a pasted headline and a corpus headline. */
var AMB = ["savaş", "kriz", "tehlike", "rekor", "tarihi", "bomba", "gözü", "herkes",
  "milyonlar", "bildirildi", "öğrenildi"];
function evidenceOf(text, hits) {
  var stripped = unquoted(String(text || "").toLocaleLowerCase("tr"));
  return hits.map(function (r) {
    var own = r.ev.some(function (t) { return stripped.indexOf(String(t).toLocaleLowerCase("tr")) >= 0; });
    var spec = r.ev.some(function (t) { return AMB.indexOf(String(t).toLocaleLowerCase("tr")) < 0; });
    var lvl = (own && spec && r.ev.length > 1) ? "güçlü" : (own && spec) ? "orta" : "zayıf";
    return { key: r.key, ev: r.ev, level: lvl, own: own, spec: spec };
  });
}

/* One call for the pipeline: everything stored per text. */
function scoreText(text) {
  var hits = runRules(text);
  var keys = hits.map(function (r) { return r.key; });
  var v = runScore(String(text || ""), keys);
  return { k: keys, v: v, b: bandOf(v).k, hits: hits, evidence: evidenceOf(text, hits) };
}

/* Browser: plain globals when inlined. Node: module.exports. */
if (typeof module !== "undefined" && module.exports) module.exports = { RULES_VERSION: RULES_VERSION, RULEDEF: RULEDEF,
  WEIGHTS: WEIGHTS, BANDS: BANDS, unquoted: unquoted, runRules: runRules, runScore: runScore, bandOf: bandOf,
  evidenceOf: evidenceOf, scoreText: scoreText };
