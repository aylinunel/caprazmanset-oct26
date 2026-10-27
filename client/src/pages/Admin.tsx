import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  publicationErrors,
  kindValues,
  statusValues,
  verificationValues,
} from "@shared/editorial";
import type { EditorialRecord } from "../../../drizzle/schema";
import "../admin.css";

const labels: Record<string, string> = {
  article: "Başlıklar",
  event: "Olaylar",
  source: "Kurumlar",
  bias: "Yanlılık tanımları",
  analysis: "Analiz çıktıları",
  draft: "Taslak",
  published: "Yayında",
  archived: "Arşiv",
  provided: "Sağlanan",
  verified: "Doğrulanmış",
  demo: "Örnek",
  needs_review: "İnceleme bekliyor",
  submitted: "Alındı",
  triaged: "Ön inceleme",
  closed: "Kapalı",
};
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı";
}

export default function Admin() {
  const auth = useAuth();
  const [tab, setTab] = useState<"records" | "intakes" | "audit" | "scraper">(
    "records"
  );
  if (auth.loading)
    return (
      <main className="editorial-admin">
        <p role="status">Oturum doğrulanıyor…</p>
      </main>
    );
  if (auth.error)
    return (
      <main className="editorial-admin">
        <h1>Oturum doğrulanamadı</h1>
        <p role="alert">{errorMessage(auth.error)}</p>
        <button onClick={() => auth.refresh()}>Yeniden dene</button>
        <a href="/">Kamu sitesine dön</a>
      </main>
    );
  if (!auth.user)
    return (
      <main className="editorial-admin access-screen">
        <span className="admin-kicker">ÇAPRAZ MANŞET / İNCELEME MASASI</span>
        <h1>Korunan editör çalışma alanı.</h1>
        <p>
          Başlıkları, kanıtları ve yayın kararlarını burada yönetin. Bu alan
          kamu sitesinden ayrıdır.
        </p>
        <button onClick={() => startLogin()}>Manus ile giriş yap</button>
        <a href="/">Kamu sitesine dön</a>
      </main>
    );
  if (auth.user.role !== "admin")
    return (
      <main className="editorial-admin access-screen">
        <h1>Yönetici yetkisi gerekli</h1>
        <p>
          Giriş başarılı; bu hesap editör işlemleri için yetkilendirilmedi.
          Yetki sunucuda denetlenir.
        </p>
        <a href="/">Kamu sitesine dön</a>
      </main>
    );
  return (
    <div className="editorial-admin">
      <header className="admin-header">
        <a href="/" aria-label="Çapraz Manşet kamu sitesi">
          <img src="/assets/logo-horizontal.svg" alt="Çapraz Manşet" />
        </a>
        <span className="admin-kicker">İNCELEME MASASI</span>
        <span className="admin-user">{auth.user.name ?? "Yönetici"}</span>
        <button onClick={() => auth.logout()}>Çıkış</button>
      </header>
      <nav aria-label="Yönetim bölümleri">
        {(
          [
            ["records", "Kayıtlar"],
            ["intakes", "Okur bildirimleri"],
            ["audit", "İşlem günlüğü"],
            ["scraper", "Türkçe scraper"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        <div className="admin-intro">
          <span className="admin-kicker">KANIT → İNCELEME → YAYIN</span>
          <h1>
            {tab === "records"
              ? "Önce kaynağı doğrula."
              : tab === "intakes"
                ? "Okur bildirimleri"
                : tab === "audit"
                  ? "Kararların izi."
                  : "Türkçe haber toplama."}
          </h1>
          <p>
            Taslaklar kamuya görünmez. Sağlanan tarihsel puanlar bağımsız
            doğrulanmış sonuçlar değildir; yeni yayınlar kanıt ve açık editör
            gerekçesi gerektirir.
          </p>
        </div>
        {tab === "records" ? (
          <Records />
        ) : tab === "intakes" ? (
          <Intakes />
        ) : tab === "audit" ? (
          <Audit />
        ) : (
          <Scraper />
        )}
      </main>
      <footer>
        Yönetim alanı · Tek kalıcı veri modeli · Yeni veri mevcut tarihsel
        analizleri otomatik yeniden hesaplamaz.
      </footer>
    </div>
  );
}

function Records() {
  const [kind, setKind] = useState<(typeof kindValues)[number]>("article");
  const [status, setStatus] = useState<(typeof statusValues)[number] | "all">(
    "draft"
  );
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const list = trpc.editorial.list.useQuery({
    kind,
    status: status === "all" ? undefined : status,
    offset,
    limit: 40,
  });
  const detail = trpc.editorial.detail.useQuery(
    { id: selected ?? "none" },
    { enabled: selected !== null }
  );
  const refresh = async () => {
    await Promise.all([list.refetch(), detail.refetch()]);
  };
  return (
    <>
      <div className="admin-filters">
        <label>
          Kayıt türü
          <select
            value={kind}
            onChange={event => {
              setKind(event.target.value as typeof kind);
              setOffset(0);
              setSelected(null);
            }}
          >
            {kindValues.map(value => (
              <option value={value} key={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Yayın durumu
          <select
            value={status}
            onChange={event => {
              setStatus(event.target.value as typeof status);
              setOffset(0);
              setSelected(null);
            }}
          >
            <option value="all">Tümü</option>
            {statusValues.map(value => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
        <span>{list.data?.total ?? "…"} kayıt</span>
      </div>
      {list.isLoading && <p role="status">Kayıtlar yükleniyor…</p>}
      {list.error && (
        <p role="alert">
          {errorMessage(list.error)}{" "}
          <button onClick={() => list.refetch()}>Yeniden dene</button>
        </p>
      )}
      <div className="review-layout">
        <section aria-label="Kayıt listesi" className="record-list">
          {list.data?.items.length === 0 && (
            <p className="empty-note">
              Bu süzgeçte kayıt yok. Scraper çıktısını içe aktarın veya yayın
              durumunu değiştirin.
            </p>
          )}
          {list.data?.items.map(record => (
            <button
              className="record-row"
              key={record.id}
              aria-pressed={selected === record.id}
              onClick={() => setSelected(record.id)}
            >
              <span className="record-meta">
                {record.sourceSlug ?? record.kind} · v{record.version} ·{" "}
                {labels[record.verificationStatus]}
              </span>
              <strong>{record.title}</strong>
              <span className="status-tag">{labels[record.status]}</span>
            </button>
          ))}
          <div className="pagination">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 40))}
            >
              Önceki
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 40, list.data?.total ?? 0)}
            </span>
            <button
              disabled={!list.data || offset + 40 >= list.data.total}
              onClick={() => setOffset(offset + 40)}
            >
              Sonraki
            </button>
          </div>
        </section>
        <section className="review-panel" aria-label="Editör incelemesi">
          {!selected ? (
            <div className="empty-note">
              <h2>Bir kayıt seçin.</h2>
              <p>
                Kaynağı, kanıt durumunu, yöntemi ve kamuya açık açıklamayı
                birlikte inceleyin.
              </p>
            </div>
          ) : detail.isLoading ? (
            <p role="status">İnceleme yükleniyor…</p>
          ) : detail.error ? (
            <p role="alert">{errorMessage(detail.error)}</p>
          ) : detail.data ? (
            <ReviewForm
              key={`${detail.data.id}-${detail.data.version}`}
              record={detail.data}
              refresh={refresh}
            />
          ) : null}
        </section>
      </div>
    </>
  );
}
function ReviewForm({
  record,
  refresh,
}: {
  record: EditorialRecord;
  refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(record.title);
  const [verification, setVerification] = useState(record.verificationStatus);
  const [provenance, setProvenance] = useState(record.provenanceNote);
  const [methodology, setMethodology] = useState(record.methodology);
  const [disclosure, setDisclosure] = useState(record.editorialDisclosure);
  const [evidence, setEvidence] = useState(record.evidenceUrl ?? "");
  const [payload, setPayload] = useState(
    JSON.stringify(record.payload, null, 2)
  );
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const save = trpc.editorial.save.useMutation();
  const publish = trpc.editorial.publish.useMutation();
  const archive = trpc.editorial.archive.useMutation();
  const history = trpc.editorial.history.useQuery({ id: record.id });
  const busy = save.isPending || publish.isPending || archive.isPending;
  const issues = publicationErrors(record);
  async function act(action: "save" | "publish" | "archive") {
    setMessage("");
    try {
      if (reason.trim().length < 10)
        throw new Error("En az 10 karakterlik editör gerekçesi yazın.");
      if (action === "save") {
        const decoded = JSON.parse(payload);
        if (!decoded || Array.isArray(decoded) || typeof decoded !== "object")
          throw new Error("Kayıt JSON’u bir nesne olmalıdır.");
        await save.mutateAsync({
          id: record.id,
          expectedVersion: record.version,
          title,
          payload: decoded,
          verificationStatus: verification,
          provenanceNote: provenance,
          methodology,
          editorialDisclosure: disclosure,
          evidenceUrl: evidence || null,
          reason,
        });
      } else
        await (action === "publish" ? publish : archive).mutateAsync({
          id: record.id,
          expectedVersion: record.version,
          reason,
        });
      await refresh();
      setMessage("İşlem kaydedildi.");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void act("save");
      }}
    >
      <div className="review-title">
        <span className="admin-kicker">
          {record.id} / v{record.version}
        </span>
        <h2>{labels[record.kind]} incelemesi</h2>
        <span className="status-tag">{labels[record.status]}</span>
      </div>
      <p className="warning-note">
        Kaydetmek yeni sürüm oluşturur ve kaydı taslağa alır. Yayınlama yalnızca
        sunucuda kayıtlı, kaydedilmiş sürümü kullanır. Önce değişiklikleri
        kaydedin.
      </p>
      <label>
        Başlık / kurum adı
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          required
          maxLength={1000}
        />
      </label>
      <label>
        Kanıt durumu
        <select
          value={verification}
          onChange={event =>
            setVerification(event.target.value as typeof verification)
          }
        >
          {verificationValues.map(value => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Asıl kanıt bağlantısı
        <input
          type="url"
          value={evidence}
          onChange={event => setEvidence(event.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Köken / kaynak notu
        <textarea
          value={provenance}
          onChange={event => setProvenance(event.target.value)}
          required
          rows={3}
        />
      </label>
      <label>
        Yöntem ve kapsam
        <textarea
          value={methodology}
          onChange={event => setMethodology(event.target.value)}
          required
          rows={3}
        />
      </label>
      <label>
        Kamuya açık açıklama
        <textarea
          value={disclosure}
          onChange={event => setDisclosure(event.target.value)}
          required
          rows={3}
        />
      </label>
      <details>
        <summary>Tam kayıt alanları (JSON)</summary>
        <label>
          Veri sözleşmesi
          <textarea
            className="code-input"
            value={payload}
            onChange={event => setPayload(event.target.value)}
            rows={16}
          />
        </label>
      </details>
      <label>
        Bu işlem için editör gerekçesi
        <textarea
          value={reason}
          onChange={event => setReason(event.target.value)}
          minLength={10}
          maxLength={2000}
          required
          rows={2}
        />
      </label>
      {issues.length > 0 && (
        <div className="publication-gate">
          <strong>Mevcut kayıt için yayın kapısı</strong>
          <ul>
            {issues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="admin-actions">
        <button type="submit" disabled={busy}>
          Taslak olarak kaydet
        </button>
        <button
          type="button"
          disabled={busy || record.status === "published" || issues.length > 0}
          onClick={() => act("publish")}
        >
          Kaydedilmiş sürümü yayınla
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || record.status === "archived"}
          onClick={() => act("archive")}
        >
          Arşive al
        </button>
      </div>
      {message && (
        <p role="status" className="result-message">
          {message}
        </p>
      )}
      <details>
        <summary>Korunan önceki sürümler ({history.data?.length ?? 0})</summary>
        {history.data?.map(item => (
          <p key={item.id}>
            v{item.version} · {item.reason} ·{" "}
            {new Date(item.createdAt).toLocaleString("tr-TR")}
          </p>
        ))}
      </details>
    </form>
  );
}
function Audit() {
  const audit = trpc.editorial.audit.useQuery();
  if (audit.isLoading) return <p role="status">İşlem günlüğü yükleniyor…</p>;
  if (audit.error) return <p role="alert">{errorMessage(audit.error)}</p>;
  return (
    <section className="audit-list">
      {audit.data?.map(item => (
        <article key={item.id}>
          <span className="admin-kicker">
            {new Date(item.createdAt).toLocaleString("tr-TR")} / {item.action}
          </span>
          <h2>{item.entityId}</h2>
          <p>{item.reason}</p>
          <small>
            {item.beforeStatus ?? "—"} → {item.afterStatus ?? "—"} ·{" "}
            {item.actorId ? `Editör #${item.actorId}` : "Sistem / özel alım"}
          </small>
        </article>
      ))}
    </section>
  );
}
function Intakes() {
  const intake = trpc.editorial.intakes.useQuery();
  const triage = trpc.editorial.triage.useMutation();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <p className="warning-note">
        Bu, özel okur bildirimi ve manuel ön inceleme kuyruğudur; bağımsız
        itiraz çözümü veya kamuya açık düzeltme ilanı sistemi değildir.
        Bildirimler yayını otomatik değiştirmez. İletişim bilgisi toplanmaz;
        açıklamalarda kişisel bilgi yazılmamalıdır.
      </p>
      <label className="triage-reason">
        İşlem gerekçesi
        <textarea
          value={reason}
          onChange={event => setReason(event.target.value)}
          minLength={10}
          rows={2}
        />
      </label>
      {intake.isLoading && <p role="status">Bildirimler yükleniyor…</p>}
      {intake.error && <p role="alert">{errorMessage(intake.error)}</p>}
      {message && <p role="status">{message}</p>}
      {intake.data?.length === 0 && (
        <p className="empty-note">Henüz okur bildirimi yok.</p>
      )}
      {intake.data?.map(item => (
        <article className="intake-card" key={item.id}>
          <span className="admin-kicker">
            {item.entityId} · {labels[item.status]}
          </span>
          <h2>{item.claim}</h2>
          <p>{item.message}</p>
          {item.evidenceUrl && (
            <a
              href={item.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Sağlanan kanıt bağlantısı — doğrulanmadı
            </a>
          )}
          <div className="admin-actions">
            {(["triaged", "closed"] as const).map(status => (
              <button
                key={status}
                disabled={item.status === "closed" || triage.isPending}
                onClick={async () => {
                  try {
                    await triage.mutateAsync({ id: item.id, status, reason });
                    await intake.refetch();
                    setMessage(
                      "Bildirim durumu kaydedildi; hedef kayıt değişmedi."
                    );
                  } catch (error) {
                    setMessage(errorMessage(error));
                  }
                }}
              >
                {labels[status]}
              </button>
            ))}
          </div>
        </article>
      ))}
    </>
  );
}
function Scraper() {
  const tokens = trpc.editorial.tokens.useQuery();
  const issue = trpc.editorial.issueToken.useMutation();
  const revoke = trpc.editorial.revokeToken.useMutation();
  const [label, setLabel] = useState("Yerel scraper");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  return (
    <section className="scraper-panel">
      <span className="admin-kicker">
        53 KAYNAK KAYDI / KULLANILABİLİRLİK GARANTİSİ DEĞİL
      </span>
      <h2>Topla. Doğrula. İçe aktar.</h2>
      <p>
        Mevcut Türkçe scraper RSS/site haritası ve başlık çıkarımını sağlar.
        Yeni kayıtlar taslak olarak saklanır; hiçbir siyasi yerleşim veya
        yanlılık hükmü otomatik üretilmez. Sürekli toplama veya zamanlama
        etkinleştirilmedi.
      </p>
      <pre>
        <code>
          {
            "python scraper/collect.py --only birgun --output work/news.jsonl --db work/news.sqlite3 --status work/status.json\npython scraper/import_news.py --input work/news.jsonl --dry-run\n# CAPRAZ_IMPORT_TOKEN değerini terminalde gizli olarak ayarlayın\npython scraper/import_news.py --input work/news.jsonl --endpoint https://SITENIZ --run-id toplama-001"
          }
        </code>
      </pre>
      <p>
        API: <code>POST /api/collector/import</code>. Anahtar yalnızca taslak
        içe aktarmaya izin verir; 30 gün sonra sona erer ve sunucuda hash olarak
        saklanır.
      </p>
      <form
        onSubmit={async event => {
          event.preventDefault();
          try {
            const value = await issue.mutateAsync({ label });
            setToken(value.token);
            await tokens.refetch();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        }}
      >
        <label>
          Anahtar etiketi
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            required
            maxLength={100}
          />
        </label>
        <button disabled={issue.isPending}>İçe aktarma anahtarı oluştur</button>
      </form>
      {token && (
        <div className="token-reveal">
          <strong>
            Yalnızca şimdi gösterilir. Kopyalayıp güvenli saklayın.
          </strong>
          <code>{token}</code>
          <button onClick={() => setToken("")}>Ekrandan temizle</button>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
      {tokens.error && <p role="alert">{errorMessage(tokens.error)}</p>}
      <div className="token-list">
        {tokens.data?.map(item => (
          <div key={item.id}>
            <span>
              {item.label} ·{" "}
              {item.revokedAt
                ? "İptal edildi"
                : `Son tarih: ${new Date(item.expiresAt).toLocaleDateString("tr-TR")}`}
            </span>
            <button
              disabled={!!item.revokedAt || revoke.isPending}
              onClick={async () => {
                try {
                  await revoke.mutateAsync({ id: item.id });
                  await tokens.refetch();
                } catch (error) {
                  setMessage(errorMessage(error));
                }
              }}
            >
              İptal et
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
