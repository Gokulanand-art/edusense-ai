CREATE TABLE IF NOT EXISTS jwt_blacklist (
    id SERIAL PRIMARY KEY,
    jti VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_jti ON jwt_blacklist(jti);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps(email);
