function getFacultyState() {
    if (!window.facultyState) {
        window.facultyState = {
            students: [],
            subjects: [],
            selectedStudentId: null,
            search: "",
            department: "All",
            classroomSubjectId: "",
            classroomDepartment: "All",
            classroomSearch: "",
            classroomRoster: [],
            classroomSummary: null,
            classroomSubject: null,
            interventionSummary: null,
            interventionWatchlist: [],
        };
    }

    return window.facultyState;
}

function focusFacultySection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function setFacultyActionState(text) {
    setText("facultyActionState", text || "Waiting");
}

function showFacultyMessage(message, type = "success") {
    const card = document.getElementById("facultyMessageCard");
    const text = document.getElementById("facultyMessageText");

    if (card && text) {
        card.hidden = false;
        card.classList.remove("faculty-message-card--success", "faculty-message-card--error");
        card.classList.add(type === "error" ? "faculty-message-card--error" : "faculty-message-card--success");
        text.innerText = message;
    }

    setFacultyActionState(type === "error" ? "Failed" : "Saved");
    showToast(message, type);
}

function populateFacultySubjectOptions(subjects) {
    ["attendanceSubject", "marksSubject", "facultyClassSubjectFilter"].forEach((selectId) => {
        const select = document.getElementById(selectId);
        if (!select) {
            return;
        }

        select.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.innerText = subjects.length ? "Select Subject" : "No Subjects Available";
        select.appendChild(placeholder);

        subjects.forEach((subject) => {
            const option = document.createElement("option");
            option.value = subject.id;
            option.innerText = subject.name + " (" + subject.code + ")";
            select.appendChild(option);
        });
    });
}

function populateFacultyDepartmentFilter(departments, selectedDepartment) {
    const filter = document.getElementById("facultyDepartmentFilter");
    if (!filter) {
        return;
    }

    const values = Array.from(new Set((departments || []).filter(Boolean))).sort();
    filter.innerHTML = "";

    ["All", ...values].forEach((department) => {
        const option = document.createElement("option");
        option.value = department;
        option.innerText = department;
        filter.appendChild(option);
    });

    filter.value = selectedDepartment && ["All", ...values].includes(selectedDepartment) ? selectedDepartment : "All";
}

function populateFacultyClassDepartmentFilter(departments, selectedDepartment) {
    const filter = document.getElementById("facultyClassDepartmentFilter");
    if (!filter) {
        return;
    }

    const values = Array.from(new Set((departments || []).filter(Boolean))).sort();
    filter.innerHTML = "";

    ["All", ...values].forEach((department) => {
        const option = document.createElement("option");
        option.value = department;
        option.innerText = department;
        filter.appendChild(option);
    });

    filter.value = selectedDepartment && ["All", ...values].includes(selectedDepartment) ? selectedDepartment : "All";
}

function setFacultyStudentSelection(student) {
    const state = getFacultyState();
    state.selectedStudentId = student ? student.student_id : null;

    const detailLabel = student
        ? [student.roll_number || "No Roll No.", student.department || "No Department"].join(" | ")
        : "None";
    const label = student ? student.name + " (" + detailLabel + ")" : "None";
    setText("facultySelectedStudent", label);

    const mappings = [
        ["attendanceStudent", "attendanceStudentId"],
        ["marksStudent", "marksStudentId"],
        ["mockStudent", "mockStudentId"],
    ];

    mappings.forEach(([nameId, hiddenId]) => {
        const input = document.getElementById(nameId);
        const hidden = document.getElementById(hiddenId);

        if (input) {
            input.value = student ? student.name + " - " + (student.roll_number || student.email) : "";
        }

        if (hidden) {
            hidden.value = student ? student.student_id : "";
        }
    });

    if (!student) {
        renderFacultyInterventions([]);
    }
}

function renderFacultyStudents(students) {
    const body = document.getElementById("facultyStudentsTable");
    if (!body) {
        return;
    }

    body.innerHTML = "";

    if (!students.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.innerText = "No students found.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    students.forEach((student) => {
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const rollNumberCell = document.createElement("td");
        const emailCell = document.createElement("td");
        const departmentCell = document.createElement("td");
        const statusCell = document.createElement("td");
        const actionCell = document.createElement("td");
        const actionGroup = document.createElement("div");

        nameCell.innerText = student.name || "--";
        rollNumberCell.innerText = student.roll_number || "--";
        emailCell.innerText = student.email || "--";
        departmentCell.innerText = student.department || "--";
        statusCell.innerText = student.status || "--";

        actionGroup.className = "faculty-action-group";

        [
            ["Support Case", "interventionSection"],
            ["Manage Attendance", "attendanceSection"],
            ["Manage Marks", "marksSection"],
            ["Manage Mock Tests", "mockSection"],
        ].forEach(([label, sectionId]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "primary-button faculty-table-button";
            button.innerText = label;
            button.onclick = () => selectFacultyStudent(student.student_id, sectionId);
            actionGroup.appendChild(button);
        });

        actionCell.appendChild(actionGroup);
        row.appendChild(nameCell);
        row.appendChild(rollNumberCell);
        row.appendChild(emailCell);
        row.appendChild(departmentCell);
        row.appendChild(statusCell);
        row.appendChild(actionCell);
        body.appendChild(row);
    });
}

function renderFacultyRiskStudents(students) {
    const body = document.getElementById("facultyRiskTable");
    if (!body) {
        return;
    }

    body.innerHTML = "";

    if (!Array.isArray(students) || !students.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.innerText = "No at-risk students for the current filter.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    students.forEach((student) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${student.name || "--"}</td>
            <td>${student.roll_number || "--"}</td>
            <td>${student.department || "--"}</td>
            <td>${formatValue(student.marks)}</td>
            <td>${student.status || "--"}</td>
            <td>${formatValue(student.open_case_count || 0)}</td>
            <td>
                <button
                    type="button"
                    class="primary-button faculty-table-button"
                    onclick="selectFacultyStudent(${student.student_id}, 'interventionSection')"
                >
                    Support
                </button>
            </td>
        `;
        body.appendChild(row);
    });
}

function renderFacultyInterventionHub() {
    const state = getFacultyState();
    const summary = state.interventionSummary || {};
    const body = document.getElementById("facultyInterventionWatchlistTable");

    setText("facultyInterventionFocusStudents", formatValue(summary.focus_students || 0));
    setText("facultyInterventionOpenCases", formatValue(summary.open_cases || 0));
    setText("facultyInterventionOverdueCases", formatValue(summary.overdue_cases || 0));
    setText("facultyInterventionDueThisWeek", formatValue(summary.due_this_week || 0));
    setText("facultyInterventionStudentsWithoutCase", formatValue(summary.students_without_case || 0));

    if (!body) {
        return;
    }

    body.innerHTML = "";

    if (!Array.isArray(state.interventionWatchlist) || !state.interventionWatchlist.length) {
        body.innerHTML = '<tr><td colspan="7" class="text-center">No support watchlist items for the current filter.</td></tr>';
        return;
    }

    state.interventionWatchlist.forEach((student) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${student.name || "--"}<br><small>${student.roll_number || "--"}</small></td>
            <td>${student.department || "--"}</td>
            <td>${student.recommended_focus || "--"}</td>
            <td>${formatValue(student.open_case_count || 0)}</td>
            <td>${(student.latest_status || "no_case").replaceAll("_", " ")}</td>
            <td>${student.due_date || "--"}</td>
            <td>
                <button
                    type="button"
                    class="primary-button faculty-table-button"
                    onclick="selectFacultyStudent(${student.student_id}, 'interventionSection')"
                >
                    Open Support
                </button>
            </td>
        `;
        body.appendChild(row);
    });
}

function renderFacultyClassroom() {
    const state = getFacultyState();
    const body = document.getElementById("facultyClassRosterTable");
    if (!body) {
        return;
    }

    const subject = state.classroomSubject;
    const summary = state.classroomSummary || {};

    setText("facultyClassSubjectName", subject ? `${subject.name} (${subject.code})` : "--");
    setText("facultyClassRosterCount", formatValue(state.classroomRoster.length));
    setText("facultyClassAverageAttendance", formatValue(summary.average_attendance || 0));
    setText("facultyClassAverageMarks", formatValue(summary.average_marks || 0));

    body.innerHTML = "";

    if (!state.classroomSubjectId) {
        body.innerHTML = '<tr><td colspan="8" class="text-center">Select a subject to load the classroom roster.</td></tr>';
        return;
    }

    if (!state.classroomRoster.length) {
        body.innerHTML = '<tr><td colspan="8" class="text-center">No students found for the selected classroom filter.</td></tr>';
        return;
    }

    state.classroomRoster.forEach((student) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${student.name || "--"}</td>
            <td>${student.roll_number || "--"}</td>
            <td>
                <input
                    class="form-control faculty-batch-input faculty-class-attendance"
                    type="number"
                    min="0"
                    max="100"
                    value="${student.attendance_percentage ?? ""}"
                    data-student-id="${student.student_id}"
                    aria-label="Attendance for ${student.name}"
                >
            </td>
            <td>
                <input
                    class="form-control faculty-batch-input faculty-class-marks"
                    type="number"
                    min="0"
                    max="100"
                    value="${student.latest_marks ?? ""}"
                    data-student-id="${student.student_id}"
                    aria-label="Marks for ${student.name}"
                >
            </td>
            <td>${student.latest_exam_type || "--"}</td>
            <td>${formatValue(student.readiness_score || 0)}</td>
            <td>${student.risk_status || "--"}</td>
            <td>
                <button
                    type="button"
                    class="primary-button faculty-table-button"
                    onclick="selectFacultyStudent(${student.student_id}, 'marksSection')"
                >
                    Open
                </button>
            </td>
        `;
        body.appendChild(row);
    });
}

function renderFacultyDetailSummary(detail) {
    const list = document.getElementById("facultyDetailSummary");
    if (!list) {
        return;
    }

    list.innerHTML = "";

    [
        "Attendance: " + formatPercent(detail.overview?.attendance),
        "Average Marks: " + formatValue(detail.overview?.marks),
        "Mock Score: " + formatValue(detail.overview?.mock_score),
        "Status: " + (detail.overview?.status || "--"),
        "Risk: " + (detail.overview?.risk_level || "--"),
    ].forEach((text) => {
        const li = document.createElement("li");
        li.innerText = text;
        list.appendChild(li);
    });
}

function renderFacultyInterventions(items) {
    const container = document.getElementById("facultyInterventionHistory");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
        container.innerHTML = '<div class="intervention-empty">No support cases logged for this student yet.</div>';
        return;
    }

    items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "intervention-card";

        const statusButtons = [];
        if (item.status !== "in_progress") {
            statusButtons.push(`
                <button
                    type="button"
                    class="toggle-button faculty-table-button"
                    onclick="updateFacultyInterventionStatus(${item.id}, 'in_progress')"
                >
                    Mark In Progress
                </button>
            `);
        }
        if (item.status !== "closed") {
            statusButtons.push(`
                <button
                    type="button"
                    class="primary-button faculty-table-button"
                    onclick="updateFacultyInterventionStatus(${item.id}, 'closed')"
                >
                    Mark Closed
                </button>
            `);
        }

        card.innerHTML = `
            <div class="intervention-card__header">
                <div>
                    <strong>${(item.intervention_type || "academic").replaceAll("_", " ")}</strong>
                    <span class="intervention-chip intervention-chip--${item.priority || "medium"}">${item.priority || "medium"}</span>
                    <span class="intervention-chip intervention-chip--status">${(item.status || "open").replaceAll("_", " ")}</span>
                </div>
                <small>${item.created_at ? new Date(item.created_at).toLocaleString() : "--"}</small>
            </div>
            <p>${item.summary || ""}</p>
            <p><strong>Action plan:</strong> ${item.action_plan || "No action plan recorded."}</p>
            <div class="intervention-card__meta">
                <span>Faculty: ${item.faculty_name || "Faculty"}</span>
                <span>Due: ${item.due_date || "--"}</span>
                <span>${item.notified_student ? "Student notified" : "Student not notified"}</span>
            </div>
            <div class="faculty-action-group">${statusButtons.join("")}</div>
        `;
        container.appendChild(card);
    });
}

function renderFacultyDetailList(items, listId, formatter, emptyText) {
    const list = document.getElementById(listId);
    if (!list) {
        return;
    }

    list.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
        const li = document.createElement("li");
        li.innerText = emptyText;
        list.appendChild(li);
        return;
    }

    items.forEach((item) => {
        const li = document.createElement("li");
        li.innerText = formatter(item);
        list.appendChild(li);
    });
}

async function loadFacultyStudentDetail(studentId) {
    try {
        const detail = await fetchJson("/faculty/student/" + studentId);
        const profile = detail.profile || {};

        setText("facultyDetailName", profile.name || "--");
        setText("facultyDetailEmail", profile.email || "--");
        setText("facultyDetailRollNumber", profile.roll_number || "--");
        setText("facultyDetailDepartment", profile.department || "--");
        setText("facultyDetailReadiness", formatPercent(detail.overview?.readiness_score || 0));
        setText("facultyDetailStatus", detail.overview?.status || "Loaded");

        renderFacultyDetailSummary(detail);
        renderSubjectPerformance(detail.subject_performance || [], "facultyDetailMarksTable");
        renderFacultyDetailList(
            detail.attendance_history || [],
            "facultyDetailAttendanceList",
            (item) => `${item.subject} - ${item.status} - ${item.date}`,
            "No attendance records available."
        );
        renderFacultyDetailList(
            detail.mock_scores || [],
            "facultyDetailMockList",
            (item) => `${item.test_name}: ${formatValue(item.score)} (${item.date || "No date"})`,
            "No mock scores available."
        );
        renderFacultyInterventions(detail.interventions || []);
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to load student detail.", "error");
    }
}

function selectFacultyStudent(studentId, sectionId) {
    const state = getFacultyState();
    const student = state.students.find((item) => Number(item.student_id) === Number(studentId));

    if (!student) {
        return;
    }

    setFacultyStudentSelection(student);
    setFacultyActionState("Student Selected");
    loadFacultyStudentDetail(student.student_id);

    if (sectionId) {
        focusFacultySection(sectionId);
    }
}

function initializeFacultyControls() {
    const state = getFacultyState();
    const searchInput = document.getElementById("facultySearch");
    const departmentFilter = document.getElementById("facultyDepartmentFilter");
    const classSearchInput = document.getElementById("facultyClassSearch");
    const classDepartmentFilter = document.getElementById("facultyClassDepartmentFilter");
    const classSubjectFilter = document.getElementById("facultyClassSubjectFilter");

    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener("input", (event) => {
            state.search = event.target.value.trim();
            loadFacultyDashboard();
        });
        searchInput.dataset.bound = "true";
    }

    if (departmentFilter && !departmentFilter.dataset.bound) {
        departmentFilter.addEventListener("change", (event) => {
            state.department = event.target.value;
            loadFacultyDashboard();
        });
        departmentFilter.dataset.bound = "true";
    }

    if (classSearchInput && !classSearchInput.dataset.bound) {
        classSearchInput.addEventListener("input", (event) => {
            state.classroomSearch = event.target.value.trim();
            loadFacultyClassroom();
        });
        classSearchInput.dataset.bound = "true";
    }

    if (classDepartmentFilter && !classDepartmentFilter.dataset.bound) {
        classDepartmentFilter.addEventListener("change", (event) => {
            state.classroomDepartment = event.target.value;
            loadFacultyClassroom();
        });
        classDepartmentFilter.dataset.bound = "true";
    }

    if (classSubjectFilter && !classSubjectFilter.dataset.bound) {
        classSubjectFilter.addEventListener("change", (event) => {
            state.classroomSubjectId = event.target.value;
            const selectedSubject = state.subjects.find(
                (subject) => String(subject.id) === String(state.classroomSubjectId)
            );

            if (selectedSubject) {
                state.classroomDepartment = selectedSubject.department || "All";
            }

            populateFacultyClassDepartmentFilter(
                (state.students || []).map((student) => student.department),
                state.classroomDepartment
            );
            loadFacultyClassroom();
        });
        classSubjectFilter.dataset.bound = "true";
    }
}

async function loadFacultyClassroom() {
    const state = getFacultyState();

    if (!state.classroomSubjectId) {
        state.classroomRoster = [];
        state.classroomSummary = null;
        state.classroomSubject = null;
        renderFacultyClassroom();
        return;
    }

    try {
        const params = new URLSearchParams({ subject_id: state.classroomSubjectId });

        if (state.classroomDepartment && state.classroomDepartment !== "All") {
            params.set("department", state.classroomDepartment);
        }

        if (state.classroomSearch) {
            params.set("search", state.classroomSearch);
        }

        const classroom = await fetchJson("/faculty/classroom?" + params.toString());
        state.classroomRoster = classroom.roster || [];
        state.classroomSummary = classroom.summary || {};
        state.classroomSubject = classroom.subject || null;

        if (classroom.department) {
            state.classroomDepartment = classroom.department;
            populateFacultyClassDepartmentFilter(
                (state.students || []).map((student) => student.department),
                state.classroomDepartment
            );
        }

        renderFacultyClassroom();
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to load classroom roster.", "error");
    }
}

async function loadFacultyDashboard() {
    if (!requireAuth(["Faculty"])) {
        return;
    }

    if (!document.getElementById("facultyStudentsTable")) {
        return;
    }

    syncTopbarUser();
    initializeFacultyControls();

    try {
        const state = getFacultyState();
        const params = new URLSearchParams();

        if (state.search) {
            params.set("search", state.search);
        }
        if (state.department && state.department !== "All") {
            params.set("department", state.department);
        }

        const suffix = params.toString() ? "?" + params.toString() : "";

        const [students, subjects, summaryData] = await Promise.all([
            fetchJson("/faculty/dashboard" + suffix),
            fetchJson("/subjects"),
            fetchJson("/faculty/summary" + suffix),
        ]);

        state.students = Array.isArray(students) ? students : [];
        state.subjects = Array.isArray(subjects) ? subjects : [];

        setText("facultyStudentCount", formatValue(summaryData.summary?.total_students || state.students.length));
        setText("facultyAverageMarks", formatValue(summaryData.summary?.average_marks || 0));
        setText("facultyAtRiskCount", formatValue(summaryData.summary?.at_risk_count || 0));
        setText("facultySubjectCount", state.subjects.length);
        setText("facultyOpenCaseCount", formatValue(summaryData.intervention_summary?.open_cases || 0));

        populateFacultyDepartmentFilter(summaryData.summary?.departments || [], state.department);
        populateFacultyClassDepartmentFilter(summaryData.summary?.departments || [], state.classroomDepartment);
        populateFacultySubjectOptions(state.subjects);
        state.interventionSummary = summaryData.intervention_summary || {};
        state.interventionWatchlist = summaryData.intervention_watchlist || [];
        const classSubjectFilter = document.getElementById("facultyClassSubjectFilter");
        if (classSubjectFilter && state.classroomSubjectId) {
            classSubjectFilter.value = state.classroomSubjectId;
        }
        renderFacultyStudents(state.students);
        renderFacultyRiskStudents(summaryData.at_risk_students || []);
        renderFacultyInterventionHub();

        const selected = state.students.find(
            (student) => Number(student.student_id) === Number(state.selectedStudentId)
        );

        if (selected) {
            setFacultyStudentSelection(selected);
            loadFacultyStudentDetail(selected.student_id);
        } else if (state.students.length) {
            setFacultyStudentSelection(state.students[0]);
            loadFacultyStudentDetail(state.students[0].student_id);
        } else {
            setFacultyStudentSelection(null);
        }

        if (!state.classroomSubjectId && state.subjects.length) {
            state.classroomSubjectId = String(state.subjects[0].id);
            state.classroomDepartment = state.subjects[0].department || "All";

            if (classSubjectFilter) {
                classSubjectFilter.value = state.classroomSubjectId;
            }
        }

        await loadFacultyClassroom();

        setFacultyActionState("Ready");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to load faculty dashboard.", "error");
    }
}

function getSelectedFacultyStudentId(hiddenInputId) {
    const value = document.getElementById(hiddenInputId)?.value;

    if (!value) {
        throw new Error("Select a student from the table first.");
    }

    return Number(value);
}

async function submitAttendance(event) {
    event.preventDefault();

    try {
        const studentId = getSelectedFacultyStudentId("attendanceStudentId");
        const subjectId = Number(document.getElementById("attendanceSubject")?.value || 0);
        const attendancePercentage = Number(document.getElementById("attendancePercentage")?.value || "");

        if (!subjectId) {
            throw new Error("Select a subject for attendance.");
        }

        if (Number.isNaN(attendancePercentage) || attendancePercentage < 0 || attendancePercentage > 100) {
            throw new Error("Enter attendance percentage between 0 and 100.");
        }

        const data = await fetchJson("/faculty/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                student_id: studentId,
                subject_id: subjectId,
                attendance_percentage: attendancePercentage,
            }),
        });

        document.getElementById("attendancePercentage").value = "";
        await loadFacultyDashboard();
        showFacultyMessage(data.message || "Attendance saved successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to save attendance.", "error");
    }
}

async function submitMarks(event) {
    event.preventDefault();

    try {
        const studentId = getSelectedFacultyStudentId("marksStudentId");
        const subjectId = Number(document.getElementById("marksSubject")?.value || 0);
        const marks = Number(document.getElementById("marksValue")?.value || "");
        const examTypeInput = document.getElementById("marksExamType");
        const examType = examTypeInput && examTypeInput.value.trim() ? examTypeInput.value.trim() : null;

        if (!subjectId) {
            throw new Error("Select a subject for marks.");
        }

        if (Number.isNaN(marks) || marks < 0 || marks > 100) {
            throw new Error("Enter marks between 0 and 100.");
        }

        const data = await fetchJson("/marks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                student_id: studentId,
                subject_id: subjectId,
                marks,
                exam_type: examType,
            }),
        });

        document.getElementById("marksValue").value = "";
        if (examTypeInput) {
            examTypeInput.value = "";
        }
        await loadFacultyDashboard();
        showFacultyMessage(data.message || "Marks saved successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to save marks.", "error");
    }
}

async function submitMockTest(event) {
    event.preventDefault();

    try {
        const studentId = getSelectedFacultyStudentId("mockStudentId");
        const testNameInput = document.getElementById("mockTestName");
        const scoreInput = document.getElementById("mockScore");
        const testName = testNameInput ? testNameInput.value.trim() : "";
        const score = Number(scoreInput?.value || "");

        if (!testName) {
            throw new Error("Enter a mock test name.");
        }

        if (Number.isNaN(score) || score < 0 || score > 100) {
            throw new Error("Enter a mock score between 0 and 100.");
        }

        const data = await fetchJson("/mock-tests", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                student_id: studentId,
                test_name: testName,
                score,
            }),
        });

        if (testNameInput) {
            testNameInput.value = "";
        }
        if (scoreInput) {
            scoreInput.value = "";
        }
        await loadFacultyDashboard();
        showFacultyMessage(data.message || "Mock test saved successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to save mock test.", "error");
    }
}

function collectFacultyBatchEntries(selector, valueKey) {
    return Array.from(document.querySelectorAll(selector))
        .map((input) => ({
            student_id: Number(input.dataset.studentId),
            [valueKey]: input.value.trim(),
        }))
        .filter((entry) => entry[valueKey] !== "");
}

async function saveFacultyClassroomAttendance() {
    const state = getFacultyState();

    try {
        if (!state.classroomSubjectId) {
            throw new Error("Select a classroom subject first.");
        }

        const entries = collectFacultyBatchEntries(".faculty-class-attendance", "attendance_percentage");
        const data = await fetchJson("/faculty/classroom/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject_id: Number(state.classroomSubjectId),
                entries,
            }),
        });

        await loadFacultyClassroom();
        showFacultyMessage(data.message || "Class attendance saved successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to save class attendance.", "error");
    }
}

async function saveFacultyClassroomMarks() {
    const state = getFacultyState();

    try {
        if (!state.classroomSubjectId) {
            throw new Error("Select a classroom subject first.");
        }

        const examType = document.getElementById("facultyClassExamType")?.value.trim() || "";
        const entries = collectFacultyBatchEntries(".faculty-class-marks", "marks");
        const data = await fetchJson("/faculty/classroom/marks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject_id: Number(state.classroomSubjectId),
                exam_type: examType,
                entries,
            }),
        });

        await loadFacultyClassroom();
        showFacultyMessage(data.message || "Class marks saved successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to save class marks.", "error");
    }
}

async function submitFacultyIntervention(event) {
    event.preventDefault();

    try {
        const state = getFacultyState();
        if (!state.selectedStudentId) {
            throw new Error("Select a student before logging a support case.");
        }

        const interventionType = document.getElementById("interventionType")?.value || "academic";
        const priority = document.getElementById("interventionPriority")?.value || "medium";
        const dueDate = document.getElementById("interventionDueDate")?.value || "";
        const summary = document.getElementById("interventionSummary")?.value.trim() || "";
        const actionPlan = document.getElementById("interventionActionPlan")?.value.trim() || "";
        const notifyStudent = Boolean(document.getElementById("interventionNotifyStudent")?.checked);

        if (!summary) {
            throw new Error("Add a short summary for the support case.");
        }

        const data = await fetchJson("/faculty/student/" + state.selectedStudentId + "/interventions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                intervention_type: interventionType,
                priority,
                due_date: dueDate || null,
                summary,
                action_plan: actionPlan,
                notify_student: notifyStudent,
            }),
        });

        ["interventionDueDate", "interventionSummary", "interventionActionPlan"].forEach((id) => {
            const node = document.getElementById(id);
            if (node) {
                node.value = "";
            }
        });
        const notifyBox = document.getElementById("interventionNotifyStudent");
        if (notifyBox) {
            notifyBox.checked = true;
        }

        await loadFacultyDashboard();
        await loadFacultyStudentDetail(state.selectedStudentId);
        showFacultyMessage(data.message || "Support intervention saved successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to save support intervention.", "error");
    }
}

async function updateFacultyInterventionStatus(interventionId, status) {
    try {
        const state = getFacultyState();
        if (!state.selectedStudentId) {
            throw new Error("Select a student before updating support status.");
        }

        const data = await fetchJson("/faculty/intervention/" + interventionId, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });

        await loadFacultyDashboard();
        await loadFacultyStudentDetail(state.selectedStudentId);
        showFacultyMessage(data.message || "Support intervention updated successfully.");
    } catch (error) {
        console.error(error);
        showFacultyMessage(error.message || "Unable to update support intervention.", "error");
    }
}
