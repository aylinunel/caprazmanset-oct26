import {
  normalizeSearchQuery,
  SearchTextIndex,
  type SearchDataset,
  type SearchMatches,
  type SearchRecord,
} from "./search-index";

export const SEARCH_EVENT_BATCH_SIZE = 24;
interface SearchRuntime {
  root: HTMLElement;
  D: SearchDataset;
  STAT: Record<string, unknown>;
  SIDE: Record<string, string>;
  $(selector: string): HTMLElement | null;
  renderSearch(): void;
  v3isIlanEvent(record: SearchRecord): boolean;
  cards(records: SearchRecord[]): string;
  esc(value: unknown): string;
  srcName(id: unknown): string;
  sideOf(id: unknown): string;
  fmtDT(value: unknown): string;
  setHTML(node: Element, html: unknown): Element;
  appendHTML(node: Element, html: unknown): Element;
  wireGo(node: Element): void;
}
interface SearchPage {
  query: string;
  events: SearchRecord[];
  shown: number;
  box: HTMLElement;
}

/** Installs on the existing post-initialization override hook. Generated legacy
 * modules remain untouched, so source regeneration preserves this optimization.
 */
export function installSearchOptimization(
  runtime: Record<string, unknown>
): () => void {
  if (
    typeof runtime.renderSearch !== "function" ||
    typeof runtime.cards !== "function"
  )
    return () => undefined;
  const view = runtime as unknown as SearchRuntime;
  const originalRender = view.renderSearch;
  let index: SearchTextIndex | undefined;
  let page: SearchPage | undefined;
  const getMatches = (query: string): SearchMatches => {
    index ??= new SearchTextIndex(view.D);
    return index.search(query, {
      excludeEvent: record => view.v3isIlanEvent(record),
      includeSource: record => Boolean(view.STAT[String(record.s)]),
    });
  };
  const href = (path: string, key: string, id: unknown) =>
    `#/${path}?${key}=${encodeURIComponent(String(id))}`;
  const articleRows = (articles: SearchRecord[]) =>
    articles
      .map(article => {
        const side = view.sideOf(article.s);
        const link = article.st
          ? `<a class="xart-t" href="${href("olay", "e", article.st)}">`
          : `<a class="xart-t" href="${view.esc(article.u)}" target="_blank" rel="noopener" data-a="${view.esc(article.i)}">`;
        return `<div class="xart"><div class="xart-h"><a class="xsrc" href="${href("kurum", "s", article.s)}">${view.esc(view.srcName(article.s))}</a><span class="xlean ${view.esc(side)}">${view.esc(view.SIDE[side])}</span><span class="xsmall mono" style="margin-left:auto">${view.fmtDT(article.d)}</span></div>${link}${view.esc(article.t)}</a></div>`;
      })
      .join("");

  const updateProgress = () => {
    if (!page) return;
    const status = page.box.querySelector<HTMLElement>(
      "[data-cm-search-progress]"
    );
    const button = page.box.querySelector<HTMLButtonElement>(
      "[data-cm-search-more]"
    );
    if (status)
      status.textContent = `${page.shown.toLocaleString("tr-TR")} / ${page.events.length.toLocaleString("tr-TR")} olay gösteriliyor.`;
    if (button) {
      const remaining = page.events.length - page.shown;
      button.setAttribute("aria-disabled", String(remaining === 0));
      button.textContent =
        remaining > 0
          ? `Sonraki ${Math.min(SEARCH_EVENT_BATCH_SIZE, remaining)} olayı göster`
          : "Bütün olaylar gösterildi";
    }
  };

  view.renderSearch = () => {
    const box = view.$("#sres");
    if (!box) return;
    const input = view.$("#sq") as HTMLInputElement | null;
    const query = normalizeSearchQuery(input?.value ?? "");
    input?.setAttribute("aria-label", "Olay, kurum, konu ve başlık ara");
    if (query.length < 2) {
      page = undefined;
      view.setHTML(
        box,
        '<p class="xsmall" style="margin-top:14px">En az iki harf yazın.</p>'
      );
      return;
    }
    const matches = getMatches(query);
    const shown = Math.min(SEARCH_EVENT_BATCH_SIZE, matches.events.length);
    page = { query, events: matches.events, shown, box };
    let html = "";
    if (matches.sources.length || matches.topics.length) {
      html += '<div class="xchips" style="margin-top:16px">';
      html += matches.sources
        .map(
          source =>
            `<a class="xtp" href="${href("kurum", "s", source.s)}">Kurum · ${view.esc(source.n)}</a>`
        )
        .join("");
      html += matches.topics
        .map(
          topic =>
            `<a class="xtp" href="${href("konu", "k", topic.k)}">Konu · ${view.esc(topic.n)}</a>`
        )
        .join("");
      html += "</div>";
    }
    html += `<section class="sec"><h2>Olaylar <span class="num xsmall" data-cm-search-total>${matches.events.length}</span></h2>`;
    html += matches.events.length
      ? `<div class="xcards" id="cm-search-events" data-cm-search-events>${view.cards(matches.events.slice(0, shown))}</div>`
      : '<p class="xempty">Eşleşen olay yok.</p>';
    if (matches.events.length > SEARCH_EVENT_BATCH_SIZE) {
      html +=
        '<p class="xsmall" id="cm-search-progress" data-cm-search-progress role="status" aria-live="polite" aria-atomic="true"></p><button type="button" class="chip" data-cm-search-more aria-controls="cm-search-events" aria-describedby="cm-search-progress"></button>';
    }
    html += "</section>";
    html += `<section class="sec"><h2>Başlıklar <span class="num xsmall">${matches.articles.length}${matches.articles.length === 40 ? "+" : ""}</span></h2>`;
    html += matches.articles.length
      ? articleRows(matches.articles)
      : '<p class="xempty">Eşleşen başlık yok.</p>';
    html += "</section>";
    view.setHTML(box, html);
    updateProgress();
    view.wireGo(box);
  };

  const showMore = (event: Event) => {
    const element = event.target as Element | null;
    const button = element?.closest<HTMLButtonElement>("[data-cm-search-more]");
    if (
      !button ||
      !page ||
      button.getAttribute("aria-disabled") === "true" ||
      !page.box.contains(button)
    )
      return;
    const query = normalizeSearchQuery(
      (view.$("#sq") as HTMLInputElement | null)?.value ?? ""
    );
    const current = getMatches(query);
    // Do not bake dynamic notice eligibility into the cached strings or allow
    // a previous flag state to leak into later progressive batches.
    if (
      query !== page.query ||
      current.events.length !== page.events.length ||
      current.events.some((record, at) => record !== page?.events[at])
    ) {
      view.renderSearch();
      (
        view
          .$("#sres")
          ?.querySelector<HTMLButtonElement>("[data-cm-search-more]") ??
        view.$("#sq")
      )?.focus();
      return;
    }
    const container = page.box.querySelector<HTMLElement>(
      "[data-cm-search-events]"
    );
    if (!container) return;
    const end = Math.min(
      page.shown + SEARCH_EVENT_BATCH_SIZE,
      page.events.length
    );
    view.appendHTML(container, view.cards(page.events.slice(page.shown, end)));
    page.shown = end;
    updateProgress();
    view.wireGo(container);
    // Appending does not replace the focused button. Keep it even when all
    // batches are loaded, so focus never jumps to the top of a long result page.
  };
  view.root.addEventListener("click", showMore);
  return () => {
    view.root.removeEventListener("click", showMore);
    view.renderSearch = originalRender;
    index?.clear();
    index = undefined;
    page = undefined;
  };
}
