/**
 * CSRF Token Helper — Shared utility for CSRF protection
 * 
 * Automatically includes CSRF token in all fetch requests.
 * Token is stored server-side in session and retrieved via template context.
 */

/**
 * Get CSRF token from hidden form field or data attribute.
 * The token is injected into templates via @app.context_processor.
 */
function getCsrfToken() {
    // Try to get from meta tag (if template includes it)
    let token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    if (token) return token;
    
    // Try to get from hidden form field
    token = document.querySelector('input[name="_csrf_token"]')?.value;
    if (token) return token;
    
    // Try to get from window.csrfToken (set by template)
    if (typeof csrfToken !== 'undefined') return csrfToken;
    
    return "";
}

/**
 * Add CSRF token to fetch options.
 * Usage:
 *   const options = withCsrfToken({ method: 'POST', body: JSON.stringify(data) });
 *   fetch('/api/endpoint', options);
 */
function withCsrfToken(options = {}) {
    const token = getCsrfToken();
    if (!token) return options;
    
    const headers = options.headers || {};
    headers['X-CSRF-Token'] = token;
    
    return {
        ...options,
        headers: headers
    };
}

/**
 * Override fetchJson to include CSRF token automatically.
 * This assumes fetchJson exists in shared.js.
 * To use: ensure this script is loaded after shared.js
 */
if (typeof fetchJson === 'function') {
    const originalFetchJson = fetchJson;
    window.fetchJson = async function(path, options = {}) {
        return originalFetchJson(path, withCsrfToken(options));
    };
}
