-- ============================================================
--  Kateb — MySQL Database Schema (Complete)
--  Run this once in phpMyAdmin or MySQL CLI to create all tables.
--  After running, the PHP API will auto-seed default settings
--  and a default admin user (phone: 09120000000, password: admin123).
-- ============================================================

-- 1. Users
CREATE TABLE IF NOT EXISTS kateb_users (
    id CHAR(36) PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    full_name TEXT DEFAULT '',
    password_hash TEXT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    coins INT DEFAULT 10,
    plan_type VARCHAR(20) DEFAULT 'free',
    ai_assistant_usage_this_month INT DEFAULT 0,
    template_usage_this_month INT DEFAULT 0,
    usage_cycle_start DATETIME NULL,
    plan_expires_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. OTP Codes
CREATE TABLE IF NOT EXISTS kateb_otp_codes (
    id CHAR(36) PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at DATETIME NOT NULL,
    used TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Sessions
CREATE TABLE IF NOT EXISTS kateb_sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    INDEX idx_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Settings (single-row table — all non-DB secrets stored here)
CREATE TABLE IF NOT EXISTS kateb_settings (
    id INT PRIMARY KEY DEFAULT 1,
    sms_api_key TEXT DEFAULT '',
    sms_pattern_code TEXT DEFAULT '',
    sms_line_number TEXT DEFAULT '',
    ai_api_url TEXT DEFAULT '',
    ai_api_key TEXT DEFAULT '',
    ai_models TEXT DEFAULT '',
    zarinpal_merchant_id TEXT DEFAULT '',
    zarinpal_sandbox TINYINT(1) DEFAULT 1,
    bazaar_client_id TEXT DEFAULT '',
    bazaar_client_secret TEXT DEFAULT '',
    bazaar_refresh_token TEXT DEFAULT '',
    bazaar_access_token TEXT DEFAULT '',
    bazaar_access_token_expires DATETIME NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Profiles
CREATE TABLE IF NOT EXISTS profiles (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    full_name TEXT DEFAULT '',
    national_id TEXT DEFAULT '',
    employee_code TEXT DEFAULT '',
    organization TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    extra_fields LONGTEXT,
    is_default TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_profiles_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Generated Letters
CREATE TABLE IF NOT EXISTS generated_letters (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    letter_type_id TEXT DEFAULT '',
    template_id TEXT DEFAULT '',
    template_title TEXT DEFAULT '',
    profile_id TEXT NULL,
    title TEXT DEFAULT '',
    content LONGTEXT,
    field_values LONGTEXT,
    status TEXT DEFAULT 'draft',
    quality_score INT NULL,
    quality_feedback TEXT NULL,
    user_rating INT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_letters_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Templates
CREATE TABLE IF NOT EXISTS templates (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    letter_type LONGTEXT,
    title TEXT DEFAULT '',
    raw_request TEXT DEFAULT '',
    rating DECIMAL(10,1) DEFAULT 0,
    rating_count INT DEFAULT 0,
    creator_name TEXT DEFAULT '',
    is_approved TINYINT(1) DEFAULT 0,
    sample_content LONGTEXT,
    source_template_id CHAR(36) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_templates_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Template Ratings
CREATE TABLE IF NOT EXISTS template_ratings (
    id CHAR(36) PRIMARY KEY,
    template_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    rating INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_template_user (template_id, user_id),
    INDEX idx_ratings_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Drafts
CREATE TABLE IF NOT EXISTS drafts (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title TEXT DEFAULT '',
    letter_type LONGTEXT,
    discovered_letter LONGTEXT,
    field_values LONGTEXT,
    chat_messages LONGTEXT,
    step INT DEFAULT 0,
    phase VARCHAR(20) DEFAULT 'chat',
    use_profile TINYINT(1) DEFAULT 1,
    include_optional TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_drafts_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Discovery Usage
CREATE TABLE IF NOT EXISTS discovery_usage (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    query_text TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_discovery_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Coin Orders (Zarinpal)
CREATE TABLE IF NOT EXISTS coin_orders (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    amount_toman INT NOT NULL,
    coins INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    authority TEXT DEFAULT '',
    ref_id TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME NULL,
    INDEX idx_orders_user (user_id),
    INDEX idx_orders_authority (authority(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Plan Orders (Zarinpal + Cafe Bazaar)
CREATE TABLE IF NOT EXISTS plan_orders (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    plan_id VARCHAR(20) NOT NULL,
    amount_toman INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    authority TEXT DEFAULT '',
    ref_id TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME NULL,
    duration_months INT NOT NULL DEFAULT 1,
    payment_provider VARCHAR(20) DEFAULT 'zarinpal',
    product_id VARCHAR(100) DEFAULT '',
    purchase_token TEXT DEFAULT '',
    bazaar_purchase_id TEXT NULL,
    INDEX idx_plan_orders_user (user_id),
    INDEX idx_plan_orders_authority (authority(50)),
    INDEX idx_plan_orders_purchase_token (purchase_token(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
--  Default settings row (edit these values after importing)
-- ============================================================
INSERT INTO kateb_settings (id, sms_api_key, sms_pattern_code, sms_line_number, ai_api_url, ai_api_key, ai_models, zarinpal_merchant_id, zarinpal_sandbox)
VALUES (1, '', '', '', 'https://ai.parspack.com/v1', '', 'qwen/qwen3-32b', '00000000-0000-0000-0000-000000000000', 1)
ON DUPLICATE KEY UPDATE id = id;

-- ============================================================
--  Default admin user (phone: 09120000000, password: admin123)
--  Password hash is SHA-256 of 'admin123'
-- ============================================================
INSERT INTO kateb_users (id, phone, full_name, is_admin, password_hash, coins)
VALUES ('a0000000-0000-0000-0000-000000000001', '09120000000', 'مدیر سیستم', 1, '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 100)
ON DUPLICATE KEY UPDATE is_admin = 1;
