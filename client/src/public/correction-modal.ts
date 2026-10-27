export type CorrectionEntityKind = "article" | "event" | "source" | "page";

export interface CorrectionTarget {
  entityId: string;
  entityKind: CorrectionEntityKind;
  label?: string;
}

interface CorrectionRuntime {
  root: HTMLElement;
  window: Window;
}

function create<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function safeEvidenceUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Minimal durable reader intake. It intentionally has no name, email or local
 * draft persistence; editorial follow-up happens only through the protected
 * queue and the returned submitted case identifier.
 */
export function openCorrectionIntake(
  runtime: CorrectionRuntime,
  target: CorrectionTarget
): void {
  const document = runtime.root.ownerDocument;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const previous = runtime.root.querySelector(".cm-correction-backdrop");
  previous?.remove();

  const backdrop = create(document, "div", "cm-correction-backdrop");
  const dialog = create(document, "section", "cm-correction-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "cm-correction-title");
  dialog.tabIndex = -1;

  const title = create(document, "h2");
  title.id = "cm-correction-title";
  title.textContent = "Düzeltme bildirimi";
  const intro = create(document, "p");
  intro.textContent =
    "Bu özel intake formu editoryal inceleme kuyruğuna gönderilir. İletişim bilgisi istemez; gönderim bir değişiklik güvencesi değildir.";
  const subject = create(document, "p");
  subject.className = "xsmall";
  subject.textContent = `Hedef: ${target.label || target.entityId}`;

  const form = create(document, "form");
  form.noValidate = true;
  const claimLabel = create(document, "label");
  claimLabel.textContent = "Hangi olgu veya ifade düzeltilmeli?";
  const claim = create(document, "textarea");
  claim.name = "claim";
  claim.rows = 4;
  claim.maxLength = 1200;
  claim.required = true;
  claimLabel.append(claim);

  const messageLabel = create(document, "label");
  messageLabel.textContent = "Açıklama (en az 10 karakter)";
  const message = create(document, "textarea");
  message.name = "message";
  message.rows = 3;
  message.minLength = 10;
  message.maxLength = 4000;
  message.required = true;
  messageLabel.append(message);

  const evidenceLabel = create(document, "label");
  evidenceLabel.textContent = "Kanıt bağlantısı (isteğe bağlı, https://)";
  const evidence = create(document, "input");
  evidence.name = "evidenceUrl";
  evidence.type = "url";
  evidence.inputMode = "url";
  evidence.maxLength = 2048;
  evidenceLabel.append(evidence);

  const consentLabel = create(document, "label");
  const consent = create(document, "input");
  consent.type = "checkbox";
  consent.required = true;
  consent.name = "consent";
  consentLabel.append(
    consent,
    document.createTextNode(
      " Bu bildirimin editoryal inceleme için işlenmesini kabul ediyorum."
    )
  );

  const honeypotLabel = create(document, "label", "cm-correction-honeypot");
  honeypotLabel.setAttribute("aria-hidden", "true");
  honeypotLabel.textContent = "Web sitesi";
  const website = create(document, "input");
  website.name = "website";
  website.tabIndex = -1;
  website.autocomplete = "off";
  honeypotLabel.append(website);

  const status = create(document, "p", "cm-correction-status");
  status.setAttribute("aria-live", "polite");
  const actions = create(document, "div", "cm-correction-actions");
  const cancel = create(document, "button");
  cancel.type = "button";
  cancel.textContent = "Vazgeç";
  const submit = create(document, "button");
  submit.type = "submit";
  submit.textContent = "Gönder";
  actions.append(cancel, submit);

  form.append(
    claimLabel,
    messageLabel,
    evidenceLabel,
    consentLabel,
    honeypotLabel,
    status,
    actions
  );
  dialog.append(title, intro, subject, form);
  backdrop.append(dialog);
  runtime.root.append(backdrop);

  const close = () => {
    backdrop.remove();
    if (
      previouslyFocused?.isConnected &&
      typeof previouslyFocused.focus === "function"
    )
      previouslyFocused.focus();
  };
  cancel.addEventListener("click", close);
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) close();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    // Resolve each time: submit/cancel are disabled while sending, and the
    // successful receipt replaces the form with a single close button.
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]"
      )
    ).filter(
      node =>
        node.tabIndex >= 0 &&
        !node.matches(":disabled") &&
        !node.closest("[hidden]")
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
    } else if (
      event.shiftKey &&
      (document.activeElement === first ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    status.textContent = "";
    const evidenceUrl = safeEvidenceUrl(evidence.value);
    if (claim.value.trim().length < 3) {
      status.textContent =
        "Düzeltilecek olgu veya ifade en az 3 karakter olmalıdır.";
      claim.focus();
      return;
    }
    if (message.value.trim().length < 10) {
      status.textContent = "Açıklama en az 10 karakter olmalıdır.";
      message.focus();
      return;
    }
    if (evidence.value.trim() && !evidenceUrl) {
      status.textContent =
        "Kanıt bağlantısı yalnızca kullanıcı bilgisi içermeyen https:// adresi olabilir.";
      evidence.focus();
      return;
    }
    if (!consent.checked) {
      status.textContent = "Göndermek için işleme onayı gereklidir.";
      consent.focus();
      return;
    }

    submit.disabled = true;
    cancel.disabled = true;
    status.textContent = "Gönderiliyor…";
    try {
      const response = await runtime.window.fetch(
        "/api/editorial/corrections",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            entityId: String(target.entityId),
            entityKind: target.entityKind,
            claim: claim.value.trim(),
            message: message.value.trim(),
            evidenceUrl,
            consent: true,
            website: website.value,
          }),
        }
      );
      const result: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        (result as { status?: unknown }).status !== "submitted" ||
        typeof (result as { id?: unknown }).id !== "string"
      ) {
        throw new Error("submission-rejected");
      }
      form.replaceChildren();
      const received = create(document, "h3");
      received.textContent = "Talebiniz gönderildi.";
      const detail = create(document, "p");
      const caseInfo = result as { id: string; status: string };
      detail.textContent = `Başvuru numarası: ${caseInfo.id}. Durum: ${caseInfo.status}.`;
      const note = create(document, "p");
      note.className = "xsmall";
      note.textContent =
        "Bu form iletişim bilgisi toplamaz; saklamak istediğiniz tek bilgi başvuru numarasıdır.";
      const done = create(document, "button");
      done.type = "button";
      done.textContent = "Kapat";
      done.addEventListener("click", close);
      form.append(received, detail, note, done);
      done.focus();
    } catch {
      submit.disabled = false;
      cancel.disabled = false;
      status.textContent =
        "Gönderim tamamlanamadı. Lütfen daha sonra yeniden deneyin.";
    }
  });

  claim.focus();
}
