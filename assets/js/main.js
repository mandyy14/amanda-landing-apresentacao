(() => {
  const $ = (sel) => document.querySelector(sel);

  const STORAGE_KEY = "amanda_inbox_v2";

  // ---------- Utils ----------
  function fakeNetwork(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function copyText(text) {
    // Clipboard API (só funciona bem em https/localhost)
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback (ajuda no file:// também)
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }

  function loadInbox() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ---------- Toast ----------
  const toastEl = $("#feedbackToast");
  const toastBody = $("#toastBody");
  const toastInstance =
    toastEl && window.bootstrap?.Toast
      ? new window.bootstrap.Toast(toastEl, { delay: 3200 })
      : null;

  function showToast(message, isError = false) {
    if (!toastEl || !toastBody || !toastInstance) return;

    toastBody.textContent = message;

    const icon = toastEl.querySelector(".toast-header i");
    icon?.classList.remove(
      "text-success",
      "text-danger",
      "bi-check-circle-fill",
      "bi-exclamation-triangle-fill",
    );

    if (isError) {
      icon?.classList.add("text-danger", "bi-exclamation-triangle-fill");
    } else {
      icon?.classList.add("text-success", "bi-check-circle-fill");
    }

    toastInstance.show();
  }

  // ---------- Year ----------
  function initYear() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  // ---------- Theme ----------
  function initTheme() {
    const html = document.documentElement;
    const themeToggle = $("#themeToggle");

    const savedTheme = localStorage.getItem("theme_v2");
    if (savedTheme) html.setAttribute("data-bs-theme", savedTheme);

    themeToggle?.addEventListener("click", () => {
      const current = html.getAttribute("data-bs-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      html.setAttribute("data-bs-theme", next);
      localStorage.setItem("theme_v2", next);
    });
  }

  // ---------- Copy Email ----------
  function initCopyEmail() {
    const copyBtn = $("#copyEmail");
    if (!copyBtn) return;

    copyBtn.addEventListener("click", async () => {
      const email = copyBtn.getAttribute("data-email") || "";
      if (!email) {
        showToast("E-mail não encontrado no botão.", true);
        return;
      }

      try {
        const ok = await copyText(email);
        if (ok) showToast("E-mail copiado para a área de transferência!");
        else
          showToast(
            "Não consegui copiar automaticamente. Copie manualmente.",
            true,
          );
      } catch {
        showToast(
          "Não consegui copiar automaticamente. Copie manualmente.",
          true,
        );
      }
    });
  }

  // ---------- Form + Inbox ----------
  function initFormAndInbox() {
    const form = $("#ctaForm");
    const submitBtn = $("#submitBtn");
    const spinner = submitBtn?.querySelector(".spinner-border");
    const btnText = submitBtn?.querySelector(".btn-text");

    const inboxList = $("#inboxList");
    const inboxEmpty = $("#inboxEmpty");
    const clearInboxBtn = $("#clearInbox");
    const exportInboxBtn = $("#exportInbox");

    function setLoading(isLoading) {
      if (!submitBtn) return;
      submitBtn.disabled = isLoading;
      spinner?.classList.toggle("d-none", !isLoading);
      if (btnText) btnText.textContent = isLoading ? "Enviando..." : "Enviar";
    }

    function renderInbox() {
      if (!inboxList || !inboxEmpty) return;

      const inbox = loadInbox();
      inboxList.innerHTML = "";

      if (!inbox.length) {
        inboxEmpty.classList.remove("d-none");
        return;
      }

      inboxEmpty.classList.add("d-none");

      inbox.forEach((msg) => {
        const card = document.createElement("div");
        card.className = "card card-soft";
        card.innerHTML = `
          <div class="card-body">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div class="fw-semibold">${escapeHtml(msg.subject)}</div>
              <span class="text-muted small">${new Date(msg.createdAt).toLocaleString()}</span>
            </div>
            <div class="text-muted small mt-1">
              <span class="me-2"><i class="bi bi-person"></i> ${escapeHtml(msg.name)}</span>
              <span><i class="bi bi-envelope"></i> ${escapeHtml(msg.email)}</span>
            </div>
            <p class="mt-3 mb-0">${escapeHtml(msg.message)}</p>
          </div>
        `;
        inboxList.appendChild(card);
      });
    }

    // Form submit
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        showToast("Verifique os campos e tente novamente.", true);
        return;
      }

      setLoading(true);

      const data = Object.fromEntries(new FormData(form).entries());
      const payload = {
        ...data,
        id: crypto?.randomUUID?.() || String(Date.now()),
        createdAt: new Date().toISOString(),
      };

      try {
        await fakeNetwork(900);

        const inbox = loadInbox();
        inbox.unshift(payload);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inbox));

        form.reset();
        form.classList.remove("was-validated");
        showToast(
          "Mensagem enviada! (demo salva no navegador - verifique o inbox)",
        );
      } catch (err) {
        console.error(err);
        showToast("Falha ao enviar. Tente novamente.", true);
      } finally {
        setLoading(false);
      }
    });

    // Modal open -> render inbox
    document
      .getElementById("inboxModal")
      ?.addEventListener("shown.bs.modal", () => {
        renderInbox();
      });

    // Clear inbox
    clearInboxBtn?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      renderInbox();
      showToast("Inbox limpa.");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initYear();
    initTheme();
    initCopyEmail();
    initFormAndInbox();
  });
})();
