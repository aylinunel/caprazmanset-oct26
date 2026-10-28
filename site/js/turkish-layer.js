/* =====================================================================
   Çapraz Manşet 3.0 — Turkish layer (T1–T7) and the appeal adapter.

   Every function here is a pure function of the data (D) and PARAMS, so the
   interface and the tests call the same code. Nothing in this file touches
   the DOM. The only code that can touch the network is appeal.submit, and it
   does so only when CONFIG.correctionEndpoint is set (it is null).
   ===================================================================== */
(function (root) {
"use strict";

/* ------------------------------------------------------------- settings */
var PARAMS = {
  // Bloc cut-offs: the site's own rule (2.0 bloc() and lean()). Validated: unchanged from 2.0.
  blocLeftBelow: 45, blocRightAbove: 55,
  // T1: how each English register label maps to a bloc. Claude's reading of the labels,
  // not validated; "Varied"/"Mixed" carry no bloc and are not compared.
  labelBloc: { "Center-left": "left", "Center-right": "right", "Secular-right": "right",
    "Pro-government": "right", "Conservative": "right", "Nationalist": "right", "Center": "mid",
    "Varied": null, "Mixed": null },
  // T2: existing 2.0 rule (validated: reproduces the 16-outlet active set).
  minDays: 20,
  // T2: starting guess, not validated. Needs Aylin's approval after the sensitivity run.
  minEventShare: 0.05,
  // T2: switched off. Per-day figures are reported so a floor can be proposed.
  minPerDay: null,
  // T3: notice rules kept as data (from the build brief, not validated by a reviewer yet).
  // T3, rule v2 (27 Oct 2026). v1 matched "ilanlar" inside news slugs ("/ilanlarda-yeni-donem") and missed
  // tenders and municipal notices. v2 matches a whole notice path segment, and adds the issuing-body words that
  // appear in all-capitals notice titles. Checked by hand on every embedded headline; not reviewer-validated.
  noticeRules: { url: "\\/(resmi-?ilan(lar)?|ilan|ilanlar)(\\/|$)",
    keywords: ["MAHKEMESİ", "HAKİMLİĞİ", "SATIŞ MEMURLUĞU", "İCRA DAİRESİ", "İCRA MÜDÜRLÜĞÜ", "BELEDİYE BAŞKANLIĞI",
      "BELEDİYE BŞK", "BAŞKANLIĞI", "MÜDÜRLÜĞÜ", "İDARESİ", "ALIM İŞİ", "İHALE"] },
  // T3, rule v1: the build brief's rule. Kept so the brief's reference counts stay checkable (tests/golden.test.js).
  noticeRulesV1: { url: "resmi-?ilan|\\/ilan\\/|\\/ilanlar",
    keywords: ["MAHKEMESİ", "SATIŞ MEMURLUĞU", "İCRA DAİRESİ", "HAKİMLİĞİ"] },
  // T3: an event with at least this notice share is an "ilan olayı" (from the brief, starting guess).
  ilanEventShare: 0.5,
  // T3: a clean event keeps this many distinct outlets after notices are removed (2.0's event floor).
  cleanMinOutlets: 5,
  // T3: proposed pass line for the reviewer's precision score; Aylin to adjust.
  noticePrecisionPass: 0.9,
  // T7: the plan's pass line: 90 of 100 marked words are a real wording difference.
  markRealPass: 0.9,
  // T4: shadow-report threshold for "under five voices" (from the brief).
  minVoices: 5,
  // T5: crawler interval. The crawler config is not in this workspace, so this is the brief's fallback.
  crawlIntervalMin: 60, crawlIntervalSource: "fallback (crawler config not found)",
  // T7: starting guesses. minStem protects "gelin" from becoming "gel".
  minStem: 4, maxStripLayers: 2
};

// All on at Aylin's request (15 Oct 2026). Reviewer gates are still open: see report.md.
// evidence: the reading list, evidence gate and pipeline on Türkiye bağlamı / Yöntem.
// attention: the home page's foil sticker, event switcher, phone-first hero and differing-word lines on cards.
// register: the crawler's 53-outlet register on Panel sağlığı and Yöntem (no figure changes).
// reviewDesk: Yönetim › Doğrulama masası and the status table on Yöntem (ADR-001).
var FLAGS = { panelHealth: true, noticeSplit: true, ownerVoices: true, echoChain: true,
  stemMatch: true, appeal: true, evidence: true, reviewDesk: true, register: true, attention: true };

// previewLink: the footer link that opens the preview of features whose flag is not on.
var CONFIG = { correctionEndpoint: null, previewLink: true };

/* All new Turkish text, in one place for the reviewer. No string is built from
   fragments; numbers go in {placeholders} and never take a case suffix. */
var TR = {
  panelHealth: "Panel sağlığı",
  activeOutlets: "Etkin kurum: {a} / {n}",
  thinData: "yetersiz veri",
  noData: "bu dönemde veri yok",
  lowestShare: "En az olay payı: {outlet} %{x}",
  // The criteria line has one string per case, so no symbol is added or removed in code.
  criteriaDays: "Ölçüt — gün: ≥{days} · olay payı: — · günlük başlık: —",
  criteriaShare: "Ölçüt — gün: ≥{days} · olay payı: ≥%{share} · günlük başlık: —",
  criteriaAll: "Ölçüt — gün: ≥{days} · olay payı: ≥%{share} · günlük başlık: ≥{perDay}",
  shadowRule: "yeni ölçüt (denemede)",
  panelLine: "Sol n={l} · Sağ n={r}",
  blocLeft: "Sol", blocMid: "Merkez", blocRight: "Sağ",
  eventShareTip: "olay payı %{x} · {days} gün · {n} başlık",
  news: "Haber",
  notice: "Resmî ilan",
  noticeEvents: "Resmî ilanlar",
  noticeShare: "İlan payı %{x}",
  estimated: "tahmini",
  noticeLine1: "Resmî ilanlar haber sayısına katılmaz, gizlenmez.",
  noticeLine2: "Ayrım otomatik bir kuralın sonucudur; hata payı vardır.",
  noticeLine3: "Bu sayfa ilanların gelirle ya da yayın tercihiyle ilişkisini ölçmez.",
  noticeEventsHead: "Haber sitelerinde yayımlanan mahkeme ve kurum ilanları",
  noticeEventsCount: "Olay: {n}",
  noticeRowCount: "{n} başlık · {k} kurum",
  noticeShort: "ilan {n}",
  evCountsSplit: "Haber: {h} · Resmî ilan: {i} · {k} kurum",
  noNotices: "Bu kurumda resmî ilan olarak ayrılan başlık yok.",
  voiceDefault: "farklı sahip",
  counter: "{k} kurum · {v} {voice}",
  counterOutletsOnly: "{k} kurum",
  sourceLine: "Kaynak: {title}, {date}",
  ownerPending: "sahip kaydı, kaynak bekliyor",
  noGroup: "Kayıtlı bir sahip grubu yok.",
  ownerLine: "Aynı sahip kayıtlı kurumlar tek sayılır. Bu, kurumların birlikte hareket ettiği anlamına gelmez.",
  ownerPanelHead: "Sahip kayıtları",
  voiceScope: "Sayılan kurumlar: panel ölçütünü geçen ve bu olayda haber başlığı olanlar ({k}).",
  close: "Kapat",
  similar: "Benzer başlıklar",
  firstSeen: "ilk görülen (taramamızda)",
  orderUnknown: "sıra bilinmiyor",
  noTime: "saat yok",
  countedOnce: "Benzer başlıklar bir kez sayıldı.",
  similarLine: "Benzer başlık, ortak bir ajans metninden de, bir kurumun diğerini izlemesinden de gelebilir; veri hangisi olduğunu söylemez.",
  flowHead: "Benzer başlıklar: sıra bilinen çiftler",
  flowLimit: "Yalnızca iki zaman damgası da saat içeren ve aradaki fark tarama aralığından büyük olan çiftler sayıldı. Sayı, hangi kurumun hangi metni kullandığını göstermez.",
  flowEarlier: "Önce görülen",
  flowLater: "Sonra görülen",
  flowCount: "Çift",
  appealBtn: "İşareti itiraz et",
  appealTitle: "Bu işaret yanlış mı?",
  appealScope: "Bu form başlığın doğru olup olmadığını değil, kelimenin işaretlenmesini ilgilendirir.",
  appealNoPromise: "Gönderim bir değişiklik güvencesi vermez.",
  appealWords: "İşaretli kelime",
  appealName: "Ad",
  appealEmail: "E-posta",
  appealText: "Açıklama",
  appealLink: "Kanıt bağlantısı (isteğe bağlı, https://)",
  appealConsent: "Adım ve e-postam yalnızca bu talebi incelemek için saklansın.",
  appealCount: "{n} / 12000",
  appealSend: "Gönder",
  appealCancel: "Vazgeç",
  appealOk: "Talebiniz alındı (No: {id}).",
  appealDisabled: "Bu önizlemede gönderim kapalı.",
  appealWait: "Bir dakika sonra yeniden deneyin.",
  appealFailed: "Gönderilemedi. Daha sonra yeniden deneyin.",
  errName: "Ad 2 ile 160 karakter arasında olmalı.",
  errEmail: "E-posta adresi geçerli görünmüyor.",
  errText: "Açıklama 24 ile 12000 karakter arasında olmalı.",
  errLink: "Kanıt bağlantısı https:// ile başlamalı.",
  errConsent: "Göndermek için onay kutusunu işaretleyin.",
  errWord: "İtiraz ettiğiniz kelimeyi seçin.",
  preview: "Deneme görünümü açık",
  previewOn: "Deneme görünümü",
  // Resmî ilanlar page (rebuilt 27 Oct 2026)
  nlEyebrow: "Resmî ilanlar",
  nlHead: "Haber sitelerinde yayımlanan mahkeme ve kurum ilanları",
  nlLede: "Bu dönemde {n} başlık resmî ilan olarak ayrıldı; gömülü başlıkların %{x} kadarı. İlanlar haber değildir: olay listelerine, konulara, günlük özete ve kör nokta testine katılmaz.",
  nlTiles: "ilan · {o} sitede · {d} günde · {p} farklı yer",
  nlKindHead: "İlanı veren makam",
  nlKindSub: "Başlık ilanın konusunu değil, ilanı veren makamı söyler. Makam türü başlıktaki kelimelerden okunur.",
  famCourt: "Mahkeme ilanı", famEnforcement: "İcra ve satış ilanı", famPublic: "Kamu kurumu ilanı", famOther: "Sınıflanamayan",
  kAsliyeHukuk: "Asliye hukuk mahkemesi", kSulhHukuk: "Sulh hukuk mahkemesi", kAsliyeCeza: "Asliye ceza mahkemesi",
  kAgirCeza: "Ağır ceza mahkemesi", kSulhCeza: "Sulh ceza hakimliği", kAile: "Aile mahkemesi", kIs: "İş mahkemesi",
  kTicaret: "Ticaret mahkemesi", kTuketici: "Tüketici mahkemesi", kKadastro: "Kadastro mahkemesi", kIdare: "İdare mahkemesi",
  kMahkeme: "Diğer mahkeme", kIcra: "İcra dairesi ve satış memurluğu", kBelediye: "Belediye", kKurum: "Diğer kamu kurumu", kDiger: "Sınıflanamayan",
  nlSiteHead: "Hangi sitelerde",
  nlSiteSub: "Sıra kurum adına göredir. İlan payı, o sitenin bu dönemdeki gömülü başlıkları içindeki paydır.",
  nlSite: "Site", nlCount: "İlan", nlNews: "Haber", nlShare: "İlan payı",
  nlDayHead: "Günlere göre",
  nlDayTip: "{d}: {n} ilan",
  nlListHead: "Bütün ilanlar",
  nlAll: "Hepsi", nlSearch: "Makam ya da yer ara", nlOutletAll: "Bütün siteler",
  nlShown: "{a} / {n} ilan gösteriliyor",
  nlMore: "{n} ilan daha göster",
  nlNone: "Bu süzgeçle eşleşen ilan yok.",
  nlPlaceNone: "yer okunamadı",
  nlOldHead: "İlanlar neden ayrı listeleniyor",
  nlOld: "İlanlar, başlıklarındaki ortak kelimeler yüzünden kümelemede {n} olay oluşturuyor ve bu kümeler Yargı ile Toplum konularında olay gibi sayılabiliyor. En büyük küme, {m} farklı makamın {k} ilanını tek bir olay gibi gösteriyor. Bu yüzden ilan kümeleri olay listelerinden, konulardan, günlük özetten ve aramadan çıkarılır; ilanlar burada tek tek listelenir.",
  nlRule: "Ayırma kuralı: adres yolunda ilan bölümü olan ya da tamamı büyük harfle yazılmış ve bir makam adı içeren başlıklar.",
  nlReview: "Kuralı denetleyin: Yönetim › Doğrulama masası.",
  // Home: attention layer
  stickerKicker: "Günün olayı",
  stickerCount: "{k} kurum",
  stickerBlocs: "sol {l} · sağ {r}",
  heroNext: "Başka bir olay",
  heroPrev: "Önceki olay",
  heroPos: "{i} / {n}",
  heroLive: "Gösterilen olay: {t}",
  diffLabel: "Ayrışan kelimeler",
  // Evidence gate and the reading list (Türkiye bağlamı, Yöntem)
  litHead: "Sitenin kurallarına arka plan olan kaynaklar",
  litSub: "Okuma listesi: {n} kaynak. Her biri kurum ya da sistem düzeyinde bir koşulu anlatır ve sitenin bir kuralının neden var olduğunu gösterir. Hiçbiri tek bir başlığı açıklamak için kullanılmaz.",
  litSource: "Kaynak", litGrade: "Kanıt düzeyi", litScope: "Kapsam", litRule: "İlgili kural",
  litOwnerNote: "Listede Turkuvaz grubu için tarihli bir mülkiyet kaynağı yok; sahip sayacı bu yüzden kaynak bekliyor.",
  notOnRecord: "kayıtta yok",
  eligible: "dayanak olabilir", notEligible: "dayanak olamaz",
  gradeA: "A · DOI doğrulandı", gradeB: "B · DOI rapordan okundu", gradeC: "C · kalıcı tanımlayıcı",
  gradeD: "D · tanımlayıcı yok", gradeE: "E · yalnızca haber aktarımı",
  ruleOwner: "Sahip kaydı ayrı sayılır (T4)",
  ruleAbsence: "Eksik haber yalnızca yokluk olarak gösterilir",
  rulePanel: "Panelin sınırı: yurt dışından yayın yapan kurumlar kayıt defterinde yok",
  ruleContext: "Genel bağlam",
  gateHead: "Kanıt kapısı",
  gateSub: "Bir kaynak, bir kurumun yerleşimine ya da bir sahip grubuna ancak üç koşulla dayanak olur: birincil kaynaktır, kalıcı bir tanımlayıcısı (DOI, handle ya da kalıcı bağlantı) vardır, yazarı ve yılı kayıtlıdır.",
  gateCount: "Dayanak olabilir: {a} / {n}",
  gateSources: "{n} kaynak",
  pipeHead: "İşlem hattı",
  pipeSub: "Bir başlığın toplanmasından sayfaya gelene kadar geçtiği kurallar. Kayıt defteri girdileri yan koldan gelir ve kanıt kapısından geçer.",
  pipeMain: "Başlığın yolu", pipeSide: "Kayıt defteri girdileri",
  stOn: "açık", stOff: "kapalı", stShadow: "denemede", stPending: "kaynak bekliyor", stFixed: "temel kural",
  p1: "Toplama", p1d: "Kurumların site haritalarından başlık ve zaman damgası.",
  p2: "İçerik ayrımı (T3)", p2d: "Resmî ilanlar haberden ayrılır ve sayılara katılmaz.",
  p3: "Kümeleme", p3d: "Aynı olguyu bildiren başlıklar bir olayda toplanır.",
  p4: "Panel ölçütü (T2)", p4d: "Taraf karşılaştırmasına hangi kurumların girdiği.",
  p5: "Zaman kalitesi (T5)", p5d: "Saat içermeyen damgalar ayrılır; sıra yalnızca belli olduğunda gösterilir.",
  p6: "Benzer başlık (T6)", p6d: "Neredeyse aynı başlıklar karşılaştırmalarda bir kez sayılır.",
  p7: "Ek eşleme (T7)", p7d: "Yalnızca ekiyle ayrılan kelimeler işaretlenmez.",
  p8: "Sahip kaydı (T4)", p8d: "Aynı sahip kayıtlı kurumlar, kaynağı olduğunda tek sayılır.",
  p9: "Kayıt denetimi (T1)", p9d: "Yerleşim sayısı ile etiketi uyuşmayan kurumlar listelenir.",
  p10: "Kanıt kapısı", p10d: "Yerleşime ve sahipliğe hangi kaynağın dayanak olabileceği.",
  // Review desk (Yönetim › Doğrulama masası) and the status table on Yöntem
  deskTab: "Doğrulama masası",
  deskBar: "Doğrulama masasındaki cevaplar bu sayfanın ortak deposunda saklanır; sayfayı açabilen herkes görür ve sonuçlar kamu sayfalarındaki etiketleri değiştirebilir.",
  deskHead: "Açık kontrolleri buradan kapatın",
  deskLede: "Cevaplar bu sayfanın ortak deposunda saklanır; sayfayı açabilen herkes sonuçları görür. Bir geçme çizgisi karşılandığında sitedeki etiket kendiliğinden güncellenir.",
  deskBlind: "Satırlar karışık sırada ve işaretsiz gösterilir. Kural sayfanın içinde çalıştığı için körleme yalnızca ekranda yapılır.",
  deskConnecting: "Ortak depoya bağlanılıyor…",
  deskNoStore: "Bu görünümde ortak depoya ulaşılamıyor; cevaplar kaydedilemez ve sonuçlar okunamaz. Sayfayı claude.ai içinde, oturum açmış olarak açın.",
  deskReadOnly: "Bu sayfada yalnızca okuma izniniz var; cevaplar gösterilir ama kaydedilemez.",
  deskAdminOnly: "Bu kararları yalnızca sayfanın sahibi ve editörler kaydedebilir.",
  deskSaveFail: "Kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin.",
  deskSaveDenied: "Bu cevabı kaydetme izniniz yok.",
  deskQuota: "Depo dolu; kayıt yapılamadı.",
  panelIlan: "Resmî ilan", panelYanki: "Benzer başlık", panelIsaret: "İşaretli kelime", panelKayit: "Kayıt kararları", panelSahip: "Sahip kaynakları",
  progress: "{d} / {n}",
  onlyOpen: "Yalnızca cevaplanmamışlar",
  qIlan: "Bu başlık resmî bir ilan mı?",
  qYanki: "İki başlık aynı metin mi?",
  qIsaret: "Her işaret kümesinde kaç kelime gerçek bir ifade farkı?",
  yes: "evet", no: "hayır",
  setX: "Küme X", setY: "Küme Y", noMarks: "işaret yok",
  scoreIlan: "İşaretlenen satırlardan ilan olan: %{p} · işaretlenmeyenlerden ilan olan: %{m}",
  scoreYanki: "Aynı metin: işaretli çiftlerde {a} / {b}, işaretsiz çiftlerde {c} / {d}",
  scoreIsaret: "Gerçek fark: tam kelime eşlemede %{o}, ek eşlemede %{n}",
  noScore: "Henüz cevap yok.",
  passLine: "Geçme çizgisi: {line}",
  lineIlan: "bütün satırlar cevaplanmış ve işaretlenenlerin en az %{x} kadarı ilan",
  lineYanki: "işaretli 50 çiftin hepsi aynı, işaretsiz 50 çiftin hiçbiri",
  lineIsaret: "bütün çiftler cevaplanmış ve ek eşlemede en az %{x} gerçek fark",
  lineRegistry: "Milliyet ve Sözcü için birer karar",
  lineOwner: "kanıt kapısından geçen bir kaynak",
  linePanel: "bir kurum çıkarılınca hiçbir konu farkının yönü değişmez",
  lineReaders: "beş okur; protokol hazır",
  stPass: "geçti", stFail: "geçmedi", stRunning: "sürüyor", stNotStarted: "başlamadı", stUnknown: "bu görünümde okunamıyor",
  stDecided: "karar verildi", stAwait: "karar bekliyor", stNotRun: "yapılmadı",
  regKeep: "Yerleşimi koru (sayı)", regLabel: "Etiketi izle (metin)",
  regRow: "Etiket: {label} · yerleşim: {p} · sayıya göre: {rule} · etikete göre: {lbl}",
  regNote: "Not", save: "Kaydet", savedAt: "Son kayıt: {at}",
  regNoEffect: "Karar kaydedilir ve gösterilir; blok sayılarını bu sürümde değiştirmez.",
  ownMembers: "Kayıtlı kurumlar: {m}",
  ownPick: "Okuma listesinden seçin", ownNone: "seçilmedi",
  ownManual: "ya da tarihli bir belge girin",
  ownTitle: "Başlık", ownUrl: "Bağlantı (https://)", ownDate: "Tarih (YYYY-AA-GG)",
  ownAccepted: "Kabul edilen kaynak: {title}",
  ownRefusedLit: "Kanıt kapısı bu kaynağı kabul etmiyor: birincil kaynak, kalıcı tanımlayıcı, yazar ve yıl gerekir.",
  ownRefusedDoc: "Başlık, https:// ile başlayan bir bağlantı ve tarih gerekir.",
  statusHead: "Doğrulama durumu",
  statusSub: "Her kural için açık kontrol, geçme çizgisi ve şu anki durum. Sonuçlar Yönetim › Doğrulama masası'ndan gelir.",
  stCheck: "Kontrol", stLine: "Geçme çizgisi", stState: "Durum", stResult: "Sonuç",
  chkIlan: "Resmî ilan kuralı (T3)", chkYanki: "Benzer başlık kuralı (T6)", chkIsaret: "Ek eşleme (T7)",
  chkRegistry: "Kayıt kararları (T1)", chkOwner: "Sahip kaynağı (T4): {g}", chkPanel: "Panel ölçütü (T2)", chkReaders: "Okur testleri",
  resPanel: "{n} yön değişikliği",
  resRegistry: "{d} / {n} karar",
  // Crawler register: Panel sağlığı row and the Yöntem coverage table
  blocNone: "Yerleşim yok",
  covHead: "Kayıt defteri ve toplama durumu",
  covSub: "Kayıt defterindeki {n} kurumun hepsi tam metin tarayıcısına eklendi. Tablo, sitenin kullandığı dönemde ({range}) hangi kurumdan başlık bulunduğunu ve bilinen toplama notlarını gösterir. Yeni eklenen kurumların başlıkları toplandığında bütün sayılar yeniden hesaplanacak.",
  covSummary: "Bu dönemde başlığı olan: {a} / {n} kurum · yerleşimi olan: {p} / {n}",
  covOutlet: "Kurum", covWindow: "Bu dönem", covPlace: "Yerleşim", covFeeds: "Etkin akış", covNote: "Toplama notu",
  covHas: "{n} başlık",
  covPending: "yeni eklendi; bu dönem henüz toplanmadı",
  noteNoSitemap: "Site haritası yok; ana sayfa, bölüm sayfaları ve akışlardan toplanır.",
  noteHost: "Haberler başka bir alan adında: {h}",
  noteExtraSitemap: "Ek site haritası kayıtlı.",
  noteListing: "Ek liste sayfası kayıtlı.",
  previewOff: "Kapat"
};
var LBL = { voice: TR.voiceDefault };
var FORBIDDEN = ["kopya", "sansür", "sessiz kaldı", "gizledi", "taraflı", "doğru haber", "gerçek haber", "tarafsız"];

/* ---------------------------------------------------------------- text */
function trLower(s) { return String(s).toLocaleLowerCase("tr"); }
function trUpper(s) { return String(s).toLocaleUpperCase("tr"); }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (m, k) { return o[k] == null ? m : String(o[k]); }); }
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function pct1(x) { return (Math.round(x * 1000) / 10).toLocaleString("tr"); }
function scanForbidden(text) {
  var low = trLower(text);
  return FORBIDDEN.filter(function (w) { return low.indexOf(w) >= 0; });
}

/* ---------------------------------------------------------------- index */
var CACHE = typeof WeakMap === "function" ? new WeakMap() : null;
function memo(D, key, fn) {
  if (!CACHE) return fn();
  var m = CACHE.get(D); if (!m) { m = {}; CACHE.set(D, m); }
  return key in m ? m[key] : (m[key] = fn());
}
function index(D) {
  return memo(D, "index", function () {
    var SRC = {}, ART = {}, EV = {}, FD = {};
    D.S.forEach(function (s) { SRC[s.s] = s; });
    D.A.forEach(function (a) { ART[a.i] = a; });
    D.E.forEach(function (e) { EV[e.i] = e; });
    (D.FD || []).forEach(function (f) { FD[f.s] = f; });
    return { SRC: SRC, ART: ART, EV: EV, FD: FD };
  });
}
/* Possessive suffix after a written number, as Turkish reads it: 16'sı, 20'si, 40'ı, 9'u. */
function trSuffix(n) {
  n = Math.abs(Math.round(n));
  var ones = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"], tens = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"];
  if (n === 0) return "ı";
  if (n % 10) return ones[n % 10];
  if (n % 100) return tens[(n / 10) % 10];
  return n % 1000 ? "ü" : "i";
}
function blocOfLean(v) {
  if (v == null) return "none"; // outlets the register has not placed (extended data) are in no bloc
  if (v < PARAMS.blocLeftBelow) return "left";
  if (v > PARAMS.blocRightAbove) return "right";
  return "mid";
}
function blocOf(D, slug) { var p = index(D).SRC[slug]; return blocOfLean(p ? p.lean : null); }

/* ======================================================= Evidence gate
   The reading list (sources/turkey_journalism_sources.xlsx, 15 Oct 2026) is loaded by the build
   with setLiterature(). Grades come from the list's own "ID status" and access columns:
   A DOI verified · B DOI read from the report · C handle or permalink · D no identifier ·
   E the link is news coverage of a report (secondary). A source can be the cited basis for an
   outlet's placement (T1) or an owner group (T4) only when it is primary, graded A–C, and its
   author and year are on record. Rule agreed with Aylin on 15 Oct 2026; not reviewer-validated. */
var LIT = [];
function setLiterature(list) { LIT.length = 0; Array.prototype.push.apply(LIT, list || []); }
function evidenceGrade(src) {
  if (!src.primary) return "E";
  var st = String(src.idStatus || "");
  if (st === "DOI verified") return "A";
  if (/^DOI/.test(st)) return "B";
  if (/^(Handle|Persistent ID)/.test(st)) return "C";
  return "D";
}
function onRecord(v) { return v != null && v !== "" && !/^Not captured/.test(String(v)); }
function basisEligible(src) {
  return "ABC".indexOf(evidenceGrade(src)) >= 0 && onRecord(src.authors) && /^\d{4}$/.test(String(src.year));
}
function literature() {
  return LIT.map(function (s) { return { src: s, grade: evidenceGrade(s), eligible: basisEligible(s) }; });
}
// ref is {lit: n} (an entry of the reading list) or {title, url, date} (a dated document).
// Returns the accepted citation, or null when the gate refuses it.
function citation(ref) {
  if (!ref) return null;
  if (ref.lit != null) {
    var s = LIT.filter(function (x) { return +x.n === +ref.lit; })[0];
    return s && basisEligible(s) ? { title: s.title, url: s.url, date: String(s.year), lit: +s.n, grade: evidenceGrade(s) } : null;
  }
  // A dated document: title, an https link (never another scheme: it is rendered as a link) and a date.
  return ref.title && /^https:\/\/[^\s"<>]+$/.test(String(ref.url)) && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(ref.date)) ? ref : null;
}

/* ======================================================= T1 registry audit */
function registryAudit(D) {
  return D.S.map(function (s) {
    var byRule = blocOfLean(s.lean);
    var byLabel = Object.prototype.hasOwnProperty.call(PARAMS.labelBloc, s.supp) ? PARAMS.labelBloc[s.supp] : null;
    return { slug: s.s, name: s.n, label: s.supp, placement: s.lean, blocByRule: byRule, blocByLabel: byLabel,
      agrees: byLabel == null ? null : byLabel === byRule, basis: citation(s.basis) };
  });
}

/* ====================================================== T2 panel admission */
function panel(D, P) {
  P = P || PARAMS;
  return memo(D, "panel:" + P.minDays + ":" + P.minEventShare + ":" + P.minPerDay, function () {
    var ix = index(D), evN = {};
    D.E.forEach(function (e) { e.s.forEach(function (s) { evN[s] = (evN[s] || 0) + 1; }); });
    return D.S.map(function (s) {
      var f = ix.FD[s.s] || {}, days = f.w || 0, n = f.n || 0, ev = evN[s.s] || 0;
      var share = D.E.length ? ev / D.E.length : 0, perDay = days ? n / days : 0;
      var old = !!f.ok && days >= P.minDays;
      var adm = old && share >= P.minEventShare && (P.minPerDay == null || perDay >= P.minPerDay);
      return { s: s.s, name: s.n, bloc: blocOfLean(s.lean), ok: !!f.ok, days: days, headlines: n, events: ev,
        eventShare: share, perDay: perDay, admittedOld: old, admittedNew: adm, noData: !days || !n };
    });
  });
}
function admittedSet(D, rule) {
  return panel(D).filter(function (r) { return rule === "new" ? r.admittedNew : r.admittedOld; })
    .map(function (r) { return r.s; });
}
// Mean participation of a set of outlets over a list of events (share of the set present).
function participation(events, set) {
  if (!set.length || !events.length) return null;
  var tot = 0;
  events.forEach(function (e) { var k = 0; e.s.forEach(function (s) { if (set.indexOf(s) >= 0) k++; }); tot += k / set.length; });
  return tot / events.length;
}
function topicGaps(D, set) {
  var ix = index(D);
  var L = set.filter(function (s) { return blocOf(D, s) === "left"; });
  var R = set.filter(function (s) { return blocOf(D, s) === "right"; });
  var out = {};
  (D.TP || []).forEach(function (t) {
    var evs = t.e.map(function (i) { return ix.EV[i]; }).filter(Boolean);
    var l = participation(evs, L), r = participation(evs, R);
    out[t.k] = { n: evs.length, gap: l == null || r == null ? null : l - r, nl: L.length, nr: R.length };
  });
  return out;
}
function sensitivity(D) {
  var oldSet = admittedSet(D, "old"), newSet = admittedSet(D, "new");
  var a = topicGaps(D, oldSet), b = topicGaps(D, newSet), flips = [], drops = {};
  newSet.forEach(function (s) {
    var g = topicGaps(D, newSet.filter(function (x) { return x !== s; }));
    drops[s] = g;
    Object.keys(b).forEach(function (k) {
      var base = b[k].gap, v = g[k].gap;
      if (base != null && v != null && base * v < 0)
        flips.push({ topic: k, removed: s, gapNew: base, gapWithout: v, events: b[k].n });
    });
  });
  return { oldSet: oldSet, newSet: newSet, oldRule: a, newRule: b, drops: drops, flips: flips };
}

/* ================================================== T3 content-type gate */
function isAllCaps(t) { return t === trUpper(t) && t !== trLower(t); }
// rules: a { url, keywords } object; defaults to PARAMS.noticeRules. (A PARAMS-shaped object also works.)
function ruleHits(a, rules) {
  rules = rules ? (rules.noticeRules || rules) : PARAMS.noticeRules;
  var t = a.t || "";
  return { url: new RegExp(rules.url, "i").test(a.u || ""),
    keyword: isAllCaps(t) && rules.keywords.some(function (k) { return t.indexOf(k) >= 0; }) };
}
/* What issued the notice, read from its all-capitals title. family: court, enforcement (icra and sales)
   or public body (tenders and announcements). Titles name the issuer, not the notice's subject. */
var NOTICE_KINDS = [
  ["icra", "enforcement", /İCRA|SATIŞ MEMURLUĞU/],
  ["agirCeza", "court", /AĞIR CEZA/], ["asliyeCeza", "court", /ASLİYE CEZA/], ["sulhCeza", "court", /SULH CEZA/],
  ["asliyeHukuk", "court", /ASLİYE HUKUK/], ["sulhHukuk", "court", /SULH HUKUK/], ["aile", "court", /AİLE MAHKEME/],
  ["is", "court", /İŞ MAHKEME/], ["ticaret", "court", /TİCARET MAHKEME/], ["tuketici", "court", /TÜKETİCİ MAHKEME/],
  ["kadastro", "court", /KADASTRO MAHKEME/], ["idare", "court", /İDARE MAHKEME/], ["mahkeme", "court", /MAHKEME|HAKİMLİĞİ/],
  ["belediye", "public", /BELEDİYE/], ["kurum", "public", /BAŞKANLIĞI|MÜDÜRLÜĞÜ|İDARESİ|İŞLETMELERİ|ÜNİVERSİTE|ALIM İŞİ|İHALE/]
];
function noticeKind(title) {
  var t = trUpper(title || "");
  for (var i = 0; i < NOTICE_KINDS.length; i++) if (NOTICE_KINDS[i][2].test(t)) return { kind: NOTICE_KINDS[i][0], family: NOTICE_KINDS[i][1] };
  return { kind: "diger", family: "other" };
}
// The place a notice names first ("BOR 1. ASLİYE…" -> "BOR"; "T.C. İZMİR 11. …" -> "İZMİR").
function noticePlace(title) {
  var t = trUpper(title || "").replace(/^T\.\s*C\.\s*/, "");
  var m = t.match(/^([A-ZÇĞİÖŞÜÂÎÛ]+(?:\s[A-ZÇĞİÖŞÜÂÎÛ]+)?)\s+(?:\d+\.|ASLİYE|SULH|AĞIR|AİLE|İCRA|İŞ|TİCARET|BÜYÜKŞEHİR|BELEDİYE|GAYRİMENKUL|KADASTRO|TÜKETİCİ|İDARE)/);
  return m ? m[1] : null;
}
// The URL rule is reported first when both match, so the reviewer file can be stratified by rule.
function classify(a, P) {
  var h = ruleHits(a, P);
  if (h.url) return { type: "ilan", why: "url" };
  if (h.keyword) return { type: "ilan", why: "keyword" };
  return { type: "haber", why: null };
}
function notices(D, rulesIn) {
  var R = rulesIn || PARAMS.noticeRules;
  return memo(D, "notices:" + R.url + "|" + R.keywords.join(","), function () {
    var ix = index(D), byArt = {}, byOutlet = {}, events = {}, rules = { url: 0, keyword: 0 }, total = 0;
    D.A.forEach(function (a) {
      var h = ruleHits(a, R), il = h.url || h.keyword;
      var o = byOutlet[a.s] || (byOutlet[a.s] = { haber: 0, ilan: 0, all: 0 });
      o.all++; o[il ? "ilan" : "haber"]++;
      // Rule counts overlap: an article can match both rules.
      if (h.url) rules.url++;
      if (h.keyword) rules.keyword++;
      if (il) { byArt[a.i] = h.url ? "url" : "keyword"; total++; }
    });
    D.E.forEach(function (e) {
      var il = 0, outs = {};
      e.a.forEach(function (i) { if (byArt[i]) il++; else outs[ix.ART[i].s] = 1; });
      var news = Object.keys(outs), all = e.a.length, share = all ? il / all : 0;
      events[e.i] = { all: all, ilan: il, haber: all - il, share: share,
        isIlan: all > 0 && share >= PARAMS.ilanEventShare,
        newsOutlets: news, clean: news.length >= PARAMS.cleanMinOutlets };
    });
    return { byArt: byArt, byOutlet: byOutlet, events: events, rules: rules, total: total };
  });
}

/* ======================================================= T4 owner voices */
// sources: { groupKey: {title,url,date} or {lit: n} } — citations supplied by Aylin, checked by citation(). None yet.
var OWNER_SOURCES = {};
function ownerGroupsRaw(D) {
  var by = {};
  D.S.forEach(function (s) {
    var g = s.own && s.own.grp;
    if (!g || /^Bağımsız/.test(g)) return;
    (by[g] = by[g] || []).push(s.s);
  });
  return Object.keys(by).filter(function (g) { return by[g].length > 1; }).sort().map(function (g) {
    return { key: g, label: g, members: by[g] };
  });
}
function ownerGroups(D) {
  return ownerGroupsRaw(D).map(function (g) { g.source = citation(OWNER_SOURCES[g.key]); return g; });
}
function groupKeyOf(groups, slug, citedOnly) {
  for (var i = 0; i < groups.length; i++) {
    if ((!citedOnly || groups[i].source) && groups[i].members.indexOf(slug) >= 0) return groups[i].key;
  }
  return slug;
}
// citedOnly=true is what the interface uses: no grouping without a citation.
function voices(outlets, groups, citedOnly) {
  var seen = {};
  outlets.forEach(function (s) { seen[groupKeyOf(groups, s, citedOnly)] = 1; });
  return Object.keys(seen).length;
}
function ownerShadow(D, scope) {
  var n = notices(D), groups = ownerGroups(D);
  var adm = scope === "all" ? null : admittedSet(D, "old");
  var clean = D.E.filter(function (e) { return n.events[e.i].clean; });
  var sumO = 0, sumV = 0, under = 0, sets = [];
  clean.forEach(function (e) {
    var os = n.events[e.i].newsOutlets.filter(function (s) { return !adm || adm.indexOf(s) >= 0; });
    var v = voices(os, groups, false);
    sumO += os.length; sumV += v; if (v < PARAMS.minVoices) under++;
    sets.push(os);
  });
  // Pairwise co-coverage lift = P(both) / (P(a) × P(b)), over clean events and the old-rule panel.
  var outs = admittedSet(D, "old"), N = sets.length, P = {};
  outs.forEach(function (s) { P[s] = sets.filter(function (x) { return x.indexOf(s) >= 0; }).length / N; });
  var acc = { same: { l: [], num: 0, den: 0 }, bloc: { l: [], num: 0, den: 0 }, cross: { l: [], num: 0, den: 0 } };
  for (var i = 0; i < outs.length; i++) for (var j = i + 1; j < outs.length; j++) {
    var a = outs[i], b = outs[j];
    var pb = sets.filter(function (x) { return x.indexOf(a) >= 0 && x.indexOf(b) >= 0; }).length / N;
    var t = groupKeyOf(groups, a, false) === groupKeyOf(groups, b, false) ? "same" : blocOf(D, a) === blocOf(D, b) ? "bloc" : "cross";
    acc[t].l.push(pb / (P[a] * P[b])); acc[t].num += pb; acc[t].den += P[a] * P[b];
  }
  var lift = {};
  Object.keys(acc).forEach(function (k) {
    var l = acc[k].l;
    lift[k] = { pairs: l.length, mean: l.reduce(function (x, y) { return x + y; }, 0) / (l.length || 1), pooled: acc[k].den ? acc[k].num / acc[k].den : null };
  });
  // Blind-spot flags whose event keeps five or more voices (the site's event floor) after grouping.
  var bs = D.E.filter(function (e) { return e.bs; });
  var bsKept = bs.filter(function (e) { return voices(n.events[e.i].newsOutlets, groups, false) >= PARAMS.cleanMinOutlets; });
  var right = D.S.filter(function (s) { return blocOfLean(s.lean) === "right" && outs.indexOf(s.s) >= 0; }).map(function (s) { return s.s; });
  return { scope: scope || "admitted", groups: groups, cleanEvents: clean.length,
    meanOutlets: sumO / (clean.length || 1), meanVoices: sumV / (clean.length || 1), underVoices: under,
    lift: lift, rightOutlets: right.length, rightVoices: voices(right, groups, false),
    blindSpots: bs.length, blindSpotsKept: bsKept.length };
}

/* ======================================================== T5 time quality */
function timeQuality(stamp) {
  return !stamp || stamp.indexOf("T") < 0 || /T00:00(:00)?$/.test(stamp) ? "date-only" : "real";
}
function minutes(stamp) { return Date.parse(stamp.length === 16 ? stamp + ":00Z" : stamp) / 60000; }
// articles: [{s, d}] ordered or not. Returns {known, order}.
function firstSeen(articles, interval) {
  interval = interval == null ? PARAMS.crawlIntervalMin : interval;
  var as = articles.slice().sort(function (x, y) { return cmp(x.d, y.d) || cmp(x.s, y.s); });
  if (as.length < 2) return { known: false, order: as };
  var a = as[0], b = as[1];
  var known = timeQuality(a.d) === "real" && timeQuality(b.d) === "real" && minutes(b.d) - minutes(a.d) > interval;
  return { known: known, order: as };
}

/* ================================================== T6 near-copy clusters */
// Reuses 2.0's stored duplicate rule (e.rep: copy -> earliest similar headline). No second implementation.
function clusters(D) {
  return memo(D, "clusters", function () {
    var ix = index(D), byEvent = {}, copyOf = {}, flowsAll = {}, flowsKnown = {}, blocAll = {}, blocKnown = {};
    var total = 0, copies = 0, perOutlet = {}, perOutletAll = {};
    D.E.forEach(function (e) {
      total += e.a.length;
      e.a.forEach(function (i) { var s = ix.ART[i].s; perOutletAll[s] = (perOutletAll[s] || 0) + 1; });
      var groups = {};
      Object.keys(e.rep || {}).forEach(function (c) {
        var o = e.rep[c]; copyOf[c] = o; copies++;
        var C = ix.ART[c], O = ix.ART[o];
        perOutlet[C.s] = (perOutlet[C.s] || 0) + 1;
        (groups[o] = groups[o] || []).push(c);
        var k = O.s + ">" + C.s, bk = blocOf(D, O.s)[0] + blocOf(D, C.s)[0];
        flowsAll[k] = (flowsAll[k] || 0) + 1; blocAll[bk] = (blocAll[bk] || 0) + 1;
        if (firstSeen([O, C]).known && O.d < C.d) {
          flowsKnown[k] = (flowsKnown[k] || 0) + 1; blocKnown[bk] = (blocKnown[bk] || 0) + 1;
        }
      });
      byEvent[e.i] = Object.keys(groups).map(function (o) {
        var arts = [o].concat(groups[o]).map(function (i) { return ix.ART[i]; });
        var fs = firstSeen(arts);
        return { origin: o, members: arts, known: fs.known, order: fs.known ? fs.order :
          arts.slice().sort(function (x, y) { return cmp(x.s, y.s); }) };
      });
    });
    return { byEvent: byEvent, copyOf: copyOf, total: total, copies: copies, perOutlet: perOutlet,
      perOutletAll: perOutletAll, flowsAll: flowsAll, flowsKnown: flowsKnown, blocAll: blocAll, blocKnown: blocKnown };
  });
}
function rankFlows(f) {
  return Object.keys(f).map(function (k) { var p = k.split(">"); return { from: p[0], to: p[1], n: f[k] }; })
    .sort(function (a, b) { return b.n - a.n || (a.from + a.to < b.from + b.to ? -1 : 1); });
}
// Paired right-minus-left loading: per event, first headline per admitted outlet; optional dedupe of near-copies.
function pairedLoading(D, dedupe) {
  var ix = index(D), adm = admittedSet(D, "old"), cop = dedupe ? clusters(D).copyOf : {}, d = [];
  D.E.forEach(function (e) {
    var first = {};
    e.a.map(function (i) { return ix.ART[i]; }).filter(function (a) { return adm.indexOf(a.s) >= 0 && !cop[a.i]; })
      .sort(function (x, y) { return cmp(x.d, y.d); })
      .forEach(function (a) { if (!first[a.s]) first[a.s] = a; });
    var L = [], R = [];
    Object.keys(first).forEach(function (s) { var b = blocOf(D, s); if (b === "left") L.push(first[s].v); else if (b === "right") R.push(first[s].v); });
    if (L.length && R.length) d.push(mean(R) - mean(L));
  });
  var m = mean(d), sd = Math.sqrt(d.reduce(function (t, x) { return t + (x - m) * (x - m); }, 0) / (d.length - 1));
  var se = sd / Math.sqrt(d.length);
  return { n: d.length, diff: m, lo: m - 1.96 * se, hi: m + 1.96 * se };
}
function mean(x) { return x.reduce(function (a, b) { return a + b; }, 0) / (x.length || 1); }

/* ====================================================== T7 stem matching */
// Inflectional surface forms only, longest first. Chains are listed as single forms.
var SUFFIXES = ["larından", "lerinden", "larında", "lerinde", "larını", "lerini", "larına", "lerine", "ların", "lerin",
  "ları", "leri", "lardan", "lerden", "larda", "lerde", "lara", "lere",
  "nın", "nin", "nun", "nün", "dan", "den", "tan", "ten", "yla", "yle", "lar", "ler",
  "yı", "yi", "yu", "yü", "ın", "in", "un", "ün", "ya", "ye", "da", "de", "ta", "te", "la", "le",
  "ı", "i", "u", "ü", "a", "e"].sort(function (a, b) { return b.length - a.length; });
var APOS = /['’ʼ]/;
function stemTR(word, P) {
  P = P || PARAMS;
  // A proper noun keeps the part before its apostrophe ("Meclis'te" -> "meclis"); then the same stripping applies.
  var w = trLower(String(word).split(APOS)[0]).replace(/[^a-zçğıöşüâîû0-9]/g, "");
  for (var layer = 0; layer < P.maxStripLayers; layer++) {
    var cut = null;
    for (var i = 0; i < SUFFIXES.length; i++) {
      var s = SUFFIXES[i];
      if (w.length > s.length && w.slice(-s.length) === s && w.length - s.length >= P.minStem) { cut = w.slice(0, -s.length); break; }
    }
    if (cut == null) break;
    w = cut;
  }
  return w;
}
function suffixOnly(a, b) {
  var na = trLower(String(a).split(APOS)[0]), nb = trLower(String(b).split(APOS)[0]);
  return na === nb || stemTR(a) === stemTR(b);
}

/* ===================================================== appeal adapter (F12) */
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function appealValidate(inp) {
  var err = [];
  var name = (inp.name || "").trim(), email = (inp.email || "").trim(), text = (inp.text || "").trim(), link = (inp.link || "").trim();
  if (name.length < 2 || name.length > 160) err.push("name");
  if (!EMAIL.test(email) || email.length > 320) err.push("email");
  if (text.length < 24 || text.length > 12000) err.push("text");
  if (link && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(link)) err.push("link");
  if (!inp.consent) err.push("consent");
  if (!inp.word) err.push("word");
  if (inp.honeypot) err.push("honeypot");
  return err;
}
function appealPayload(inp) {
  var lines = ["Olay: " + inp.eventId,
    "Başlık 1 (" + inp.a.outlet + "): " + inp.a.title,
    "Başlık 2 (" + inp.b.outlet + "): " + inp.b.title,
    "İşaretli kelime: " + inp.word, "", inp.text.trim()];
  var body = { name: inp.name.trim(), email: inp.email.trim(), requestedCorrection: lines.join("\n") };
  if (inp.link) body.evidenceUrl = inp.link.trim();
  if (inp.dbId) { body.entityType = "story_comparison"; body.entityId = inp.dbId; }
  return body;
}
// env: { fetch, endpoint, now, storage } — injected so tests can mock everything.
function appealSubmit(inp, env) {
  var errs = appealValidate(inp);
  if (errs.length) return Promise.resolve({ ok: false, errors: errs });
  var endpoint = env && env.endpoint !== undefined ? env.endpoint : CONFIG.correctionEndpoint;
  if (!endpoint) return Promise.resolve({ ok: false, disabled: true });
  var store = env && env.storage, now = env && env.now ? env.now() : Date.now();
  try { var last = store ? +store.getItem("cm3-appeal-last") : 0; if (last && now - last < 60000) return Promise.resolve({ ok: false, cooldown: true }); } catch (e) {}
  var url = String(endpoint).replace(/\/+$/, "") + "/api/trpc/editorial.submitCorrection";
  return env.fetch(url, { method: "POST", credentials: "omit", headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: appealPayload(inp) }) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var d = j && j.result && j.result.data && j.result.data.json;
      if (!d || d.id == null) return { ok: false, failed: true };
      try { if (store) store.setItem("cm3-appeal-last", String(now)); } catch (e) {}
      return { ok: true, id: d.id, accepted: d.accepted };
    }, function () { return { ok: false, failed: true }; });
}

/* ======================================================= Outlet register (crawler)
   The crawler's register (aylinunel/mediabias, sources.json) is loaded by the build with
   setRegister(). It only adds outlets: the page's own outlet data is not changed, so no
   bloc figure, panel rule or blind-spot test moves until crawled data is rebuilt. */
var REGISTER = { commit: null, sources: [] };
function setRegister(doc) { REGISTER.commit = doc && doc.commit || null; REGISTER.sources = doc && doc.sources || []; }
// Outlets in the register that the site has no profile for (no placement, no data this period).
function registerExtras(D) {
  var ix = index(D);
  return REGISTER.sources.filter(function (r) { return !ix.SRC[r.id]; });
}
// One row per register outlet: headlines this period, placement if any, collection notes.
function coverage(D) {
  var ix = index(D), byS = {};
  D.A.forEach(function (a) { byS[a.s] = (byS[a.s] || 0) + 1; });
  return REGISTER.sources.map(function (r) {
    var f = ix.FD[r.id], p = ix.SRC[r.id];
    var crawled = (f && f.n) || 0;
    return { id: r.id, name: r.name, website: r.website, feeds: r.feeds, notes: r.notes,
      profiled: !!p, placement: p ? p.lean : null, headlines: crawled, embedded: byS[r.id] || 0,
      state: crawled ? "data" : f ? "noData" : "pending" };
  });
}

/* ======================================================= Review desk (ADR-001)
   One seeded sampler for the reviewer sets, used by the page and by scripts/make_audit.js,
   so the ids on the desk match the CSV files. Scores are pure functions of the answers. */
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0; var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
// The first headline of an outlet in an event, and 2.0's default pair (most left and most right outlet).
function firstOf(D, e, s) {
  var ix = index(D);
  return e.a.map(function (i) { return ix.ART[i]; }).filter(function (a) { return a.s === s; })
    .sort(function (x, y) { return x.d.localeCompare(y.d); })[0];
}
function defaultPairOf(D, e) {
  var ix = index(D);
  var ss = e.s.filter(function (s) { return ix.SRC[s] && ix.SRC[s].lean != null && firstOf(D, e, s); })
    .sort(function (x, y) { return ix.SRC[x].lean - ix.SRC[y].lean; });
  return ss.length >= 2 ? [ss[0], ss[ss.length - 1]] : null;
}
// marker: { old(a, b) -> [words], new(a, b) -> [words] } — the page's own marking function in each mode.
/* The dataset as 2.0 stored it (1 Sept - 10 Oct), when the page carries the extended data
   (pipeline/extend.py): headlines added later and automatic events are left out, and events that
   later headlines joined get their stored members back. The review desk samples from this view
   so its items, and the decisions already recorded against them, do not move when data is added. */
function storedView(D) {
  var v3 = D.meta && D.meta.v3;
  if (!v3 || !v3.maxA) return D;
  return memo(D, "storedView", function () {
    var view = {}, orig = v3.storedEvents || {};
    Object.keys(D).forEach(function (k) { view[k] = D[k]; });
    view.A = D.A.filter(function (a) { return +a.i.slice(1) <= v3.maxA; });
    view.E = D.E.filter(function (e) { return !e.auto; }).map(function (e) {
      var o = orig[e.i]; if (!o) return e;
      var c = {}; Object.keys(e).forEach(function (k) { c[k] = k in o ? o[k] : e[k]; });
      return c;
    });
    return view;
  });
}
function reviewSets(D, marker) {
  D = storedView(D);
  var ix = index(D), n = notices(D), c = clusters(D), out = {};
  // Notices: 100 flagged (round robin over outlet × rule) and 100 unflagged, shuffled.
  var r = rng(3), groups = {};
  shuffle(D.A.filter(function (a) { return n.byArt[a.i]; }), r).forEach(function (a) {
    var k = a.s + "|" + n.byArt[a.i]; (groups[k] = groups[k] || []).push(a);
  });
  var pickF = [], keys = Object.keys(groups).sort();
  while (pickF.length < 100) keys.forEach(function (k) { if (pickF.length < 100 && groups[k].length) pickF.push(groups[k].shift()); });
  var pickU = shuffle(D.A.filter(function (a) { return !n.byArt[a.i]; }), r).slice(0, 100);
  out.ilan = shuffle(pickF.map(function (a) { return [a, 1]; }).concat(pickU.map(function (a) { return [a, 0]; })), r)
    .map(function (x, i) { return { id: "n" + (i + 1), a: x[0], flagged: x[1], rule: x[1] ? n.byArt[x[0].i] : "" }; });
  // Near-copies: 50 stored pairs and 50 plain pairs from the same events.
  r = rng(5);
  var fp = [], plain = [];
  D.E.forEach(function (e) {
    Object.keys(e.rep || {}).forEach(function (k) { fp.push([ix.ART[e.rep[k]], ix.ART[k], e.i]); });
    var as = e.a.map(function (i) { return ix.ART[i]; }).filter(function (a) { return !e.rep[a.i]; });
    for (var i = 0; i + 1 < as.length; i += 2) if (as[i].s !== as[i + 1].s) plain.push([as[i], as[i + 1], e.i]);
  });
  out.yanki = shuffle(shuffle(fp, r).slice(0, 50).map(function (p) { return p.concat(1); })
    .concat(shuffle(plain, r).slice(0, 50).map(function (p) { return p.concat(0); })), r)
    .map(function (p, i) { return { id: "y" + (i + 1), e: p[2], a: p[0], b: p[1], flagged: p[3] }; });
  var chains = [];
  Object.keys(c.byEvent).forEach(function (e) { c.byEvent[e].forEach(function (x) { chains.push([e, x]); }); });
  out.zincir = shuffle(chains, r).slice(0, 30).map(function (x, i) { return { id: "z" + (i + 1), e: x[0], chain: x[1] }; });
  // Marked words: 100 default pairs, old and new marks shown blind as X and Y.
  if (marker) {
    r = rng(6);
    var pairs = [];
    D.E.forEach(function (e) {
      var p = defaultPairOf(D, e); if (!p) return;
      var a = firstOf(D, e, p[0]), b = firstOf(D, e, p[1]);
      pairs.push({ e: e, a: a, b: b, old: marker.old(a, b), "new": marker["new"](a, b) });
    });
    out.isaret = shuffle(pairs.filter(function (p) { return p.old.length || p["new"].length; }), r).slice(0, 100).map(function (p, i) {
      var flip = r() < 0.5;
      return { id: "p" + (i + 1), e: p.e.i, a: p.a, b: p.b, X: flip ? p["new"] : p.old, Y: flip ? p.old : p["new"], xIs: flip ? "new" : "old" };
    });
  }
  return out;
}
// answers: { id: "e" | "h" }. A gate passes only when every item is answered.
function scoreIlan(items, answers) {
  var f = 0, fy = 0, u = 0, uy = 0, done = 0;
  items.forEach(function (it) {
    var v = answers[it.id]; if (v !== "e" && v !== "h") return;
    done++;
    if (it.flagged) { f++; if (v === "e") fy++; } else { u++; if (v === "e") uy++; }
  });
  var precision = f ? fy / f : null;
  return { total: items.length, done: done, precision: precision, miss: u ? uy / u : null,
    pass: done === items.length && precision != null && precision >= PARAMS.noticePrecisionPass };
}
function scoreYanki(items, answers) {
  var done = 0, fs = 0, f = 0, us = 0, u = 0;
  items.forEach(function (it) {
    var v = answers[it.id]; if (v !== "e" && v !== "h") return;
    done++;
    if (it.flagged) { f++; if (v === "e") fs++; } else { u++; if (v === "e") us++; }
  });
  return { total: items.length, done: done, flaggedSame: fs, flagged: f, plainSame: us, plain: u,
    pass: done === items.length && fs === f && us === 0 };
}
// answers: { id: { realX, realY } } counts of marked words that are a real wording difference.
function scoreIsaret(items, answers) {
  var t = { old: [0, 0], "new": [0, 0] }, done = 0;
  items.forEach(function (it) {
    var a = answers[it.id]; if (!a || a.realX == null || a.realY == null) return;
    done++;
    var xv = it.xIs, yv = xv === "new" ? "old" : "new";
    t[xv][0] += Math.min(+a.realX, it.X.length); t[xv][1] += it.X.length;
    t[yv][0] += Math.min(+a.realY, it.Y.length); t[yv][1] += it.Y.length;
  });
  var share = function (v) { return t[v][1] ? t[v][0] / t[v][1] : null; };
  return { total: items.length, done: done, oldShare: share("old"), newShare: share("new"),
    pass: done === items.length && share("new") != null && share("new") >= PARAMS.markRealPass };
}
// A store-safe id for an owner group key ("Turkuvaz Medya (Kalyon Grubu)" -> "turkuvaz-medya-kalyon-grubu").
function safeId(s) {
  var map = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u" };
  return trLower(s).replace(/[çğıöşüâîû]/g, function (c) { return map[c]; }).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}
// Owner decisions from the store: { safeId: {lit} | {title, url, date} }. Only what citation() accepts takes effect.
function applyOwnerSources(D, stored) {
  Object.keys(OWNER_SOURCES).forEach(function (k) { delete OWNER_SOURCES[k]; });
  ownerGroupsRaw(D).forEach(function (g) {
    var ref = stored && stored[safeId(g.key)];
    if (ref && citation(ref)) OWNER_SOURCES[g.key] = ref.lit != null ? { lit: ref.lit } : { title: ref.title, url: ref.url, date: ref.date };
  });
}

var API = { PARAMS: PARAMS, FLAGS: FLAGS, CONFIG: CONFIG, TR: TR, LBL: LBL, FORBIDDEN: FORBIDDEN, OWNER_SOURCES: OWNER_SOURCES,
  storedView: storedView, trSuffix: trSuffix, trLower: trLower, trUpper: trUpper, cmp: cmp, fill: fill, pct1: pct1, scanForbidden: scanForbidden, blocOfLean: blocOfLean,
  registryAudit: registryAudit, panel: panel, admittedSet: admittedSet, participation: participation, topicGaps: topicGaps,
  sensitivity: sensitivity, classify: classify, ruleHits: ruleHits, noticeKind: noticeKind, noticePlace: noticePlace, isAllCaps: isAllCaps, notices: notices, ownerGroups: ownerGroups,
  voices: voices, ownerShadow: ownerShadow, timeQuality: timeQuality, firstSeen: firstSeen, clusters: clusters,
  rankFlows: rankFlows, pairedLoading: pairedLoading, stemTR: stemTR, suffixOnly: suffixOnly,
  rng: rng, shuffle: shuffle, defaultPairOf: defaultPairOf, reviewSets: reviewSets, scoreIlan: scoreIlan,
  scoreYanki: scoreYanki, scoreIsaret: scoreIsaret, safeId: safeId, applyOwnerSources: applyOwnerSources,
  setRegister: setRegister, registerExtras: registerExtras, coverage: coverage,
  setLiterature: setLiterature, literature: literature, evidenceGrade: evidenceGrade, basisEligible: basisEligible, citation: citation,
  appeal: { validate: appealValidate, payload: appealPayload, submit: appealSubmit } };
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.CM3 = API;
})(this);

CM3.setLiterature([
 {
  "n": 1,
  "category": "Journal article",
  "authors": "Tunç, Aslı",
  "year": 2013,
  "title": "Freedom of expression debates in Turkey: Acute problems and new hopes",
  "venue": "International Journal of Media & Cultural Politics 9(2): 153–163 (Intellect)",
  "doi": "10.1386/macp.9.2.153_1",
  "pid": "Handle: https://hdl.handle.net/11411/8082 (İstanbul Bilgi University repository)",
  "url": "https://doi.org/10.1386/macp.9.2.153_1",
  "access": "Paywalled (publisher); repository record available",
  "idStatus": "DOI verified",
  "covers": "Ownership structure, legal constraints, self-censorship, owner-politics ties and weakened editorial independence; social media after the Gezi protests.",
  "notes": "DOI confirmed on the publisher page.",
  "kapsam": "Mülkiyet yapısı, hukuki kısıtlar, sahip-siyaset ilişkileri ve editoryal bağımsızlık üzerine bir değerlendirme.",
  "rule": "owner",
  "primary": true
 },
 {
  "n": 2,
  "category": "Thesis",
  "authors": "Kanver, Duygu",
  "year": 2013,
  "title": "\"Freedom\" of the Press in Turkey: Journalist Imprisonments During the Last Decade, 2002–2012",
  "venue": "MA thesis (Journalism), Michigan State University",
  "doi": "No DOI found",
  "pid": "MSU ETD record 1700",
  "url": "https://d.lib.msu.edu/etd/1700",
  "access": "Open (full-text download on repository)",
  "idStatus": "No DOI found",
  "covers": "Interviews with journalists jailed 2002–2012: reasons for imprisonment, censorship, effects on the public.",
  "notes": "The MSU repository was blocking access when I checked the record page, so a DOI could not be ruled out there.",
  "kapsam": "2002–2012 arasında tutuklanan gazetecilerle yapılan görüşmeler.",
  "rule": "absence",
  "primary": true
 },
 {
  "n": 3,
  "category": "Thesis",
  "authors": "Not captured – see record",
  "year": "Not captured",
  "title": "Freedom of the Press in Turkey (exact title to confirm on record)",
  "venue": "Brunel University London (thesis)",
  "doi": "No DOI found",
  "pid": "Handle (derived from the file path): http://bura.brunel.ac.uk/handle/2438/13657",
  "url": "https://bura.brunel.ac.uk/bitstream/2438/13657/1/FulltextThesis.pdf",
  "access": "Open (full-text PDF)",
  "idStatus": "Handle only (derived)",
  "covers": "Turkish press law and practice, and the historical press–politics relationship (1931 Press Code onward), including media ownership.",
  "notes": "Author, year and exact title were not visible in the search extract; confirm on the Brunel record.",
  "kapsam": "Türk basın hukuku ve 1931 Basın Kanunu'ndan bu yana basın-siyaset ilişkisi; medya mülkiyeti dahil.",
  "rule": "owner",
  "primary": true
 },
 {
  "n": 4,
  "category": "Thesis",
  "authors": "Not captured – see record",
  "year": "Not captured",
  "title": "Media Ownership Structure and Media Freedom in Turkey",
  "venue": "Boğaziçi University (thesis)",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://digitalarchive.library.bogazici.edu.tr/bitstreams/1850781e-97e3-48d5-8f05-fa320f722bac/download",
  "access": "Open (full-text download)",
  "idStatus": "No DOI found",
  "covers": "Argues the monopolistic ownership structure damages journalists' internal freedom; includes content analysis of newspapers.",
  "notes": "Author and year were not visible in the search extract.",
  "kapsam": "Tekelleşmiş mülkiyet yapısının gazetecilerin kurum içi özgürlüğüne etkisi; gazete içerik analizi içerir.",
  "rule": "owner",
  "primary": true
 },
 {
  "n": 5,
  "category": "Thesis",
  "authors": "Özden, Begüm Gürcüoğlu",
  "year": 2020,
  "title": "Journalism at risk: to what extent does the domestic and international norms are capable of protecting freedom of press in Turkey?",
  "venue": "Koç University, Graduate School of Social Sciences and Humanities (Public Law)",
  "doi": "No DOI found",
  "pid": "Handle: https://hdl.handle.net/20.500.14288/5001",
  "url": "https://research.hub.ku.edu.tr/entities/publication/c0e80e29-ef58-4498-a0c1-43fa25f39532/full",
  "access": "Restricted (Koç University affiliates only)",
  "idStatus": "Handle only",
  "covers": "Legal protection of press freedom under domestic and international norms.",
  "notes": "Record lists it as a thesis in Public Law; the degree level is not stated.",
  "kapsam": "Basın özgürlüğünün iç hukuk ve uluslararası normlarla korunması.",
  "rule": "context",
  "primary": true
 },
 {
  "n": 6,
  "category": "Thesis",
  "authors": "Yaylali, Gözde",
  "year": "Not captured",
  "title": "Pressefreiheit in der Türkei: Veränderungen der Arbeitsbedingungen türkischer Printjournalisten und Printjournalistinnen unter der Regierung Recep Tayyip Erdoğans",
  "venue": "University of Vienna (Magisterarbeit)",
  "doi": "No DOI found",
  "pid": "PHAIDRA permalink: https://phaidra.univie.ac.at/o:1337729",
  "url": "https://phaidra.univie.ac.at/o:1337729",
  "access": "See record",
  "idStatus": "Persistent ID (PHAIDRA)",
  "covers": "Interviews with print journalists on how working conditions changed after the AKP took power.",
  "notes": "In German, with an English abstract. Year not visible in the extract.",
  "kapsam": "AKP döneminde yazılı basın çalışanlarının çalışma koşullarındaki değişim üzerine görüşmeler.",
  "rule": "absence",
  "primary": true
 },
 {
  "n": 7,
  "category": "Monitoring report",
  "authors": "İnceoğlu, Yasemin; Erbaysal Filibeli, Tirşe; Özbek, Melis; Çenberli, Yağmur",
  "year": 2025,
  "title": "Monitoring media pluralism in the European Union: results of the MPM2025. Country report: Turkey",
  "venue": "European University Institute, Centre for Media Pluralism and Media Freedom (CMPF)",
  "doi": "No DOI found",
  "pid": "Handle: https://hdl.handle.net/1814/92914",
  "url": "https://cadmus.eui.eu/entities/publication/3f5ff71e-cc1d-4835-8caf-6da0475dde51",
  "access": "Open access (CC BY 4.0)",
  "idStatus": "Handle only",
  "covers": "Annual risk assessment of media pluralism (legal, political, economic) for Turkey, reporting year 2024.",
  "notes": "The record page mentions a DOI but did not display its value, so none is listed. Earlier editions have DOIs: MPM2024 10.2870/664316; MPM2023 10.2870/842959; MPM2017 10.2870/534918.",
  "kapsam": "Türkiye için 2024 yılı medya çoğulculuğu risk değerlendirmesi: hukuki, siyasi ve ekonomik göstergeler.",
  "rule": "owner",
  "primary": true
 },
 {
  "n": 8,
  "category": "Survey report",
  "authors": "Newman, Nic, et al.",
  "year": 2025,
  "title": "Reuters Institute Digital News Report 2025",
  "venue": "Reuters Institute for the Study of Journalism, University of Oxford",
  "doi": "10.60625/risj-8qqf-jt36",
  "pid": "None",
  "url": "https://doi.org/10.60625/risj-8qqf-jt36",
  "access": "Open access",
  "idStatus": "DOI taken from report PDF",
  "covers": "Annual 48-market survey; the Turkey data show trust in news at its lowest since 2015.",
  "notes": "DOI read from a copy of the report PDF; I did not open the resolver page. Turkey figures reached me via Turkish Minute's coverage, so check the report's Turkey page.",
  "kapsam": "48 pazarda yıllık okur anketi. Listeye göre Türkiye'de haberlere güven 2015'ten bu yana en düşük düzeyde; bu rakam bir haber aktarımından alındı, raporun Türkiye sayfasında doğrulanmalı.",
  "rule": "context",
  "primary": true
 },
 {
  "n": 9,
  "category": "Monitoring report",
  "authors": "Council of Europe Safety of Journalists Platform (partner organisations)",
  "year": "2026 (covers 2025)",
  "title": "Annual report of the Platform to Promote the Protection of Journalism and Safety of Journalists (exact title to confirm)",
  "venue": "Council of Europe",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://turkishminute.com/2026/03/06/turkey-among-europes-most-hostile-environments-for-journalism-council-of-europe-report-says/amp/",
  "access": "Open (news coverage; original report not opened)",
  "idStatus": "Secondary source only",
  "covers": "Places Turkey among Europe's most hostile environments for journalism, with 24 journalists jailed.",
  "notes": "The link is news coverage, not the report itself. Find the original on the Council of Europe platform before citing.",
  "kapsam": "Türkiye'yi gazetecilik için Avrupa'nın en zor ortamları arasında sayan yıllık rapor (haber aktarımı).",
  "rule": "absence",
  "primary": false
 },
 {
  "n": 10,
  "category": "Research report",
  "authors": "Aydınlı, Sinem (bianet)",
  "year": 2026,
  "title": "Monopolized ownership, fragile trust, and audience disengagement: The future of media in Turkey – Assessments of key actors",
  "venue": "Our Media project (IPS Communication Foundation / bianet and regional partners)",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://bianet.org/haber/turkey-s-media-landscape-multiplicity-without-pluralism-318078",
  "access": "Open (news coverage of the report)",
  "idStatus": "No DOI found",
  "covers": "Media workers' testimonies on legal pressure, economic fragility, ownership concentration and platform control.",
  "notes": "The link is bianet's write-up; the full report is not linked there in what I saw.",
  "kapsam": "Medya çalışanlarının hukuki baskı, ekonomik kırılganlık, mülkiyet yoğunlaşması ve platform denetimi üzerine anlatımları (haber aktarımı).",
  "rule": "owner",
  "primary": false
 },
 {
  "n": 11,
  "category": "Research report",
  "authors": "Not captured – see record",
  "year": "c. 2012",
  "title": "Media Integrity Report: Media ownership and finances in Turkey",
  "venue": "Peace Institute, Ljubljana (Media Integrity series)",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://www.mirovni-institut.si/wp-content/uploads/2012/12/Media-Ownership-and-Finances-in-Turkey.pdf",
  "access": "Open (PDF)",
  "idStatus": "No DOI found",
  "covers": "Highly concentrated, clientelist ownership; 2002 deregulation removed cross-ownership limits; no ownership disclosure duty.",
  "notes": "Year inferred from the file path (2012/12); author not visible in the extract.",
  "kapsam": "Yoğun ve kayırmacı mülkiyet; 2002 düzenlemesiyle çapraz mülkiyet sınırının kalkması; mülkiyet açıklama yükümlülüğünün olmaması.",
  "rule": "owner",
  "primary": true
 },
 {
  "n": 12,
  "category": "Research brief",
  "authors": "International Press Institute (IPI)",
  "year": "Not captured",
  "title": "Self-censorship in Turkey growing, journalists report",
  "venue": "International Press Institute",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://ipi.media/self-censorship-in-turkey-growing-journalists-report/",
  "access": "Open",
  "idStatus": "No DOI found",
  "covers": "Journalists' accounts of self-censorship after the July 2016 coup attempt and under emergency decrees.",
  "notes": "Publication date not visible in the extract.",
  "kapsam": "2016 darbe girişimi ve olağanüstü hal kararnameleri sonrasında gazetecilerin yazmaktan kaçındıklarını anlattıkları konular.",
  "rule": "absence",
  "primary": true
 },
 {
  "n": 13,
  "category": "Essay",
  "authors": "Dündar, Can (per article)",
  "year": 2017,
  "title": "Turkish media in exile? Think again",
  "venue": "Committee to Protect Journalists (CPJ), July 2017",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://cpj.org/2017/07/media-in-exile-think-again/",
  "access": "Open",
  "idStatus": "No DOI found",
  "covers": "First-person account of setting up an exile outlet (#Özgürüz) in Germany and of censorship at home.",
  "notes": "Authorship inferred from the first-person text and photo caption; confirm on the page.",
  "kapsam": "Almanya'da kurulan bir sürgün yayın organının (#Özgürüz) birinci ağızdan anlatımı.",
  "rule": "panel",
  "primary": true
 },
 {
  "n": 14,
  "category": "Dossier",
  "authors": "Various contributors (CCRD panel, Humboldt University Berlin)",
  "year": 2021,
  "title": "Freedom of the Press in Turkey: Challenges and Implications",
  "venue": "Reset Dialogues on Civilizations, dossier by the Center for Comparative Research on Democracy (CCRD)",
  "doi": "No DOI found",
  "pid": "None found",
  "url": "https://www.resetdoc.org/dossier/freedom-press-turkey-challenges-implications/",
  "access": "Open",
  "idStatus": "No DOI found",
  "covers": "Press oppression, alternative media, and journalism from exile.",
  "notes": "Event page names Esra Arsan and Elisabeth Kimmerle as speakers; the dossier's full contributor list was not checked.",
  "kapsam": "Alternatif medya ve sürgünde gazetecilik üzerine bir panel dosyası.",
  "rule": "panel",
  "primary": true
 }
]);
CM3.setRegister({
 "commit": "4c267f4",
 "observed": "2026-09-08T22:38:00Z",
 "sources": [
  {
   "id": "hurriyet",
   "name": "Hürriyet",
   "website": "https://www.hurriyet.com.tr",
   "feeds": 4,
   "notes": [
    {
     "k": "noSitemap"
    },
    {
     "k": "listing"
    }
   ]
  },
  {
   "id": "mynet",
   "name": "Mynet",
   "website": "https://www.mynet.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "sabah",
   "name": "Sabah",
   "website": "https://www.sabah.com.tr",
   "feeds": 3,
   "notes": []
  },
  {
   "id": "milliyet",
   "name": "Milliyet",
   "website": "https://www.milliyet.com.tr",
   "feeds": 4,
   "notes": [
    {
     "k": "noSitemap"
    }
   ]
  },
  {
   "id": "sozcu",
   "name": "Sözcü",
   "website": "https://www.sozcu.com.tr",
   "feeds": 4,
   "notes": []
  },
  {
   "id": "sondakika",
   "name": "Sondakika.com",
   "website": "https://www.sondakika.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "haberturk",
   "name": "Habertürk",
   "website": "https://www.haberturk.com",
   "feeds": 5,
   "notes": []
  },
  {
   "id": "halktv",
   "name": "Halk TV",
   "website": "https://halktv.com.tr",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "onedio",
   "name": "Onedio",
   "website": "https://onedio.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "birgun",
   "name": "BirGün",
   "website": "https://www.birgun.net",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "t24",
   "name": "T24",
   "website": "https://t24.com.tr",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "ntv",
   "name": "NTV",
   "website": "https://www.ntv.com.tr",
   "feeds": 2,
   "notes": []
  },
  {
   "id": "karar",
   "name": "Karar",
   "website": "https://www.karar.com",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "memurlar",
   "name": "Memurlar.net",
   "website": "https://www.memurlar.net",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "yenisafak",
   "name": "Yeni Şafak",
   "website": "https://www.yenisafak.com",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "haber7",
   "name": "Haber7",
   "website": "https://www.haber7.com",
   "feeds": 1,
   "notes": [
    {
     "k": "noSitemap"
    }
   ]
  },
  {
   "id": "bloomberght",
   "name": "Bloomberg HT",
   "website": "https://www.bloomberght.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "cnnturk",
   "name": "CNN Türk",
   "website": "https://www.cnnturk.com",
   "feeds": 4,
   "notes": [
    {
     "k": "noSitemap"
    }
   ]
  },
  {
   "id": "akit",
   "name": "Yeni Akit",
   "website": "https://www.yeniakit.com.tr",
   "feeds": 5,
   "notes": []
  },
  {
   "id": "internethaber",
   "name": "İnternet Haber",
   "website": "https://www.internethaber.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "aa",
   "name": "Anadolu Ajansı",
   "website": "https://www.aa.com.tr",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "tv100",
   "name": "TV100",
   "website": "https://www.tv100.com",
   "feeds": 5,
   "notes": []
  },
  {
   "id": "ekonomim",
   "name": "Ekonomim",
   "website": "https://www.ekonomim.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "nefes",
   "name": "Nefes",
   "website": "https://www.nefes.com.tr",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "diken",
   "name": "Diken",
   "website": "https://www.diken.com.tr",
   "feeds": 4,
   "notes": []
  },
  {
   "id": "trthaber",
   "name": "TRT Haber",
   "website": "https://www.trthaber.com",
   "feeds": 2,
   "notes": []
  },
  {
   "id": "cumhuriyet",
   "name": "Cumhuriyet",
   "website": "https://www.cumhuriyet.com.tr",
   "feeds": 2,
   "notes": []
  },
  {
   "id": "ensonhaber",
   "name": "En Son Haber",
   "website": "https://www.ensonhaber.com",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "aksam",
   "name": "Akşam",
   "website": "https://www.aksam.com.tr",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "posta",
   "name": "Posta",
   "website": "https://www.posta.com.tr",
   "feeds": 0,
   "notes": [
    {
     "k": "noSitemap"
    }
   ]
  },
  {
   "id": "haberglobal",
   "name": "Haber Global",
   "website": "https://haberglobal.com.tr",
   "feeds": 0,
   "notes": [
    {
     "k": "host",
     "h": "haberglobal.com"
    }
   ]
  },
  {
   "id": "odatv",
   "name": "Oda TV",
   "website": "https://www.odatv.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "gercekgundem",
   "name": "Gerçek Gündem",
   "website": "https://www.gercekgundem.com",
   "feeds": 5,
   "notes": []
  },
  {
   "id": "takvim",
   "name": "Takvim",
   "website": "https://www.takvim.com.tr",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "ahaber",
   "name": "A Haber",
   "website": "https://www.ahaber.com.tr",
   "feeds": 5,
   "notes": []
  },
  {
   "id": "aydinlik",
   "name": "Aydınlık",
   "website": "https://www.aydinlik.com.tr",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "star",
   "name": "Star",
   "website": "https://www.star.com.tr",
   "feeds": 5,
   "notes": []
  },
  {
   "id": "tgrt",
   "name": "TGRT Haber",
   "website": "https://www.tgrthaber.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "dunya",
   "name": "Dünya",
   "website": "https://www.dunya.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "turkiyegz",
   "name": "Türkiye Gazetesi",
   "website": "https://www.turkiyegazetesi.com.tr",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "oksijen",
   "name": "Oksijen",
   "website": "https://gazeteoksijen.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "f5haber",
   "name": "F5Haber",
   "website": "https://www.f5haber.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "haberler",
   "name": "Haberler.com",
   "website": "https://www.haberler.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "milligazete",
   "name": "Milli Gazete",
   "website": "https://www.milligazete.com.tr",
   "feeds": 1,
   "notes": []
  },
  {
   "id": "vatan",
   "name": "Vatan",
   "website": "https://www.gazetevatan.com",
   "feeds": 0,
   "notes": [
    {
     "k": "noSitemap"
    }
   ]
  },
  {
   "id": "dirilis",
   "name": "Diriliş Postası",
   "website": "https://www.dirilispostasi.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "yeniasya",
   "name": "Yeni Asya",
   "website": "https://www.yeniasya.com.tr",
   "feeds": 0,
   "notes": [
    {
     "k": "extraSitemap"
    }
   ]
  },
  {
   "id": "artigercek",
   "name": "Artı Gerçek",
   "website": "https://artigercek.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "dha",
   "name": "Demirören Haber Ajansı",
   "website": "https://www.dha.com.tr",
   "feeds": 0,
   "notes": [
    {
     "k": "noSitemap"
    }
   ]
  },
  {
   "id": "yenicag",
   "name": "Yeni Çağ",
   "website": "https://www.yenicaggazetesi.com",
   "feeds": 2,
   "notes": []
  },
  {
   "id": "instacp",
   "name": "Instacp",
   "website": "https://www.instacp.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "gazetelerdebugun",
   "name": "GazetelerdeBugün",
   "website": "https://www.gazetelerdebugun.com",
   "feeds": 0,
   "notes": []
  },
  {
   "id": "tele1",
   "name": "TELE1",
   "website": "https://www.tele1.com.tr",
   "feeds": 0,
   "notes": []
  }
 ]
});
