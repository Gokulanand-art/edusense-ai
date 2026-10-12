/* ═══════════════════════════════════════════════════════════════
   student.js  –  All student-portal pages
   Pages: dashboard_student, student_progress, student_skills,
          student_profile, goals, notifications
   Depends on: shared.js (fetchAuth, requireAuth, showToast,
               setText, escapeHtml, formatValue, formatPercent,
               formatDate, timeAgo, setLoading)
═══════════════════════════════════════════════════════════════ */
"use strict";

// ── Shared helper ─────────────────────────────────────────────────────────────

async function getStudentDashboardSnapshot() {
    return fetchAuth("/student/dashboard");
}

function getReadinessColor(score) {
    if (score >= 80) return "var(--success, #10b981)";
    if (score >= 60) return "var(--warning, #f59e0b)";
    return "var(--danger, #ef4444)";
}

function applyKpiColor(node, level) {
    if (!node) return;
    node.style.color = level === "success"
        ? "var(--success)" : level === "warning"
        ? "var(--warning)" : "var(--danger)";
}

// ── Render helpers (used across pages) ───────────────────────────────────────

function renderProfile(profile) {
    if (!profile) return;
    setText("profileName",       profile.name       || "–");
    setText("profileRollNumber", profile.roll_number|| "–");
    setText("profileDepartment", profile.department  || "–");
    setText("profileEmail",      profile.email       || "–");
}

function renderProfileSummary(summary, listId = "placementReasons") {
    const list = document.getElementById(listId);
    if (!list || !summary) return;
    const items = [
        summary.best_subject    && `Best subject: <strong>${escapeHtml(summary.best_subject)}</strong>`,
        summary.weakest_subject && `Needs work: <strong>${escapeHtml(summary.weakest_subject)}</strong>`,
        summary.status          && `Status: <strong>${escapeHtml(summary.status)}</strong>`,
    ].filter(Boolean);
    list.innerHTML = items.length
        ? items.map(i => `<li class="insight-item fs-13">${i}</li>`).join("")
        : '<li class="insight-item text-muted fs-13">No summary data yet.</li>';
}

function renderPlacementReasons(reasons, listId = "placementReasons") {
    const list = document.getElementById(listId);
    if (!list) return;
    if (!reasons || !reasons.length) {
        list.innerHTML = '<li class="insight-item text-muted fs-13">No placement insights yet.</li>';
        return;
    }
    list.innerHTML = reasons.map(r =>
        `<li class="insight-item fs-13"><i class="fas fa-check-circle text-success" style="margin-right:6px"></i>${escapeHtml(r)}</li>`
    ).join("");
}

function renderAlerts(alerts, containerId = "studentAlerts") {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!alerts || !alerts.length) {
        container.innerHTML = "";
        return;
    }
    container.innerHTML = alerts.map(a => {
        const sev = a.severity || "warning";
        const colorMap = { danger: "var(--danger)", warning: "var(--warning)", info: "var(--primary)" };
        return `
        <div class="alert-item" style="padding:12px 16px;border-radius:10px;background:#fff;
             border-left:4px solid ${colorMap[sev]||colorMap.warning};
             box-shadow:var(--shadow-sm);margin-bottom:10px">
            <strong style="color:${colorMap[sev]||colorMap.warning}">${escapeHtml(a.title||"Alert")}</strong>
            <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0">${escapeHtml(a.message||"")}</p>
        </div>`;
    }).join("");
}

function renderInsights(insights, listId = "studentInsights") {
    const list = document.getElementById(listId);
    if (!list) return;
    if (!insights || !insights.length) {
        list.innerHTML = '<li class="insight-item text-muted">No insights yet.</li>';
        return;
    }
    list.innerHTML = insights.map(i =>
        `<li class="insight-item fs-13">
            <i class="fas fa-lightbulb" style="color:var(--warning);margin-right:8px"></i>${escapeHtml(typeof i === "string" ? i : String(i))}
         </li>`
    ).join("");
}

function renderDashboardMetrics(data) {
    setText("attendance",  formatPercent(data.attendance));
    setText("marks",       formatValue(data.marks));
    setText("mockScore",   formatValue(data.mock_score));
    setText("skillsCount", String(data.skills_count || 0));
}

function renderStrengthWeakness(data) {
    setText("strengthLabel",  data.strength  || "–");
    setText("weaknessLabel",  data.weakness  || "–");
}

function renderChart(data, canvasId = "performanceChart") {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    // Destroy existing chart if any
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    new Chart(canvas, {
        type: "radar",
        data: {
            labels: ["Attendance", "Marks", "Mock Tests", "Skills"],
            datasets: [{
                label: "Your Performance",
                data: [
                    data.attendance   || 0,
                    data.marks        || 0,
                    data.mock_score   || 0,
                    data.skills_score || 0,
                ],
                backgroundColor: "rgba(79,70,229,0.15)",
                borderColor:     "rgba(79,70,229,0.8)",
                borderWidth: 2,
                pointBackgroundColor: "#4f46e5",
                pointRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { stepSize: 25, font: { size: 10 } },
                    grid: { color: "rgba(0,0,0,0.06)" },
                    pointLabels: { font: { size: 12, weight: "500" } },
                },
            },
            plugins: { legend: { display: false } },
        },
    });
}

function renderSubjectPerformance(subjects, tableId = "subjectPerformanceTable") {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    if (!subjects || !subjects.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No subject data yet.</td></tr>';
        return;
    }
    tbody.innerHTML = subjects.map(s => {
        const avg = parseFloat(s.average_marks || 0);
        const badge = avg >= 75 ? "badge-success" : avg >= 50 ? "badge-warning" : "badge-danger";
        return `<tr>
            <td><strong>${escapeHtml(s.subject_name || "–")}</strong></td>
            <td>${formatValue(avg)}</td>
            <td><span class="badge ${badge}">${avg >= 75 ? "Good" : avg >= 50 ? "Average" : "At Risk"}</span></td>
        </tr>`;
    }).join("");
}

function renderSubjectPerformanceChart(subjects, canvasId = "subjectChart") {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart || !subjects || !subjects.length) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    new Chart(canvas, {
        type: "bar",
        data: {
            labels: subjects.map(s => s.subject_name || ""),
            datasets: [{
                label: "Avg Marks",
                data: subjects.map(s => parseFloat(s.average_marks || 0)),
                backgroundColor: subjects.map(s =>
                    parseFloat(s.average_marks||0) >= 75 ? "rgba(16,185,129,.7)" :
                    parseFloat(s.average_marks||0) >= 50 ? "rgba(245,158,11,.7)" : "rgba(239,68,68,.7)"
                ),
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            scales: { y: { min: 0, max: 100, ticks: { stepSize: 25 } } },
            plugins: { legend: { display: false } },
        },
    });
}

function renderPlacementBreakdown(breakdown, containerId = "placementBreakdownContainer") {
    const container = document.getElementById(containerId);
    if (!container || !breakdown || !breakdown.components) return;
    container.innerHTML = breakdown.components.map(c => `
        <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px">
                <span class="fw-600">${escapeHtml(c.metric)}</span>
                <span class="${c.status==="Good"?"text-success":"text-danger"}">${formatValue(c.value)}  (${c.weight}% weight)</span>
            </div>
            <div style="background:var(--border-color);border-radius:4px;height:8px;overflow:hidden">
                <div style="height:100%;width:${Math.min(c.value,100)}%;background:${c.status==="Good"?"var(--success)":"var(--danger)"};transition:width .6s ease;border-radius:4px"></div>
            </div>
        </div>`).join("");
}

function renderGrowthTimeline(timeline, canvasId = "growthTimelineChart") {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart || !timeline || !timeline.length) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    new Chart(canvas, {
        type: "line",
        data: {
            labels: timeline.map(t => t.label || t.month || ""),
            datasets: [{
                label: "Marks Trend",
                data: timeline.map(t => parseFloat(t.value || t.marks || 0)),
                borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,.1)",
                borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            scales: { y: { min: 0, max: 100 } },
            plugins: { legend: { display: false } },
        },
    });
}

function renderSubjectTrends(trends, containerId = "subjectTrendsContainer") {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!trends || !trends.length) {
        container.innerHTML = '<p class="text-muted fs-13">No subject trend data available yet. Add marks to see trends.</p>';
        return;
    }
    container.innerHTML = trends.map(t => {
        const trend = parseFloat(t.trend || 0);
        const arrow = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
        const color = trend > 0 ? "var(--success)" : trend < 0 ? "var(--danger)" : "var(--text-muted)";
        return `<div class="insight-item fs-13" style="display:flex;justify-content:space-between">
            <span>${escapeHtml(t.subject_name || "")}</span>
            <span style="color:${color};font-weight:600">${arrow} ${Math.abs(trend).toFixed(1)}</span>
        </div>`;
    }).join("");
}

function highlightProgressMetrics(data) {
    const fields = [
        { id: "attendance",   val: data.attendance,   thresholds: [75, 60] },
        { id: "marks",        val: data.marks,         thresholds: [75, 60] },
        { id: "mock",         val: data.mock_score,    thresholds: [70, 50] },
        { id: "skills",       val: data.skills_score,  thresholds: [60, 40] },
    ];
    fields.forEach(({ id, val, thresholds }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const v = parseFloat(val || 0);
        el.style.color = v >= thresholds[0] ? "var(--success)" : v >= thresholds[1] ? "var(--warning)" : "var(--danger)";
    });
}

function normalizeSkillsResponse(response) {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray(response.skills)) return response.skills;
    if (response && Array.isArray(response.data)) return response.data;
    return [];
}

function ensureSkillsLayout() {
    // no-op: layout is already in the template; kept for backward compat
}

// ── Weekly summary / Action plan / Goal snapshot / Notifications ──────────────

function renderWeeklySummary(summary) {
    if (!summary) return;
    setText("weeklyPrimaryFocus",         summary.primary_focus       || "–");
    setText("weeklyUnreadNotifications",  formatValue(summary.unread_notifications || 0));
    setText("weeklyActiveGoals",          formatValue(summary.active_goals || 0));
    setText("weeklyGoalCompletion",       formatValue(summary.goal_completion_rate || 0) + "%");
    setText("weeklyHeadline",             summary.headline || "Your weekly summary is ready.");
}

function renderActionPlan(actions) {
    const list = document.getElementById("studentActionPlan");
    if (!list) return;
    if (!Array.isArray(actions) || !actions.length) {
        list.innerHTML = '<li class="insight-item text-muted fs-13">No action items right now. Keep your current routine steady.</li>';
        return;
    }
    const colourMap = { high: "var(--danger)", medium: "var(--warning)", low: "var(--success)" };
    list.innerHTML = actions.map(a => `
        <li class="insight-item">
            <div style="flex:1">
                <strong class="fw-600">${escapeHtml(a.title || "Next Step")}</strong>
                <p class="fs-13" style="color:var(--text-secondary);margin:3px 0 0">${escapeHtml(a.message || "")}</p>
            </div>
            <span class="badge" style="background:${colourMap[a.priority]||colourMap.medium}22;color:${colourMap[a.priority]||colourMap.medium}">
                ${escapeHtml(a.priority || "medium")}
            </span>
        </li>`).join("");
}

function renderGoalSnapshot(goalSummary, dueGoals) {
    setText("goalSummaryActive",    formatValue(goalSummary?.active    || 0));
    setText("goalSummaryCompleted", formatValue(goalSummary?.completed || 0));
    setText("goalSummaryDueSoon",   formatValue((dueGoals || []).length));
    const list = document.getElementById("dueGoalsList");
    if (!list) return;
    if (!Array.isArray(dueGoals) || !dueGoals.length) {
        list.innerHTML = '<li class="insight-item text-muted fs-13">No upcoming goal deadlines.</li>';
        return;
    }
    list.innerHTML = dueGoals.map(g => `
        <li class="insight-item">
            <strong class="fw-600">${escapeHtml(g.title || "Goal")}</strong>
            <p class="fs-13 text-muted">Due ${escapeHtml(g.target_date || "No date")} · ${formatValue(g.progress_pct || 0)}% done</p>
        </li>`).join("");
}

function renderNotificationSummary(summary) {
    setText("notificationDigestStatus",    summary?.digest_enabled ? "Enabled" : "Disabled");
    setText("notificationDigestFrequency", summary?.digest_frequency || "–");
    setText("notificationUnreadCount",     formatValue(summary?.unread_count || 0));
}

function renderLeaderboard(students) {
    const list = document.getElementById("topStudents");
    if (!list) return;
    if (!Array.isArray(students) || !students.length) {
        list.innerHTML = '<li class="insight-item text-muted fs-13">No leaderboard data yet.</li>';
        return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    list.innerHTML = students.map((s, i) => `
        <li class="insight-item" style="display:flex;justify-content:space-between;align-items:center">
            <span>${medals[i] || `#${i+1}`} ${escapeHtml(s.name || "Student")}</span>
            <span class="badge badge-primary">${formatValue(s.final_score || 0)}</span>
        </li>`).join("");
}

// ── Page: Dashboard ───────────────────────────────────────────────────────────

async function loadDashboard() {
    if (!requireAuth(["Student"])) return;

    try {
        const data = await getStudentDashboardSnapshot();
        const score = Number(data.readiness_score || 0);

        // KPI cards
        setText("readinessScore", formatPercent(score));
        setText("placement",      data.placement_status || "Not Available");

        const progressFill = document.getElementById("progressFill");
        if (progressFill) {
            progressFill.style.width      = score + "%";
            progressFill.style.background = getReadinessColor(score);
        }

        const statusNode = document.getElementById("status");
        if (statusNode) {
            statusNode.textContent = data.status || "–";
            applyKpiColor(statusNode, score >= 80 ? "success" : score >= 60 ? "warning" : "danger");
        }

        const riskNode = document.getElementById("risk");
        if (riskNode) {
            riskNode.textContent = data.risk_level || "–";
            applyKpiColor(riskNode,
                data.risk_level === "Safe"    ? "success" :
                data.risk_level === "Warning" ? "warning" : "danger"
            );
        }

        renderDashboardMetrics(data);
        renderProfile(data.profile);
        renderPlacementReasons(data.placement_reasons || []);
        renderAlerts(data.alerts || []);
        renderInsights(data.insights || []);
        renderStrengthWeakness(data);
        renderWeeklySummary(data.weekly_summary);
        renderActionPlan(data.action_plan || []);
        renderGoalSnapshot(data.goal_summary || {}, data.due_goals || []);
        renderNotificationSummary(data.notification_summary || {});
        renderChart(data);
        renderSubjectPerformance(data.subject_performance || []);
        renderLeaderboard(data.top_students || []);

        if (data.placement_breakdown)
            renderPlacementBreakdown(data.placement_breakdown);
        if (data.marks_timeline && data.marks_timeline.length)
            renderGrowthTimeline(data.marks_timeline);
        renderSubjectTrends(data.subject_trends || []);

    } catch (err) {
        showToast(err.message || "Unable to load dashboard.", "error");
    }
}

// ── Page: Progress ────────────────────────────────────────────────────────────

async function loadProgress() {
    if (!requireAuth(["Student"])) return;

    try {
        const data = await getStudentDashboardSnapshot();
        setText("attendance", formatPercent(data.attendance));
        setText("marks",      formatValue(data.marks));
        setText("mock",       formatValue(data.mock_score));
        setText("skills",     formatValue(data.skills_score));
        highlightProgressMetrics(data);
        renderChart(data);
        renderSubjectPerformance(data.subject_performance || []);
        renderSubjectPerformanceChart(data.subject_performance || []);
        if (data.marks_timeline && data.marks_timeline.length)
            renderGrowthTimeline(data.marks_timeline);
    } catch (err) {
        showToast(err.message || "Unable to load progress.", "error");
    }
}

// ── Page: Skills ──────────────────────────────────────────────────────────────

async function loadSkills() {
    if (!requireAuth(["Student"])) return;

    try {
        const raw  = await fetchAuth("/student/skills");
        const data = normalizeSkillsResponse(raw);
        const list = document.getElementById("skillsList");
        const empty = document.getElementById("skillsEmptyState");
        const msg   = document.getElementById("skillsSummaryMessage");

        setText("skillsCount", data.length + (data.length === 1 ? " skill" : " skills"));

        if (!list) return;

        if (!data.length) {
            list.innerHTML = "";
            if (empty) empty.hidden = false;
            if (msg)   msg.textContent = "No skills added yet. Start by adding your first skill.";
            return;
        }

        if (empty) empty.hidden = true;
        if (msg)   msg.textContent = "Your skills are strengthening your student profile.";

        list.innerHTML = data.map(skill => {
            const level = (skill.skill_level || "Intermediate").toLowerCase();
            return `<li class="skill-chip skill-chip--${level}">
                <span>${escapeHtml(skill.skill_name || skill.name || "")}</span>
                <small>${escapeHtml(skill.skill_level || "Intermediate")}</small>
            </li>`;
        }).join("");
    } catch (err) {
        showToast(err.message || "Unable to load skills.", "error");
    }
}

async function addSkill() {
    const input      = document.getElementById("skillInput");
    const levelInput = document.getElementById("skillLevel");
    const skill      = (input ? input.value : "").trim();
    const level      = levelInput ? levelInput.value : "Intermediate";

    if (!skill) { showToast("Enter a skill before adding.", "error"); return; }

    const addBtn = document.getElementById("addSkillBtn");
    setLoading(addBtn, true);
    try {
        const data = await fetchAuth("/student/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skill_name: skill, skill_level: level }),
        });
        if (input) input.value = "";
        if (levelInput) levelInput.value = "Intermediate";
        showToast(data.message || "Skill saved successfully.", "success");
        loadSkills();
    } catch (err) {
        showToast(err.message || "Unable to add skill.", "error");
    } finally {
        setLoading(addBtn, false);
    }
}

// ── Page: Profile ─────────────────────────────────────────────────────────────

async function loadProfile() {
    if (!requireAuth(["Student"])) return;

    try {
        const data = await getStudentDashboardSnapshot();
        renderProfile(data.profile);
        renderProfileSummary(data.profile_summary, "profileSummaryList");
        renderAlerts(data.alerts || [], "profileAlerts");
        renderSubjectPerformance(data.subject_performance || [], "profileSubjectPerformanceTable");
        renderPlacementReasons(data.placement_reasons || [], "profilePlacementReasons");
        setText("profileReadiness", formatPercent(data.readiness_score || 0));
        setText("profileStatus",    data.status          || "–");
        setText("profileRisk",      data.risk_level      || "–");
        setText("profilePlacement", data.placement_status|| "–");
    } catch (err) {
        showToast(err.message || "Unable to load profile.", "error");
    }
}

// ── Page: Leaderboard ─────────────────────────────────────────────────────────

async function loadLeaderboard() {
    try {
        const data = await fetchAuth("/top-students");
        renderLeaderboard(Array.isArray(data) ? data : (data.students || []));
    } catch (err) {
        showToast(err.message || "Unable to load leaderboard.", "error");
    }
}
