(() => {
  /**
   * helper para querySelector (1 elemento)
   */
  const $ = (sel) => document.querySelector(sel);

  /**
   * Chave única do LocalStorage para salvar as mensagens do formulário
   */
  const STORAGE_KEY = "amanda_inbox_v2";

  // Utils (funções puras/reutilizáveis)

  /**
   * Simula uma chamada assíncrona (ex: request HTTP)
   */
  function fakeNetwork(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * - Converte caracteres especiais em entidades HTML
   * - Segurança extra porque as mensagens vêm do usuário (form)
   */
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Copia um texto para a área de transferência
   * - Preferência: Clipboard API
   *   -> funciona bem em HTTPS ou localhost
   * - Fallback: execCommand("copy")
   *   -> ajuda em ambiente file:// ou casos em que Clipboard API falha
   */
  async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;

    // Evita teclado em mobile + impede edição
    textarea.setAttribute("readonly", "");

    // Tira do layout/visão do usuário
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

  /**
   * Lê o inbox do LocalStorage e retorna um array
   * Se der erro , devolve array vazio
   */
  function loadInbox() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // Toast
  const toastEl = $("#feedbackToast");
  const toastBody = $("#toastBody");

  /**
   * Cria a instância do toast somente se:
   * - existe o elemento no DOM
   * - existe bootstrap.Toast no window
   */
  const toastInstance =
    toastEl && window.bootstrap?.Toast
      ? new window.bootstrap.Toast(toastEl, { delay: 3200 })
      : null;

  /**
   * Mostra um toast.
   * - message: texto principal
   * - isError: muda cor
   */
  function showToast(message, isError = false) {
    // Se o toast não estiver disponível, a função não quebra o app.
    if (!toastEl || !toastBody || !toastInstance) return;

    // Atualiza texto do toast
    toastBody.textContent = message;

    // Ajusta ícone conforme erro/sucesso
    const icon = toastEl.querySelector(".toast-header i");

    // Limpa classes antes de aplicar as novas
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

    // Exibe
    toastInstance.show();
  }

  // Year (footer)
  /**
   * Coloca o ano atual no footer.
   * Ex: © 2026 Amanda Mesquita
   */
  function initYear() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  // Theme toggle (Bootstrap 5.3 - data-bs-theme)
  /**
   * Alterna entre light/dark usando data-bs-theme no <html>.
   * Persiste a escolha no LocalStorage. feature futura
   */
  function initTheme() {
    const html = document.documentElement;
    const themeToggle = $("#themeToggle");

    // Restaura o tema salvo, se existir
    const savedTheme = localStorage.getItem("theme_v2");
    if (savedTheme) html.setAttribute("data-bs-theme", savedTheme);

    // Clique -> alterna tema e salva
    themeToggle?.addEventListener("click", () => {
      const current = html.getAttribute("data-bs-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      html.setAttribute("data-bs-theme", next);
      localStorage.setItem("theme_v2", next);
    });
  }

  // Copy Email button
  /**
   * - pega o e-mail do atributo data-email
   * - copia com Clipboard API (ou fallback)
   * - mostra feedback pelo toast
   */
  function initCopyEmail() {
    const copyBtn = $("#copyEmail");
    if (!copyBtn) return;

    copyBtn.addEventListener("click", async () => {
      const email = copyBtn.getAttribute("data-email") || "";

      // Segurança: se esquecer de setar data-email
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

  // Form + Inbox modal
  /**
   * - submit do formulário (validação + loading + persistência)
   * - renderização do inbox quando o modal abre
   * - limpar inbox
   */
  function initFormAndInbox() {
    const form = $("#ctaForm");

    // Botão e elementos de loading
    const submitBtn = $("#submitBtn");
    const spinner = submitBtn?.querySelector(".spinner-border");
    const btnText = submitBtn?.querySelector(".btn-text");

    // Elementos do inbox modal
    const inboxList = $("#inboxList");
    const inboxEmpty = $("#inboxEmpty");
    const clearInboxBtn = $("#clearInbox");

    /**
     * Controla estado de loading no botão.
     * - desabilita o botão
     * - mostra/esconde spinner
     * - troca texto
     */
    function setLoading(isLoading) {
      if (!submitBtn) return;

      submitBtn.disabled = isLoading;
      spinner?.classList.toggle("d-none", !isLoading);

      if (btnText) btnText.textContent = isLoading ? "Enviando..." : "Enviar";
    }

    /**
     * Renderiza a lista de mensagens no modal “Inbox”.
     * - lê do LocalStorage
     * - cria cards com innerHTML (usando escapeHtml)
     * - controla o estado vazio
     */
    function renderInbox() {
      if (!inboxList || !inboxEmpty) return;

      const inbox = loadInbox();

      inboxList.innerHTML = "";

      // Estado vazio
      if (!inbox.length) {
        inboxEmpty.classList.remove("d-none");
        return;
      }

      inboxEmpty.classList.add("d-none");

      // Renderiza cada mensagem
      inbox.forEach((msg) => {
        const card = document.createElement("div");
        card.className = "card card-soft";

        // escapeHtml em tudo que veio do usuário (form)
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

    // Form submit (com validação)
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        showToast("Verifique os campos e tente novamente.", true);
        return;
      }

      setLoading(true);

      // Lê os dados do form
      const data = Object.fromEntries(new FormData(form).entries());

      // Monta payload “similar” a um backend
      const payload = {
        ...data,
        id: crypto?.randomUUID?.() || String(Date.now()),
        createdAt: new Date().toISOString(),
      };

      try {
        // Simula request
        await fakeNetwork(900);

        // Persiste no localStorage
        const inbox = loadInbox();
        inbox.unshift(payload); // adiciona no começo
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inbox));

        // Reseta o form e validação
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

    // Modal open
    document
      .getElementById("inboxModal")
      ?.addEventListener("shown.bs.modal", () => {
        renderInbox();
      });

    // Limpar inbox
    clearInboxBtn?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      renderInbox();
      showToast("Inbox limpa.");
    });
  }

  // Bootstrapping (inicialização)
  /**
   * Garante que tudo só roda depois que o DOM existe.
   * (Evita null em querySelector)
   */
  document.addEventListener("DOMContentLoaded", () => {
    initYear();
    initTheme();
    initCopyEmail();
    initFormAndInbox();
  });
})();
