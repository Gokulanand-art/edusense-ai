function getAdminState() {
    if (!window.adminState) {
        window.adminState = {
            users: [],
            subjects: [],
            topStudentsByDepartment: [],
            lowPerformers: [],
            departmentAverageScores: [],
            departments: [],
            departmentCatalog: [],
            dataQuality: null,
            operations: null,
            context: null,
            institutions: [],
            userSearch: "",
            subjectSearch: "",
            analyticsSearch: "",
            analyticsDepartment: "All",
            userPage: 1,
            subjectPage: 1,
            pageSize: 5,
            initialized: false,
        };
    }

    return window.adminState;
}

function showAdminMessage(message, type = "success") {
    const card = document.getElementById("adminMessageCard");
    const text = document.getElementById("adminMessageText");

    if (card && text) {
        card.hidden = false;
        card.classList.remove("faculty-message-card--success", "faculty-message-card--error");
        card.classList.add(type === "error" ? "faculty-message-card--error" : "faculty-message-card--success");
        text.innerText = message;
    }

    showToast(message, type);
}

function setAdminLastSync() {
    const now = new Date();
    setText("adminLastSync", now.toLocaleTimeString());
}

function populateAdminAnalyticsDepartments(departments, selectedDepartment) {
    const filter = document.getElementById("adminAnalyticsDepartmentFilter");
    if (!filter) {
        return;
    }

    const uniqueDepartments = Array.from(new Set((departments || []).filter(Boolean))).sort();
    filter.innerHTML = "";

    ["All", ...uniqueDepartments].forEach((department) => {
        const option = document.createElement("option");
        option.value = department;
        option.innerText = department;
        filter.appendChild(option);
    });

    filter.value = ["All", ...uniqueDepartments].includes(selectedDepartment) ? selectedDepartment : "All";
}

function filterAdminUsers() {
    const state = getAdminState();
    const term = state.userSearch.toLowerCase();

    return state.users.filter((user) =>
        [user.name, user.email, user.role]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term))
    );
}

function filterAdminSubjects() {
    const state = getAdminState();
    const term = state.subjectSearch.toLowerCase();

    return state.subjects.filter((subject) =>
        [subject.name, subject.code, subject.department]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term))
    );
}

function filterAdminLowPerformers() {
    const state = getAdminState();
    const term = state.analyticsSearch.toLowerCase();

    return state.lowPerformers.filter((student) => {
        const matchesSearch = !term
            || (student.name || "").toLowerCase().includes(term)
            || (student.roll_number || "").toLowerCase().includes(term);
        const matchesDepartment = state.analyticsDepartment === "All" || student.department === state.analyticsDepartment;
        return matchesSearch && matchesDepartment;
    });
}

function filterAdminTopStudentsByDepartment() {
    const state = getAdminState();
    const term = state.analyticsSearch.toLowerCase();

    return (state.topStudentsByDepartment || [])
        .filter((group) => state.analyticsDepartment === "All" || group.department === state.analyticsDepartment)
        .map((group) => ({
            ...group,
            students: (group.students || []).filter((student) =>
                !term
                || (student.name || "").toLowerCase().includes(term)
                || (student.roll_number || "").toLowerCase().includes(term)
            ),
        }))
        .filter((group) => group.students.length);
}

function paginateItems(items, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * pageSize;

    return {
        items: items.slice(start, start + pageSize),
        page: safePage,
        totalPages,
    };
}

function updatePaginationControls(prefix, page, totalPages, totalItems) {
    setText(prefix + "PageInfo", `Page ${page} of ${totalPages}`);
    setText(prefix + "CountInfo", `${totalItems} total`);

    const prevButton = document.getElementById(prefix + "Prev");
    const nextButton = document.getElementById(prefix + "Next");

    if (prevButton) {
        prevButton.disabled = page <= 1;
    }
    if (nextButton) {
        nextButton.disabled = page >= totalPages;
    }
}

function populateAdminSubjectDepartments(departments) {
    const select = document.getElementById("adminSubjectDepartment");
    if (!select) {
        return;
    }

    const options = (departments || []).map((item) => item.name || item).filter(Boolean);
    select.innerHTML = '<option value="">Select department</option>';

    options.forEach((department) => {
        const option = document.createElement("option");
        option.value = department;
        option.innerText = department;
        select.appendChild(option);
    });
}

function renderAdminDepartmentAverages(items) {
    const state = getAdminState();
    const body = document.getElementById("adminDepartmentAverageTable");
    if (!body) {
        return;
    }

    body.innerHTML = "";

    const filteredItems = state.analyticsDepartment === "All"
        ? (items || [])
        : (items || []).filter((item) => item.department === state.analyticsDepartment);

    if (!Array.isArray(filteredItems) || !filteredItems.length) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="3">No department averages available yet.</td>';
        body.appendChild(row);
        return;
    }

    filteredItems.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.department}</td>
            <td>${formatValue(item.average_score)}</td>
            <td>${formatValue(item.student_count)}</td>
        `;
        body.appendChild(row);
    });
}

function renderAdminTopStudentsByDepartment(groups) {
    const container = document.getElementById("adminTopStudentsByDepartment");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!Array.isArray(groups) || !groups.length) {
        container.innerHTML = '<p class="empty-state">No department toppers available yet.</p>';
        return;
    }

    groups.forEach((group) => {
        const wrapper = document.createElement("div");
        wrapper.className = "profile-row";
        const topStudent = group.students && group.students.length
            ? group.students[0].name
                + " ("
                + (group.students[0].roll_number || "No Roll No.")
                + " | "
                + formatValue(group.students[0].score)
                + ")"
            : "No students";

        wrapper.innerHTML = `
            <span>${group.department}</span>
            <strong>${topStudent}</strong>
        `;
        container.appendChild(wrapper);
    });
}

function renderAdminLowPerformers(users) {
    const list = document.getElementById("adminLowPerformers");
    if (!list) {
        return;
    }

    list.innerHTML = "";

    if (!Array.isArray(users) || !users.length) {
        const li = document.createElement("li");
        li.innerText = "No low performers right now.";
        list.appendChild(li);
        return;
    }

    users.forEach((user) => {
        const li = document.createElement("li");
        li.innerText = `${user.name} (${user.roll_number || "No Roll No."}) - ${user.department} - Score ${formatValue(user.score)}`;
        list.appendChild(li);
    });
}

function renderAdminDepartments() {
    const state = getAdminState();
    const body = document.getElementById("adminDepartmentsTable");
    if (!body) {
        return;
    }

    body.innerHTML = "";
    const departments = state.departmentCatalog || [];
    setText("adminDepartmentsCountInfo", `${departments.length} total`);

    if (!departments.length) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="4">No departments available yet. Add your first department to start structuring the system.</td>';
        body.appendChild(row);
        return;
    }

    departments.forEach((department) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${department.name}</td>
            <td>${formatValue(department.student_count)}</td>
            <td>${formatValue(department.subject_count)}</td>
            <td>
                <div class="faculty-action-group">
                    <button
                        type="button"
                        class="logout-button faculty-table-button"
                        onclick="deleteDepartment(${department.id})"
                    >
                        Delete
                    </button>
                </div>
            </td>
        `;
        body.appendChild(row);
    });
}

function renderAdminUsers() {
    const state = getAdminState();
    const body = document.getElementById("adminUsersTable");
    if (!body) {
        return;
    }

    const filtered = filterAdminUsers();
    const paginated = paginateItems(filtered, state.userPage, state.pageSize);
    state.userPage = paginated.page;

    body.innerHTML = "";

    if (!filtered.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.innerText = "No users found.";
        row.appendChild(cell);
        body.appendChild(row);
        updatePaginationControls("adminUsers", 1, 1, 0);
        return;
    }

    paginated.items.forEach((user) => {
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const emailCell = document.createElement("td");
        const roleCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const actionGroup = document.createElement("div");
        const button = document.createElement("button");

        nameCell.innerText = user.name || "--";
        emailCell.innerText = user.email || "--";
        roleCell.innerText = user.role || "--";

        actionGroup.className = "faculty-action-group";
        button.type = "button";
        button.className = "logout-button faculty-table-button";
        button.innerText = "Delete User";
        button.onclick = () => deleteUser(user.id);
        actionGroup.appendChild(button);
        actionCell.appendChild(actionGroup);

        row.appendChild(nameCell);
        row.appendChild(emailCell);
        row.appendChild(roleCell);
        row.appendChild(actionCell);
        body.appendChild(row);
    });

    updatePaginationControls("adminUsers", paginated.page, paginated.totalPages, filtered.length);
}

function renderAdminSubjects() {
    const state = getAdminState();
    const body = document.getElementById("adminSubjectsTable");
    if (!body) {
        return;
    }

    const filtered = filterAdminSubjects();
    const paginated = paginateItems(filtered, state.subjectPage, state.pageSize);
    state.subjectPage = paginated.page;

    body.innerHTML = "";

    if (!filtered.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.innerText = "No subjects found.";
        row.appendChild(cell);
        body.appendChild(row);
        updatePaginationControls("adminSubjects", 1, 1, 0);
        return;
    }

    paginated.items.forEach((subject) => {
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const codeCell = document.createElement("td");
        const departmentCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const actionGroup = document.createElement("div");
        const button = document.createElement("button");

        nameCell.innerText = subject.name || "--";
        codeCell.innerText = subject.code || "--";
        departmentCell.innerText = subject.department || "--";

        actionGroup.className = "faculty-action-group";
        button.type = "button";
        button.className = "logout-button faculty-table-button";
        button.innerText = "Delete Subject";
        button.onclick = () => deleteSubject(subject.id);
        actionGroup.appendChild(button);
        actionCell.appendChild(actionGroup);

        row.appendChild(nameCell);
        row.appendChild(codeCell);
        row.appendChild(departmentCell);
        row.appendChild(actionCell);
        body.appendChild(row);
    });

    updatePaginationControls("adminSubjects", paginated.page, paginated.totalPages, filtered.length);
}

function renderAdminAnalytics() {
    const state = getAdminState();
    renderAdminDepartmentAverages(state.departmentAverageScores || []);
    renderAdminTopStudentsByDepartment(filterAdminTopStudentsByDepartment());
    renderAdminLowPerformers(filterAdminLowPerformers());
}

function renderAdminDataQuality() {
    const data = getAdminState().dataQuality || {};
    setText("adminDataQualityStatus", data.status || "--");
    setText("adminMissingRollNumbers", formatValue(data.missing_roll_numbers));
    setText("adminMissingDepartments", formatValue(data.missing_departments));
    setText("adminDuplicateRollNumbers", formatValue(data.duplicate_roll_number_groups));
    setText("adminOrphanStudents", formatValue(data.orphan_student_links));
    setText("adminStudentsWithoutActivity", formatValue(data.students_without_activity));
}

function renderAdminOperations() {
    const container = document.getElementById("adminOperationsGrid");
    if (!container) {
        return;
    }

    const operations = getAdminState().operations || {};
    setText("adminOperationsStatus", operations.status || "--");

    const cards = [
        {
            label: "Critical Interventions",
            value: formatValue(operations.critical_interventions),
            note: "Students below 45 readiness score.",
            tone: "danger",
        },
        {
            label: "Support Watchlist",
            value: formatValue(operations.support_watchlist),
            note: "Students between 45 and 60 readiness.",
            tone: "warning",
        },
        {
            label: "Departments Without Subjects",
            value: formatValue(operations.departments_without_subjects),
            note: "Department records that still need subject coverage.",
            tone: "info",
        },
        {
            label: "Subjects Without Marks",
            value: formatValue(operations.subjects_without_marks),
            note: "Subjects not yet receiving marks entries.",
            tone: "warning",
        },
        {
            label: "Subjects Without Attendance",
            value: formatValue(operations.subjects_without_attendance),
            note: "Subjects not yet receiving attendance updates.",
            tone: "warning",
        },
        {
            label: "New Students in 30 Days",
            value: formatValue(operations.new_students_last_30_days),
            note: "Recent onboarding volume across the institution.",
            tone: "success",
        },
        {
            label: "Marks Updates in 7 Days",
            value: formatValue(operations.marks_updates_last_7_days),
            note: "Latest assessment activity recorded by faculty.",
            tone: "success",
        },
        {
            label: "Attendance Updates in 7 Days",
            value: formatValue(operations.attendance_updates_last_7_days),
            note: "Recent classroom attendance activity in the system.",
            tone: "info",
        },
    ];

    container.innerHTML = cards.map((card) => `
        <div class="operations-tile operations-tile--${card.tone}">
            <strong>${card.label}</strong>
            <span class="operations-value">${card.value}</span>
            <small>${card.note}</small>
        </div>
    `).join("");
}

function renderAdminContext() {
    const context = getAdminState().context || {};
    setText("adminInstitutionName", context.name || "--");
    setText("adminInstitutionCode", context.code || "--");
    setText("adminInstitutionPlan", context.plan_name || "--");
    setText("adminInstitutionStatus", context.status || "--");
    setText("adminInstitutionUsers", formatValue(context.total_users));
    setText("adminInstitutionStudents", formatValue(context.total_students));
    setText("adminInstitutionNotices", formatValue(context.total_notices));

    const featureList = document.getElementById("adminInstitutionFeatures");
    if (featureList) {
        const features = context.features || {};
        const enabled = Object.entries(features)
            .filter((entry) => entry[1])
            .map((entry) => entry[0].replaceAll("_", " "));

        featureList.innerHTML = enabled.length
            ? enabled.map((item) => `<li>${item}</li>`).join("")
            : "<li>Standard core workflows</li>";
    }

    const superAdminPanel = document.getElementById("superAdminSection");
    if (superAdminPanel) {
        superAdminPanel.hidden = !(context.viewer && context.viewer.is_super_admin);
    }
}

function renderAdminInstitutions() {
    const body = document.getElementById("adminInstitutionsTable");
    if (!body) {
        return;
    }

    const institutions = getAdminState().institutions || [];
    body.innerHTML = "";

    if (!institutions.length) {
        body.innerHTML = '<tr><td colspan="6">No institutions available yet.</td></tr>';
        return;
    }

    institutions.forEach((institution) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${institution.name}</td>
            <td>${institution.code}</td>
            <td>${institution.plan_name}</td>
            <td>${institution.user_count}</td>
            <td>${institution.student_count}</td>
            <td>${institution.status}</td>
        `;
        body.appendChild(row);
    });
}

function initializeAdminControls() {
    const state = getAdminState();
    if (state.initialized) {
        return;
    }

    const userSearch = document.getElementById("adminUsersSearch");
    const subjectSearch = document.getElementById("adminSubjectsSearch");
    const analyticsSearch = document.getElementById("adminAnalyticsSearch");
    const analyticsDepartment = document.getElementById("adminAnalyticsDepartmentFilter");
    const userPrev = document.getElementById("adminUsersPrev");
    const userNext = document.getElementById("adminUsersNext");
    const subjectPrev = document.getElementById("adminSubjectsPrev");
    const subjectNext = document.getElementById("adminSubjectsNext");

    if (userSearch) {
        userSearch.addEventListener("input", (event) => {
            state.userSearch = event.target.value.trim();
            state.userPage = 1;
            renderAdminUsers();
        });
    }

    if (subjectSearch) {
        subjectSearch.addEventListener("input", (event) => {
            state.subjectSearch = event.target.value.trim();
            state.subjectPage = 1;
            renderAdminSubjects();
        });
    }

    if (analyticsSearch) {
        analyticsSearch.addEventListener("input", (event) => {
            state.analyticsSearch = event.target.value.trim();
            renderAdminAnalytics();
        });
    }

    if (analyticsDepartment) {
        analyticsDepartment.addEventListener("change", (event) => {
            state.analyticsDepartment = event.target.value;
            renderAdminAnalytics();
        });
    }

    if (userPrev) {
        userPrev.addEventListener("click", () => {
            state.userPage -= 1;
            renderAdminUsers();
        });
    }

    if (userNext) {
        userNext.addEventListener("click", () => {
            state.userPage += 1;
            renderAdminUsers();
        });
    }

    if (subjectPrev) {
        subjectPrev.addEventListener("click", () => {
            state.subjectPage -= 1;
            renderAdminSubjects();
        });
    }

    if (subjectNext) {
        subjectNext.addEventListener("click", () => {
            state.subjectPage += 1;
            renderAdminSubjects();
        });
    }

    state.initialized = true;
}

async function loadUsers() {
    const body = document.getElementById("adminUsersTable");
    if (!body) {
        return;
    }

    body.innerHTML = `
        <tr>
            <td colspan="4">Loading users...</td>
        </tr>
    `;

    const state = getAdminState();
    state.users = await fetchJson("/admin/users");
    renderAdminUsers();
    return state.users;
}

async function loadAdminSubjects() {
    const body = document.getElementById("adminSubjectsTable");
    if (!body) {
        return [];
    }

    body.innerHTML = `
        <tr>
            <td colspan="4">Loading subjects...</td>
        </tr>
    `;

    const state = getAdminState();
    state.subjects = await fetchJson("/admin/subjects");
    renderAdminSubjects();
    return state.subjects;
}

async function loadAdminDepartments() {
    const body = document.getElementById("adminDepartmentsTable");
    if (!body) {
        return [];
    }

    body.innerHTML = `
        <tr>
            <td colspan="4">Loading departments...</td>
        </tr>
    `;

    const state = getAdminState();
    state.departmentCatalog = await fetchJson("/admin/departments");
    populateAdminSubjectDepartments(state.departmentCatalog);
    renderAdminDepartments();
    return state.departmentCatalog;
}

async function loadAdminDashboard() {
    if (!requireAuth(["Admin"])) {
        return;
    }

    if (!document.getElementById("adminUsersTable")) {
        return;
    }

    syncTopbarUser();
    initializeAdminControls();

    try {
        const [stats, dataQuality, operations, context] = await Promise.all([
            fetchJson("/admin/stats"),
            fetchJson("/admin/data-quality"),
            fetchJson("/admin/operations"),
            fetchJson("/admin/context"),
            loadUsers(),
            loadAdminDepartments(),
            loadAdminSubjects(),
        ]);
        const state = getAdminState();

        state.topStudentsByDepartment = stats.top_students_by_department || [];
        state.lowPerformers = stats.low_performers || [];
        state.departmentAverageScores = stats.department_average_scores || [];
        state.departments = stats.departments || [];
        state.dataQuality = dataQuality || {};
        state.operations = operations || {};
        state.context = context || {};

        if (context?.viewer?.is_super_admin) {
            state.institutions = await fetchJson("/admin/institutions");
        } else {
            state.institutions = [];
        }

        setText("adminTotalStudents", formatValue(stats.total_students));
        setText("adminTotalFaculty", formatValue(stats.total_faculty));
        setText("adminTotalUsers", formatValue(stats.total_users));
        setText("adminTotalDepartments", formatValue(stats.total_departments));
        populateAdminAnalyticsDepartments(state.departments, state.analyticsDepartment);
        renderAdminAnalytics();
        renderAdminDepartments();
        renderAdminDataQuality();
        renderAdminOperations();
        renderAdminContext();
        renderAdminInstitutions();
        setAdminLastSync();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to load admin dashboard.", "error");
    }
}

async function submitInstitution(event) {
    event.preventDefault();

    try {
        const name = document.getElementById("adminInstitutionFormName")?.value.trim() || "";
        const code = document.getElementById("adminInstitutionFormCode")?.value.trim() || "";
        const subdomain = document.getElementById("adminInstitutionFormSubdomain")?.value.trim() || "";
        const planName = document.getElementById("adminInstitutionFormPlan")?.value.trim() || "starter";

        if (!name || !code) {
            throw new Error("Institution name and code are required.");
        }

        const response = await fetchJson("/admin/institutions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                code,
                subdomain,
                plan_name: planName,
            }),
        });

        showAdminMessage(response.message || "Institution created successfully.");
        event.target.reset();
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to create institution.", "error");
    }
}

async function submitAdminDepartment(event) {
    event.preventDefault();

    try {
        const nameInput = document.getElementById("adminDepartmentName");
        const name = nameInput ? nameInput.value.trim() : "";

        if (!name) {
            throw new Error("Department name is required.");
        }

        const data = await fetchJson("/admin/department", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });

        if (nameInput) {
            nameInput.value = "";
        }

        showAdminMessage(data.message || "Department added successfully.");
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to add department.", "error");
    }
}

async function submitAdminSubject(event) {
    event.preventDefault();

    try {
        const nameInput = document.getElementById("adminSubjectName");
        const codeInput = document.getElementById("adminSubjectCode");
        const departmentInput = document.getElementById("adminSubjectDepartment");
        const name = nameInput ? nameInput.value.trim() : "";
        const code = codeInput ? codeInput.value.trim() : "";
        const department = departmentInput ? departmentInput.value.trim() : "";

        if (!name || !code || !department) {
            throw new Error("Subject name, code, and department are required.");
        }

        const data = await fetchJson("/admin/subject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, code, department }),
        });

        if (nameInput) {
            nameInput.value = "";
        }
        if (codeInput) {
            codeInput.value = "";
        }
        if (departmentInput) {
            departmentInput.value = "";
        }

        showAdminMessage(data.message || "Subject added successfully.");
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to add subject.", "error");
    }
}

async function deleteDepartment(id) {
    const confirmed = await confirmAction({
        title: "Delete Department",
        message: "Delete this department? It can only be removed if no students or subjects are linked to it.",
        confirmText: "Delete Department",
        danger: true,
    });

    if (!confirmed) {
        return;
    }

    try {
        const data = await fetchJson("/admin/department/" + id, {
            method: "DELETE",
        });

        showAdminMessage(data.message || "Department deleted successfully.");
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to delete department.", "error");
    }
}

async function deleteSubject(id) {
    const confirmed = await confirmAction({
        title: "Delete Subject",
        message: "Delete this subject? Related marks and attendance records will also be removed.",
        confirmText: "Delete Subject",
        danger: true,
    });

    if (!confirmed) {
        return;
    }

    try {
        const data = await fetchJson("/admin/subject/" + id, {
            method: "DELETE",
        });

        showAdminMessage(data.message || "Subject deleted successfully.");
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to delete subject.", "error");
    }
}

async function deleteUser(id) {
    const confirmed = await confirmAction({
        title: "Delete User",
        message: "Delete this user account? This action cannot be undone.",
        confirmText: "Delete User",
        danger: true,
    });

    if (!confirmed) {
        return;
    }

    try {
        const data = await fetchJson("/admin/user/" + id, {
            method: "DELETE",
        });

        showAdminMessage(data.message || "User deleted successfully.");
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to delete user.", "error");
    }
}

async function downloadAdminExport(exportName) {
    try {
        // Cookie is sent automatically — no manual auth header needed
        const response = await fetch("/admin/exports/" + encodeURIComponent(exportName), {
            method: "GET",
            credentials: "same-origin",
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || "Unable to download export.");
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get("Content-Disposition") || "";
        const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
        const filename = fileNameMatch ? fileNameMatch[1] : `${exportName}.csv`;
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        showAdminMessage(`Downloaded ${filename}.`);
    } catch (error) {
        console.error(error);
        showAdminMessage(error.message || "Unable to download export.", "error");
    }
}

// ── Placement KPI widget on admin dashboard ──────────────────────────────────
async function loadPlacementKPI() {
    try {
        const res = await fetchAuth("/placement/stats/summary");
        if (!res || !res.success) return;
        const s = res.data;
        const el = document.getElementById("adminPlacementRate");
        const sub = document.getElementById("adminPlacementSub");
        if (el) el.textContent = (s.placement_rate || 0) + "%";
        if (sub) sub.textContent = s.placed_students + " placed · Avg " + (s.avg_package || 0).toFixed(1) + " LPA";
    } catch (_) { /* silent — placement stats are optional */ }
}
