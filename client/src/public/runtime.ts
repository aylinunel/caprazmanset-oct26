import DOMPurify from "dompurify";
import {
  openCorrectionIntake,
  type CorrectionEntityKind,
} from "./correction-modal";
import {
  isLegacyAdminHash,
  parsePublicHash,
  redirectLegacyAdmin,
} from "./hash";
import { installSearchOptimization } from "./search-optimization";

export interface PublicRuntime {
  data: Record<string, unknown>;
  CM3: unknown;
  root: HTMLElement;
  window: Window;
  document: Document;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
  initializeBindings(names: string[]): void;
  setHTML(node: Element, html: unknown): Element;
  appendHTML(node: Element, html: unknown): Element;
  insertHTML(node: Element, where: InsertPosition, html: unknown): Element;
  replaceHTML(node: Element, html: unknown): Element | null;
  installPublicOverrides(): void;
  cleanup(): void;
  [key: string]: unknown;
}

interface RuntimeOptions {
  host: HTMLElement;
  root: HTMLElement;
  data: Record<string, unknown>;
  logo: Record<string, string>;
}

type ListenerTarget = Window | Document | HTMLElement;

/**
 * Native Window and Document members perform WebIDL receiver checks. The
 * public renderer gets a scoped facade rather than either global object, so
 * inherited methods from Object.create(actualWindow/document) would receive
 * the facade as `this` and throw "Illegal invocation". Always read with the
 * real browser object as receiver and bind callable members back to it.
 */
function nativeMember(target: object, property: PropertyKey): unknown {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}

function safeExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isSafeInternalUrl(raw: string): boolean {
  return (
    raw.startsWith("#") ||
    (raw.startsWith("/") && !raw.startsWith("//")) ||
    raw.startsWith("./") ||
    raw.startsWith("../")
  );
}

function firstById(root: HTMLElement, id: string): HTMLElement | null {
  if (root.id === id) return root;
  const nodes = root.querySelectorAll<HTMLElement>("[id]");
  for (const node of nodes) if (node.id === id) return node;
  return null;
}

function appendProvenance(
  root: HTMLElement,
  data: Record<string, unknown>
): void {
  root.querySelector(".cm-provenance")?.remove();
  const document = root.ownerDocument;
  const strip = document.createElement("aside");
  strip.className = "cm-provenance";
  strip.setAttribute("aria-label", "Veri kökeni bildirimi");
  const statement = document.createElement("strong");
  statement.textContent =
    "Sağlanan tarihsel veri · bağımsız doğrulama yapılmadı";
  const counts = document.createElement("span");
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const originalCounts = (meta.counts ?? {}) as Record<string, unknown>;
  const publicCounts = (meta.publicCounts ?? {}) as Record<string, unknown>;
  const formatCount = (value: unknown) =>
    Number(value ?? 0).toLocaleString("tr-TR");
  counts.textContent = `Tarihsel tarama: ${formatCount(originalCounts.harvested)} · ekranda: ${formatCount(publicCounts.articles ?? (Array.isArray(data.A) ? data.A.length : 0))} başlık.`;
  const external = document.createElement("span");
  external.textContent = "Dış bağlantılar sağlanan bağlantılardır.";
  const method = document.createElement("a");
  method.href = "#/yontem?s=1";
  method.textContent = "Yöntem ve sayım tanımları";
  strip.append(statement, counts, external, method);
  root.prepend(strip);
}

function prepareLegacyRoutes(container: Element): void {
  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-cm-route]"
  )) {
    const route = element.getAttribute("data-cm-route") || "";
    if (!route.startsWith("/")) {
      element.removeAttribute("data-cm-route");
      continue;
    }
    if (!/^(A|AREA|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName)) {
      element.setAttribute("role", "link");
      if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
    }
  }
}

function enforceUrlPolicy(container: Element, actualWindow: Window): void {
  for (const anchor of container.querySelectorAll<HTMLAnchorElement>(
    "a[href]"
  )) {
    const raw = anchor.getAttribute("href") || "";
    if (isSafeInternalUrl(raw)) continue;
    const safe = safeExternalUrl(raw);
    if (!safe) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.setAttribute("aria-disabled", "true");
      continue;
    }
    anchor.href = safe;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.setAttribute("data-cm-supplied-link", "true");
  }

  for (const node of container.querySelectorAll<HTMLElement>(
    "[src], [xlink\\:href]"
  )) {
    const attr = node.hasAttribute("src") ? "src" : "xlink:href";
    const raw = node.getAttribute(attr) || "";
    if (raw.startsWith("data:image/svg+xml") || isSafeInternalUrl(raw))
      continue;
    const safe = safeExternalUrl(raw);
    if (!safe) node.removeAttribute(attr);
    else node.setAttribute(attr, safe);
  }

  // Use actualWindow to keep the parameter intentionally tied to the mount's
  // browsing context; it also avoids accidental URL policy reuse server-side.
  void actualWindow;
}

function safeHtml(value: unknown): string {
  return DOMPurify.sanitize(String(value ?? ""), {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ["target", "rel", "role", "tabindex", "xlink:href"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

export function createPublicRuntime(options: RuntimeOptions): PublicRuntime {
  const actualWindow = options.host.ownerDocument.defaultView;
  if (!actualWindow) throw new Error("Public site requires a browser window.");
  const actualDocument = options.host.ownerDocument;
  const disposers: Array<() => void> = [];
  let disposeSearch: (() => void) | undefined;
  const listenerMap = new WeakMap<
    object,
    Map<EventListenerOrEventListenerObject, EventListener>
  >();
  let runtime: PublicRuntime;

  const redirectIfAdmin = (): boolean => {
    if (!isLegacyAdminHash(actualWindow.location.hash)) return false;
    redirectLegacyAdmin(actualWindow);
    return true;
  };

  const register = (
    target: ListenerTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | AddEventListenerOptions
  ) => {
    const wrapped: EventListener = event => {
      if (type === "hashchange") {
        if (redirectIfAdmin()) return;
        const parsed = parsePublicHash(actualWindow.location.hash);
        if (parsed.malformed || parsed.unsupported) {
          actualWindow.location.hash = "#/";
          return;
        }
        const current = runtime.route;
        if (typeof current === "function" && current !== listener) {
          (current as EventListener).call(windowFacade, event);
          return;
        }
      }
      if (typeof listener === "function") listener.call(windowFacade, event);
      else listener.handleEvent(event);
    };
    const map =
      listenerMap.get(target) ||
      new Map<EventListenerOrEventListenerObject, EventListener>();
    map.set(listener, wrapped);
    listenerMap.set(target, map);
    target.addEventListener(type, wrapped, listenerOptions);
    disposers.push(() =>
      target.removeEventListener(type, wrapped, listenerOptions)
    );
  };

  const unregister = (
    target: ListenerTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | EventListenerOptions
  ) => {
    const wrapped =
      listenerMap.get(target)?.get(listener) || (listener as EventListener);
    target.removeEventListener(type, wrapped, listenerOptions);
  };

  const windowState: Record<PropertyKey, unknown> = Object.create(null);
  let windowFacade: Window & Record<string, unknown>;
  const documentState: Record<PropertyKey, unknown> = Object.create(null);

  Object.defineProperties(documentState, {
    body: { get: () => options.root },
    documentElement: { get: () => options.root },
    activeElement: { get: () => actualDocument.activeElement },
    scrollingElement: { get: () => options.root },
    defaultView: { get: () => windowFacade },
  });
  documentState.getElementById = (id: string) => firstById(options.root, id);
  documentState.querySelector = (selectors: string) =>
    options.root.querySelector(selectors);
  documentState.querySelectorAll = (selectors: string) =>
    options.root.querySelectorAll(selectors);
  documentState.createElement =
    actualDocument.createElement.bind(actualDocument);
  documentState.createElementNS =
    actualDocument.createElementNS.bind(actualDocument);
  documentState.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | AddEventListenerOptions
  ) => {
    register(actualDocument, type, listener, listenerOptions);
  };
  documentState.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | EventListenerOptions
  ) => {
    unregister(actualDocument, type, listener, listenerOptions);
  };

  const documentFacade = new Proxy(documentState, {
    get(state, property, receiver) {
      return Reflect.has(state, property)
        ? Reflect.get(state, property, receiver)
        : nativeMember(actualDocument, property);
    },
    set(state, property, value) {
      return Reflect.set(state, property, value, state);
    },
  }) as unknown as Document;

  windowState.CM_LOGO = options.logo;
  windowState.DATA = options.data;
  windowState.document = documentFacade;
  windowState.location = actualWindow.location;
  windowState.history = actualWindow.history;
  windowState.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | AddEventListenerOptions
  ) => {
    register(actualWindow, type, listener, listenerOptions);
  };
  windowState.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    listenerOptions?: boolean | EventListenerOptions
  ) => {
    unregister(actualWindow, type, listener, listenerOptions);
  };
  windowFacade = new Proxy(windowState, {
    get(state, property, receiver) {
      if (property === "window" || property === "self") return windowFacade;
      return Reflect.has(state, property)
        ? Reflect.get(state, property, receiver)
        : nativeMember(actualWindow, property);
    },
    set(state, property, value) {
      return Reflect.set(state, property, value, state);
    },
  }) as unknown as Window & Record<string, unknown>;

  const sanitizeInto = (node: Element, html: unknown) => {
    const sanitized = safeHtml(html);
    (node as HTMLElement).innerHTML = sanitized;
    prepareLegacyRoutes(node);
    enforceUrlPolicy(node, actualWindow);
    if ((node as HTMLElement).id === "app")
      appendProvenance(node as HTMLElement, options.data);
    return node;
  };

  runtime = {
    data: options.data,
    CM3: undefined,
    root: options.root,
    window: windowFacade,
    document: documentFacade,
    location: actualWindow.location,
    history: actualWindow.history,
    addEventListener: windowFacade.addEventListener,
    removeEventListener: windowFacade.removeEventListener,
    initializeBindings(names) {
      for (const name of names) runtime[name] = undefined;
    },
    setHTML: sanitizeInto,
    appendHTML(node, html) {
      const sanitized = safeHtml(html);
      (node as HTMLElement).insertAdjacentHTML("beforeend", sanitized);
      prepareLegacyRoutes(node);
      enforceUrlPolicy(node, actualWindow);
      return node;
    },
    insertHTML(node, where, html) {
      const sanitized = safeHtml(html);
      (node as HTMLElement).insertAdjacentHTML(where, sanitized);
      prepareLegacyRoutes(node.parentElement || node);
      enforceUrlPolicy(node.parentElement || node, actualWindow);
      return node;
    },
    replaceHTML(node, html) {
      const template = actualDocument.createElement("template");
      template.innerHTML = safeHtml(html);
      const replacement = template.content.firstElementChild;
      if (!replacement) {
        node.remove();
        return null;
      }
      node.replaceWith(template.content);
      prepareLegacyRoutes(options.root);
      enforceUrlPolicy(options.root, actualWindow);
      return replacement;
    },
    installPublicOverrides() {
      const hasPublicationDate = (value: unknown): value is string =>
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value);
      const preserveUnknownDate = (name: "fmtD" | "fmtDT") => {
        const legacyFormat = runtime[name];
        if (typeof legacyFormat !== "function") return;
        runtime[name] = (value: unknown) =>
          hasPublicationDate(value)
            ? legacyFormat(value)
            : "Yayın tarihi belirtilmedi";
      };
      // Collector records without upstream publication metadata are projected
      // with d: "" so the legacy date bucket/sort code remains total. Replace
      // its invalid-Date display only after the generated formatters exist.
      preserveUnknownDate("fmtD");
      preserveUnknownDate("fmtDT");
      disposeSearch?.();
      disposeSearch = installSearchOptimization(runtime);

      type RuntimeCorrectionEntityKind = CorrectionEntityKind;
      type RuntimeCorrectionTarget = {
        entityId: string;
        entityKind: RuntimeCorrectionEntityKind;
        label: string;
      };
      const pageTarget: RuntimeCorrectionTarget = {
        entityId: "historical-2026-10-13",
        entityKind: "page",
        label: "Tarihsel site / yöntem sayfası",
      };
      const routeTarget = (): RuntimeCorrectionTarget => {
        const parsed = parsePublicHash(actualWindow.location.hash);
        const sourceId =
          parsed.path === "/kurum" ? parsed.params.get("s") : null;
        if (sourceId)
          return {
            entityId: sourceId,
            entityKind: "source",
            label: "Kurum profili",
          };
        const eventId = parsed.path === "/olay" ? parsed.params.get("e") : null;
        if (eventId)
          return {
            entityId: eventId,
            entityKind: "event",
            label: "Olay karşılaştırması",
          };
        return pageTarget;
      };
      const open = (
        entityId?: unknown,
        entityKind?: unknown,
        label?: unknown
      ) => {
        const directKind: RuntimeCorrectionEntityKind | null =
          entityKind === "article" ||
          entityKind === "event" ||
          entityKind === "source" ||
          entityKind === "page"
            ? entityKind
            : null;
        const direct =
          typeof entityId === "string" && entityId && directKind
            ? {
                entityId,
                entityKind: directKind,
                label: typeof label === "string" ? label : entityId,
              }
            : null;
        const target = direct || routeTarget();
        openCorrectionIntake(runtime, target);
      };
      // The supplied artifact calls these openFix / v3openAppeal names. The
      // v2Fix/v3Appeal aliases retain compatibility for any referenced legacy
      // markup while all paths now open this one durable intake modal.
      const legacyKind: Record<string, RuntimeCorrectionEntityKind> = {
        kurum: "source",
        source: "source",
        olay: "event",
        event: "event",
        article: "article",
        genel: "page",
      };
      runtime.openFix = (kind: string, id: string, label?: string) => {
        const mapped = legacyKind[kind];
        if (mapped === "page")
          return open(pageTarget.entityId, mapped, pageTarget.label);
        return mapped ? open(id, mapped, label) : open();
      };
      runtime.v3openAppeal = (button?: unknown) => {
        const split =
          button instanceof actualWindow.Element
            ? button.previousElementSibling
            : null;
        const eventId = split?.getAttribute("data-e");
        return eventId
          ? open(eventId, "event", "Olay karşılaştırması")
          : open();
      };
      runtime.v2Fix = runtime.openFix;
      runtime.v3Appeal = runtime.v3openAppeal;

      const originalRoute = runtime.route;
      if (typeof originalRoute === "function") {
        runtime.route = () => {
          if (redirectIfAdmin()) return;
          const parsed = parsePublicHash(actualWindow.location.hash);
          if (parsed.malformed || parsed.unsupported) {
            actualWindow.location.hash = "#/";
            return;
          }
          return (originalRoute as () => unknown)();
        };
      }
    },
    cleanup() {
      disposeSearch?.();
      disposeSearch = undefined;
      const acid = runtime.acid as { stop?: () => void } | undefined;
      try {
        acid?.stop?.();
      } catch {
        // Cleanup remains best-effort if a browser already released WebGL.
      }
      const legacyTimeout = (runtime.window as Window & Record<string, unknown>)
        ._lt;
      if (typeof legacyTimeout === "number")
        runtime.window.clearTimeout(legacyTimeout);
      for (const dispose of disposers.splice(0).reverse()) dispose();
      options.root.replaceChildren();
    },
  };

  const routeAction = (event: Event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-cm-route]"
    );
    if (!target || !options.root.contains(target)) return;
    const route = target.getAttribute("data-cm-route") || "";
    if (!route.startsWith("/")) return;
    event.preventDefault();
    if (route.startsWith("/yonetim")) {
      redirectLegacyAdmin(actualWindow);
      return;
    }
    actualWindow.location.hash = `#${route}`;
  };
  const routeKey = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-cm-route]"
    );
    if (!target) return;
    event.preventDefault();
    target.click();
  };
  options.root.addEventListener("click", routeAction);
  options.root.addEventListener("keydown", routeKey);
  disposers.push(() => options.root.removeEventListener("click", routeAction));
  disposers.push(() => options.root.removeEventListener("keydown", routeKey));

  return runtime;
}
