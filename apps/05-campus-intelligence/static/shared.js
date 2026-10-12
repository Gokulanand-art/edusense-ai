/* ─────────────────────────────────────────────────────────────────────────────
 * shared.js  –  Global utilities for Smart Campus Intelligence System
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY NOTE (2026-06):
 *   Auth token is stored ONLY in an HttpOnly secure cookie set by the server.
 *   JS can never read the token — preventing XSS-based token theft.
 *   sessionStorage holds only non-sensitive display metadata (name, role).
 * ───────────────────────────────────────────────────────────────────────────── */

"use strict";

// ── Session metadata (display-only, not security) ─────────────────────────────

const _SESSION_KEYS = ["user_name", "user_email", "role_id", "role_name", "institution_id"];

function _getSession(key) {
    return sessionStorage.getItem(key) || "";
}

function _setSession(user) {
    sessionStorage.setItem("user_name",       user.name        || "");
    sessionStorage.setItem("user_email",      user.email       || "");
    sessionStorage.setItem("role_id",         String(user.role_id || ""));
    sessionStorage.setItem("role_name",       (user.role_name  || "").toLowerCase());
    sessionStorage.setItem("institution_id",  String(user.institution_id || ""));
}

function _clearSession() {
    _SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
}

// ── Navigation ────────────────────────────────────────────────────────────────

function go(path) {
    window.location.href = path;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function logout() {
    try {
        // Cookie is sent automatically — no need to pass Authorization header
        await fetch("/auth/logout", {
            method: "POST",
            credentials: "same-origin",
        });
    } catch (_) {
        // Ignore network errors — clear local state regardless
    }
    _clearSession();
    window.location.href = "/";
}

/**
 * Client-side guard: redirect to login if no session metadata is present.
 * Real security enforcement happens server-side via the HttpOnly cookie.
 * Role check here is for UX only (e.g., student visiting /admin-dashboard).
 */
function requireAuth(expectedRoles = []) {
    const roleName = _getSession("role_name");

    if (!roleName) {
        // No session metadata — send to login; server will enforce on any API call too
        window.location.href = "/";
        return false;
    }

    if (Array.isArray(expectedRoles) && expectedRoles.length) {
        const allowedRoles = expectedRoles.map((r) => String(r).toLowerCase());
        if (!allowedRoles.includes(roleName.toLowerCase())) {
            window.location.href = "/";
            return false;
        }
    }

    return true;
}

// ── Topbar user info ──────────────────────────────────────────────────────────

function syncTopbarUser() {
    const name  = _getSession("user_name");
    const role  = _getSession("role_name") || "User";
    const email = _getSession("user_email");
    const displayName = name || email || "User";

    const nameElem  = document.getElementById("topbarUserName");
    const roleElem  = document.getElementById("topbarUserRole");
    const emailElem = document.getElementById("userEmail");

    if (nameElem)  nameElem.textContent  = email || displayName;
    if (roleElem)  roleElem.textContent  = role.charAt(0).toUpperCase() + role.slice(1);
    if (emailElem) emailElem.textContent = email || displayName;

    // Personalise the topbar title
    const titleEl = document.getElementById("topbarTitle");
    if (titleEl && role) {
        const roleCap = role.charAt(0).toUpperCase() + role.slice(1);
        const txt = titleEl.textContent.trim();
        if (txt === "Overview" || txt === "Welcome back, User") {
            titleEl.textContent = "Welcome back, " + roleCap;
        }
    }

    // Role-based sidebar logo icon
    const iconEl = document.getElementById("sidebarIcon");
    const icons = {
        student: "fas fa-user-graduate",
        faculty: "fas fa-chalkboard-user",
        admin:   "fas fa-crown",
    };
    if (iconEl && icons[role.toLowerCase()]) iconEl.className = icons[role.toLowerCase()];

    const avatarIcon = document.getElementById("topbarAvatarIcon");
    if (avatarIcon && icons[role.toLowerCase()]) avatarIcon.className = icons[role.toLowerCase()];
}

document.addEventListener("DOMContentLoaded", syncTopbarUser);

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Authenticated fetch — relies on the HttpOnly cookie sent automatically
 * by the browser. No token handling in JS needed.
 */
async function fetchJson(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    // Auto-set Content-Type for JSON string bodies
    if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(path, {
        ...options,
        headers,
        credentials: "same-origin", // Ensures HttpOnly cookie is sent
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        // Session expired or invalid cookie — clear metadata and redirect
        if (response.status === 401) {
            _clearSession();
            window.location.href = "/";
            return;
        }
        throw new Error(data.error || data.message || `Request failed (${response.status})`);
    }

    return data;
}

/** Alias used across dashboard files. */
async function fetchAuth(path, options = {}) {
    return fetchJson(path, options);
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatValue(value) {
    const n = Number(value ?? 0);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
}

function formatPercent(value) {
    return formatValue(value) + "%";
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function setHtml(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
}

// ── Toast notifications ───────────────────────────────────────────────────────

let _toastContainer = null;

function _getToastContainer() {
    if (!_toastContainer) {
        _toastContainer = document.createElement("div");
        _toastContainer.id = "toast-container";
        Object.assign(_toastContainer.style, {
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: "9999",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-end",
        });
        document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
}

function showToast(message, type = "info", duration = 3500) {
    const container = _getToastContainer();
    const colours = {
        success: "#10b981",
        error:   "#ef4444",
        warning: "#f59e0b",
        info:    "#4f46e5",
    };
    const icons = {
        success: "fas fa-check-circle",
        error:   "fas fa-times-circle",
        warning: "fas fa-exclamation-triangle",
        info:    "fas fa-info-circle",
    };

    const toast = document.createElement("div");
    Object.assign(toast.style, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 18px",
        borderRadius: "10px",
        background: "#1e293b",
        borderLeft: `4px solid ${colours[type] || colours.info}`,
        color: "#f8fafc",
        fontSize: "14px",
        fontWeight: "500",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)",
        transform: "translateX(120%)",
        transition: "transform .3s ease",
        maxWidth: "340px",
        wordBreak: "break-word",
    });
    toast.innerHTML = `<i class="${icons[type] || icons.info}" style="color:${colours[type] || colours.info};flex-shrink:0"></i><span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => { toast.style.transform = "translateX(0)"; });
    });

    setTimeout(() => {
        toast.style.transform = "translateX(120%)";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ── Button loading state ──────────────────────────────────────────────────────

function setLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalHtml || "Submit";
    }
}

// ── At-risk student table renderer (used by faculty/admin dashboards) ─────────

function renderAtRiskTable(students, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!students || !students.length) {
        container.innerHTML = `
            <div class="empty-state" style="text-align:center;padding:32px;color:#94a3b8">
                <i class="fas fa-check-circle" style="font-size:32px;color:#10b981;margin-bottom:12px;display:block"></i>
                <p style="font-weight:500">All students are performing satisfactorily.</p>
            </div>`;
        return;
    }

    let html = `<div class="table-wrapper custom-scrollbar"><table class="data-table">
        <thead><tr>
            <th>Name</th><th>Department</th><th>Score</th><th>Risk Level</th><th>Action</th>
        </tr></thead><tbody>`;

    students.forEach((s) => {
        const score      = parseFloat(s.final_score ?? 0);
        const riskClass  = score < 40 ? "badge-danger" : score < 60 ? "badge-warning" : "badge-success";
        const riskLabel  = s.risk || (score < 60 ? "High Risk" : "Moderate");

        html += `<tr>
            <td>${escapeHtml(s.name || "N/A")}</td>
            <td>${escapeHtml(s.department || "N/A")}</td>
            <td><strong>${formatValue(score)}%</strong></td>
            <td><span class="badge ${riskClass}">${riskLabel}</span></td>
            <td><button class="btn btn-sm btn-outline" onclick="viewStudent(${s.student_id || s.id})">
                <i class="fas fa-eye"></i> View
            </button></td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ── Security helper ───────────────────────────────────────────────────────────

function escapeHtml(str) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return String(str ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)    return "just now";
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr) {
    if (!dateStr) return "\u2014";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Media helpers ─────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchMediaBlob(fileId) {
    // Cookie sent automatically — no manual auth header needed
    const response = await fetch(`/media/${encodeURIComponent(fileId)}`, {
        credentials: "same-origin",
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Download failed (${response.status})`);
    }

    return {
        blob: await response.blob(),
        contentDisposition: response.headers.get("Content-Disposition") || "",
    };
}

function getDownloadFilename(contentDisposition, fallback) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    return match ? match[1] : fallback;
}

async function downloadMediaFile(fileId, filename) {
    try {
        const { blob, contentDisposition } = await fetchMediaBlob(fileId);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = getDownloadFilename(contentDisposition, filename || "download");
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        showToast(error.message || "Unable to download file.", "error");
    }
}

async function deleteMediaFile(panel, fileId) {
    const ok = await confirmAction({
        title: "Delete file",
        message: "This file will be removed from media storage.",
        confirmText: "Delete",
        danger: true,
    });
    if (!ok) return;

    try {
        await fetchAuth(`/media/${encodeURIComponent(fileId)}`, { method: "DELETE" });
        showToast("File deleted.", "success");
        loadMediaFiles(panel);
    } catch (error) {
        showToast(error.message || "Unable to delete file.", "error");
    }
}

async function toggleMediaPublic(panel, fileId, isPublic) {
    try {
        await fetchAuth(`/media/${encodeURIComponent(fileId)}/public`, {
            method: "PUT",
            body: JSON.stringify({ is_public: isPublic }),
        });
        showToast(isPublic ? "File is public." : "File is private.", "success");
        loadMediaFiles(panel);
    } catch (error) {
        showToast(error.message || "Unable to update file.", "error");
    }
}

function renderMediaFiles(panel, files) {
    const tbody = panel.querySelector("[data-media-files]");
    if (!tbody) return;

    if (!files.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No files uploaded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = files.map((file) => {
        const fileId = escapeHtml(file.file_id);
        const filename = escapeHtml(file.filename || "Untitled file");
        const description = file.description
            ? `<div class="fs-12 text-muted">${escapeHtml(file.description)}</div>`
            : "";
        const uploadedAt = file.created_at ? formatDate(file.created_at) : "";
        const publicIcon  = file.is_public ? "fa-lock-open" : "fa-lock";
        const publicTitle = file.is_public ? "Make private" : "Make public";

        return `
            <tr>
                <td>
                    <strong>${filename}</strong>
                    <div class="fs-12 text-muted">${escapeHtml(file.mime_type || file.type || "file")}</div>
                    ${description}
                </td>
                <td>${formatFileSize(file.size)}</td>
                <td>${uploadedAt}</td>
                <td>
                    <button class="btn btn-sm btn-outline" type="button"
                        onclick="downloadMediaFile('${fileId}', '${filename}')"
                        title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" type="button"
                        onclick="toggleMediaPublic(this.closest('[data-media-panel]'), '${fileId}', ${!file.is_public})"
                        title="${publicTitle}">
                        <i class="fas ${publicIcon}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" type="button"
                        onclick="deleteMediaFile(this.closest('[data-media-panel]'), '${fileId}')"
                        title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    }).join("");
}

async function loadMediaFiles(panel) {
    const tbody = panel.querySelector("[data-media-files]");
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading files...</td></tr>';
    }

    try {
        const data = await fetchAuth("/media/list");
        renderMediaFiles(panel, data.files || []);
    } catch (error) {
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Unable to load files.</td></tr>';
        }
    }
}

function initMediaPanel(panel) {
    if (!panel || panel.dataset.mediaReady === "true") return;
    panel.dataset.mediaReady = "true";

    const form = panel.querySelector("[data-media-upload-form]");
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);

            setLoading(button, true);
            try {
                const result = await fetchAuth("/media/upload", {
                    method: "POST",
                    body: formData,
                });
                if (result.error) throw new Error(result.error);
                showToast("File uploaded.", "success");
                form.reset();
                loadMediaFiles(panel);
            } catch (error) {
                showToast(error.message || "Unable to upload file.", "error");
            } finally {
                setLoading(button, false);
            }
        });
    }

    loadMediaFiles(panel);
}

function initMediaPanels() {
    document.querySelectorAll("[data-media-panel]").forEach(initMediaPanel);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMediaPanels);
} else {
    initMediaPanels();
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function confirmAction({ title = "Confirm", message = "Are you sure?", confirmText = "Confirm", danger = false } = {}) {
    return new Promise((resolve) => {
        document.getElementById("__confirm-modal")?.remove();

        const overlay = document.createElement("div");
        overlay.id = "__confirm-modal";
        Object.assign(overlay.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,.5)",
            zIndex: "9998", display: "flex", alignItems: "center",
            justifyContent: "center", padding: "20px", backdropFilter: "blur(2px)",
        });

        const btnColor = danger ? "var(--danger,#ef4444)" : "var(--primary,#4f46e5)";
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:32px;max-width:400px;width:100%;
                        box-shadow:0 25px 60px rgba(0,0,0,.25);animation:fadeIn .2s ease">
                <h3 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#0f172a">${escapeHtml(title)}</h3>
                <p style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.6">${escapeHtml(message)}</p>
                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button id="__confirm-cancel"
                        style="padding:9px 20px;border-radius:8px;border:1.5px solid #e2e8f0;
                               background:#fff;color:#475569;font-weight:600;cursor:pointer;font-size:14px">
                        Cancel
                    </button>
                    <button id="__confirm-ok"
                        style="padding:9px 20px;border-radius:8px;border:none;
                               background:${btnColor};color:#fff;font-weight:600;cursor:pointer;font-size:14px">
                        ${escapeHtml(confirmText)}
                    </button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const cleanup = (result) => { overlay.remove(); resolve(result); };
        overlay.querySelector("#__confirm-ok").addEventListener("click",     () => cleanup(true));
        overlay.querySelector("#__confirm-cancel").addEventListener("click",  () => cleanup(false));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
        document.addEventListener("keydown", function handler(e) {
            if (e.key === "Escape") { cleanup(false); document.removeEventListener("keydown", handler); }
        });
    });
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function toggleTheme() {
    const isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("dark_mode", String(isDark));
    showToast(isDark ? "Dark mode on" : "Light mode on", "info", 1500);
}
