# Çapraz Manşet 3.0 — Salt-okunur Kod ve Ürün İncelemesi

**İncelenen dosya:** `/home/ubuntu/upload/ÇaprazManşet3.0.html`
**Kapsam:** Tek HTML artefaktının statik incelemesi; uygulama değiştirilmedi, tarayıcı çalıştırılmadı ve ağ isteği yapılmadı.
**İnceleme yöntemi:** BeautifulSoup ile DOM/script/JSON envanteri, JSON şema ve referans bütünlüğü kontrolleri, URL şema denetimi, JavaScript `node --check` sözdizimi denetimi ve kaynak satırı incelemesi.

## Özet

Bu artefakt, Türkçe haber başlıklarını olaylar, kurumlar, kapsama asimetrisi, anlatı, çerçeveleme ve yöntem ekranlarında karşılaştıran; dikkatle düşünülmüş bir statik araştırma prototipidir. Ancak 6.8 MB tek dosya, gömülü snapshot verisi, gerçek zamanlı olmayan toplama, korumasız/çelişkili düzeltme-akışı ve taşınabilir bir yetkilendirme sınırının yokluğu; “temiz refactor + gerçek Türkçe scraper + yeni GitHub deposu” hedefi için **bloklayıcıdır**.

**Karar:** **Değişiklik iste — onaylanamaz.** Önce gerçek veri hattı, sunucu tarafı düzeltme/inceleme işlemleri ve yetkilendirme kurulmalı; sonra kullanıcı arayüzü özellik eşdeğerliği modüler biçimde taşınmalıdır.

## İnceleme Özeti ve Doğrulanan Bulgular

- Dosya 6,844,576 bayt; 10,776 fiziksel satırdır. Beş inline `<script>`, üç inline `<style>` içerir. Çalışma zamanında doğrudan HTML’de buton/form yoktur; arayüz bütünüyle JavaScript string-render ile üretilir.
- Gömülü `cm-data` JSON’u **6,018,653 karakter**, yani dosyanın yaklaşık **%90’ı**dır. Inline JavaScript 537,425, inline CSS 113,783 karakterdir.
- `node --check`, üç çalıştırılabilir inline script için geçmiştir. Bu yalnızca parse/sözdizimi sağlığıdır; davranış, güvenlik ve entegrasyon testi değildir.
- Mevcut JSON veri kümesindeki tüm 16,088 incelenen URL (`A.u`, kaynak, feed ve bibliyografik URL’ler) HTTPS’tir; `javascript:` veya `data:` bulunmamıştır.
- Mevcut gömülü veri referansları tutarlıdır: yinelenen makale/olay/kaynak kimliği yoktur; olay→makale, olay→kaynak, makale→kaynak, feed→kaynak, konu→olay ve tekrar temsilcisi→makale ilişkilerinde kırık referans bulunmamıştır.
- Buna karşılık, UI’nin kullandığı makale dizisi `D.A` 15,913 kayıttır; metadata `counts.articles` ve `harvested` 105,869, `political` 75,849, `embedded` 15,913 demektedir. Bu terimler arayüzde ayrıştırılmadan kullanıldığından, hangi korpusun ekranda/ölçümlerde kullanıldığı belirsizdir.

## Özellik Eşdeğerliği Envanteri (Taşınacak Yüzey)

Aşağıdaki işlevler refactor kabul kriteri olarak korunmalıdır. Route tanımı kaynakta `3700–3816`, güncel gezinti katmanı `9086–9128` arasındadır.

| Route / durum | Mevcut işlev |
|---|---|
| `#/` | Ana sayfa, öne çıkan olay, split-card karşılaştırması, konu kartları, kör-nokta özetleri, tema ve animasyonlu hero |
| `#/olaylar?t=liste` | Olay listesi; arama, sıralama, kart/tablo/spektrum görünümleri |
| `#/olaylar?t=kor` | Normalize edilmiş kör nokta görünümü |
| `#/olaylar?t=konular` | Konu dizini |
| `#/olaylar?t=kapsama` | Kapsama görünümü |
| `#/olaylar?t=ilan` | İlan/duyuru ayrımı (özellik bayrağıyla) |
| `#/olay?e=<id>` | Olay ayrıntısı, kurum başlıkları, split-card, işaretli sözcük karşılaştırması ve düzeltme girişi |
| `#/konu?k=<id>` | Konu ayrıntısı ve olayları |
| `#/anlati` | Anlatı haritası; hafta/olay seçimi, akış/kart/tablo görünümü, sorumluluk grafiği |
| `#/kurumlar` | Genel bakış, kurum listesi, ikili karşılaştırma, kayıt defteri ve güven sekmeleri |
| `#/kurum?s=<id>` | Kurum profili; altı eksenli yerleşim, başlıklar, kapsama ve karşılaştırmalar |
| `#/harita` | Atlas/komşuluk/paralel-koordinat haritaları |
| `#/bulgular?t=temel|ileri` | Temel bulgular ve gömülü ileri analiz görselleştirmeleri |
| `#/yanlilik?t=kesif|cozumleyici|bicimler|turkiye` | Yapı keşfi/kütüphane, kural tabanlı başlık çözümleyici, üretim aşamaları ve Türkiye bağlamı |
| `#/yontem?s=<n>` | Yöntem, derlem/kümeleme/puanlama/kapsama/anlatı/ileri analiz dokümantasyonu |
| `#/benim?t=akis|denge|takip` | Tarayıcıda tutulan takip, okuma geçmişi, kişisel akış ve denge görünümü |
| `#/ara?q=<metin>` | Olay, kurum, konu ve başlık araması |
| `#/yonetim?t=panel|inceleme|ozet|saglik|dogrulama` | Operasyon paneli, yerel inceleme kuyruğu, yerel düzeltme özetleri, akış sağlığı ve opsiyonel doğrulama masası |
| Global | Açık/koyu tema, mobil menü, açık kaynak başlık linkleri, yöntem uyarıları, düzeltme/itiraz modalları, statik veri için konsol denetim API’si |

## Kritik Sorunlar (Birleştirmeden Önce Giderilmeli)

### C1. Gerçek scraper/veri yenileme yok; mevcut ürün yalnızca gömülü bir snapshot

**Kanıt:** Türkçe katman kendisi DOM dışında tek ağ yolu olarak `appeal.submit`i tanımlar (`1706–1712`). `CONFIG.correctionEndpoint` açıkça `null`dur (`1767`). Front end `window.DATA` ile gelen veriye dayanır (`3231–3237`); 6 MB `cm-data` payload’ı HTML içindedir (fiziksel satır `1705`). Buna rağmen yöntem sayfası site haritalarından geçmişe dönük toplama anlatır (`8879–8883`), fakat bu dosyada sitemap/RSS çekme, robots denetimi, HTML ayrıştırma, kuyruğa alma ya da veri yayımlama kodu yoktur.

**Etki:** Yeni haberler, kaynak başarısızlıkları, deduplikasyon, yeniden kümeleme ve ölçümlerin yeniden üretimi dağıtım dışında gerçekleşemez. “Akış sağlığı” ekranı gerçek zamanlı gözlem değil, snapshot içinde taşınan `FD` verisinin gösterimidir. İstenen gerçek Türkçe scraper hedefi karşılanmamıştır.

**Öneri:** Scraper’ı UI’dan ayırın. Kaynak kaydı → robots/TOS politikası → sitemap/RSS keşfi → izinli domain fetch’i → Türkçe başlık/tarih çıkarımı → normalizasyon/dedup → olay kümeleri → sürümlü yayın adımlarını işçi (worker) işinde kurun. Her çalışmayı `runId`, kaynak URL, çekim zamanı, HTTP sonucu, içerik hash’i, parser sürümü, kural/model sürümü ve karar gerekçesiyle saklayın. Front end yalnızca imzalı/sürümlü, okunabilir API veya statik export tüketmelidir.

### C2. Düzeltme/itiraz akışı kullanıcı açısından teslim etmiyor; kişisel veri tarayıcıda tutuluyor ve iki çelişkili yol var

**Kanıt:** Eski “Düzeltme iste” formu ad, e-posta, açıklama ve kanıt URL’sini `cm2-fixes` localStorage anahtarına yazar (`9353–9389`); metin bunu açıkça “yalnızca bu tarayıcıda saklanır; sunucuya gönderilmez” diye belirtir (`9368–9369`). Yönetim özeti de yalnızca aynı tarayıcıdaki kayıtları okur (`9466–9478`). Diğer itiraz formu ise isteği yalnızca bir endpoint varsa POST eder (`2381–2398`), fakat endpoint `null`dur (`1767`); özellik bayrağı açıktır (`1763–1764`). Eski inceleme kuyruğu da karar/audit trail’i yalnızca `cm-review-v2` localStorage’da tutar (`4862–4881`).

**Etki:** Bir okuyucu talebinin editöre ulaştığını sanabilir; farklı cihazda yönetici hiçbir şey görmez. Ortak bilgisayarda e-posta ve açıklama sonraki kullanıcı tarafından okunabilir. Talep kaybı, silme/tutma politikası, durum güncellemesi, kanıt eki, mükerrer bildirim ve kamuya açık düzeltme notu için güvenilir kayıt yoktur.

**Öneri:** Tek bir sunucu-tarafı `CorrectionCase` iş akışı kurun: `submitted → triage → investigating → resolved/rejected → published-correction/closed`. PII’yi ayrı, şifreli erişim alanında tutun; vaka numarası, onay/aydınlatma metni sürümü, rate limit, honeypot, sunucu doğrulaması ve saklama/silme politikası ekleyin. İçerik sürümü ve etkilenen olay/makale/kurum kaydıyla ilişkilendirin. Kullanıcıya yalnızca takip numarası ve açık bir teslim durumu verin; localStorage yalnızca form taslağı için, PII’siz ve açık rızayla kullanılmalıdır.

### C3. Yönetim ve doğrulama masası için taşınabilir, sunucu tarafında zorlanan yetkilendirme yok

**Kanıt:** `#/yonetim` route’u normal hash router tarafından doğrudan render edilir (`3759–3760`, `10447–10470`); ayrı bir giriş/oturum kapısı yoktur. Yeni doğrulama masası, varsa `window.claude` üzerinden istemcide `data.write`/`canEdit` denetimi yapar (`10003–10020`) ve istemci kodu belge yazma çağrısı üretir (`10036–10050`). Arayüzde butonları devre dışı bırakmak (`10165–10167`) bir yetkilendirme denetimi değildir. Bu artefakt, bu dış depolamanın ACL/RLS kurallarını veya denetim kaydını sağlamaz.

**Etki:** GitHub’a taşınacak bağımsız üründe “Yönetim” görünümü gerçekten korunmuş sayılmaz. İstemci mantığının değiştirilmesiyle rol kontrolü atlanabilir; ayrıca paylaşılan inceleme kararlarının erişim sınırı ve veri sahipliği doğrulanamaz.

**Öneri:** Yönetim route’larını ayrı uygulama/alt alan adı ya da backend-guard ile koruyun. Oturum, rol (reader/reporter/reviewer/editor/admin), nesne sahipliği ve her mutasyonun yetkisi API/DB katmanında zorlanmalıdır. Değişmez audit event’leri (actor, role, previous/new state, gerekçe, timestamp, request id) ekleyin. İstemci yalnızca yetkili sunucu sonucu gösterir.

## Büyük Sorunlar (Refactor’da Giderilmeli)

### M1. 6.8 MB tek dosya hem veri hem UI hem iş kuralı hem admin hem görselleştirme içeriyor

**Kanıt:** `cm-data` tek başına dosyanın %90’ıdır (satır `1705`); başlangıçta `D.A` üzerinde indeks ve istatistik oluşturulur (`3243–3261`). Aynı HTML; 113 KB CSS, 537 KB JavaScript, WebGL hero (`3285–3405`), route sistemi (`3739–3765`, `10447–10756`), eski/yeni katmanlar ve admin akışlarını içerir. 362 geleneksel function declaration tespit edildi; örneğin `runScore` yaklaşık 508 satır, `findingsCompute` yaklaşık 401 satır, router yaklaşık 311 satırdır.

**Etki:** Küçük görsel değişiklikler veri/analiz davranışını kırabilir; kod sahipliği, review, diff, cache, test ve güvenlik başlıkları ayrışmaz. Bir kullanıcı her route için tüm korpusu indirip parse eder.

**Öneri:** `web`, `api`, `collector`, `analysis` ve `shared` katmanlarına bölün. Route bileşenleri yalnızca görünüm/etkileşim, domain servisleri yalnızca saf hesap, worker yalnızca veri toplama ve yayınlama yapmalıdır. Büyük listelerde sayfalama/filtre API’si ve event detail endpoint’i kullanın; başlangıç sayfasına 15,913 başlık yüklemeyin.

### M2. Korpus sayıları, yayınlanan kayıtlar ve ölçümlerin sürümü açık bir veri sözleşmesi değil

**Kanıt:** UI `D.A` verisini indeksler ve ölçümler için dolaşır (`3250–3260`), yani tarayıcıda 15,913 makale vardır. Buna karşın yöntem özeti metadata’daki 105,869 “başlık” sayısını kullanır (`8857–8863`) ve ana sayfa da `m.articles` değerini gösterir (`9265–9267`). Metadata aynı zamanda `political=75,849`, `embedded=15,913` taşır. `R` kaynağı isimsiz positional array olarak yorumlanır (`3248`), kısa alan adları (`A`, `E`, `S`, `FD`, `BR`, `ADV` vb.) ise yalnızca bu dosyanın içindeki örtük bilgiyle anlaşılır.

**Etki:** Okur “105,869 başlık incelenmiştir” ifadesinin 15,913 yayınlanan/ölçülebilir başlığı mı, filtre öncesi hasadı mı, yoksa başka bir offline korpusu mu anlattığını belirleyemez. İleri analiz ve yayınlanmış bulguların hangi input/sürümle üretildiği tekrar doğrulanamaz.

**Öneri:** Sürüm numaralı açık şema ve bir `DatasetManifest` yayımlayın. `discovered`, `fetched`, `parsed`, `inWindow`, `eligible`, `clustered`, `published`, `rendered` sayıları ayrı alanlar olsun. Her bulgu için `datasetVersion`, `analysisRunId`, kod commit’i, parametreler, input hash’i, kapsam dışı bırakma kuralları ve üretilme zamanı saklansın. UI’da yalnızca doğru evre adı ve sayısı gösterilsin.

### M3. Metin HTML-escape edilse de URL ve HTML veri sınırları gerçek scraper için güvenli değil

**Kanıt:** `esc` yalnızca `& < > "` karakterlerini escape eder (`3240`); URL şemasını doğrulamaz. Makale/kaynak URL’leri birçok yerde `href="` içine doğrudan konur (`3966`, `6365–6366`, `7964`, `9201`, `9628`, `10090`). Hash route parametreleri ve bazı `onclick` handler’lar veriden gelen ID’leri raw birleştirir (`4062`, `4132`, `4558`). Route parser `decodeURIComponent` çağrılarını try/catch olmadan yapar (`10454–10457`).

**Bugünkü durum:** Mevcut snapshot iyi durumdadır: incelenen URL’lerin tamamı HTTPS, `javascript:`/`data:` yoktur. Bu mevcut verinin güvenli oluşu, gelecekte scraper veya API ile gelecek verinin güvenli olacağı anlamına gelmez.

**Etki:** Yeni scraper kaynak başlığı, URL’si, kaynak adı veya kimliği ile bu render noktalarına güvenilmeyen veri getirirse DOM-XSS, `javascript:` navigasyonu, attribute/inline-handler kırılması ya da URL kaynaklı route çökmesi oluşabilir. JSON’un HTML içinde serializasyonunda literal `</script>` de güvenli biçimde encode edilmelidir.

**Öneri:**

```ts
export function safeExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
```

Sunucuda source-domain allowlist’i ve SSRF koruması uygulayın; istemcide `safeExternalUrl` başarısızsa link üretmeyin. Route parametrelerini `URLSearchParams` ile parse edin ve izinli ID desenleriyle doğrulayın. String tabanlı `innerHTML`/inline `onclick` yerine bileşen/DOM API kullanın; zorunlu rich HTML için allowlist sanitizer kullanın. Build sırasında JSON’da `<` karakterini `\u003c` olarak serialise edin.

### M4. Router hatalı/bozuk URL’yi kontrollü ele almıyor

**Kanıt:** Route parametreleri elle `split("&")`, `split("=")` ile ayrılıp doğrudan `decodeURIComponent` edilir (`10450–10457`). Geçersiz yüzde kodlu bir hash örneğin `#/?q=%E0%A4%A`, `URIError` ile uygulamanın render’ını kesebilir.

**Öneri:** `new URLSearchParams()` kullanın veya decode işlemini hata sınırı içinde yapın; bilinmeyen route/parametre için güvenli 404/boş durum üretin. E2E testine bozuk encoding, çoklu `=`, yinelenen parametre ve 10 KB query sınırını ekleyin.

### M5. İleri analiz/makine anlatısı için çalıştırılabilir üretim hattı yok; veri yalnızca sonuçları taşıyor

**Kanıt:** Metin çözümleyici kendisini doğru biçimde “model tahmini değil, açık ve denetlenebilir yüzey testleri” olarak tanımlar (`6015–6030`); kural ekranı da aynı sınırlamayı açıklar (`5830–5835`). Bu olumlu bir ayrımdır. Buna karşılık yöntem, hiyerarşik kümeleme/PCA/GSDMM sonuçları için güçlü bir sonuç cümlesi kullanır (`8857–8863`) ve değerleri gömülü `ADV`/`G`/`P`/`T` alanlarından ekrana basar (`8946–8963`); bu HTML’de Python/R çalışma kodu, giriş matrisi, random seed, sürüm pin’i veya yeniden çalıştırılabilir çıktı yoktur.

**Etki:** Ürünü “AI” diye pazarlamak yanlış olur; görünen kural çözümleyici AI değildir, ileri istatistik sonuçları da bu artefakt içinde tekrar üretilemez. Veri güncellendiğinde okuyucu hangi analizin yeni korpusa ait olduğunu kontrol edemez.

**Öneri:** Arayüz dili “kural tabanlı işaretleme” ve “önceden hesaplanmış araştırma ölçümleri” olarak kalmalıdır. `analysis/` altında pin’li bağımlılıklar, seed, komut, input manifest, ara tablolar, figür JSON’u ve doğrulama raporu yayımlayın. AI/ML yalnızca gerçekten kullanılan yöntem, veri kapsamı, değerlendirme ve hata profili belgelendiğinde iddia edilmelidir.

### M6. İstemcide tekrarlı tam-korpus taramaları ve katmanlı override’lar bakım/performance riskini büyütüyor

**Kanıt:** Başlangıçta tüm `D.A` üzerinde istatistik çıkarılır (`3253–3260`); route tarafında kurum profili için tekrar tekrar korpus taranır (`10580–10604`) ve bazı ekranlar render sırasında geniş `filter/sort/map` zincirleri çalıştırır. Eski ve yeni görünüm katmanları birbirinin ardından çağrılır (`10742`), `v2After`, `v2bAfter`, `v2cAfter`, `v3After` isimleri davranışın hangi katmandan geldiğini zorlaştırır.

**Öneri:** Backend aggregation endpoint’leri, memoize edilmiş seçiciler ve gerektiğinde Web Worker kullanın. Route bileşeni için tek veri sahipliği belirleyin; “eski render + sonradan DOM yaması” yerine açık bileşen kompozisyonuna geçin.

### M7. Paketlenmiş artefakta davranış testi yok; yorumlar eksik dosyalara işaret ediyor

**Kanıt:** HTML içinde Jest/Vitest/Playwright/Cypress/pytest test runner veya assertion suite bulunmadı. `tests/golden.test.js` yorumla anılıyor (`1739`) ve `scripts/make_audit.js` anılıyor (`2425–2427`), ama bu yüklemede o dosyalar yoktur. `CL.cases` içinde 12 durum verisi bulunması, bunların çalıştırıldığı veya CI’da fail ettiği anlamına gelmez.

**Öneri:** Yeni repoda domain unit testlerini, contract testlerini, fixture/snapshot testlerini ve role/flow E2E testlerini zorunlu CI kapısı yapın. Aşağıdaki test kapsamı bölümündeki matrisi başlangıç kabul kriteri kabul edin.

## Küçük Sorunlar (İyileştirme Önerileri)

### N1. Positional ve kısa alanlı veri formatı okunabilirlik ve migration maliyetini yükseltiyor

`D.R` satırları indeksle `s/n/u/v/lab` alanlarına dönüştürülüyor (`3248`); birçok koleksiyon tek harfli alanlar kullanıyor. Yeni API’de açık adlar (`articleId`, `sourceId`, `publishedAt`, `ruleIds`, `evidence`, `coverageByBloc`) ve Zod/JSON Schema ile doğrulama kullanılmalıdır. Kompakt statik export gerekiyorsa bunu API/ETL’nin son optimizasyonu yapın, ana sözleşme yapmayın.

### N2. Hata görünürlüğü sınırlı

`localStorage` işlemlerindeki hatalar çoğunlukla boş `catch` ile yutuluyor (`4869–4870`, `7613–7614`, `10754`, `10767`). Kullanıcıya taslak/durumun kalıcı olmadığı açıkça bildirilmelidir. Telemetri yalnızca rızaya uygun, PII’siz ve sunucuda korunmuş olmalıdır.

### N3. CSP ve asset stratejisi ayrıştırılmalı

Yüzlerce inline string/handler ve inline script, güçlü nonce/hash tabanlı CSP kurmayı zorlaştırır. Refactor’da bundler çıkışı olan ayrı JS/CSS dosyaları, güvenli CSP, `connect-src` allowlist’i ve self-host/pin’li font stratejisi hedeflenmelidir.

## Olumlu Geri Bildirim

- **Şeffaf metodoloji:** Başlık düzeyinde sınırlılığı ve tekil haber ile yapısal koşul arasındaki ayrımı açıkça vurgulaması güçlüdür (`6053–6079`, `8974` sonrası sınırlılıklar). Bu disiplin yeni üründe korunmalıdır.
- **AI konusunda doğru ihtiyat:** Çözümleyicinin model tahmini olmadığını, yüzey kuralı olduğunu açıkça söylemesi (`5830–5835`, `6015–6030`) sahte AI iddiasından kaçınan doğru bir tercihtir.
- **Kullanıcıya kanıt gösterme:** Kural eşleşmelerinde başlığa ve tetikleyici sözcüğe dönmek, kapalı kutu skorundan daha denetlenebilirdir.
- **Mevcut snapshot veri hijyeni:** JSON parse ediliyor; ID’ler benzersiz, incelenen ilişkiler kırık değil, incelenen dış URL’lerin tamamı HTTPS. Bu, export validation için iyi bir temel oluşturur.
- **Güvenli link alışkanlığı:** Dış `target="_blank"` linklerinin çoğunda `rel="noopener"` vardır.
- **Erişilebilirlik niyeti:** Skip link, bazı aria etiketleri, dialog focus trap ve reduced-motion kontrolü bulunuyor (`10467`, `9837–9850`, `3355–3404`). Refactor’da bunları otomatik erişilebilir bileşenlerle koruyun.
- **Araştırma denetlenebilirliği niyeti:** Ölçüm fonksiyonlarını `window.CM` ile incelemeye açmak (`10758–10765`) yararlı bir prototip yaklaşımıdır; bunun üretim karşılığı sürümlü kamu metodoloji/API export’u olmalıdır.

## Veri Sözleşmesi ve Sayım Envanteri

| Anahtar | Mevcut adet | Bugünkü sözleşme özeti |
|---|---:|---|
| `meta` | 1 | build/window/method/counts/perDay/sources/v2 metadata |
| `A` | 15,913 | Makale: `i,s,t,u,d,c,k[],v,b,p,e[],st?` |
| `E` | 1,489 | Olay: başlık/özet, konu/kapsama, makale ID’leri, kaynaklar, tekrarlar, kör-nokta ve el-kodlama bilgisi |
| `S` | 29 | Kurum profili/yerleşim/altı eksen/sahiplik-risk alanları |
| `R` | 53 | Positional kaynak kayıtları (`s,n,u,v,lab` olarak yorumlanıyor) |
| `B` / `F` | 28 / 10 | Kural/yanlılık tanımları ve çerçeve biçimleri |
| `FD` | 29 | Feed/erişim sağlığı: `s,u,c,ok,e,n,w,l` |
| `P` / `X` | 19 / 3 | Profil ve eksen yardımcı verileri |
| `N` | 69 | Anlatı kayıtları ve kodlama satırları |
| `I` / `G` / `L` | 5 / 1 / 11 | Türkiye bağlamı, göstergeler ve sözlükler |
| `BR` / `BRM` | 129 / 1 | Bibliyografik/evidence gate verisi ve protokol metadata’sı |
| `CL` | 12 vaka | Kontrol vakası sonuçları; çalıştırılabilir test suite değildir |
| `TP` / `OM` / `NW` | 29 / 20 / 7 | Konular, outlet ölçümleri ve anlatı haftaları |
| `ADV` | 1 | Önceden hesaplanmış agenda/PCA/topic ölçümleri |

**Korunacak ilişkiler:** `A.i → E.a[]/E.rep`, `S.s → A.s/E.s/FD.s`, `E.i → TP.e[]`, anlatı/event referansları ve kurum/source registry eşleştirmeleri. Bunlar yeni veri tabanında foreign key veya eşdeğer uygulama doğrulaması ile zorlanmalıdır.

**Zorunlu manifest düzeltmesi:** `105,869 harvested`, `75,849 political`, `15,913 embedded/rendered` ve `1,489 events` birbirinden semantik olarak ayrılmalıdır. Her birinin hesaplandığı adım ve input seti açık olmalıdır.

## Test Kapsamı Değerlendirmesi

| Alan | Mevcut sonuç | Yeni repo kabul kriteri |
|---|---|---|
| Sözdizimi | Üç inline JS scripti `node --check` geçiyor | TypeScript strict build + lint + format CI |
| Saf puan/kural fonksiyonları | Çalıştırılabilir suite yok | Türkçe ek, apostrof, Unicode/İ/ı, boş/uzun başlık, eşik ve golden fixture unit testleri |
| Scraper | Yok | Her kaynak adapter’ı için saved HTML/XML fixture, robots/rate-limit/timeout/retry/charset/tarih parser testleri |
| Veri sözleşmesi | JSON parse ve bu incelemedeki referans kontrolü geçti | API/OpenAPI veya JSON Schema contract test; uniqueness/FK/URL/datetime invariant’ları |
| XSS/URL | Güncel veri HTTPS; runtime policy yok | Fuzz test: `javascript:`, `data:`, CRLF, quotes, `</script>`, SVG/HTML payload, bozuk hash/query |
| Düzeltmeler | LocalStorage demo; endpoint kapalı | Submit/rate limit/consent/dedup/PII access/role transition/audit event integration testleri |
| Yönetim/rol | İstemci kontrolüne bağımlı | API/DB authorization negatif testleri: reader/reviewer/editor/admin, IDOR ve cross-tenant denemeleri |
| Kritik kullanıcı akışları | E2E yok | Playwright: tüm route’lar, filtre/arama, tema, keyboard/dialog, düzeltme yaşam döngüsü, admin yetki reddi |
| Analiz tekrarlanabilirliği | Çıktılar gömülü | Pinned analysis environment, fixed seed, manifest-hash ve golden metric regression testleri |

## Yazar/Ürün Sahibi İçin Sorular

1. 105,869/75,849/15,913 sayıları sırasıyla hangi ETL evresini ifade ediyor; yayınlanan her bulgu hangisini kullanıyor?
2. Gerçek scraper için her yayıncının açık RSS/sitemap izni, robots.txt politikası, kullanım şartı ve uygun crawl sıklığı kim tarafından onaylanacak?
3. Başlık, yayın zamanı ve canonical URL dışında içerik saklanacak mı? Saklama süresi, telif/publisher takedown prosedürü ve kaynak silme politikası nedir?
4. Düzeltme talebi için ilk yanıt ve çözüm SLA’sı, editör rolleri, kanıt standardı, itiraz yolu ve kamuya açık düzeltme notu formatı nedir?
5. Review desk kararları gerçek corpus/analiz sürümünü ne zaman ve nasıl etkiler? Karar sonrası yeniden hesap/yeniden yayın onayı kimdedir?
6. İleri analiz sonuçlarının üreten kodu ve ham/ara veri paylaşılabilecek mi? Paylaşılamıyorsa iddia düzeyi nasıl daraltılacak?
7. GitHub deposu açık kaynak mı, özel mi? Veri ve PII için ayrı erişim alanı/secret yönetimi nasıl yapılacak?

## Önerilen Refactor Sınırları ve Yeni Depo Yapısı

```text
capraz-manset/
  apps/
    web/                 # Kamu arayüzü; route bileşenleri, erişilebilir UI
    admin/               # Korumalı editör/review workspace (ayrı deploy tercih edilir)
    api/                 # Auth, public read API, correction/review mutation API
    collector/           # Kuyruklu sitemap/RSS/HTML collector worker
  packages/
    domain/              # Article/Event/Source/CorrectionCase tipleri ve saf kurallar
    schemas/             # Zod/JSON Schema, API contract’ları, enumlar
    analysis/            # Kümeler, metrikler, reproducible analysis adapters
    ui/                  # Paylaşılan tasarım sistemi; string HTML değil bileşenler
    source-registry/     # Kaynak allowlist, parser yapılandırması, crawl politikası
  data/
    manifests/           # Sürümlü yayın manifest’leri (PII içermez)
    fixtures/            # İzinli scrubbed sitemap/RSS/HTML test fixture’ları
  infra/
    migrations/          # DB şeması, RLS/role politikaları
    queues/              # Worker job tanımları, retry/DLQ kuralları
  docs/
    methodology/         # Sayım sözlüğü, analiz parametreleri, yayın protokolü
    correction-policy.md
  .github/workflows/
    ci.yml               # typecheck, test, security, contract, migration checks
```

### Öncelikli geçiş sırası

1. **Sözleşme sabitleme:** Mevcut JSON’u kayıp yaşatmadan açık adlara dönüştüren, versioned `v1` export şeması yazın; bu incelemedeki ID/FK/HTTPS invariant’larını test haline getirin.
2. **Collector ve veri tabanı:** Source registry + allowlist + robots/rate-limit + audit manifest + raw/normalized katmanlarını kurun. Scraper başarısızlığını veri yokluğu ile karıştırmayın.
3. **Analiz pipeline’ı:** Kural skorları ve clustering’i worker/CLI olarak çalıştırın; her yayınlanmış dataset için result tables/figures + manifest üretin. İleri analiz için seed ve bağımlılık sürümü zorunlu olsun.
4. **Düzeltme/inceleme backend’i:** LocalStorage iş akışlarını tek `CorrectionCase` ve `ReviewDecision` modeline taşıyın; sunucuda RBAC/RLS/audit event uygulayın.
5. **Web feature-parity:** Önce olay/kurum/split-card/yöntem, sonra arama/konu/anlatı/harita, en son kişiselleştirme ve WebGL gibi dekoratif özellikleri ayrı bileşenler halinde taşıyın. Eski hash route’ları yeni canonical URL’lere redirect/map edin.
6. **Güvenlik ve yayın:** CSP, URL policy, input validation, error boundary, observability, backup/retention ve bağımsız security review tamamlanmadan gerçek kullanıcı düzeltme formunu açmayın.

## Sonuç

Artefakt, özellikle metodolojik uyarıları, Türkçe kural tabanlı çözümleyiciyi açıkça “AI modeli değil” diye sınırlandırması ve mevcut snapshot’ın iç referans/HTTPS hijyeni bakımından değerli bir prototiptir. Ancak bunu üretim ürünü veya canlı scraper olarak ele almak yanlış olur. Yeni GitHub deposu, **veri toplayan ve denetlenebilir backend + korumalı editorial workflow + sürümlü analiz + hafif feature-parity web istemcisi** olarak kurulmalıdır; mevcut HTML yalnızca görsel/ürün davranışı ve veri migration’ı için referans kabul edilmelidir.
