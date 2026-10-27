import publicLegacyCss from "../styles/public-legacy.css?raw";
import {
  isLegacyAdminHash,
  normalizeUnsafeInitialHash,
  redirectLegacyAdmin,
} from "./hash";
import { createPublicRuntime } from "./runtime";
import { mountLegacyRenderer } from "./legacy/index.js";

function message(host: HTMLElement, title: string, detail: string): void {
  host.replaceChildren();
  const box = host.ownerDocument.createElement("section");
  box.setAttribute("role", "status");
  box.style.cssText =
    "max-width:720px;margin:48px auto;padding:24px;border:1px solid #d8d5cd;background:#fff;color:#1b1813;font:16px/1.5 Georgia,serif";
  const heading = host.ownerDocument.createElement("h1");
  heading.textContent = title;
  const paragraph = host.ownerDocument.createElement("p");
  paragraph.textContent = detail;
  box.append(heading, paragraph);
  host.append(box);
}

function injectPublicCss(document: Document): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset.caprazPublicStyle = "true";
  style.textContent = publicLegacyCss;
  document.head.append(style);
  return style;
}

/** The dataset request, also started by the page shell in parallel with this chunk. */
export function fetchPublicDataset(view: Window): Promise<Response> {
  return view.fetch("/api/public/dataset", {
    headers: { accept: "application/json" },
  });
}

function isPublicDataset(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.A) &&
    Array.isArray(data.E) &&
    Array.isArray(data.S) &&
    Array.isArray(data.R) &&
    !!data.meta
  );
}

/**
 * Mounts the supplied historical public interface below a React-owned host.
 * The parent owns when this runs; this function owns all DOM and listeners
 * beneath host until the returned cleanup is called.
 */
export async function mountPublicWebsite(
  host: HTMLElement,
  prefetched?: Promise<Response>
): Promise<() => void> {
  const view = host.ownerDocument.defaultView;
  if (!view) {
    message(host, "Kamu görünümü açılamadı", "Tarayıcı penceresi bulunamadı.");
    return () => host.replaceChildren();
  }
  if (isLegacyAdminHash(view.location.hash)) {
    redirectLegacyAdmin(view);
    return () => undefined;
  }
  normalizeUnsafeInitialHash(view);
  message(
    host,
    "Tarihsel veri yükleniyor",
    "Sağlanan kamu veri kümesi hazırlanıyor…"
  );

  let response: Response;
  let data: unknown;
  try {
    response = await (prefetched ?? fetchPublicDataset(view));
    if (!response.ok) throw new Error(`dataset-${response.status}`);
    data = await response.json();
  } catch {
    message(
      host,
      "Tarihsel veri yüklenemedi",
      "Kamu veri kümesine şu anda erişilemiyor. Lütfen daha sonra yeniden deneyin."
    );
    return () => host.replaceChildren();
  }
  if (!isPublicDataset(data)) {
    message(
      host,
      "Tarihsel veri okunamadı",
      "Sunucudan beklenen kamu veri biçimi alınamadı."
    );
    return () => host.replaceChildren();
  }

  host.replaceChildren();
  const root = host.ownerDocument.createElement("div");
  root.dataset.caprazPublic = "true";
  root.id = "capraz-public-root";
  const app = host.ownerDocument.createElement("div");
  app.id = "app";
  root.append(app);
  host.append(root);
  const style = injectPublicCss(host.ownerDocument);
  const runtime = createPublicRuntime({
    host,
    root,
    data,
    logo: {
      h: "/assets/capraz-manset-logo.svg",
      hd: "/assets/capraz-manset-logo-dark.svg",
      cmp: "/assets/capraz-manset-compare.svg",
    },
  });

  try {
    mountLegacyRenderer(runtime);
  } catch (error) {
    runtime.cleanup();
    style.remove();
    message(
      host,
      "Kamu görünümü açılamadı",
      "Tarihsel görünüm başlatılırken beklenmeyen bir hata oluştu."
    );
    console.error("Çapraz Manşet public mount failed", error);
    return () => host.replaceChildren();
  }

  return () => {
    runtime.cleanup();
    style.remove();
    host.replaceChildren();
  };
}
