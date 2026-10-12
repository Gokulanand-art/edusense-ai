// ================= HELPER FUNCTIONS =================

/**
 * Toggle password visibility
 */
function togglePassword(element) {
    const input = element.previousElementSibling;
    if (input.type === "password") {
        input.type = "text";
        element.classList.remove("fa-eye");
        element.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        element.classList.remove("fa-eye-slash");
        element.classList.add("fa-eye");
    }
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isStrongPassword(password) {
    return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

/**
 * Clear all error messages
 */
function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

/**
 * Display error message
 */
function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
    }
}

/**
 * Show/hide message with animation
 */
function showMessage(message, type = 'error', targetId = null) {
    // Auto-detect the right message element
    const candidates = targetId ? [targetId] : ['loginMessage','registerMessage','forgotMessage','message'];
    let messageEl = null;
    for (const id of candidates) {
        const el = document.getElementById(id);
        if (el) { messageEl = el; break; }
    }
    if (!messageEl) return;

    messageEl.textContent = message;
    messageEl.className = `auth-alert ${type}`;
    messageEl.style.display = 'block';

    messageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (type === 'success') {
        setTimeout(() => {
            messageEl.className = 'auth-alert';
            messageEl.style.display = 'none';
        }, 4000);
    }
}

/**
 * Get selected role option
 */
function getSelectedRoleOption() {
    const roleSelect = document.getElementById("role");
    return roleSelect ? roleSelect.options[roleSelect.selectedIndex] : null;
}

function populateRegistrationDepartments(departments) {
    const departmentSelect = document.getElementById("department");
    if (!departmentSelect) {
        return;
    }

    departmentSelect.innerHTML = '<option value="">Select your department</option>';

    (departments || []).forEach((department) => {
        const option = document.createElement("option");
        option.value = department;
        option.innerText = department;
        departmentSelect.appendChild(option);
    });

    if (!(departments || []).length) {
        const option = document.createElement("option");
        option.value = "";
        option.innerText = "No departments available yet";
        departmentSelect.appendChild(option);
    }
}

/**
 * Toggle department field visibility
 */
function toggleDepartmentField() {
    const departmentField = document.getElementById("departmentField");
    const departmentInput = document.getElementById("department");
    const rollNumberField = document.getElementById("rollNumberField");
    const rollNumberInput = document.getElementById("rollNumber");
    const selectedRole = getSelectedRoleOption();
    const isStudent = (selectedRole?.dataset.roleName || "").toLowerCase() === "student";

    if (departmentField) {
        departmentField.style.display = isStudent ? 'block' : 'none';
    }

    if (rollNumberField) {
        rollNumberField.style.display = isStudent ? 'block' : 'none';
    }

    if (departmentInput) {
        if (isStudent) {
            departmentInput.disabled = false;
        } else {
            departmentInput.value = "";
            departmentInput.disabled = true;
        }
    }

    if (rollNumberInput) {
        if (isStudent) {
            rollNumberInput.placeholder = "Enter your student roll number";
        } else {
            rollNumberInput.value = "";
        }
    }
}

// ================= REGISTRATION =================

/**
 * Load registration form with available roles
 */
async function loadRegistrationForm() {
    const roleSelect = document.getElementById("role");
    if (!roleSelect) return;

    try {
        const [roles, departments] = await Promise.all([
            fetchJson("/auth/roles"),
            fetchJson("/auth/departments"),
        ]);
        roleSelect.innerHTML = '<option value="">Choose your role...</option>';

        roles.forEach((role) => {
            const option = document.createElement("option");
            option.value = role.id;
            option.dataset.roleName = role.name;
            option.innerText = role.name.charAt(0).toUpperCase() + role.name.slice(1);
            roleSelect.appendChild(option);
        });

        populateRegistrationDepartments(departments);
        roleSelect.removeEventListener("change", toggleDepartmentField);
        roleSelect.addEventListener("change", toggleDepartmentField);
        toggleDepartmentField();
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Unable to load registration roles.", "error");
    }
}

/**
 * Validate registration form
 */
function validateRegistration() {
    clearErrors();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const terms = document.getElementById("terms").checked;
    const departmentInput = document.getElementById("department");
    const department = departmentInput ? departmentInput.value.trim() : "";
    const rollNumberInput = document.getElementById("rollNumber");
    const rollNumber = rollNumberInput ? rollNumberInput.value.trim() : "";
    const roleOption = getSelectedRoleOption();
    const roleName = (roleOption?.dataset.roleName || "").toLowerCase();

    let isValid = true;

    // Validate name
    if (!name) {
        showError("nameError", "Full name is required");
        isValid = false;
    } else if (name.length < 2) {
        showError("nameError", "Name must be at least 2 characters");
        isValid = false;
    }

    // Validate email
    if (!email) {
        showError("emailError", "Email is required");
        isValid = false;
    } else if (!isValidEmail(email)) {
        showError("emailError", "Please enter a valid email address");
        isValid = false;
    }

    // Validate password
    if (!password) {
        showError("passwordError", "Password is required");
        isValid = false;
    } else if (!isStrongPassword(password)) {
        showError("passwordError", "Password must be at least 8 characters with uppercase, lowercase, and a number");
        isValid = false;
    }

    // Validate role
    if (!role) {
        showError("roleError", "Please select a role");
        isValid = false;
    }

    // Validate department for students
    if (roleName === "student" && !department) {
        showError("departmentError", "Department is required for students");
        isValid = false;
    }

    if (roleName === "student" && !rollNumber) {
        showError("rollNumberError", "Roll number is required for students");
        isValid = false;
    }

    // Validate terms
    if (!terms) {
        showError("termsError", "You must accept the terms and conditions");
        isValid = false;
    }

    return isValid;
}

/**
 * Register user
 */
async function register() {
    // Validate form
    if (!validateRegistration()) {
        showMessage("Please fix the errors above", "error");
        return;
    }

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const departmentInput = document.getElementById("department");
    const department = departmentInput ? departmentInput.value.trim() : "";
    const rollNumberInput = document.getElementById("rollNumber");
    const rollNumber = rollNumberInput ? rollNumberInput.value.trim() : "";
    const registerBtn = document.getElementById('registerBtn');

    if (registerBtn) {
        registerBtn.disabled = true;
        registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
    }

    try {
        const data = await fetchJson("/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                email,
                password,
                role_id: parseInt(role, 10),
                department,
                roll_number: rollNumber,
            })
        });

        showMessage("Account created successfully! Redirecting...", "success");
        showToast("Welcome to Smart Campus! 🎓");
        
        setTimeout(() => {
            window.location.href = "/";
        }, 2000);
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Registration failed. Please try again.", "error");
        if (registerBtn) {
            registerBtn.disabled = false;
            registerBtn.innerHTML = '<span>Create Account</span><i class="fas fa-arrow-right"></i>';
        }
    }
}

// ================= LOGIN =================

/**
 * Validate login form
 */
function validateLogin() {
    clearErrors();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    let isValid = true;

    if (!email) {
        showError("emailError", "Email is required");
        isValid = false;
    } else if (!isValidEmail(email)) {
        showError("emailError", "Please enter a valid email address");
        isValid = false;
    }

    if (!password) {
        showError("passwordError", "Password is required");
        isValid = false;
    }

    return isValid;
}

/**
 * Login user
 */
async function login() {
    // Validate form
    if (!validateLogin()) {
        showMessage("Please fill in all fields", "error");
        return;
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const rememberMe = document.getElementById("rememberMe")?.checked || false;
    const loginBtn = document.getElementById("loginBtn");

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> Signing In...</span>';
    }

    try {
        const data = await fetchJson("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!data || !data.token || !data.user) {
            throw new Error((data && data.error) || "Login failed. Please try again.");
        }

        // Store credentials
        
        sessionStorage.setItem("user_email", data.user.email || "");
        sessionStorage.setItem("role_id", String(data.user.role_id || ""));
        sessionStorage.setItem("role_name", (data.user.role_name || "").toLowerCase());
        sessionStorage.setItem("user_name", data.user.name || "");
        
        if (rememberMe) {
            localStorage.setItem("remember_email", email);
        }

        showMessage("Login successful! Redirecting...", "success");
        showToast("Welcome back!", "success");
        
        setTimeout(() => {
            window.location.href = data.user.dashboard_path || "/";
        }, 1500);
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Login failed. Please check your credentials.", "error");
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Sign In</span><i class="fas fa-arrow-right"></i>';
        }
    }
}

// ================= FORGOT PASSWORD =================

let _forgotEmail = "";
let _otpValue = "";
let _otpTimerInterval = null;

/**
 * Show the forgot password panel, hide login
 */
function showForgotPanel() {
    const loginPanel = document.getElementById("loginPanel");
    const forgotPanel = document.getElementById("forgotPanel");
    if (loginPanel) loginPanel.style.display = "none";
    if (forgotPanel) {
        forgotPanel.style.display = "block";
        forgotPanel.classList.add("panel-slide-in");
    }
    // Reset to step 1
    _showForgotStep(1);
    clearErrors();

    // Pre-fill email if user already typed it on login
    const loginEmail = document.getElementById("email");
    const forgotEmail = document.getElementById("forgotEmail");
    if (loginEmail && forgotEmail && loginEmail.value.trim()) {
        forgotEmail.value = loginEmail.value.trim();
    }
}

/**
 * Show the login panel, hide forgot password
 */
function showLoginPanel() {
    const loginPanel = document.getElementById("loginPanel");
    const forgotPanel = document.getElementById("forgotPanel");
    if (forgotPanel) {
        forgotPanel.style.display = "none";
        forgotPanel.classList.remove("panel-slide-in");
    }
    if (loginPanel) {
        loginPanel.style.display = "block";
        loginPanel.classList.add("panel-slide-in");
    }
    clearErrors();
    _stopOtpTimer();

    // Clear forgot message
    const forgotMsg = document.getElementById("forgotMessage");
    if (forgotMsg) { forgotMsg.textContent = ""; forgotMsg.style.display = "none"; }
}

/**
 * Show a specific forgot-password step (1-4)
 */
function _showForgotStep(step) {
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`forgotStep${i}`);
        if (el) el.style.display = i === step ? "block" : "none";
    }

    // Update step indicators
    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step${i}Indicator`);
        if (indicator) {
            indicator.classList.remove("active", "completed");
            if (i < step) indicator.classList.add("completed");
            else if (i === step) indicator.classList.add("active");
        }
        if (i < 3) {
            const line = document.getElementById(`stepLine${i}`);
            if (line) {
                line.classList.toggle("active", i < step);
            }
        }
    }
}

/**
 * Step 1: Send OTP to email
 */
async function sendOtp() {
    clearErrors();
    const emailInput = document.getElementById("forgotEmail");
    const email = (emailInput?.value || "").trim();

    if (!email) {
        showError("forgotEmailError", "Email is required");
        return;
    }
    if (!isValidEmail(email)) {
        showError("forgotEmailError", "Please enter a valid email address");
        return;
    }

    const btn = document.getElementById("sendOtpBtn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }

    try {
        await fetchJson("/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        _forgotEmail = email;
        const sentLabel = document.getElementById("otpSentEmail");
        if (sentLabel) sentLabel.textContent = email;

        _showForgotStep(2);
        _startOtpTimer(15 * 60); // 15 min
        _initOtpInputs();
    } catch (error) {
        showMessage(error.message || "Failed to send OTP", "error", "forgotMessage");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Send OTP</span><i class="fas fa-paper-plane"></i>';
        }
    }
}

/**
 * Step 2: Verify OTP
 */
async function verifyOtp() {
    clearErrors();
    const otp = _getOtpValue();

    if (!otp || otp.length !== 6) {
        showError("otpError", "Please enter the complete 6-digit OTP");
        return;
    }

    _otpValue = otp;
    // Move to step 3 (new password) — actual verification happens on reset
    _showForgotStep(3);
    _stopOtpTimer();
}

/**
 * Step 3: Reset password with OTP
 */
async function resetPassword() {
    clearErrors();
    const newPassword = document.getElementById("newPassword")?.value || "";
    const confirmPassword = document.getElementById("confirmPassword")?.value || "";

    if (!newPassword) {
        showError("newPasswordError", "New password is required");
        return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        showError("newPasswordError", "Password must be 8+ chars with uppercase and a number");
        return;
    }
    if (newPassword !== confirmPassword) {
        showError("confirmPasswordError", "Passwords do not match");
        return;
    }

    const btn = document.getElementById("resetPasswordBtn");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
    }

    try {
        await fetchJson("/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: _forgotEmail,
                otp: _otpValue,
                new_password: newPassword
            })
        });

        _showForgotStep(4);
        if (typeof showToast === 'function') {
            showToast("Password reset successful!", "success");
        }
    } catch (error) {
        showMessage(error.message || "Failed to reset password", "error", "forgotMessage");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Reset Password</span><i class="fas fa-arrow-right"></i>';
        }
    }
}

/**
 * Resend OTP
 */
async function resendOtp() {
    const link = document.getElementById("resendOtpLink");
    if (link) link.textContent = "Sending...";

    try {
        await fetchJson("/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: _forgotEmail })
        });

        _startOtpTimer(15 * 60);
        if (typeof showToast === 'function') {
            showToast("New OTP sent!", "success");
        }
        // Clear existing OTP inputs
        for (let i = 1; i <= 6; i++) {
            const d = document.getElementById(`otpDigit${i}`);
            if (d) d.value = "";
        }
        document.getElementById("otpDigit1")?.focus();
    } catch (error) {
        showMessage(error.message || "Failed to resend OTP", "error", "forgotMessage");
    } finally {
        if (link) link.textContent = "Resend OTP";
    }
}

// ================= OTP INPUT HELPERS =================

/**
 * Initialize OTP single-digit inputs with auto-advance
 */
function _initOtpInputs() {
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`otpDigit${i}`);
        if (!input) continue;

        input.value = "";

        input.addEventListener("input", function () {
            this.value = this.value.replace(/[^0-9]/g, "");
            if (this.value.length === 1 && i < 6) {
                document.getElementById(`otpDigit${i + 1}`)?.focus();
            }
        });

        input.addEventListener("keydown", function (e) {
            if (e.key === "Backspace" && !this.value && i > 1) {
                document.getElementById(`otpDigit${i - 1}`)?.focus();
            }
            if (e.key === "Enter") {
                verifyOtp();
            }
        });

        input.addEventListener("paste", function (e) {
            e.preventDefault();
            const pasted = (e.clipboardData.getData("text") || "").replace(/[^0-9]/g, "").slice(0, 6);
            for (let j = 0; j < pasted.length; j++) {
                const d = document.getElementById(`otpDigit${j + 1}`);
                if (d) d.value = pasted[j];
            }
            const lastFilled = Math.min(pasted.length, 6);
            document.getElementById(`otpDigit${lastFilled}`)?.focus();
        });
    }

    document.getElementById("otpDigit1")?.focus();
}

/**
 * Read OTP value from 6 digit inputs
 */
function _getOtpValue() {
    let otp = "";
    for (let i = 1; i <= 6; i++) {
        otp += document.getElementById(`otpDigit${i}`)?.value || "";
    }
    return otp;
}

// ================= OTP TIMER =================

function _startOtpTimer(seconds) {
    _stopOtpTimer();
    let remaining = seconds;
    const el = document.getElementById("otpCountdown");
    const timerContainer = document.getElementById("otpTimer");

    function tick() {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        if (remaining <= 0) {
            _stopOtpTimer();
            if (el) el.textContent = "Expired";
            if (timerContainer) timerContainer.classList.add("expired");
        }
        remaining--;
    }

    tick();
    _otpTimerInterval = setInterval(tick, 1000);
}

function _stopOtpTimer() {
    if (_otpTimerInterval) {
        clearInterval(_otpTimerInterval);
        _otpTimerInterval = null;
    }
    const timerContainer = document.getElementById("otpTimer");
    if (timerContainer) timerContainer.classList.remove("expired");
}

// ================= PAGE INITIALIZATION =================

/**
 * Initialize login page
 */
function initLoginPage() {
    // Restore remembered email
    const rememberedEmail = localStorage.getItem("remember_email");
    if (rememberedEmail) {
        const emailInput = document.getElementById("email");
        if (emailInput) {
            emailInput.value = rememberedEmail;
            const rememberCheckbox = document.getElementById("rememberMe");
            if (rememberCheckbox) {
                rememberCheckbox.checked = true;
            }
        }
    }

    // Handle Enter key on login form
    const form = document.getElementById("loginForm");
    if (form) {
        form.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                login();
            }
        });
    }
}

/**
 * Initialize registration page
 */
function initRegisterPage() {
    loadRegistrationForm();

    // Handle Enter key
    const form = document.getElementById("registerForm");
    if (form) {
        form.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                register();
            }
        });
    }
}

// Initialize pages when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("loginForm")) {
            initLoginPage();
        }
        if (document.getElementById("registerForm")) {
            initRegisterPage();
        }
    });
} else {
    if (document.getElementById("loginForm")) {
        initLoginPage();
    }
    if (document.getElementById("registerForm")) {
        initRegisterPage();
    }
}
