# Deployment Readiness Checklist

**Last Updated:** 2026-06-05  
**Target Environment:** Render.com (with Managed PostgreSQL)  
**Status:** ✅ Production Ready

## Pre-Deployment Checklist

### Environment & Configuration
- [ ] `.env` file is configured with all required variables (see `.env.example`)
- [ ] `JWT_SECRET` is a strong random string (min 32 characters)
- [ ] `FLASK_SECRET_KEY` is a strong random string (min 32 characters)
- [ ] `DATABASE_URL` points to production Postgres instance
- [ ] `FLASK_ENV` is set to `"production"` (not `"development"`)
- [ ] `FLASK_DEBUG` is set to `"false"`
- [ ] `AUTH_COOKIE_SECURE` is set to `"true"` for HTTPS-only cookies
- [ ] `LOG_LEVEL` is set to `"INFO"` (not `"DEBUG"`)
- [ ] All sensitive values are kept out of `.git` (use `.gitignore`)

### Database & Migrations
- [ ] PostgreSQL instance is ready and accessible
- [ ] Connection string includes `sslmode=require` for Render
- [ ] Database user has appropriate permissions (CREATE TABLE, etc.)
- [ ] Connection pooling is configured: `DB_POOL_MINCONN` and `DB_POOL_MAXCONN`
- [ ] Database backups are configured (if using Render Postgres)

### Security
- [ ] HTTPS is enforced (Render provides free SSL)
- [ ] HTTP→HTTPS redirect is configured
- [ ] Security headers are applied (via `core/security_headers.py`)
- [ ] CSRF protection is enabled (via `core/csrf_protection.py`)
- [ ] Rate limiting is active (via `core/rate_limiter.py`)
- [ ] Authentication cookies are HttpOnly and Secure
- [ ] JWT tokens have appropriate expiration time
- [ ] Audit logging is enabled for sensitive operations
- [ ] Password hashing uses bcrypt (not plaintext)

### File Storage
- [ ] Media files are stored in PostgreSQL BYTEA columns (not local filesystem)
- [ ] Uploaded files have size limits enforced (MAX_FILE_SIZE in media_service.py)
- [ ] File type validation is in place (ALLOWED_EXTENSIONS)
- [ ] Files are virus-scanned if required by compliance

### Health & Monitoring
- [ ] `/health/live` endpoint responds with 200 OK
- [ ] `/health/ready` endpoint responds with 200 OK and database status
- [ ] `/health/startup` endpoint provides version/commit information
- [ ] Application startup is idempotent (can restart safely)
- [ ] Migrations run automatically on startup without errors

### API & Endpoints
- [ ] All public API endpoints return consistent JSON response format
- [ ] Error responses include appropriate HTTP status codes
- [ ] Rate limits are configured and enforced
- [ ] Pagination works correctly for list endpoints
- [ ] Request/response validation is in place

### Frontend & Browser
- [ ] All JavaScript files are minified for production
- [ ] Service Worker is configured for offline capability
- [ ] CSS is optimized and not inline-heavy
- [ ] Fonts are loaded from CDN with fallbacks
- [ ] Images are optimized (size, format, lazy-loading)
- [ ] Mobile responsiveness has been tested
- [ ] Dark mode toggle works correctly
- [ ] No console errors in browser DevTools

### Testing
- [ ] Unit tests pass: `pytest -q`
- [ ] Integration tests pass: `pytest -q --co`
- [ ] Security scan passes: `bandit -r . --severity-level high`
- [ ] Linting passes: `ruff check .`
- [ ] Coverage is adequate for critical paths (>80%)

### CI/CD Pipeline
- [ ] GitHub Actions workflow is configured (`.github/workflows/ci.yml`)
- [ ] Tests run on every push/PR
- [ ] Security scans are included in the pipeline
- [ ] Encoding checks catch mojibake characters
- [ ] Deployment is triggered only after all checks pass

## Post-Deployment Verification

### 1. Run Health Checks
```bash
python scripts/verify_deployment.py https://your-app.render.com 10
```

Expected output:
```
[✓] Liveness probe: ok
[✓] Readiness probe: Database is healthy
[✓] Startup probe: Release information available
[✓] Security headers are set correctly
```

### 2. Verify Authentication Flow
1. Navigate to `https://your-app.render.com/`
2. Login with test credentials
3. Verify redirect to dashboard
4. Check browser DevTools → Application → Cookies
   - `auth_token` should be HttpOnly, Secure, SameSite=Strict
5. Logout and verify session is cleared

### 3. Test Student Dashboard
1. Login as Student
2. Verify attendance, marks, readiness score display
3. Check peer learning feed loads
4. Verify mock test scores appear
5. Test goal creation and tracking
6. Upload a document (test media storage)

### 4. Test Faculty Dashboard
1. Login as Faculty
2. View student list (should be tenant-scoped)
3. Record attendance
4. Enter marks
5. View at-risk student list
6. Export data (PDF/CSV)

### 5. Test Admin Dashboard
1. Login as Admin
2. View all dashboards (student, faculty, admin)
3. Access admin utilities:
   - User management
   - Import CSV
   - Export reports
4. Verify role-based access control

### 6. Test API Endpoints
```bash
# Get auth token
curl -X POST https://your-app.render.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Use token in subsequent requests
curl -H "Authorization: Bearer <TOKEN>" \
  https://your-app.render.com/api/students
```

### 7. Monitor Logs
1. Check Render logs for any errors
2. Verify database connections are pooled correctly
3. Confirm no 500 errors in startup

## Production Rollout Plan

### Phase 1: Staging
1. Deploy to staging environment (same config as prod, different DB)
2. Run full verification checklist
3. Load test with simulated users
4. Security audit

### Phase 2: Canary Deployment
1. Deploy to prod with 10% traffic
2. Monitor error rates and latency
3. Gradually increase to 100%

### Phase 3: Full Rollout
1. Deploy to 100% traffic
2. Monitor for 24 hours
3. Set up alerts for anomalies

## Rollback Plan

If issues occur:

1. **Database corruption:** Restore from backup (Render Postgres snapshots)
2. **Application crash:** Render auto-restarts failed instances
3. **Data corruption:** Use audit logs to identify affected records

## Monitoring & Alerts

Configure these alerts on Render dashboard:
- [ ] CPU usage > 80%
- [ ] Memory usage > 90%
- [ ] Request latency > 5s (p95)
- [ ] Error rate > 1%
- [ ] Database connections > 20
- [ ] Disk usage (if applicable)

## Post-Deployment Maintenance

### Daily
- Monitor error logs
- Check health endpoints

### Weekly
- Review performance metrics
- Audit security logs

### Monthly
- Database maintenance (VACUUM, ANALYZE)
- Update dependencies (security patches)
- Backup verification

### Quarterly
- Security audit
- Load testing
- Disaster recovery drill

## Emergency Contacts & Escalation

| Component | Owner | Escalation | Page |
|-----------|-------|-----------|------|
| Application | Dev Team | CTO | See internal wiki |
| Database | DBA | CTO | See internal wiki |
| Infrastructure | Platform | VP Ops | See internal wiki |

---

**Need Help?** See [docs/RENDER_DEPLOYMENT_GUIDE.md](../RENDER_DEPLOYMENT_GUIDE.md) for detailed setup instructions.
