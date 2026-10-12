/**
 * Campus AI Assistant
 * ───────────────────
 * Reads user role from sessionStorage (display metadata only — auth via HttpOnly cookie).
 * Routes to the correct endpoint:
 *   Student  → POST /ai/chat/student   {message}
 *   Faculty  → POST /ai/chat/faculty   {query}
 *   Admin    → shows a "not available" message
 *
 * Initialised automatically when this script loads.
 */
(function () {
  "use strict";

  const ROLE = (sessionStorage.getItem("role_name") || "").toLowerCase();
  const NAME = sessionStorage.getItem("user_name") || "there";

  // Admins don't have an AI advisor — don't render the widget
  if (ROLE === "admin") return;

  const GREETING =
    ROLE === "faculty"
      ? `Hi ${NAME}! I'm your Campus AI. Ask me about class performance, at-risk students, or teaching strategies.`
      : `Hi ${NAME}! I'm your Campus AI advisor. Ask me about your studies, grades, skills, or placement readiness.`;

  // ── DOM construction ──────────────────────────────────────────────────────

  function buildWidget() {
    const container = document.createElement("div");
    container.id = "campus-ai-widget";
    container.innerHTML = `
      <button class="ai-toggle-btn" id="ai-toggle-btn" aria-label="Open AI Assistant" title="Campus AI Assistant">
        <i class="fas fa-robot"></i>
      </button>

      <div class="ai-chat-window" id="ai-chat-window" role="dialog" aria-label="Campus AI Assistant" aria-hidden="true">
        <div class="ai-chat-header">
          <div class="ai-chat-header-info">
            <span class="ai-status-dot"></span>
            <div>
              <div class="ai-header-title">Campus AI</div>
              <div class="ai-header-sub">${ROLE === "faculty" ? "Faculty Advisor" : "Student Advisor"}</div>
            </div>
          </div>
          <button class="ai-close-btn" id="ai-close-btn" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="ai-chat-messages" id="ai-chat-messages"></div>

        <div class="ai-suggestions" id="ai-suggestions"></div>

        <div class="ai-chat-input-area">
          <textarea
            id="ai-chat-input"
            class="ai-chat-textarea"
            placeholder="Ask me anything…"
            rows="1"
            maxlength="1000"
            aria-label="Message input"
          ></textarea>
          <button id="ai-send-btn" class="ai-send-btn" aria-label="Send message" title="Send">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let isOpen = false;
  let isThinking = false;
  let chatInitialised = false;

  const SUGGESTIONS = {
    student: [
      "How can I improve my readiness score?",
      "What skills should I focus on?",
      "Give me a study plan for this week",
    ],
    faculty: [
      "Which students need attention?",
      "How can I improve class average?",
      "Suggest an intervention strategy",
    ],
  };

  // ── Core functions ────────────────────────────────────────────────────────

  function getEl(id) { return document.getElementById(id); }

  function addMessage(text, side) {
    const messages = getEl("ai-chat-messages");
    const div = document.createElement("div");
    div.className = `ai-message ai-message-${side}`;

    if (side === "ai") {
      div.innerHTML = `
        <div class="ai-avatar"><i class="fas fa-robot"></i></div>
        <div class="ai-bubble">${formatAIText(text)}</div>`;
    } else {
      div.innerHTML = `<div class="ai-bubble">${escapeHtml(text)}</div>`;
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function showTyping() {
    const messages = getEl("ai-chat-messages");
    const div = document.createElement("div");
    div.className = "ai-message ai-message-ai ai-typing-row";
    div.innerHTML = `
      <div class="ai-avatar"><i class="fas fa-robot"></i></div>
      <div class="ai-bubble ai-typing">
        <span></span><span></span><span></span>
      </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function formatAIText(text) {
    // Convert newlines to <br>, escape HTML first
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildSuggestions() {
    const container = getEl("ai-suggestions");
    const list = SUGGESTIONS[ROLE] || SUGGESTIONS.student;
    container.innerHTML = list
      .map(
        (s) =>
          `<button class="ai-suggestion-chip" onclick="window._aiSendSuggestion('${escapeHtml(s)}')">${escapeHtml(s)}</button>`
      )
      .join("");
  }

  window._aiSendSuggestion = function (text) {
    const input = getEl("ai-chat-input");
    if (input) input.value = text;
    sendMessage();
  };

  function initChat() {
    if (chatInitialised) return;
    chatInitialised = true;
    addMessage(GREETING, "ai");
    buildSuggestions();
  }

  // ── Send logic ────────────────────────────────────────────────────────────

  async function sendMessage() {
    const input = getEl("ai-chat-input");
    const sendBtn = getEl("ai-send-btn");
    const message = (input.value || "").trim();

    if (!message || isThinking) return;

    isThinking = true;
    input.value = "";
    input.style.height = "auto";
    if (sendBtn) sendBtn.disabled = true;

    // Hide suggestions after first message
    const suggestions = getEl("ai-suggestions");
    if (suggestions) suggestions.style.display = "none";

    addMessage(message, "user");
    const typingEl = showTyping();

    const endpoint = ROLE === "faculty" ? "/ai/chat/faculty" : "/ai/chat/student";
    const body = ROLE === "faculty" ? { query: message } : { message };

    try {
      
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      typingEl.remove();

      if (!res.ok) {
        addMessage(data.error || "Something went wrong. Please try again.", "ai");
      } else {
        addMessage(data.response || "No response from AI.", "ai");
      }
    } catch (_) {
      typingEl.remove();
      addMessage(
        "I'm having trouble connecting right now. Please check your internet connection and try again.",
        "ai"
      );
    } finally {
      isThinking = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  function openChat() {
    isOpen = true;
    const win = getEl("ai-chat-window");
    const btn = getEl("ai-toggle-btn");
    win.classList.add("active");
    win.setAttribute("aria-hidden", "false");
    btn.classList.add("open");
    initChat();
    setTimeout(() => getEl("ai-chat-input")?.focus(), 300);
  }

  function closeChat() {
    isOpen = false;
    const win = getEl("ai-chat-window");
    const btn = getEl("ai-toggle-btn");
    win.classList.remove("active");
    win.setAttribute("aria-hidden", "true");
    btn.classList.remove("open");
  }

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    buildWidget();

    getEl("ai-toggle-btn").addEventListener("click", () =>
      isOpen ? closeChat() : openChat()
    );
    getEl("ai-close-btn").addEventListener("click", closeChat);

    const input = getEl("ai-chat-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener("input", () => autoResize(input));

    getEl("ai-send-btn").addEventListener("click", sendMessage);

    // Close on outside click
    document.addEventListener("click", (e) => {
      const widget = document.getElementById("campus-ai-widget");
      if (isOpen && widget && !widget.contains(e.target)) closeChat();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
