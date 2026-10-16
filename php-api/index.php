<?php
/**
 * Kateb JSON API — single-entry PHP backend
 *
 * Upload this entire `php-api/` folder to your hosting (e.g. inside public_html/api/).
 * The frontend talks to this file via POST with a JSON body: { "action": "...", ...params }
 *
 * On first run it automatically creates all required MySQL tables.
 */

error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
ini_set('display_errors', '0');
set_time_limit(120);
ini_set('max_execution_time', '120');

// ─── CORS ─────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Client-Info, Apikey');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ─── Config ───────────────────────────────────────────────────
$config = require __DIR__ . '/config.php';

// ─── Database ─────────────────────────────────────────────────
function db(): PDO {
    global $config;
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = "mysql:host={$config['db_host']};dbname={$config['db_name']};charset={$config['db_charset']}";
    try {
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        json_error('خطا در اتصال به دیتابیس', 500);
    }
    return $pdo;
}

// ─── Helpers ──────────────────────────────────────────────────
function json_out($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $msg, int $status = 400): void {
    json_out(['error' => $msg], $status);
}

function body(): array {
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input');
        $b = json_decode($raw, true) ?? [];
    }
    return $b;
}

function action(): string {
    // The frontend sends action inside the JSON body for most calls.
    $a = body()['action'] ?? '';
    if ($a) return $a;
    // For ai_proxy the action comes as a query param.
    return $_GET['action'] ?? '';
}

function gen_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function gen_token(): string {
    return bin2hex(random_bytes(32));
}

function gen_otp(): string {
    return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function hash_password(string $pw): string {
    return hash('sha256', $pw);
}

function get_auth_token(): ?string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $h, $m)) return trim($m[1]);
    return null;
}

function now_iso(): string {
    return date('Y-m-d H:i:s');
}

// ─── Table Auto-Creation ──────────────────────────────────────
function init_tables(): void {
    $pdo = db();
    $ddl = [
        "CREATE TABLE IF NOT EXISTS kateb_users (
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS kateb_otp_codes (
            id CHAR(36) PRIMARY KEY,
            phone VARCHAR(20) NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            used TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_otp_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS kateb_sessions (
            token VARCHAR(64) PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            INDEX idx_sessions_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS kateb_settings (
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT single_row CHECK (id = 1)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS profiles (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS generated_letters (
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_letters_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS templates (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS template_ratings (
            id CHAR(36) PRIMARY KEY,
            template_id CHAR(36) NOT NULL,
            user_id CHAR(36) NOT NULL,
            rating INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_template_user (template_id, user_id),
            INDEX idx_ratings_template (template_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS drafts (
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_drafts_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS discovery_usage (
            id CHAR(36) PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            query_text TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_discovery_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS coin_orders (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS plan_orders (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];

    foreach ($ddl as $sql) {
        $pdo->exec($sql);
    }

    // Add plan/usage columns to existing kateb_users table if missing
    $cols = $pdo->query("SHOW COLUMNS FROM kateb_users")->fetchAll(PDO::FETCH_COLUMN);
    $addCols = [
        'plan_type' => "ADD COLUMN plan_type VARCHAR(20) DEFAULT 'free'",
        'ai_assistant_usage_this_month' => 'ADD COLUMN ai_assistant_usage_this_month INT DEFAULT 0',
        'template_usage_this_month' => 'ADD COLUMN template_usage_this_month INT DEFAULT 0',
        'usage_cycle_start' => 'ADD COLUMN usage_cycle_start DATETIME NULL',
        'plan_expires_at' => 'ADD COLUMN plan_expires_at DATETIME NULL',
    ];
    foreach ($addCols as $col => $sql) {
        if (!in_array($col, $cols)) {
            $pdo->exec("ALTER TABLE kateb_users $sql");
        }
    }

    // Add duration_months to existing plan_orders table if missing
    $planCols = $pdo->query("SHOW COLUMNS FROM plan_orders")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('duration_months', $planCols)) {
        $pdo->exec("ALTER TABLE plan_orders ADD COLUMN duration_months INT NOT NULL DEFAULT 1");
    }
    // Add Bazaar payment columns to existing plan_orders table if missing
    $bazaarOrderCols = [
        'payment_provider' => "ADD COLUMN payment_provider VARCHAR(20) DEFAULT 'zarinpal'",
        'product_id' => "ADD COLUMN product_id VARCHAR(100) DEFAULT ''",
        'purchase_token' => "ADD COLUMN purchase_token TEXT DEFAULT ''",
        'bazaar_purchase_id' => "ADD COLUMN bazaar_purchase_id TEXT NULL",
    ];
    foreach ($bazaarOrderCols as $col => $sql) {
        if (!in_array($col, $planCols)) {
            $pdo->exec("ALTER TABLE plan_orders $sql");
        }
    }
    // Add purchase_token index if missing
    $planIndexes = $pdo->query("SHOW INDEX FROM plan_orders")->fetchAll(PDO::FETCH_ASSOC);
    $hasTokenIdx = false;
    foreach ($planIndexes as $idx) {
        if ($idx['Key_name'] === 'idx_plan_orders_purchase_token') { $hasTokenIdx = true; break; }
    }
    if (!$hasTokenIdx) {
        try { $pdo->exec("ALTER TABLE plan_orders ADD INDEX idx_plan_orders_purchase_token (purchase_token(100))"); } catch (Exception $e) {}
    }

    // Add Bazaar credential columns to kateb_settings if missing
    $settingsCols = $pdo->query("SHOW COLUMNS FROM kateb_settings")->fetchAll(PDO::FETCH_COLUMN);
    $bazaarSettingsCols = [
        'bazaar_client_id' => "ADD COLUMN bazaar_client_id TEXT DEFAULT ''",
        'bazaar_client_secret' => "ADD COLUMN bazaar_client_secret TEXT DEFAULT ''",
        'bazaar_refresh_token' => "ADD COLUMN bazaar_refresh_token TEXT DEFAULT ''",
        'bazaar_access_token' => "ADD COLUMN bazaar_access_token TEXT DEFAULT ''",
        'bazaar_access_token_expires' => "ADD COLUMN bazaar_access_token_expires DATETIME NULL",
    ];
    foreach ($bazaarSettingsCols as $col => $sql) {
        if (!in_array($col, $settingsCols)) {
            $pdo->exec("ALTER TABLE kateb_settings $sql");
        }
    }

    // ─── Hamdam product tables (additive — legacy tables are never dropped) ───
    // Occasions: reference calendar data (holidays + cultural occasions),
    // manageable from the admin panel. Deterministic md5 id keeps seeding
    // idempotent via ON DUPLICATE KEY / INSERT IGNORE.
    $pdo->exec("CREATE TABLE IF NOT EXISTS occasions (
        id VARCHAR(32) PRIMARY KEY,
        title TEXT NOT NULL,
        jalali_date VARCHAR(10) NOT NULL,
        gregorian_date DATE NOT NULL,
        type VARCHAR(20) DEFAULT 'cultural',
        is_official_holiday TINYINT(1) DEFAULT 0,
        description TEXT NULL,
        UNIQUE KEY uk_occasion (jalali_date, title(80)),
        INDEX idx_occasions_gregorian (gregorian_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Server-side record of assistant/calendar events (local-first on the
    // client; this is the durable per-user copy for the php-api auth system).
    $pdo->exec("CREATE TABLE IF NOT EXISTS calendar_events (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        event_date DATE NOT NULL,
        start_time VARCHAR(5) DEFAULT '10:00',
        end_time VARCHAR(5) NULL,
        location TEXT NULL,
        category VARCHAR(20) DEFAULT 'other',
        color VARCHAR(9) DEFAULT '#2563eb',
        reminder_minutes INT DEFAULT 30,
        recurrence VARCHAR(20) DEFAULT 'none',
        source VARCHAR(20) DEFAULT 'manual',
        status VARCHAR(20) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_calendar_events_user (user_id),
        INDEX idx_calendar_events_date (event_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS manager_tasks (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        due_date DATE NOT NULL,
        due_time VARCHAR(5) NULL,
        duration_minutes INT DEFAULT 60,
        priority VARCHAR(10) DEFAULT 'medium',
        category VARCHAR(20) DEFAULT 'other',
        status VARCHAR(20) DEFAULT 'pending',
        recurrence VARCHAR(20) DEFAULT 'none',
        reminder_minutes INT DEFAULT 30,
        source VARCHAR(20) DEFAULT 'manual',
        completed_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_manager_tasks_user (user_id),
        INDEX idx_manager_tasks_date (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Seed occasions once (first run only, so admin edits are never overwritten).
    $stmt = $pdo->query("SELECT COUNT(*) FROM occasions");
    if ((int)$stmt->fetchColumn() === 0) {
        $seed = [
            ['عید سعید فطر - آغاز نوروز', '1405-01-01', '2026-03-21', 'religious', 1],
            ['تعطیل به مناسبت عید سعید فطر - نوروز', '1405-01-02', '2026-03-22', 'religious', 1],
            ['عید نوروز', '1405-01-03', '2026-03-23', 'cultural', 1],
            ['عید نوروز', '1405-01-04', '2026-03-24', 'cultural', 1],
            ['روز جمهوری اسلامی ایران', '1405-01-12', '2026-04-01', 'national', 1],
            ['روز طبیعت (سیزده‌به‌در)', '1405-01-13', '2026-04-02', 'cultural', 1],
            ['شهادت امام جعفر صادق (ع)', '1405-01-25', '2026-04-14', 'religious', 1],
            ['شهادت استاد مرتضی مطهری - روز معلم', '1405-02-12', '2026-05-02', 'cultural', 0],
            ['عید سعید قربان', '1405-03-06', '2026-05-27', 'religious', 1],
            ['عید سعید غدیر خم - رحلت امام خمینی', '1405-03-14', '2026-06-04', 'religious', 1],
            ['قیام خونین ۱۵ خرداد', '1405-03-15', '2026-06-05', 'national', 1],
            ['تاسوعای حسینی', '1405-04-03', '2026-06-24', 'religious', 1],
            ['عاشورای حسینی', '1405-04-04', '2026-06-25', 'religious', 1],
            ['اربعین حسینی', '1405-05-13', '2026-08-04', 'religious', 1],
            ['رحلت حضرت رسول اکرم (ص) - شهادت امام حسن مجتبی (ع)', '1405-05-21', '2026-08-12', 'religious', 1],
            ['شهادت امام رضا (ع)', '1405-05-22', '2026-08-13', 'religious', 1],
            ['شهادت امام حسن عسکری (ع) - آغاز امامت حضرت ولیعصر (عج)', '1405-05-30', '2026-08-21', 'religious', 1],
            ['ولادت حضرت رسول اکرم (ص) - ولادت امام جعفر صادق (ع)', '1405-06-08', '2026-08-30', 'religious', 1],
            ['شهادت حضرت فاطمه زهرا (س)', '1405-08-22', '2026-11-13', 'religious', 1],
            ['شب یلدا - شب چلّه', '1405-09-30', '2026-12-21', 'cultural', 0],
            ['ولادت امام علی (ع) - روز پدر', '1405-10-02', '2026-12-23', 'religious', 1],
            ['مبعث حضرت رسول اکرم (ص)', '1405-10-16', '2027-01-06', 'religious', 1],
            ['ولادت حضرت قائم (عج)', '1405-11-04', '2027-01-24', 'religious', 1],
            ['پیروزی انقلاب اسلامی ایران', '1405-11-22', '2027-02-11', 'national', 1],
            ['شهادت حضرت علی (ع)', '1405-12-09', '2027-02-28', 'religious', 1],
            ['عید سعید فطر', '1405-12-19', '2027-03-10', 'religious', 1],
            ['تعطیل به مناسبت عید سعید فطر', '1405-12-20', '2027-03-11', 'religious', 1],
            ['چهارشنبه‌سوری - آخرین چهارشنبه سال', '1405-12-26', '2027-03-17', 'cultural', 0],
            ['روز ملی شدن صنعت نفت ایران', '1405-12-29', '2027-03-20', 'national', 1],
            ['عید نوروز - آغاز سال ۱۴۰۶', '1406-01-01', '2027-03-21', 'cultural', 1],
            ['عید نوروز', '1406-01-02', '2027-03-22', 'cultural', 1],
            ['عید نوروز', '1406-01-03', '2027-03-23', 'cultural', 1],
            ['عید نوروز', '1406-01-04', '2027-03-24', 'cultural', 1],
            ['روز جمهوری اسلامی ایران', '1406-01-12', '2027-04-01', 'national', 1],
            ['روز طبیعت (سیزده‌به‌در)', '1406-01-13', '2027-04-02', 'cultural', 1],
        ];
        $seedStmt = $pdo->prepare("INSERT IGNORE INTO occasions (id, title, jalali_date, gregorian_date, type, is_official_holiday) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($seed as $row) {
            $seedStmt->execute([md5($row[1] . $row[0]), $row[0], $row[1], $row[2], $row[3], $row[4]]);
        }
    }

    // Insert default settings row ONLY on first run (when empty)
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM kateb_settings WHERE id = 1");
    $stmt->execute();
    if ((int)$stmt->fetchColumn() === 0) {
        $pdo->prepare("INSERT INTO kateb_settings (id, sms_api_key, sms_pattern_code, sms_line_number, ai_api_url, ai_api_key, ai_models, zarinpal_merchant_id, zarinpal_sandbox)
            VALUES (1, '', '', '', 'https://ai.parspack.com/v1', '', 'qwen/qwen3-32b', '00000000-0000-0000-0000-000000000000', 1)")
            ->execute();
    }

    // Insert default admin user (phone: 09120000000, password: admin123)
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM kateb_users WHERE phone = '09120000000'");
    $stmt->execute();
    if ((int)$stmt->fetchColumn() === 0) {
        $adminId = 'a0000000-0000-0000-0000-000000000001';
        $pdo->prepare("INSERT INTO kateb_users (id, phone, full_name, is_admin, password_hash, coins)
            VALUES (?, '09120000000', 'مدیر سیستم', 1, ?, 100)")
            ->execute([$adminId, hash_password('admin123')]);
    } else {
        // Ensure existing admin stays admin
        $pdo->prepare("UPDATE kateb_users SET is_admin = 1 WHERE phone = '09120000000'")->execute();
    }
}

// ─── Settings (cached) ────────────────────────────────────────
function get_settings(): array {
    static $cached = null;
    if ($cached !== null) return $cached;
    $stmt = db()->prepare("SELECT * FROM kateb_settings WHERE id = 1");
    $stmt->execute();
    $row = $stmt->fetch();
    $cached = $row ?: [
        'sms_api_key' => '', 'sms_pattern_code' => '', 'sms_line_number' => '',
        'ai_api_url' => '', 'ai_api_key' => '', 'ai_models' => '',
        'zarinpal_merchant_id' => '', 'zarinpal_sandbox' => 1,
        'bazaar_client_id' => '', 'bazaar_client_secret' => '', 'bazaar_refresh_token' => '',
        'bazaar_access_token' => '', 'bazaar_access_token_expires' => null,
    ];
    return $cached;
}

// ─── Session / Auth ───────────────────────────────────────────
function get_session_user(): ?array {
    $token = get_auth_token();
    if (!$token) return null;
    $stmt = db()->prepare("SELECT user_id, expires_at FROM kateb_sessions WHERE token = ? LIMIT 1");
    $stmt->execute([$token]);
    $sess = $stmt->fetch();
    if (!$sess) return null;
    if (strtotime($sess['expires_at']) < time()) return null;
    $stmt = db()->prepare("SELECT id, phone, full_name, is_admin, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month, usage_cycle_start, plan_expires_at FROM kateb_users WHERE id = ? LIMIT 1");
    $stmt->execute([$sess['user_id']]);
    $user = $stmt->fetch();
    if (!$user) return null;
    return [
        'id' => $user['id'],
        'phone' => $user['phone'],
        'full_name' => $user['full_name'] ?? '',
        'is_admin' => (bool)($user['is_admin'] ?? 0),
        'coins' => (int)($user['coins'] ?? 0),
        'plan_type' => $user['plan_type'] ?? 'free',
        'ai_assistant_usage_this_month' => (int)($user['ai_assistant_usage_this_month'] ?? 0),
        'template_usage_this_month' => (int)($user['template_usage_this_month'] ?? 0),
        'usage_cycle_start' => $user['usage_cycle_start'] ?? null,
        'plan_expires_at' => $user['plan_expires_at'] ?? null,
    ];
}

function reset_usage_if_needed(array &$user): void {
    $cycleStart = $user['usage_cycle_start'] ?? null;
    $needsReset = false;
    if (!$cycleStart) {
        $needsReset = true;
    } else {
        $start = strtotime($cycleStart);
        $thirtyDays = 30 * 24 * 60 * 60;
        if (time() - $start >= $thirtyDays) $needsReset = true;
    }
    if ($needsReset) {
        db()->prepare("UPDATE kateb_users SET ai_assistant_usage_this_month = 0, template_usage_this_month = 0, usage_cycle_start = ? WHERE id = ?")
            ->execute([now_iso(), $user['id']]);
        $user['ai_assistant_usage_this_month'] = 0;
        $user['template_usage_this_month'] = 0;
    }
}

function create_session(string $userId, string $phone): string {
    $token = gen_token();
    $expires = date('Y-m-d H:i:s', time() + 30 * 86400);
    db()->prepare("INSERT INTO kateb_sessions (token, user_id, phone, expires_at) VALUES (?, ?, ?, ?)")
        ->execute([$token, $userId, $phone, $expires]);
    return $token;
}

// ─── SMS ──────────────────────────────────────────────────────
function send_sms(string $phone, string $code): bool {
    $s = get_settings();
    if (!$s['sms_api_key'] || !$s['sms_pattern_code']) return false;
    $payload = json_encode([
        'code' => $s['sms_pattern_code'],
        'attributes' => ['code' => $code],
        'recipient' => $phone,
        'line_number' => $s['sms_line_number'],
        'number_format' => 'english',
    ]);
    $ch = curl_init('https://api.iranpayamak.com/ws/v1/sms/pattern');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Api-Key: ' . $s['sms_api_key'],
        ],
    ]);
    curl_exec($ch);
    $ok = curl_getinfo($ch, CURLINFO_HTTP_CODE) < 400;
    curl_close($ch);
    return $ok;
}

// ─── JSON field helpers ───────────────────────────────────────
function j_encode($v): string {
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function j_decode(string $v, $default = null) {
    $d = json_decode($v, true);
    return $d !== null ? $d : ($default ?? []);
}

// ─── HTTP fetch helper ────────────────────────────────────────
function http_post_json(string $url, array $body, array $headers = []): array {
    $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
    $allHeaders = array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers);

    // Method 1: cURL with forced HTTP/1.1
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 55,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_ENCODING => 'gzip, deflate',
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_HTTPHEADER => $allHeaders,
        ]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($resp !== false) {
            return ['body' => json_decode($resp, true), 'code' => (int)$code, 'raw' => $resp, 'error' => ''];
        }
        // cURL failed — try fallback below
    }

    // Method 2: file_get_contents with stream context (no HTTP/2 involved)
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $allHeaders),
            'content' => $payload,
            'timeout' => 55,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp !== false) {
        $code = 200;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $code = (int)$m[1];
        }
        return ['body' => json_decode($resp, true), 'code' => $code, 'raw' => $resp, 'error' => ''];
    }

    return ['body' => null, 'code' => 0, 'raw' => '', 'error' => 'هم cURL و هم file_get_contents ناموفق بودند'];
}

// ─── Main ─────────────────────────────────────────────────────
try {
    init_tables();
    $act = action();
    $b = body();

    // ─── AI Proxy (action via query param) ────────────────────
    if ($act === 'ai_proxy') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $s = get_settings();
        $aiUrl = rtrim($s['ai_api_url'] ?: 'https://ai.parspack.com/v1', '/');
        $aiKey = $s['ai_api_key'] ?: '';
        $defaultModel = trim(explode(',', $s['ai_models'] ?? '')[0] ?? 'qwen/qwen3-32b');
        $model = $b['model'] ?? $defaultModel;
        $messages = $b['messages'] ?? [];
        $temperature = $b['temperature'] ?? 0.7;
        $maxTokens = $b['max_tokens'] ?? 2000;

        $endpoint = $aiUrl . '/chat/completions';
        $payload = [
            'model' => $model,
            'messages' => $messages,
            'temperature' => $temperature,
            'max_tokens' => (int)$maxTokens,
        ];

        $result = http_post_json($endpoint, $payload, [
            "Authorization: Bearer {$aiKey}",
        ]);
        if ($result['error']) {
            json_error('خطا در ارتباط با سرور هوش مصنوعی: ' . $result['error'], 502);
        }
        if ($result['code'] >= 400) {
            $detail = substr($result['raw'] ?? '', 0, 500);
            json_error("AI API error {$result['code']}: {$detail}", 502);
        }
        if ($result['body'] === null) {
            json_error('پاسخ هوش مصنوعی خالی است', 502);
        }

        // Some Parspack reasoning models return content in reasoning field instead of content
        $body = $result['body'];
        if (isset($body['choices'][0]['message'])) {
            $msg = $body['choices'][0]['message'];
            if (empty($msg['content']) && !empty($msg['reasoning'])) {
                $body['choices'][0]['message']['content'] = $msg['reasoning'];
            }
        }
        json_out($body);
    }

    // ─── AI Test (admin only) ────────────────────────────────
    if ($act === 'ai_test') {
        $user = get_session_user();
        if (!$user || !$user['is_admin']) json_error('دسترسی غیرمجاز', 403);
        $s = get_settings();
        $aiUrl = rtrim($s['ai_api_url'] ?: 'https://ai.parspack.com/v1', '/');
        $aiKey = $s['ai_api_key'] ?: '';
        $defaultModel = trim(explode(',', $s['ai_models'] ?? '')[0] ?? 'qwen/qwen3-32b');

        $testPrompt = 'سلام! لطفاً یک جمله کوتاه و مفید بگو.';
        $endpoint = $aiUrl . '/chat/completions';
        $payload = [
            'model' => $defaultModel,
            'messages' => [['role' => 'user', 'content' => $testPrompt]],
            'temperature' => 0.7,
            'max_tokens' => 200,
        ];

        $result = http_post_json($endpoint, $payload, [
            "Authorization: Bearer {$aiKey}",
        ]);

        if ($result['error']) {
            json_out(['success' => false, 'message' => 'خطا در اتصال: ' . $result['error']]);
        }
        if ($result['code'] >= 400) {
            $detail = substr($result['raw'] ?? '', 0, 300);
            json_out(['success' => false, 'message' => "خطای API ({$result['code']}): {$detail}"]);
        }
        if ($result['body'] === null) {
            json_out(['success' => false, 'message' => 'پاسخ خالی دریافت شد']);
        }

        // Extract response text, handling reasoning models
        $text = '';
        $msg = $result['body']['choices'][0]['message'] ?? null;
        if ($msg) {
            $text = $msg['content'] ?? '';
            if (!$text && !empty($msg['reasoning'])) $text = $msg['reasoning'];
        }

        if ($text) {
            json_out(['success' => true, 'message' => 'اتصال موفق!', 'response' => $text]);
        } else {
            json_out(['success' => false, 'message' => 'پاسخی از هوش مصنوعی دریافت نشد']);
        }
    }

    // ─── Payment Callback (public, no auth — called by Zarinpal redirect) ──
    if ($act === 'payment_callback') {
        $authority = (string)($b['authority'] ?? '');
        $statusParam = (string)($b['status'] ?? '');
        if (!$authority) json_error('Authority یافت نشد', 400);
        if ($statusParam !== 'OK') json_out(['success' => false, 'status' => 'failed', 'message' => 'پرداخت ناموفق']);

        // Check coin_orders first
        $stmt = db()->prepare("SELECT * FROM coin_orders WHERE authority = ? LIMIT 1");
        $stmt->execute([$authority]);
        $order = $stmt->fetch();
        if ($order) {
            if ($order['status'] === 'paid') json_out(['success' => true, 'status' => 'paid', 'order_id' => $order['id'], 'already_paid' => true, 'coins' => (int)$order['coins']]);
            $s = get_settings();
            $merchantId = $s['zarinpal_merchant_id'] ?: '00000000-0000-0000-0000-000000000000';
            $sandbox = (bool)($s['zarinpal_sandbox'] ?? true);
            $verifyUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json' : 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
            $result = http_post_json($verifyUrl, ['merchant_id' => $merchantId, 'amount' => (int)$order['amount_toman'], 'authority' => $authority]);
            $refId = $result['body']['data']['ref_id'] ?? null;
            $code = $result['body']['data']['code'] ?? null;
            if ($code == 100 || $code == 101 || $refId) {
                db()->prepare("UPDATE coin_orders SET status='paid', ref_id=?, paid_at=? WHERE id=?")->execute([(string)$refId, now_iso(), $order['id']]);
                $stmt = db()->prepare("SELECT coins FROM kateb_users WHERE id = ? LIMIT 1");
                $stmt->execute([$order['user_id']]);
                $newCoins = (int)$stmt->fetchColumn() + (int)$order['coins'];
                db()->prepare("UPDATE kateb_users SET coins = ? WHERE id = ?")->execute([$newCoins, $order['user_id']]);
                json_out(['success' => true, 'status' => 'paid', 'order_id' => $order['id'], 'coins' => $newCoins, 'added' => (int)$order['coins'], 'ref_id' => $refId]);
            }
            db()->prepare("UPDATE coin_orders SET status='failed' WHERE id=?")->execute([$order['id']]);
            json_out(['success' => false, 'status' => 'failed', 'order_id' => $order['id'], 'message' => 'تأیید پرداخت ناموفق']);
        }

        // Check plan_orders
        $stmt = db()->prepare("SELECT * FROM plan_orders WHERE authority = ? LIMIT 1");
        $stmt->execute([$authority]);
        $planOrder = $stmt->fetch();
        if ($planOrder) {
            if ($planOrder['status'] === 'paid') json_out(['success' => true, 'status' => 'paid', 'order_id' => $planOrder['id'], 'already_paid' => true]);
            $s = get_settings();
            $merchantId = $s['zarinpal_merchant_id'] ?: '00000000-0000-0000-0000-000000000000';
            $sandbox = (bool)($s['zarinpal_sandbox'] ?? true);
            $verifyUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json' : 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
            $result = http_post_json($verifyUrl, ['merchant_id' => $merchantId, 'amount' => (int)$planOrder['amount_toman'], 'authority' => $authority]);
            $refId = $result['body']['data']['ref_id'] ?? null;
            $code = $result['body']['data']['code'] ?? null;
            if ($code == 100 || $code == 101 || $refId) {
                $durationMonths = (int)($planOrder['duration_months'] ?? 1);
                db()->prepare("UPDATE plan_orders SET status='paid', ref_id=?, paid_at=? WHERE id=?")->execute([(string)$refId, now_iso(), $planOrder['id']]);
                $expiryDate = date('Y-m-d H:i:s', strtotime("+{$durationMonths} months"));
                db()->prepare("UPDATE kateb_users SET plan_type=?, ai_assistant_usage_this_month=0, template_usage_this_month=0, usage_cycle_start=?, plan_expires_at=? WHERE id=?")
                    ->execute([$planOrder['plan_id'], now_iso(), $expiryDate, $planOrder['user_id']]);
                json_out(['success' => true, 'status' => 'paid', 'order_id' => $planOrder['id'], 'ref_id' => $refId, 'plan_id' => $planOrder['plan_id']]);
            }
            db()->prepare("UPDATE plan_orders SET status='failed' WHERE id=?")->execute([$planOrder['id']]);
            json_out(['success' => false, 'status' => 'failed', 'order_id' => $planOrder['id'], 'message' => 'تأیید پرداخت ناموفق']);
        }

        json_out(['success' => false, 'status' => 'failed', 'message' => 'سفارش یافت نشد']);
    }

    // ─── Payment Status (public, no auth — called from payment result page) ──
    if ($act === 'payment_status') {
        $orderId = (string)($b['order_id'] ?? '');
        if (!$orderId) json_error('شناسه سفارش یافت نشد', 400);
        // Check coin_orders
        $stmt = db()->prepare("SELECT * FROM coin_orders WHERE id = ? LIMIT 1");
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if ($order) {
            json_out(['success' => $order['status'] === 'paid', 'status' => $order['status'], 'order_id' => $order['id'], 'coins' => (int)$order['coins'], 'ref_id' => $order['ref_id'] ?? '']);
        }
        // Check plan_orders
        $stmt = db()->prepare("SELECT * FROM plan_orders WHERE id = ? LIMIT 1");
        $stmt->execute([$orderId]);
        $planOrder = $stmt->fetch();
        if ($planOrder) {
            json_out(['success' => $planOrder['status'] === 'paid', 'status' => $planOrder['status'], 'order_id' => $planOrder['id'], 'plan_id' => $planOrder['plan_id'], 'ref_id' => $planOrder['ref_id'] ?? '']);
        }
        json_error('سفارش یافت نشد', 404);
    }

    // ─── Ping (health check) ─────────────────────────────────
    if ($act === 'ping') {
        json_out(['success' => true, 'message' => 'pong']);
    }

    // ─── OTP: Send ────────────────────────────────────────────
    if ($act === 'otp_send') {
        $phone = (string)($b['phone'] ?? '');
        if (!preg_match('/^09\d{9}$/', $phone)) json_error('شماره موبایل نامعتبر', 400);
        $stmt = db()->prepare("SELECT COUNT(*) FROM kateb_otp_codes WHERE phone = ? AND created_at > ?");
        $stmt->execute([$phone, date('Y-m-d H:i:s', time() - 600)]);
        if ((int)$stmt->fetchColumn() >= 5) json_error('تعداد درخواست زیاد است. کمی صبر کنید.', 429);
        $stmt = db()->prepare("SELECT id, phone, full_name, is_admin, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month FROM kateb_users WHERE phone = ? LIMIT 1");
        $stmt->execute([$phone]);
        $isExisting = (bool)$stmt->fetch();
        $code = gen_otp();
        $expires = date('Y-m-d H:i:s', time() + 120);
        db()->prepare("INSERT INTO kateb_otp_codes (id, phone, code, expires_at, used) VALUES (?, ?, ?, ?, 0)")
            ->execute([gen_uuid(), $phone, $code, $expires]);
        $smsSent = send_sms($phone, $code);
        json_out(['success' => true, 'message' => 'کد تایید ارسال شد', 'sms_sent' => $smsSent, 'is_existing_user' => $isExisting, 'code' => $smsSent ? null : $code]);
    }

    // ─── OTP: Verify ──────────────────────────────────────────
    if ($act === 'otp_verify') {
        $phone = (string)($b['phone'] ?? '');
        $code = (string)($b['code'] ?? '');
        $fullName = (string)($b['full_name'] ?? '');
        $password = (string)($b['password'] ?? '');
        if (!preg_match('/^09\d{9}$/', $phone)) json_error('شماره موبایل نامعتبر', 400);
        $stmt = db()->prepare("SELECT id, used, expires_at FROM kateb_otp_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$phone, $code, now_iso()]);
        $otp = $stmt->fetch();
        if (!$otp) json_error('کد تایید اشتباه یا منقضی شده', 400);
        db()->prepare("UPDATE kateb_otp_codes SET used = 1 WHERE id = ?")->execute([$otp['id']]);

        $stmt = db()->prepare("SELECT id, phone, full_name, is_admin, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month FROM kateb_users WHERE phone = ? LIMIT 1");
        $stmt->execute([$phone]);
        $user = $stmt->fetch();
        $isNewUser = false;
        if (!$user) {
            if (!trim($fullName)) json_error('نام و نام خانوادگی الزامی است', 400);
            if (strlen($password) < 4) json_error('رمز عبور باید حداقل ۴ کاراکتر باشد', 400);
            $isNewUser = true;
            $newId = gen_uuid();
            $hash = hash_password($password);
            db()->prepare("INSERT INTO kateb_users (id, phone, full_name, password_hash, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month, usage_cycle_start) VALUES (?, ?, ?, ?, 10, 'free', 0, 0, ?)")
                ->execute([$newId, $phone, $fullName, $hash, now_iso()]);
            $user = ['id' => $newId, 'phone' => $phone, 'full_name' => $fullName, 'is_admin' => 0, 'coins' => 10, 'plan_type' => 'free', 'ai_assistant_usage_this_month' => 0, 'template_usage_this_month' => 0];
        } else {
            if ($fullName && !$user['full_name']) {
                db()->prepare("UPDATE kateb_users SET full_name = ? WHERE id = ?")->execute([$fullName, $user['id']]);
                $user['full_name'] = $fullName;
            }
        }
        $token = create_session($user['id'], $phone);
        json_out([
            'success' => true,
            'session' => [
                'access_token' => $token,
                'user' => [
                    'id' => $user['id'], 'phone' => $user['phone'],
                    'full_name' => $user['full_name'] ?? '',
                    'is_admin' => (bool)($user['is_admin'] ?? 0),
                    'coins' => (int)($user['coins'] ?? 10),
                    'plan_type' => $user['plan_type'] ?? 'free',
                    'ai_assistant_usage_this_month' => (int)($user['ai_assistant_usage_this_month'] ?? 0),
                    'template_usage_this_month' => (int)($user['template_usage_this_month'] ?? 0),
                ],
            ],
            'is_new_user' => $isNewUser,
        ]);
    }

    // ─── Password Login ───────────────────────────────────────
    if ($act === 'password_login') {
        $phone = (string)($b['phone'] ?? '');
        $password = (string)($b['password'] ?? '');
        if (!preg_match('/^09\d{9}$/', $phone)) json_error('شماره موبایل نامعتبر', 400);
        if (!$password) json_error('رمز عبور را وارد کنید', 400);
        $stmt = db()->prepare("SELECT id, phone, full_name, password_hash, is_admin, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month FROM kateb_users WHERE phone = ? LIMIT 1");
        $stmt->execute([$phone]);
        $user = $stmt->fetch();
        if (!$user || !$user['password_hash']) json_error('شماره موبایل یا رمز عبور اشتباه است', 401);
        $hashed = hash_password($password);
        if ($hashed !== $user['password_hash'] && $password !== $user['password_hash']) {
            json_error('شماره موبایل یا رمز عبور اشتباه است', 401);
        }
        $token = create_session($user['id'], $user['phone']);
        json_out([
            'success' => true,
            'session' => [
                'access_token' => $token,
                'user' => [
                    'id' => $user['id'], 'phone' => $user['phone'],
                    'full_name' => $user['full_name'] ?? '',
                    'is_admin' => (bool)($user['is_admin'] ?? 0),
                    'coins' => (int)($user['coins'] ?? 10),
                    'plan_type' => $user['plan_type'] ?? 'free',
                    'ai_assistant_usage_this_month' => (int)($user['ai_assistant_usage_this_month'] ?? 0),
                    'template_usage_this_month' => (int)($user['template_usage_this_month'] ?? 0),
                ],
            ],
        ]);
    }

    // ─── Auth: me ─────────────────────────────────────────────
    if ($act === 'me') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        reset_usage_if_needed($user);
        json_out(['user' => $user]);
    }

    // ─── Auth: signout ────────────────────────────────────────
    if ($act === 'signout') {
        $token = get_auth_token();
        if ($token) db()->prepare("DELETE FROM kateb_sessions WHERE token = ?")->execute([$token]);
        json_out(['success' => true]);
    }

    // ─── Auth: set password ───────────────────────────────────
    if ($act === 'set_password') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $password = (string)($b['password'] ?? '');
        if (strlen($password) < 4) json_error('رمز عبور باید حداقل ۴ کاراکتر باشد', 400);
        db()->prepare("UPDATE kateb_users SET password_hash = ? WHERE id = ?")
            ->execute([hash_password($password), $user['id']]);
        json_out(['success' => true]);
    }

    // ─── Auth: update account ─────────────────────────────────
    if ($act === 'update_account') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $fullName = trim((string)($b['full_name'] ?? ''));
        if (!$fullName) json_error('نام نمی‌تواند خالی باشد', 400);
        db()->prepare("UPDATE kateb_users SET full_name = ? WHERE id = ?")->execute([$fullName, $user['id']]);
        json_out(['success' => true, 'user' => array_merge($user, ['full_name' => $fullName])]);
    }

    // ─── Require auth for everything below ────────────────────
    $user = get_session_user();
    if (!$user) json_error('احراز هویت نشده', 401);
    $uid = $user['id'];

    // ─── Usage: increment AI assistant ───────────────────────
    if ($act === 'increment_ai_usage') {
        $newCount = (int)$user['ai_assistant_usage_this_month'] + 1;
        db()->prepare("UPDATE kateb_users SET ai_assistant_usage_this_month = ? WHERE id = ?")->execute([$newCount, $uid]);
        json_out(['success' => true, 'ai_assistant_usage_this_month' => $newCount]);
    }

    // ─── Usage: increment template ──────────────────────────
    if ($act === 'increment_template_usage') {
        $newCount = (int)$user['template_usage_this_month'] + 1;
        db()->prepare("UPDATE kateb_users SET template_usage_this_month = ? WHERE id = ?")->execute([$newCount, $uid]);
        json_out(['success' => true, 'template_usage_this_month' => $newCount]);
    }

    // ─── Usage: get current ───────────────────────────────────
    if ($act === 'usage_get') {
        json_out([
            'plan_type' => $user['plan_type'] ?? 'free',
            'ai_assistant_usage_this_month' => (int)($user['ai_assistant_usage_this_month'] ?? 0),
            'template_usage_this_month' => (int)($user['template_usage_this_month'] ?? 0),
            'expires_at' => $user['plan_expires_at'] ?? null,
            'cycle_start' => $user['usage_cycle_start'] ?? null,
        ]);
    }

    // ─── Profiles ─────────────────────────────────────────────
    if ($act === 'profiles_list') {
        $stmt = db()->prepare("SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC");
        $stmt->execute([$uid]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) $r['extra_fields'] = j_decode($r['extra_fields'], []);
        json_out(['data' => $rows]);
    }
    if ($act === 'profiles_create') {
        $id = gen_uuid();
        db()->prepare("INSERT INTO profiles (id, user_id, full_name, national_id, employee_code, organization, job_title, extra_fields, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$id, $uid, $b['full_name'] ?? '', $b['national_id'] ?? '', $b['employee_code'] ?? '', $b['organization'] ?? '', $b['job_title'] ?? '', j_encode($b['extra_fields'] ?? []), ($b['is_default'] ?? false) ? 1 : 0]);
        json_out(['data' => ['id' => $id]]);
    }
    if ($act === 'profiles_update') {
        $id = $b['id'] ?? '';
        $fields = [];
        $vals = [];
        foreach (['full_name', 'national_id', 'employee_code', 'organization', 'job_title'] as $f) {
            if (array_key_exists($f, $b)) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
        }
        if (array_key_exists('extra_fields', $b)) { $fields[] = 'extra_fields = ?'; $vals[] = j_encode($b['extra_fields']); }
        if (array_key_exists('is_default', $b)) { $fields[] = 'is_default = ?'; $vals[] = $b['is_default'] ? 1 : 0; }
        if ($fields) {
            $vals[] = $id; $vals[] = $uid;
            db()->prepare("UPDATE profiles SET " . implode(', ', $fields) . " WHERE id = ? AND user_id = ?")->execute($vals);
        }
        json_out(['success' => true]);
    }
    if ($act === 'profiles_delete') {
        db()->prepare("DELETE FROM profiles WHERE id = ? AND user_id = ?")->execute([$b['id'] ?? '', $uid]);
        json_out(['success' => true]);
    }

    // ─── Letters ──────────────────────────────────────────────
    if ($act === 'letters_list') {
        $stmt = db()->prepare("SELECT * FROM generated_letters WHERE user_id = ? ORDER BY created_at DESC");
        $stmt->execute([$uid]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) $r['field_values'] = j_decode($r['field_values'], []);
        json_out(['data' => $rows]);
    }
    if ($act === 'letters_create') {
        $id = gen_uuid();
        db()->prepare("INSERT INTO generated_letters (id, user_id, letter_type_id, template_id, template_title, profile_id, title, content, field_values, status, quality_score, quality_feedback) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$id, $uid, $b['letter_type_id'] ?? '', $b['template_id'] ?? '', $b['template_title'] ?? '', $b['profile_id'] ?? null, $b['title'] ?? '', $b['content'] ?? '', j_encode($b['field_values'] ?? []), $b['status'] ?? 'draft', $b['quality_score'] ?? null, $b['quality_feedback'] ?? null]);
        json_out(['data' => ['id' => $id]]);
    }
    if ($act === 'letters_update') {
        $fields = []; $vals = [];
        foreach (['content', 'title', 'status'] as $f) {
            if (array_key_exists($f, $b)) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
        }
        if (array_key_exists('quality_score', $b)) { $fields[] = 'quality_score = ?'; $vals[] = $b['quality_score']; }
        if (array_key_exists('quality_feedback', $b)) { $fields[] = 'quality_feedback = ?'; $vals[] = $b['quality_feedback']; }
        if (array_key_exists('user_rating', $b)) { $fields[] = 'user_rating = ?'; $vals[] = max(0, min(5, (int)$b['user_rating'])); }
        $fields[] = 'updated_at = ?'; $vals[] = now_iso();
        $vals[] = $b['id'] ?? ''; $vals[] = $uid;
        db()->prepare("UPDATE generated_letters SET " . implode(', ', $fields) . " WHERE id = ? AND user_id = ?")->execute($vals);
        json_out(['success' => true]);
    }
    if ($act === 'letters_rate') {
        $letterId = (string)($b['id'] ?? '');
        $rating = max(1, min(5, (int)($b['rating'] ?? 0)));
        if (!$letterId || $rating < 1) json_error('مقادیر نامعتبر', 400);
        db()->prepare("UPDATE generated_letters SET user_rating = ?, updated_at = ? WHERE id = ? AND user_id = ?")
            ->execute([$rating, now_iso(), $letterId, $uid]);
        json_out(['success' => true, 'rating' => $rating]);
    }
    if ($act === 'letters_delete') {
        db()->prepare("DELETE FROM generated_letters WHERE id = ? AND user_id = ?")->execute([$b['id'] ?? '', $uid]);
        json_out(['success' => true]);
    }

    // ─── Drafts ───────────────────────────────────────────────
    if ($act === 'drafts_list') {
        $stmt = db()->prepare("SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC");
        $stmt->execute([$uid]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['letter_type'] = j_decode($r['letter_type'], []);
            $r['discovered_letter'] = $r['discovered_letter'] ? j_decode($r['discovered_letter'], null) : null;
            $r['field_values'] = j_decode($r['field_values'], []);
            $r['chat_messages'] = j_decode($r['chat_messages'], []);
        }
        json_out(['data' => $rows]);
    }
    if ($act === 'drafts_save') {
        $id = $b['id'] ?? '';
        $payload = [
            $b['title'] ?? '', j_encode($b['letter_type'] ?? []),
            $b['discovered_letter'] ? j_encode($b['discovered_letter']) : null,
            j_encode($b['field_values'] ?? []), j_encode($b['chat_messages'] ?? []),
            (int)($b['step'] ?? 0), $b['phase'] ?? 'chat',
            ($b['use_profile'] ?? true) ? 1 : 0, ($b['include_optional'] ?? true) ? 1 : 0,
            now_iso(),
        ];
        if ($id) {
            db()->prepare("UPDATE drafts SET title=?, letter_type=?, discovered_letter=?, field_values=?, chat_messages=?, step=?, phase=?, use_profile=?, include_optional=?, updated_at=? WHERE id=? AND user_id=?")
                ->execute(array_merge($payload, [$id, $uid]));
            json_out(['data' => ['id' => $id]]);
        } else {
            $newId = gen_uuid();
            db()->prepare("INSERT INTO drafts (id, user_id, title, letter_type, discovered_letter, field_values, chat_messages, step, phase, use_profile, include_optional, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute(array_merge([$newId, $uid], $payload));
            json_out(['data' => ['id' => $newId]]);
        }
    }
    if ($act === 'drafts_delete') {
        db()->prepare("DELETE FROM drafts WHERE id = ? AND user_id = ?")->execute([$b['id'] ?? '', $uid]);
        json_out(['success' => true]);
    }

    // ─── Templates ────────────────────────────────────────────
    if ($act === 'templates_list') {
        $search = trim((string)($b['search'] ?? ''));
        $includePending = (bool)($b['include_pending'] ?? false);
        $sql = "SELECT * FROM templates";
        $conds = []; $vals = [];
        if (!$user['is_admin'] || !$includePending) { $conds[] = "is_approved = 1"; }
        if ($search) {
            $conds[] = "(title LIKE ? OR raw_request LIKE ? OR creator_name LIKE ?)";
            $like = "%$search%";
            $vals[] = $like; $vals[] = $like; $vals[] = $like;
        }
        if ($conds) $sql .= " WHERE " . implode(' AND ', $conds);
        $sql .= " ORDER BY created_at DESC";
        $stmt = db()->prepare($sql);
        $stmt->execute($vals);
        $templates = $stmt->fetchAll();
        // Fetch ratings
        $ratingsMap = [];
        if (count($templates) > 0) {
            $ids = array_column($templates, 'id');
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = db()->prepare("SELECT template_id, user_id, rating FROM template_ratings WHERE template_id IN ($placeholders)");
            $stmt->execute($ids);
            foreach ($stmt->fetchAll() as $r) {
                if (!isset($ratingsMap[$r['template_id']])) $ratingsMap[$r['template_id']] = ['sum' => 0, 'count' => 0, 'my' => 0];
                $ratingsMap[$r['template_id']]['sum'] += (int)$r['rating'];
                $ratingsMap[$r['template_id']]['count']++;
                if ($r['user_id'] === $uid) $ratingsMap[$r['template_id']]['my'] = (int)$r['rating'];
            }
        }
        $enriched = [];
        foreach ($templates as $t) {
            $rm = $ratingsMap[$t['id']] ?? ['sum' => 0, 'count' => 0, 'my' => 0];
            $t['letter_type'] = j_decode($t['letter_type'], []);
            $t['rating'] = $rm['count'] > 0 ? round($rm['sum'] / $rm['count'], 1) : 0;
            $t['rating_count'] = $rm['count'];
            $t['my_rating'] = $rm['my'];
            $enriched[] = $t;
        }
        json_out(['data' => $enriched, 'total' => count($enriched)]);
    }
    if ($act === 'templates_create') {
        $id = gen_uuid();
        $creatorName = $user['full_name'] ?? '';
        db()->prepare("INSERT INTO templates (id, user_id, letter_type, title, raw_request, rating, rating_count, creator_name, sample_content, source_template_id, is_approved) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0)")
            ->execute([$id, $uid, j_encode($b['letter_type'] ?? []), $b['title'] ?? '', $b['raw_request'] ?? '', $creatorName, $b['sample_content'] ?? '', $b['source_template_id'] ?? null]);
        json_out(['data' => ['id' => $id]]);
    }
    if ($act === 'templates_rate' || $act === 'templates_update_rating') {
        $templateId = (string)($b['template_id'] ?? '');
        $rating = max(1, min(5, (int)($b['rating'] ?? 0)));
        if (!$templateId || $rating < 1) json_error('Invalid input', 400);
        $stmt = db()->prepare("SELECT id FROM template_ratings WHERE template_id = ? AND user_id = ? LIMIT 1");
        $stmt->execute([$templateId, $uid]);
        $existing = $stmt->fetch();
        if ($existing) {
            db()->prepare("UPDATE template_ratings SET rating = ? WHERE id = ?")->execute([$rating, $existing['id']]);
        } else {
            db()->prepare("INSERT INTO template_ratings (id, template_id, user_id, rating) VALUES (?, ?, ?, ?)")
                ->execute([gen_uuid(), $templateId, $uid, $rating]);
        }
        $stmt = db()->prepare("SELECT rating FROM template_ratings WHERE template_id = ?");
        $stmt->execute([$templateId]);
        $all = $stmt->fetchAll();
        $rc = count($all);
        $avg = $rc > 0 ? round(array_sum(array_column($all, 'rating')) / $rc, 1) : 0;
        json_out(['data' => ['avg' => $avg, 'count' => $rc, 'my_rating' => $rating]]);
    }
    if ($act === 'templates_delete') {
        db()->prepare("DELETE FROM templates WHERE id = ? AND user_id = ?")->execute([$b['id'] ?? '', $uid]);
        json_out(['success' => true]);
    }

    // ─── Coins ────────────────────────────────────────────────
    if ($act === 'coins_balance') {
        $stmt = db()->prepare("SELECT coins FROM kateb_users WHERE id = ? LIMIT 1");
        $stmt->execute([$uid]);
        json_out(['coins' => (int)($stmt->fetchColumn() ?? 0)]);
    }
    if ($act === 'coins_deduct') {
        $amount = max(1, (int)($b['amount'] ?? 0));
        $reason = (string)($b['reason'] ?? '');
        $stmt = db()->prepare("SELECT coins FROM kateb_users WHERE id = ? LIMIT 1");
        $stmt->execute([$uid]);
        $current = (int)$stmt->fetchColumn();
        if ($current < $amount) json_error('سکه کافی ندارید', 402);
        $newCoins = $current - $amount;
        db()->prepare("UPDATE kateb_users SET coins = ? WHERE id = ?")->execute([$newCoins, $uid]);
        json_out(['success' => true, 'coins' => $newCoins, 'reason' => $reason]);
    }

    // ─── Discovery Usage ──────────────────────────────────────
    if ($act === 'discovery_count') {
        $stmt = db()->prepare("SELECT COUNT(*) FROM discovery_usage WHERE user_id = ?");
        $stmt->execute([$uid]);
        json_out(['count' => (int)$stmt->fetchColumn()]);
    }
    if ($act === 'discovery_record') {
        $stmt = db()->prepare("SELECT coins FROM kateb_users WHERE id = ? LIMIT 1");
        $stmt->execute([$uid]);
        $current = (int)$stmt->fetchColumn();
        if ($current < 5) json_error('سکه کافی ندارید', 402);
        $newCoins = $current - 5;
        db()->prepare("UPDATE kateb_users SET coins = ? WHERE id = ?")->execute([$newCoins, $uid]);
        db()->prepare("INSERT INTO discovery_usage (id, user_id, query_text) VALUES (?, ?, ?)")
            ->execute([gen_uuid(), $uid, $b['query_text'] ?? '']);
        json_out(['success' => true, 'coins' => $newCoins]);
    }

    // ─── Zarinpal Payments ────────────────────────────────────
    if ($act === 'coin_packages') {
        json_out(['data' => [
            ['id' => 'small', 'coins' => 10, 'price' => 50000, 'label' => '۱۰ سکه — ۵۰٬۰۰۰ تومان'],
            ['id' => 'medium', 'coins' => 20, 'price' => 100000, 'label' => '۲۰ سکه — ۱۰۰٬۰۰۰ تومان', 'popular' => true],
            ['id' => 'large', 'coins' => 40, 'price' => 200000, 'label' => '۴۰ سکه — ۲۰۰٬۰۰۰ تومان'],
            ['id' => 'xlarge', 'coins' => 90, 'price' => 450000, 'label' => '۹۰ سکه — ۴۵۰٬۰۰۰ تومان'],
        ]]);
    }
    if ($act === 'zarinpal_request') {
        $pkgId = (string)($b['package_id'] ?? '');
        $s = get_settings();
        $merchantId = $s['zarinpal_merchant_id'] ?: '00000000-0000-0000-0000-000000000000';
        $sandbox = (bool)($s['zarinpal_sandbox'] ?? true);
        $packages = ['small' => [10, 50000], 'medium' => [20, 100000], 'large' => [40, 200000], 'xlarge' => [90, 450000]];
        if (!isset($packages[$pkgId])) json_error('بسته نامعتبر', 400);
        [$coins, $price] = $packages[$pkgId];
        $callbackUrl = (string)($b['callback_url'] ?? '');
        // Reject localhost / insecure callback URLs — always use production HTTPS
        if ($callbackUrl === '' || preg_match('#^https?://(localhost|127\.0\.0\.1|10\.|192\.168\.)#i', $callbackUrl)) {
            $callbackUrl = 'https://app.kateb.site/payment/callback';
        }
        $baseUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json' : 'https://payment.zarinpal.com/pg/v4/payment/request.json';
        $gatewayUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/StartPay/' : 'https://payment.zarinpal.com/pg/StartPay/';
        $result = http_post_json($baseUrl, [
            'merchant_id' => $merchantId, 'amount' => $price, 'currency' => 'IRT',
            'description' => "خرید {$coins} سکه - کاتب", 'callback_url' => $callbackUrl,
        ]);
        $authority = $result['body']['data']['authority'] ?? null;
        if (!$authority) {
            $errMsg = $result['body']['errors'][0]['message'] ?? 'خطا در ارتباط با زرین‌پال';
            json_error($errMsg, 500);
        }
        $orderId = gen_uuid();
        db()->prepare("INSERT INTO coin_orders (id, user_id, amount_toman, coins, status, authority) VALUES (?, ?, ?, ?, 'pending', ?)")
            ->execute([$orderId, $uid, $price, $coins, $authority]);
        json_out(['data' => ['authority' => $authority, 'redirect_url' => $gatewayUrl . $authority, 'order_id' => $orderId]]);
    }
    if ($act === 'zarinpal_verify') {
        $authority = (string)($b['authority'] ?? '');
        $statusParam = (string)($b['status'] ?? '');
        if ($statusParam !== 'OK') json_error('پرداخت ناموفق', 400);
        $stmt = db()->prepare("SELECT * FROM coin_orders WHERE authority = ? AND user_id = ? LIMIT 1");
        $stmt->execute([$authority, $uid]);
        $order = $stmt->fetch();
        if (!$order) json_error('سفارش یافت نشد', 404);
        if ($order['status'] === 'paid') json_out(['success' => true, 'already_paid' => true, 'coins' => (int)$order['coins']]);
        $s = get_settings();
        $merchantId = $s['zarinpal_merchant_id'] ?: '00000000-0000-0000-0000-000000000000';
        $sandbox = (bool)($s['zarinpal_sandbox'] ?? true);
        $verifyUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json' : 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
        $result = http_post_json($verifyUrl, ['merchant_id' => $merchantId, 'amount' => (int)$order['amount_toman'], 'authority' => $authority]);
        $refId = $result['body']['data']['ref_id'] ?? null;
        $code = $result['body']['data']['code'] ?? null;
        if ($code == 100 || $code == 101 || $refId) {
            db()->prepare("UPDATE coin_orders SET status='paid', ref_id=?, paid_at=? WHERE id=?")
                ->execute([(string)$refId, now_iso(), $order['id']]);
            $stmt = db()->prepare("SELECT coins FROM kateb_users WHERE id = ? LIMIT 1");
            $stmt->execute([$uid]);
            $newCoins = (int)$stmt->fetchColumn() + (int)$order['coins'];
            db()->prepare("UPDATE kateb_users SET coins = ? WHERE id = ?")->execute([$newCoins, $uid]);
            json_out(['success' => true, 'coins' => $newCoins, 'ref_id' => $refId, 'added' => (int)$order['coins']]);
        }
        db()->prepare("UPDATE coin_orders SET status='failed' WHERE id=?")->execute([$order['id']]);
        json_error('تأیید پرداخت ناموفق', 400);
    }
    if ($act === 'coin_orders_list') {
        $stmt = db()->prepare("SELECT * FROM coin_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20");
        $stmt->execute([$uid]);
        json_out(['data' => $stmt->fetchAll()]);
    }

    // ─── Plan Purchase via Zarinpal ───────────────────────────
    if ($act === 'plan_request') {
        $planId = (string)($b['plan_id'] ?? '');
        $planPrices = ['basic' => 59000, 'pro' => 119000];
        if (!isset($planPrices[$planId])) json_error('طرح نامعتبر', 400);
        $monthlyPrice = $planPrices[$planId];
        $durationMonths = (int)($b['duration_months'] ?? 1);
        if (!in_array($durationMonths, [1, 3, 6], true)) json_error('مدت زمان نامعتبر', 400);
        $discountRate = $durationMonths === 6 ? 0.20 : ($durationMonths === 3 ? 0.10 : 0);
        $baseTotal = $monthlyPrice * $durationMonths;
        $price = (int)round($baseTotal * (1 - $discountRate));
        $s = get_settings();
        $merchantId = $s['zarinpal_merchant_id'] ?: '00000000-0000-0000-0000-000000000000';
        $sandbox = (bool)($s['zarinpal_sandbox'] ?? true);
        $callbackUrl = (string)($b['callback_url'] ?? '');
        if ($callbackUrl === '' || preg_match('#^https?://(localhost|127\.0\.0\.1|10\.|192\.168\.)#i', $callbackUrl)) {
            $callbackUrl = 'https://app.kateb.site/payment/callback';
        }
        $baseUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json' : 'https://payment.zarinpal.com/pg/v4/payment/request.json';
        $gatewayUrl = $sandbox ? 'https://sandbox.zarinpal.com/pg/StartPay/' : 'https://payment.zarinpal.com/pg/StartPay/';
        $result = http_post_json($baseUrl, [
            'merchant_id' => $merchantId, 'amount' => $price, 'currency' => 'IRT',
            'description' => "خرید طرح {$planId} ({$durationMonths} ماه) - کاتب", 'callback_url' => $callbackUrl,
        ]);
        $authority = $result['body']['data']['authority'] ?? null;
        if (!$authority) {
            $errMsg = $result['body']['errors'][0]['message'] ?? 'خطا در ارتباط با زرین‌پال';
            json_error($errMsg, 500);
        }
        $orderId = gen_uuid();
        db()->prepare("INSERT INTO plan_orders (id, user_id, plan_id, amount_toman, status, authority, duration_months) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
            ->execute([$orderId, $uid, $planId, $price, $authority, $durationMonths]);
        json_out(['data' => ['authority' => $authority, 'redirect_url' => $gatewayUrl . $authority, 'order_id' => $orderId]]);
    }

    // ─── Plan Transactions List (user-facing) ──────────────────
    if ($act === 'plan_transactions_list') {
        $stmt = db()->prepare("SELECT id, plan_id, amount_toman, status, authority, ref_id, created_at, paid_at, payment_provider, product_id FROM plan_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20");
        $stmt->execute([$uid]);
        json_out(['data' => $stmt->fetchAll()]);
    }

    // ─── Cafe Bazaar Purchase Verification (Android) ───────────
    if ($act === 'bazaar_purchase_verify') {
        $productId = (string)($b['product_id'] ?? '');
        $purchaseToken = (string)($b['purchase_token'] ?? '');
        if ($productId === '' || $purchaseToken === '') json_error('اطلاعات خرید ناقص است', 400);

        // Server-side product ID validation
        $bazaarProducts = [
            'kateb_basic_1m' => ['plan' => 'basic', 'months' => 1],
            'kateb_basic_3m' => ['plan' => 'basic', 'months' => 3],
            'kateb_basic_6m' => ['plan' => 'basic', 'months' => 6],
            'kateb_pro_1m'   => ['plan' => 'pro', 'months' => 1],
            'kateb_pro_3m'   => ['plan' => 'pro', 'months' => 3],
            'kateb_pro_6m'   => ['plan' => 'pro', 'months' => 6],
        ];
        if (!isset($bazaarProducts[$productId])) json_error('محصول نامعتبر است', 400);
        $planInfo = $bazaarProducts[$productId];
        $planId = $planInfo['plan'];
        $durationMonths = $planInfo['months'];

        // Idempotency: check if this purchase_token was already processed
        $stmt = db()->prepare("SELECT id, user_id, status FROM plan_orders WHERE purchase_token = ? LIMIT 1");
        $stmt->execute([$purchaseToken]);
        $existing = $stmt->fetch();
        if ($existing) {
            if ($existing['user_id'] !== $uid) json_error('این خرید به حساب دیگری متصل است', 403);
            if ($existing['status'] === 'paid') {
                json_out(['success' => true, 'already_processed' => true]);
            }
        }

        // Get Bazaar OAuth access token
        $s = get_settings();
        $clientId = $s['bazaar_client_id'] ?? '';
        $clientSecret = $s['bazaar_client_secret'] ?? '';
        $refreshToken = $s['bazaar_refresh_token'] ?? '';
        if (!$clientId || !$clientSecret || !$refreshToken) json_error('تنظیمات کافه‌بازار کامل نیست', 500);

        // Check cached access token validity
        $accessToken = $s['bazaar_access_token'] ?? '';
        $tokenExpires = $s['bazaar_access_token_expires'] ?? null;
        $needNewToken = !$accessToken || !$tokenExpires || strtotime($tokenExpires) < time() + 60;
        if ($needNewToken) {
            $tokenParams = http_build_query([
                'grant_type' => 'refresh_token',
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'refresh_token' => $refreshToken,
            ]);
            // CafeBazaar Developer API v2 token endpoint. Both the official C# client
            // (Geeksltd/CafeBazaar.DeveloperApi) and nikapps/bazaar-api-php use exactly
            // this URL with a form-encoded refresh_token grant.
            $tokenCh = curl_init('https://pardakht.cafebazaar.ir/devapi/v2/auth/token/');
            curl_setopt_array($tokenCh, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $tokenParams,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_CONNECTTIMEOUT => 15,
                // TLS peer verification is deliberately OFF here, matching the Zarinpal
                // calls above: this shared host has no usable CA bundle. Turning it on
                // made the token request fail while producing no diagnostic at all.
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            ]);
            $tokenResp = curl_exec($tokenCh);
            $tokenCode = (int)curl_getinfo($tokenCh, CURLINFO_HTTP_CODE);
            $tokenErr  = curl_error($tokenCh);
            curl_close($tokenCh);

            $tokenData = json_decode($tokenResp ?: '', true);
            $newToken = $tokenData['access_token'] ?? '';
            $expiresIn = $tokenData['expires_in'] ?? 3600;
            if (!$newToken) {
                // Report what actually happened instead of a bare "failed": a cURL
                // error, or the HTTP status plus the raw body (which carries
                // invalid_grant / invalid_client for bad credentials).
                $detail = $tokenErr !== ''
                    ? ('cURL: ' . $tokenErr)
                    : ('HTTP ' . $tokenCode . ' :: ' . mb_substr((string)$tokenResp, 0, 400));
                error_log('Bazaar token request failed: ' . $detail);
                json_error('دریافت توکن کافه‌بازار ناموفق بود — ' . $detail, 500);
            }
            $newExpiry = date('Y-m-d H:i:s', time() + (int)$expiresIn - 60);
            db()->prepare("UPDATE kateb_settings SET bazaar_access_token = ?, bazaar_access_token_expires = ? WHERE id = 1")
                ->execute([$newToken, $newExpiry]);
            $accessToken = $newToken;
        }

        // Verify purchase with Bazaar Developer API
        $packageName = 'com.kateb.app';

        // Both reference clients pass the access token as an `access_token` QUERY
        // PARAMETER, not an Authorization header. The previous revision used a Bearer
        // header, which the endpoint does not accept.
        //
        // The subscription endpoint is the documented one for ITEM_TYPE_SUBS purchases.
        // The in-app endpoint is tried as a fallback because some Bazaar setups
        // register these products as plain in-app items.
        $candidateUrls = [
            'subscription' => "https://pardakht.cafebazaar.ir/devapi/v2/api/applications/" . rawurlencode($packageName) .
                "/subscriptions/" . rawurlencode($productId) .
                "/purchases/" . rawurlencode($purchaseToken) . "/?access_token=" . urlencode($accessToken),
            'inapp' => "https://pardakht.cafebazaar.ir/devapi/v2/api/validate/" . rawurlencode($packageName) .
                "/inapp/" . rawurlencode($productId) .
                "/purchases/" . rawurlencode($purchaseToken) . "/?access_token=" . urlencode($accessToken),
        ];

        $verifyData = null;
        $verifyVia = '';
        $verifyErr = '';
        $attempts = [];
        foreach ($candidateUrls as $via => $verifyUrl) {
            $ch = curl_init($verifyUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $verifyResp = curl_exec($ch);
            $verifyCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $verifyErr = curl_error($ch);
            curl_close($ch);

            $decoded = json_decode($verifyResp ?: '', true);
            $attempts[] = $via . ' -> HTTP ' . $verifyCode . ' :: ' . mb_substr((string)$verifyResp, 0, 300);

            if ($verifyCode === 200 && is_array($decoded) && empty($decoded['error'])) {
                $verifyData = $decoded;
                $verifyVia = $via;
                break;
            }
        }

        if ($verifyData === null) {
            $detail = $verifyErr !== '' ? ('cURL: ' . $verifyErr) : implode(' | ', $attempts);
            error_log('Bazaar verify failed: ' . $detail);
            json_error('تأیید خرید از کافه‌بازار ناموفق بود — ' . $detail, 502);
        }

        // The two endpoints return different shapes, so validate defensively:
        //  - in-app:       consumptionState, purchaseState (0 = purchased, 1 = cancelled, 2 = refunded)
        //  - subscription: initiationTimestampMsec, validUntilTimestampMsec, autoRenewing
        if (isset($verifyData['purchaseState']) && (int)$verifyData['purchaseState'] !== 0) {
            json_error('وضعیت خرید نامعتبر است', 400);
        }
        if (isset($verifyData['validUntilTimestampMsec'])
            && (int)$verifyData['validUntilTimestampMsec'] > 0
            && (int)($verifyData['validUntilTimestampMsec'] / 1000) < time()) {
            json_error('اشتراک منقضی شده است', 400);
        }

        // The subscription endpoint returns no purchaseId, so fall back to the
        // purchase token - it is a stable, unique reference for support lookups.
        $bazaarPurchaseId = $verifyData['purchaseId'] ?? $purchaseToken;
        $orderId = $existing['id'] ?? gen_uuid();

        // Begin transaction
        $pdo = db();
        $pdo->beginTransaction();
        try {
            if ($existing) {
                $pdo->prepare("UPDATE plan_orders SET status='paid', paid_at=?, ref_id=?, payment_provider='bazaar', product_id=?, purchase_token=?, bazaar_purchase_id=? WHERE id=?")
                    ->execute([now_iso(), $bazaarPurchaseId, $productId, $purchaseToken, $bazaarPurchaseId, $orderId]);
            } else {
                $pdo->prepare("INSERT INTO plan_orders (id, user_id, plan_id, amount_toman, status, paid_at, duration_months, payment_provider, product_id, purchase_token, bazaar_purchase_id, ref_id)
                    VALUES (?, ?, ?, 0, 'paid', ?, ?, 'bazaar', ?, ?, ?, ?)")
                    ->execute([$orderId, $uid, $planId, now_iso(), $durationMonths, $productId, $purchaseToken, $bazaarPurchaseId, $bazaarPurchaseId]);
            }

            // Activate subscription: extend from current expiry if still active, else from now
            $stmt = $pdo->prepare("SELECT plan_type, plan_expires_at FROM kateb_users WHERE id = ? LIMIT 1");
            $stmt->execute([$uid]);
            $userRow = $stmt->fetch();
            $currentExpiry = $userRow['plan_expires_at'] ?? null;
            $baseDate = ($currentExpiry && strtotime($currentExpiry) > time()) ? $currentExpiry : now_iso();
            $newExpiry = date('Y-m-d H:i:s', strtotime("+{$durationMonths} months", strtotime($baseDate)));

            $pdo->prepare("UPDATE kateb_users SET plan_type=?, plan_expires_at=?, ai_assistant_usage_this_month=0, template_usage_this_month=0, usage_cycle_start=? WHERE id=?")
                ->execute([$planId, $newExpiry, now_iso(), $uid]);

            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log('Bazaar purchase verification DB error: ' . $e->getMessage());
            json_error('خطا در ثبت اشتراک', 500);
        }

        json_out([
            'success' => true,
            'plan_id' => $planId,
            'duration_months' => $durationMonths,
            'expires_at' => $newExpiry,
            'already_processed' => false,
        ]);
    }

    // ═══ ADMIN ENDPOINTS ═══════════════════════════════════════
    if (!$user['is_admin']) json_error('دسترسی غیرمجاز', 403);

    if ($act === 'admin_users_list') {
        $stmt = db()->query("SELECT id, phone, full_name, is_admin, coins, plan_type, created_at FROM kateb_users ORDER BY created_at DESC");
        json_out(['data' => $stmt->fetchAll()]);
    }
    if ($act === 'admin_user_set_coins') {
        $targetId = (string)($b['id'] ?? '');
        $newVal = max(0, floor((int)($b['coins'] ?? 0)));
        if (!$targetId) json_error('کاربر نامعتبر', 400);
        db()->prepare("UPDATE kateb_users SET coins = ? WHERE id = ?")->execute([$newVal, $targetId]);
        json_out(['success' => true, 'coins' => $newVal]);
    }
    if ($act === 'admin_user_add_coins') {
        $targetId = (string)($b['id'] ?? '');
        $amount = (int)($b['amount'] ?? 0);
        if (!$targetId || !$amount) json_error('مقادیر نامعتبر', 400);
        db()->prepare("UPDATE kateb_users SET coins = GREATEST(0, coins + ?) WHERE id = ?")->execute([$amount, $targetId]);
        $stmt = db()->prepare("SELECT coins FROM kateb_users WHERE id = ? LIMIT 1");
        $stmt->execute([$targetId]);
        json_out(['success' => true, 'coins' => (int)$stmt->fetchColumn()]);
    }
    if ($act === 'admin_user_update') {
        $id = (string)($b['id'] ?? '');
        $fields = []; $vals = [];
        if (array_key_exists('full_name', $b)) { $fields[] = 'full_name = ?'; $vals[] = $b['full_name']; }
        if (array_key_exists('is_admin', $b)) { $fields[] = 'is_admin = ?'; $vals[] = $b['is_admin'] ? 1 : 0; }
        if (!empty($b['password'])) { $fields[] = 'password_hash = ?'; $vals[] = hash_password((string)$b['password']); }
        if ($fields) {
            $vals[] = $id;
            db()->prepare("UPDATE kateb_users SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);
        }
        json_out(['success' => true]);
    }
    if ($act === 'admin_user_delete') {
        db()->prepare("DELETE FROM kateb_users WHERE id = ?")->execute([(string)($b['id'] ?? '')]);
        json_out(['success' => true]);
    }
    if ($act === 'admin_user_set_plan') {
        $targetId = (string)($b['id'] ?? '');
        $planId = (string)($b['plan_id'] ?? 'free');
        if (!$targetId) json_error('کاربر نامعتبر', 400);
        $validPlans = ['free', 'basic', 'pro'];
        if (!in_array($planId, $validPlans, true)) json_error('طرح نامعتبر', 400);

        $cycleStart = now_iso();
        $expiryDate = $planId === 'free' ? null : date('Y-m-d H:i:s', strtotime('+30 days'));
        db()->prepare("UPDATE kateb_users SET plan_type = ?, ai_assistant_usage_this_month = 0, template_usage_this_month = 0, usage_cycle_start = ?, plan_expires_at = ? WHERE id = ?")
            ->execute([$planId, $cycleStart, $expiryDate, $targetId]);

        $stmt = db()->prepare("SELECT id, phone, full_name, is_admin, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month, usage_cycle_start, created_at FROM kateb_users WHERE id = ? LIMIT 1");
        $stmt->execute([$targetId]);
        $updated = $stmt->fetch();
        json_out(['success' => true, 'data' => $updated]);
    }

    if ($act === 'admin_user_create') {
        $phone = (string)($b['phone'] ?? '');
        if (!preg_match('/^09\d{9}$/', $phone)) json_error('شماره نامعتبر', 400);
        $password = (string)($b['password'] ?? '');
        if (strlen($password) < 4) json_error('رمز کوتاه', 400);
        $newId = gen_uuid();
        db()->prepare("INSERT INTO kateb_users (id, phone, full_name, is_admin, password_hash) VALUES (?, ?, ?, ?, ?)")
            ->execute([$newId, $phone, $b['full_name'] ?? '', ($b['is_admin'] ?? false) ? 1 : 0, hash_password($password)]);
        json_out(['data' => ['id' => $newId]]);
    }
    if ($act === 'admin_settings_get') {
        json_out(['data' => get_settings()]);
    }
    if ($act === 'admin_settings_update') {
        $fields = []; $vals = [];
        foreach (['sms_api_key', 'sms_pattern_code', 'sms_line_number', 'ai_api_url', 'ai_api_key', 'ai_models', 'zarinpal_merchant_id', 'bazaar_client_id', 'bazaar_client_secret', 'bazaar_refresh_token'] as $f) {
            if (array_key_exists($f, $b)) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
        }
        if (array_key_exists('zarinpal_sandbox', $b)) { $fields[] = 'zarinpal_sandbox = ?'; $vals[] = $b['zarinpal_sandbox'] ? 1 : 0; }
        $fields[] = 'updated_at = ?'; $vals[] = now_iso();
        $vals[] = 1;
        db()->prepare("UPDATE kateb_settings SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);
        json_out(['success' => true]);
    }
    if ($act === 'admin_stats') {
        $pdo = db();
        $stats = [];
        foreach (['kateb_users' => 'users', 'generated_letters' => 'letters', 'drafts' => 'drafts', 'templates' => 'templates', 'discovery_usage' => 'discovery', 'calendar_events' => 'events', 'manager_tasks' => 'tasks', 'occasions' => 'occasions'] as $table => $key) {
            $stats[$key] = (int)$pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn();
        }
        json_out(['data' => $stats]);
    }
    if ($act === 'admin_templates_list') {
        $stmt = db()->query("SELECT * FROM templates ORDER BY created_at DESC");
        $rows = $stmt->fetchAll();
        foreach ($rows as &$t) $t['letter_type'] = j_decode($t['letter_type'], []);
        json_out(['data' => $rows, 'total' => count($rows)]);
    }
    if ($act === 'admin_template_approve') {
        db()->prepare("UPDATE templates SET is_approved = 1 WHERE id = ?")->execute([(string)($b['id'] ?? '')]);
        json_out(['success' => true]);
    }
    if ($act === 'admin_template_reject') {
        db()->prepare("DELETE FROM templates WHERE id = ?")->execute([(string)($b['id'] ?? '')]);
        json_out(['success' => true]);
    }

    if ($act === 'admin_subs_list') {
        $stmt = db()->query("SELECT u.id, u.phone, u.full_name, u.plan_type, u.ai_assistant_usage_this_month, u.template_usage_this_month, u.usage_cycle_start, u.plan_expires_at FROM kateb_users u ORDER BY u.created_at DESC LIMIT 50");
        $rows = $stmt->fetchAll();
        $planLimits = ['free' => [3, 10], 'basic' => [20, 30], 'pro' => [80, 120]];
        $enriched = [];
        foreach ($rows as $r) {
            $planId = $r['plan_type'] ?? 'free';
            $limits = $planLimits[$planId] ?? $planLimits['free'];
            $enriched[] = [
                'id' => $r['id'],
                'plan_id' => $planId,
                'status' => $planId === 'free' ? 'cancelled' : 'active',
                'ai_assistant_usage' => (int)($r['ai_assistant_usage_this_month'] ?? 0),
                'template_usage' => (int)($r['template_usage_this_month'] ?? 0),
                'ai_assistant_limit' => $limits[0],
                'template_limit' => $limits[1],
                'started_at' => $r['usage_cycle_start'] ?? null,
                'expires_at' => $r['plan_expires_at'] ?? null,
                'cycle_start' => $r['usage_cycle_start'] ?? null,
                'kateb_users' => ['full_name' => $r['full_name'], 'phone' => $r['phone']],
            ];
        }
        json_out(['data' => $enriched]);
    }
    if ($act === 'admin_transactions_list') {
        $stmt = db()->query("SELECT po.id, po.plan_id, po.amount_toman, po.status, po.authority, po.ref_id, po.created_at, po.paid_at, po.payment_provider, po.product_id, po.bazaar_purchase_id, u.full_name, u.phone FROM plan_orders po JOIN kateb_users u ON po.user_id = u.id ORDER BY po.created_at DESC LIMIT 50");
        $rows = $stmt->fetchAll();
        $enriched = [];
        foreach ($rows as $r) {
            $enriched[] = [
                'id' => $r['id'],
                'plan_id' => $r['plan_id'],
                'amount_toman' => (int)$r['amount_toman'],
                'status' => $r['status'],
                'authority' => $r['authority'],
                'ref_id' => $r['ref_id'],
                'created_at' => $r['created_at'],
                'paid_at' => $r['paid_at'],
                'payment_provider' => $r['payment_provider'] ?? 'zarinpal',
                'product_id' => $r['product_id'] ?? '',
                'bazaar_purchase_id' => $r['bazaar_purchase_id'] ?? null,
                'kateb_users' => ['full_name' => $r['full_name'], 'phone' => $r['phone']],
            ];
        }
        json_out(['data' => $enriched]);
    }

    // ══════════════════════════════════════════════════════════════
    //  Hamdam — AI calendar assistant (new product layer)
    //  Reuses the SAME upstream AI settings (kateb_settings) and the SAME
    //  http_post_json transport as the legacy ai_proxy action. The API key
    //  never leaves the server.
    // ══════════════════════════════════════════════════════════════

    // ─── Jalali calendar helpers (port of the frontend jalaali algorithm) ───
if (!defined('HM_JALALI_MONTHS')) {
    define('HM_JALALI_MONTHS', ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
                                'مهر','آبان','آذر','دی','بهمن','اسفند']);
    define('HM_JALALI_MONTHS_ALT', ['فروردين','ارديبهشت','خرداد','تير','مرداد','شهريور',
                                    'مهر','ابان','اذر','دي','بهمن','اسفند']);
    define('HM_WEEKDAYS', ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه']);
    define('HM_MAX_ITERATIONS', 6);
    define('HM_MAX_MODEL_CALLS', 8);
}

/**
 * ============================================================================
 *  همدم — هستهٔ دستیار (Assistant v2)
 * ============================================================================
 *  این فایل کتابخانهٔ خودبسندهٔ دستیار همدم است و به صورت top-level در
 *  php-api/index.php قرار می‌گیرد (قبل از بلوک try اصلی).
 *
 *  مسئولیت‌ها:
 *    ۱. تبدیل دقیق تاریخ جلالی ⇄ میلادی (الگوریتم jalaali-js)
 *    ۲. حل عبارات تاریخ طبیعی فارسی («چهارشنبه این هفته»، «پس‌فردا»، «یلدا»)
 *    ۳. موتور ابزار (tools) روی دادهٔ تقویم کاربر: بازه‌ها، تداخل، زمان آزاد
 *    ۴. حلقهٔ tool-calling با مدل هوش مصنوعی (native function calling + fallback)
 *    ۵. اعمال نوشتن (create/update/cancel) با بررسی مجدد تداخل
 *
 *  هیچ کلید یا مدلی در این فایل هاردکد نمی‌شود؛ همه از kateb_settings خوانده
 *  می‌شود که همان تنظیمات پنل مدیریت است.
 * ============================================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// ۰) سازگاری — اگر افزونهٔ mbstring روی هاست نبود
// ─────────────────────────────────────────────────────────────────────────────
if (!function_exists('mb_strpos')) {
    function mb_strpos($haystack, $needle, $offset = 0) {
        $pos = strpos((string)$haystack, (string)$needle, $offset);
        return $pos === false ? false : $pos;
    }
    function mb_strlen($s) {
        return preg_match_all('/./us', (string)$s) ?: 0;
    }
    function mb_substr($s, $start, $length = null) {
        preg_match_all('/./us', (string)$s, $m);
        $chars = $m[0];
        $slice = $length === null ? array_slice($chars, $start) : array_slice($chars, $start, $length);
        return implode('', $slice);
    }
    function mb_strtolower($s) { return strtolower((string)$s); }
}
if (!function_exists('mb_strpos_utf8_safe')) {
    function mb_strpos_utf8_safe($h, $n) { return mb_strpos($h, $n); }
}

// ─────────────────────────────────────────────────────────────────────────────
// ۱) تقویم جلالی
// ─────────────────────────────────────────────────────────────────────────────

function hm_div($a, $b) { return intdiv((int)$a, (int)$b); }

function hm_mod($a, $b) {
    $b = (int)$b;
    return (int)$a - hm_div($a, $b) * $b;
}

/** الگوریتم جلالی (jalCal) — همان پیاده‌سازی jalaali-js */
function hm_jal_cal(int $jy): array {
    $breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635,
               2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    $bl = count($breaks);
    $gy = $jy + 621;
    $leapJ = -14;
    $jp = $breaks[0];
    $jm = 0;
    $jump = 0;
    if ($jy < $jp || $jy >= $breaks[$bl - 1]) {
        throw new Exception('سال جلالی نامعتبر: ' . $jy);
    }
    for ($i = 1; $i < $bl; $i++) {
        $jm = $breaks[$i];
        $jump = $jm - $jp;
        if ($jy < $jm) break;
        $leapJ = $leapJ + hm_div($jump, 33) * 8 + hm_div(hm_mod($jump, 33), 4);
        $jp = $jm;
    }
    $n = $jy - $jp;
    $leapJ = $leapJ + hm_div($n, 33) * 8 + hm_div(hm_mod($n, 33) + 3, 4);
    if (hm_mod($jump, 33) === 4 && $jump - $n === 4) $leapJ += 1;

    $leapG = hm_div($gy, 4) - hm_div((hm_div($gy, 100) + 1) * 3, 4) - 150;
    $march = 20 + $leapJ - $leapG;

    if ($jump - $n < 6) $n = $n - $jump + hm_div($jump + 4, 33) * 33;
    $leap = hm_mod(hm_mod($n + 1, 33) - 1, 4);
    if ($leap === -1) $leap = 4;

    return ['leap' => $leap, 'gy' => $gy, 'march' => $march];
}

function hm_g2d($gy, $gm, $gd) {
    $d = hm_div(($gy + hm_div($gm - 8, 6) + 100100) * 1461, 4)
       + hm_div(153 * hm_mod($gm + 9, 12) + 2, 5)
       + $gd - 34840408;
    $d = $d - hm_div(hm_div($gy + 100100 + hm_div($gm - 8, 6), 100) * 3, 4) + 752;
    return $d;
}

function hm_d2g($jdn): array {
    $j = 4 * $jdn + 139361631;
    $j = $j + hm_div(hm_div(4 * $jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    $i = hm_div(hm_mod($j, 1461), 4) * 5 + 308;
    $gd = hm_div(hm_mod($i, 153), 5) + 1;
    $gm = hm_mod(hm_div($i, 153), 12) + 1;
    $gy = hm_div($j, 1461) - 100100 + hm_div(8 - $gm, 6);
    return ['gy' => $gy, 'gm' => $gm, 'gd' => $gd];
}

/** جلالی → میلادی */
function hm_j2g(int $jy, int $jm, int $jd): array {
    $r = hm_jal_cal($jy);
    return hm_d2g(hm_g2d($r['gy'], 3, $r['march']) + ($jm - 1) * 31 - hm_div($jm, 7) * ($jm - 7) + $jd - 1);
}

/** میلادی → جلالی */
function hm_g2j(int $gy, int $gm, int $gd): array {
    $r = hm_jal_cal($gy - 621);
    $jdn = hm_g2d($gy, $gm, $gd) - hm_g2d($r['gy'], 3, $r['march']);
    $jy = $gy - 621;
    $k = $jdn;
    if ($k >= 0) {
        if ($k <= 185) {
            return ['jy' => $jy, 'jm' => 1 + hm_div($k, 31), 'jd' => hm_mod($k, 31) + 1];
        }
        $k -= 186;
    } else {
        $jy -= 1;
        $k += 179;
        if ($r['leap'] === 1) $k += 1;
    }
    return ['jy' => $jy, 'jm' => 7 + hm_div($k, 30), 'jd' => hm_mod($k, 30) + 1];
}

function hm_j_days_in_month(int $jy, int $jm): int {
    if ($jm <= 6) return 31;
    if ($jm <= 11) return 30;
    $r = hm_jal_cal($jy);
    return $r['leap'] === 0 ? 30 : 29;
}

function hm_iso(int $gy, int $gm, int $gd): string {
    return sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
}

function hm_jalali_str(int $jy, int $jm, int $jd): string {
    return sprintf('%04d/%02d/%02d', $jy, $jm, $jd);
}

function hm_iso_of_j(int $jy, int $jm, int $jd): string {
    $g = hm_j2g($jy, $jm, $jd);
    return hm_iso($g['gy'], $g['gm'], $g['gd']);
}

function hm_j_of_iso(string $iso): array {
    $p = array_map('intval', explode('-', substr($iso, 0, 10)));
    if (count($p) !== 3) return [0, 0, 0];
    $j = hm_g2j($p[0], $p[1], $p[2]);
    return [$j['jy'], $j['jm'], $j['jd']];
}

function hm_jalali_of_iso(string $iso): string {
    $j = hm_j_of_iso($iso);
    return hm_jalali_str($j[0], $j[1], $j[2]);
}

function hm_add_days_iso(string $iso, int $days): string {
    $p = array_map('intval', explode('-', substr($iso, 0, 10)));
    $jdn = hm_g2d($p[0], $p[1], $p[2]) + $days;
    $g = hm_d2g($jdn);
    return hm_iso($g['gy'], $g['gm'], $g['gd']);
}

/** 0=شنبه ... 6=جمعه */
function hm_jalali_dow(string $iso): int {
    $p = array_map('intval', explode('-', substr($iso, 0, 10)));
    $jdn = hm_g2d($p[0], $p[1], $p[2]);
    $g = hm_d2g($jdn);
    $utcDow = (int)gmdate('w', gmmktime(0, 0, 0, $g['gm'], $g['gd'], $g['gy'])); // 0=Sun
    return ($utcDow + 1) % 7;
}

function hm_diff_days(string $fromIso, string $toIso): int {
    $a = array_map('intval', explode('-', substr($fromIso, 0, 10)));
    $b = array_map('intval', explode('-', substr($toIso, 0, 10)));
    return hm_g2d($b[0], $b[1], $b[2]) - hm_g2d($a[0], $a[1], $a[2]);
}





/** ساعت جاری تهران به‌صورت ساخت‌یافته */
function hm_now(): array {
    $ts = time() + 12600; // Asia/Tehran = UTC+3:30 (بدون ساعت تابستانی)
    return [
        'ts'   => $ts,
        'iso'  => gmdate('Y-m-d', $ts),
        'time' => gmdate('H:i', $ts),
        'hour' => (int)gmdate('G', $ts),
        'min'  => (int)gmdate('i', $ts),
        'jy'   => (int)hm_j_of_iso(gmdate('Y-m-d', $ts))[0],
    ];
}

/** زمینهٔ زمانی کامل — «امروز» همیشه از اینجا خوانده می‌شود */
function hm_time_context(?string $todayIso = null): array {
    $now = hm_now();
    $today = $todayIso ?: $now['iso'];
    $j = hm_j_of_iso($today);
    $dow = hm_jalali_dow($today);
    $weekStart = hm_add_days_iso($today, -$dow);
    $weekEnd = hm_add_days_iso($weekStart, 6);
    $nextWeekStart = hm_add_days_iso($weekStart, 7);
    $nextWeekEnd = hm_add_days_iso($nextWeekStart, 6);
    $nextYearJ = [$j[0] + 1, 1, 1];
    return [
        'today_iso'       => $today,
        'today_jalali'    => hm_jalali_str($j[0], $j[1], $j[2]),
        'today_jalali_pretty' => sprintf('%d %s %d', $j[2], HM_JALALI_MONTHS[$j[1] - 1], $j[0]),
        'today_weekday'   => HM_WEEKDAYS[$dow],
        'today_dow'       => $dow,
        'now_time'        => $now['time'],
        'tomorrow_iso'    => hm_add_days_iso($today, 1),
        'day_after_iso'   => hm_add_days_iso($today, 2),
        'yesterday_iso'   => hm_add_days_iso($today, -1),
        'week_start_iso'  => $weekStart,
        'week_end_iso'    => $weekEnd,
        'week_start_jalali' => hm_jalali_of_iso($weekStart),
        'week_end_jalali'   => hm_jalali_of_iso($weekEnd),
        'next_week_start_iso' => $nextWeekStart,
        'next_week_end_iso'   => $nextWeekEnd,
        'month_start_iso' => hm_iso_of_j($j[0], $j[1], 1),
        'month_end_iso'   => hm_iso_of_j($j[0], $j[1], hm_j_days_in_month($j[0], $j[1])),
        'nowruz_next_iso' => hm_iso_of_j($nextYearJ[0], 1, 1),
        'nowruz_next_jalali' => hm_jalali_str($nextYearJ[0], 1, 1),
        'this_week_days'  => array_map(function ($i) use ($weekStart) {
            $iso = hm_add_days_iso($weekStart, $i);
            return ['iso' => $iso, 'weekday' => HM_WEEKDAYS[$i], 'jalali' => hm_jalali_of_iso($iso)];
        }, range(0, 6)),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// ۲) حل عبارات تاریخ طبیعی فارسی
// ─────────────────────────────────────────────────────────────────────────────

function hm_normalize_fa(string $s): string {
    $s = str_replace(['ي', 'ك', 'ۀ', 'ﻩ'], ['ی', 'ک', 'ه', 'ه'], $s);
    $s = preg_replace('/[\x{200c}\x{200f}\x{200e}]/u', ' ', $s); // نیم‌فاصله و نشانه‌های جهت
    $s = str_replace(['‌', '‏', '‎'], ' ', $s);
    $fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    $s = str_replace($fa, ['0','1','2','3','4','5','6','7','8','9'], $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

function hm_month_index(string $name): int {
    $name = hm_normalize_fa($name);
    foreach (HM_JALALI_MONTHS as $i => $m) {
        if ($m === $name) return $i + 1;
    }
    foreach (HM_JALALI_MONTHS_ALT as $i => $m) {
        if ($m === $name) return $i + 1;
    }
    $norm = [];
    foreach (HM_JALALI_MONTHS as $i => $m) { $norm[$m] = $i + 1; }
    $hit = hm_match_longest($name, $norm);
    return $hit > 0 ? $hit : 0;
}

/**
 * تطبیق طولانی‌ترین‌اول — بدون این، «چهارشنبه» با «شنبه» تطبیق داده می‌شد
 * و «پنج‌شنبه» با «شنبه». کلیدهای بلندتر همیشه اول بررسی می‌شوند.
 */
function hm_match_longest(string $name, array $table) {
    $keys = array_keys($table);
    usort($keys, function ($a, $b) { return mb_strlen((string)$b) - mb_strlen((string)$a); });
    foreach ($keys as $k) {
        if ($name === (string)$k) return $table[$k];
    }
    foreach ($keys as $k) {
        if (mb_strpos($name, (string)$k) !== false) return $table[$k];
    }
    return -1;
}

function hm_weekday_index(string $name): int {
    $name = hm_normalize_fa($name);
    $table = [
        'شنبه' => 0, 'یکشنبه' => 1, 'دوشنبه' => 2, 'سه شنبه' => 3,
        'چهارشنبه' => 4, 'چهار شنبه' => 4, 'پنج شنبه' => 5, 'جمعه' => 6,
    ];
    $norm = [];
    foreach ($table as $k => $v) { $norm[hm_normalize_fa($k)] = $v; }
    return hm_match_longest($name, $norm);
}

/**
 * حل یک عبارت تاریخ به ISO میلادی.
 * $spec می‌تواند باشد: ISO میلادی، جلالی YYYY/MM/DD، «امروز/فردا/پس‌فردا/دیروز»،
 * «چهارشنبه»، «چهارشنبه این هفته»، «هفته آینده»، «آخر هفته»، «۱۵ آبان»،
 * «نوروز»، «یلدا»، «چهارشنبه‌سوری»، یا offset روز (+3/-2).
 */
function hm_resolve_date($spec, array $ctx, array $occasions = []): array {
    $today = $ctx['today_iso'];
    $note = '';

    if (is_array($spec)) {
        if (isset($spec['iso']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$spec['iso'])) {
            $spec = (string)$spec['iso'];
        } elseif (isset($spec['jalali'])) {
            $spec = (string)$spec['jalali'];
        } elseif (isset($spec['offset_days'])) {
            $spec = (int)$spec['offset_days'];
        } elseif (isset($spec['weekday'])) {
            $spec = (string)$spec['weekday'];
        } elseif (isset($spec['text'])) {
            $spec = (string)$spec['text'];
        }
    }

    // offset عددی
    if (is_int($spec) || (is_string($spec) && preg_match('/^[+-]?\d+$/', trim($spec)))) {
        $iso = hm_add_days_iso($today, (int)$spec);
        return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => $note];
    }

    $text = hm_normalize_fa((string)$spec);
    if ($text === '') $text = 'امروز';

    // ISO میلادی
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $text, $m)) {
        $iso = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
        return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => $note];
    }

    // جلالی کامل YYYY/MM/DD
    if (preg_match('#^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$#', $text, $m)) {
        $iso = hm_iso_of_j((int)$m[1], (int)$m[2], (int)$m[3]);
        return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => $note];
    }

    // «۱۵ آبان» یا «15 آبان 1405»
    if (preg_match('/^(\d{1,2})\s*([^\d\s]+)\s*(\d{4})?$/u', $text, $m)) {
        $mi = hm_month_index($m[2]);
        if ($mi > 0) {
            $jy = isset($m[3]) && $m[3] !== '' ? (int)$m[3] : (int)explode('/', $ctx['today_jalali'])[0];
            $jd = (int)$m[1];
            if (!isset($m[3]) || $m[3] === '') {
                $iso = hm_iso_of_j($jy, $mi, $jd);
                if ($iso < $today) { $jy += 1; }
            }
            $iso = hm_iso_of_j($jy, $mi, $jd);
            return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => $note];
        }
    }

    $hasThisWeek = mb_strpos($text, 'این هفته') !== false;
    $hasNextWeek = mb_strpos($text, 'هفته بعد') !== false || mb_strpos($text, 'هفته آینده') !== false || mb_strpos($text, 'هفته اینده') !== false;
    $hasWeek = mb_strpos($text, 'هفته') !== false;

    // آخر هفته → پنج‌شنبه این هفته
    if (mb_strpos($text, 'آخر هفته') !== false || mb_strpos($text, 'اخر هفته') !== false) {
        $iso = hm_add_days_iso($ctx['week_start_iso'], 5);
        return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[5], 'note' => 'آخر هفته (پنج‌شنبه)'];
    }

    // روزهای نسبی
    // ترتیب مهم است: عبارت‌های بلندتر اول («پس فردا» قبل از «فردا»)
    $rel = ['پس فردا' => 2, 'پسفردا' => 2, 'فردا' => 1, 'دیروز' => -1, 'پریشب' => -2, 'امروز' => 0, 'امشب' => 0];
    foreach ($rel as $k => $off) {
        if (mb_strpos($text, $k) !== false) {
            $iso = hm_add_days_iso($today, $off);
            return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => $k];
        }
    }

    // نام روز هفته
    $wd = hm_weekday_index($text);
    if ($wd >= 0) {
        if ($hasNextWeek) {
            $iso = hm_add_days_iso($ctx['next_week_start_iso'], $wd);
        } else {
            $iso = hm_add_days_iso($ctx['week_start_iso'], $wd);
            if (!$hasThisWeek && !$hasWeek && $iso < $today) {
                $iso = hm_add_days_iso($iso, 7); // «چهارشنبه» گذشته → چهارشنبه آینده
                $note = 'روز هفتهٔ آینده (گذشتهٔ این هفته)';
            } elseif ($hasThisWeek || $hasWeek) {
                $note = 'همین هفته';
            }
        }
        return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[$wd], 'note' => $note];
    }

    // مناسبت‌های شناخته‌شده
    $anchors = [
        'نوروز'       => ['kind' => 'nowruz'],
        'سال تحویل'   => ['kind' => 'nowruz'],
        'سال نو'      => ['kind' => 'nowruz'],
        'عید'         => ['kind' => 'nowruz'],
        'یلدا'        => ['kind' => 'fixed_j', 'jm' => 9,  'jd' => 30],
        'شب چله'      => ['kind' => 'fixed_j', 'jm' => 9,  'jd' => 30],
        'چهارشنبه سوری' => ['kind' => 'chaharshanbe_suri'],
        'چهارشنبهسوری' => ['kind' => 'chaharshanbe_suri'],
        'سیزده بدر'   => ['kind' => 'fixed_j', 'jm' => 1,  'jd' => 13],
        'روز معلم'    => ['kind' => 'fixed_j', 'jm' => 2,  'jd' => 12],
        'روز کارگر'   => ['kind' => 'fixed_j', 'jm' => 2,  'jd' => 11],
        'روز زن'      => ['kind' => 'fixed_j', 'jm' => 12, 'jd' => 29],
        'روز مادر'    => ['kind' => 'fixed_j', 'jm' => 12, 'jd' => 29],
    ];
    foreach ($anchors as $needle => $a) {
        if (mb_strpos($text, hm_normalize_fa($needle)) !== false) {
            $jy = (int)explode('/', $ctx['today_jalali'])[0];
            if ($a['kind'] === 'nowruz') {
                $iso = hm_iso_of_j($jy, 1, 1);
                if ($iso <= $today) $iso = hm_iso_of_j($jy + 1, 1, 1);
            } elseif ($a['kind'] === 'fixed_j') {
                $iso = hm_iso_of_j($jy, $a['jm'], $a['jd']);
                if ($iso < $today) $iso = hm_iso_of_j($jy + 1, $a['jm'], $a['jd']);
            } else { // چهارشنبه‌سوری = آخرین سه‌شنبهٔ اسفند (شب آن)
                $days = hm_j_days_in_month($jy, 12);
                $iso = '';
                for ($d = $days; $d >= 1; $d--) {
                    $cand = hm_iso_of_j($jy, 12, $d);
                    if (hm_jalali_dow($cand) === 3) { $iso = $cand; break; }
                }
                if ($iso !== '' && $iso < $today) {
                    $days2 = hm_j_days_in_month($jy + 1, 12);
                    for ($d = $days2; $d >= 1; $d--) {
                        $cand = hm_iso_of_j($jy + 1, 12, $d);
                        if (hm_jalali_dow($cand) === 3) { $iso = $cand; break; }
                    }
                }
            }
            return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => 'مناسبت: ' . $needle];
        }
    }

    // جست‌وجو در مناسبت‌های واقعی سامانه
    if (is_array($occasions) && count($occasions) > 0) {
        $q = $text;
        foreach ($occasions as $o) {
            $title = hm_normalize_fa((string)($o['title'] ?? ''));
            if ($title === '') continue;
            $hit = mb_strpos($title, $q) !== false || mb_strpos($q, $title) !== false;
            if (!$hit && mb_strlen($q) >= 3) {
                $hit = mb_strpos($title, mb_substr($q, 0, max(3, (int)(mb_strlen($q) / 2)))) !== false;
            }
            if ($hit && !empty($o['gregorian_date'])) {
                $iso = substr((string)$o['gregorian_date'], 0, 10);
                if ($iso < $today) {
                    // همان مناسبت در سال بعد
                    $d = hm_iso_of_j(hm_j_of_iso($iso)[0] + 1, hm_j_of_iso($iso)[1], hm_j_of_iso($iso)[2]);
                    $iso = $d;
                }
                return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => 'مناسبت: ' . $o['title']];
            }
        }
    }

    // «ماه بعد / هفته بعد» بدون روز مشخص
    if ($hasNextWeek) {
        return ['iso' => $ctx['next_week_start_iso'], 'jalali' => hm_jalali_of_iso($ctx['next_week_start_iso']), 'weekday' => HM_WEEKDAYS[0], 'note' => 'ابتدای هفتهٔ آینده'];
    }
    if (mb_strpos($text, 'ماه بعد') !== false || mb_strpos($text, 'ماه آینده') !== false) {
        $j = hm_j_of_iso($today);
        $jm = $j[1] === 12 ? 1 : $j[1] + 1;
        $jy = $j[1] === 12 ? $j[0] + 1 : $j[0];
        $iso = hm_iso_of_j($jy, $jm, 1);
        return ['iso' => $iso, 'jalali' => hm_jalali_of_iso($iso), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)], 'note' => 'ابتدای ماه بعد'];
    }

    return ['iso' => $today, 'jalali' => $ctx['today_jalali'], 'weekday' => $ctx['today_weekday'], 'note' => 'نامشخص — امروز در نظر گرفته شد'];
}

// ─────────────────────────────────────────────────────────────────────────────
// ۳) قواعد زمانی و تداخل
// ─────────────────────────────────────────────────────────────────────────────

function hm_to_min(?string $hhmm): ?int {
    if (!$hhmm) return null;
    if (!preg_match('/^(\d{1,2}):(\d{2})/', trim($hhmm), $m)) return null;
    $h = (int)$m[1];
    $mi = (int)$m[2];
    if ($h > 23 || $mi > 59) return null;
    return $h * 60 + $mi;
}

function hm_to_time(int $minutes): string {
    $minutes = max(0, min(24 * 60 - 1, $minutes));
    return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
}

function hm_fa_digits($s): string {
    return str_replace(['0','1','2','3','4','5','6','7','8','9'],
                       ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'], (string)$s);
}

/**
 * ساخت بازه‌های مشغول برای یک روز از روی کارها و رویدادهای کاربر.
 * هر بازه: ['start'=>min,'end'=>min,'kind'=>'task|event','title'=>..,'id'=>..,'time'=>'HH:MM']
 */
function hm_busy_intervals(array $tasks, array $events, string $iso): array {
    $out = [];
    foreach ($events as $e) {
        if (substr((string)($e['date'] ?? ''), 0, 10) !== $iso) continue;
        $start = hm_to_min($e['startTime'] ?? $e['start_time'] ?? null);
        if ($start === null) continue;
        $end = hm_to_min($e['endTime'] ?? $e['end_time'] ?? null);
        if ($end === null || $end <= $start) $end = $start + 60;
        $out[] = [
            'start' => $start, 'end' => $end, 'kind' => 'event',
            'title' => (string)($e['title'] ?? ''), 'id' => (string)($e['id'] ?? ''),
            'time' => hm_to_time($start), 'location' => (string)($e['location'] ?? ''),
        ];
    }
    foreach ($tasks as $t) {
        if (substr((string)($t['dueDate'] ?? $t['due_date'] ?? ''), 0, 10) !== $iso) continue;
        if (($t['status'] ?? 'pending') !== 'pending') continue;
        $start = hm_to_min($t['dueTime'] ?? $t['due_time'] ?? null);
        if ($start === null) {
            // کار بدون ساعت → بازهٔ تمام‌روز سراسری
            $out[] = [
                'start' => 0, 'end' => 24 * 60, 'kind' => 'task',
                'title' => (string)($t['title'] ?? ''), 'id' => (string)($t['id'] ?? ''),
                'time' => '', 'all_day' => true,
            ];
            continue;
        }
        $dur = (int)($t['duration'] ?? $t['duration_minutes'] ?? 60);
        if ($dur <= 0) $dur = 60;
        $out[] = [
            'start' => $start, 'end' => $start + $dur, 'kind' => 'task',
            'title' => (string)($t['title'] ?? ''), 'id' => (string)($t['id'] ?? ''),
            'time' => hm_to_time($start),
        ];
    }
    usort($out, function ($a, $b) { return $a['start'] - $b['start']; });
    return $out;
}

/** تلاقی بازه‌ها — هر بازهٔ موجود که با [start,end) هم‌پوشانی دارد */
function hm_find_conflicts(array $busy, int $start, int $end, string $excludeId = ''): array {
    $hits = [];
    foreach ($busy as $b) {
        if ($excludeId !== '' && ($b['id'] ?? '') === $excludeId) continue;
        if ($start < $b['end'] && $end > $b['start']) {
            $hits[] = [
                'title' => $b['title'], 'kind' => $b['kind'], 'id' => $b['id'],
                'time' => $b['time'] ?? '', 'end_time' => hm_to_time($b['end']),
                'overlap_minutes' => max(0, min($end, $b['end']) - max($start, $b['start'])),
                'all_day' => !empty($b['all_day']),
            ];
        }
    }
    return $hits;
}

/** ادغام بازه‌های مشغول */
function hm_merge_intervals(array $busy): array {
    $merged = [];
    foreach ($busy as $b) {
        if (count($merged) > 0 && $b['start'] <= $merged[count($merged) - 1]['end']) {
            $merged[count($merged) - 1]['end'] = max($merged[count($merged) - 1]['end'], $b['end']);
        } else {
            $merged[] = ['start' => $b['start'], 'end' => $b['end']];
        }
    }
    return $merged;
}

/** زمان‌های آزاد واقعی در بازهٔ کاری */
function hm_free_slots(array $tasks, array $events, array $holidays, array $ctx,
                       string $fromIso, string $toIso, int $duration, string $workStart, string $workEnd, array $workDays): array {
    $ws = hm_to_min($workStart) ?? 480;
    $we = hm_to_min($workEnd) ?? 1200;
    $slots = [];
    $total = 0;
    $iso = $fromIso;
    $guard = 0;
    while ($iso <= $toIso && $guard++ < 120) {
        $dow = hm_jalali_dow($iso);
        if ($dow !== 6 && in_array($dow, $workDays, true)) {
            $isHoliday = false;
            $holidayTitle = '';
            foreach ($holidays as $h) {
                if (substr((string)($h['gregorianDate'] ?? $h['gregorian_date'] ?? ''), 0, 10) === $iso
                    && !empty($h['isOfficialHoliday'])) {
                    $isHoliday = true;
                    $holidayTitle = (string)($h['title'] ?? '');
                    break;
                }
            }
            if (!$isHoliday) {
                $busy = hm_merge_intervals(hm_busy_intervals($tasks, $events, $iso));
                $cur = $ws;
                foreach ($busy as $b) {
                    if ($b['start'] - $cur >= $duration && $b['start'] > $ws) {
                        $slots[] = [
                            'date' => $iso, 'jalali' => hm_jalali_of_iso($iso),
                            'weekday' => HM_WEEKDAYS[$dow],
                            'start_time' => hm_to_time($cur), 'end_time' => hm_to_time($b['start']),
                            'minutes' => $b['start'] - $cur,
                        ];
                        $total += $b['start'] - $cur;
                    }
                    $cur = max($cur, $b['end']);
                }
                if ($we - $cur >= $duration) {
                    $slots[] = [
                        'date' => $iso, 'jalali' => hm_jalali_of_iso($iso),
                        'weekday' => HM_WEEKDAYS[$dow],
                        'start_time' => hm_to_time($cur), 'end_time' => hm_to_time($we),
                        'minutes' => $we - $cur,
                    ];
                    $total += $we - $cur;
                }
            }
        }
        $iso = hm_add_days_iso($iso, 1);
    }
    usort($slots, function ($a, $b) {
        if ($a['minutes'] === $b['minutes']) return strcmp($a['date'], $b['date']);
        return $b['minutes'] - $a['minutes'];
    });
    return ['slots' => array_slice($slots, 0, 12), 'total_free_minutes' => $total];
}

/** خلاصهٔ خوانا از یک روز */
function hm_day_summary_text(array $tasks, array $events, array $occasions, string $iso, string $title): string {
    $lines = [];
    $busy = hm_busy_intervals($tasks, $events, $iso);
    if (count($busy) === 0) {
        $lines[] = 'برنامه‌ای ثبت نشده.';
    } else {
        foreach ($busy as $b) {
            $kind = $b['kind'] === 'event' ? 'رویداد' : 'کار';
            $when = !empty($b['all_day']) ? 'بدون ساعت مشخص' : ('ساعت ' . hm_fa_digits($b['time']));
            $lines[] = sprintf('%s: %s — %s', $kind, $b['title'], $when);
        }
    }
    foreach ($occasions as $o) {
        if (substr((string)($o['gregorian_date'] ?? $o['gregorianDate'] ?? ''), 0, 10) !== $iso) continue;
        $lines[] = '📌 مناسبت: ' . (string)($o['title'] ?? '')
                 . (!empty($o['is_official_holiday']) || !empty($o['isOfficialHoliday']) ? ' (تعطیل رسمی)' : '');
    }
    return $title . ':' . "\n" . implode("\n", $lines);
}

if (!defined('HM_JALALI_MONTHS')) {
    define('HM_JALALI_MONTHS', ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
                                'مهر','آبان','آذر','دی','بهمن','اسفند']);
    define('HM_JALALI_MONTHS_ALT', ['فروردين','ارديبهشت','خرداد','تير','مرداد','شهريور',
                                    'مهر','ابان','اذر','دي','بهمن','اسفند']);
    define('HM_WEEKDAYS', ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه']);
    define('HM_MAX_ITERATIONS', 6);
    define('HM_MAX_MODEL_CALLS', 8);
}

/**
 * ============================================================================
 *  همدم — موتور ابزار و حلقهٔ عامل (Assistant v2, part 2)
 * ============================================================================
 *  ابزارها روی دادهٔ واقعی تقویم کاربر اجرا می‌شوند (کارها، رویدادها، مناسبت‌ها).
 *  کارت‌های رابط کاربری از «نتیجهٔ واقعی ابزار» ساخته می‌شوند، نه از متن مدل؛
 *  پس مدل هرگز نمی‌تواند دادهٔ ساختگی نشان دهد.
 * ============================================================================
 */



/** فهرست ابزارها — هم به شکل OpenAI tools و هم خلاصهٔ JSON برای fallback */
function hm_tool_specs(): array {
    return [
        [
            'name' => 'get_schedule',
            'description' => 'برنامهٔ یک روز یا یک بازهٔ زمانی را برمی‌گرداند (کارها، رویدادها، مناسبت‌ها). برای هر سؤالی مثل «چیکارم؟»، «برنامه امروز»، «چهارشنبه چه دارم» از این ابزار استفاده کن.',
            'params' => [
                'date'      => ['type' => 'string', 'description' => 'تاریخ شروع — می‌تواند طبیعی باشد: «امروز»، «فردا»، «چهارشنبه»، «چهارشنبه این هفته»، «۱۵ آبان»، «1405/07/20»، «2026-10-14»', 'required' => true],
                'days'      => ['type' => 'integer', 'description' => 'تعداد روزهای بعد از تاریخ شروع (پیش‌فرض ۱)', 'required' => false],
            ],
        ],
        [
            'name' => 'check_conflicts',
            'description' => 'بررسی می‌کند آیا در تاریخ و ساعت مشخص با کار/رویداد دیگری تداخل وجود دارد یا نه. قبل از هر ثبت زمان‌دار و هر وقت کاربر پرسید «آیا وقت دارم؟» این را صدا بزن.',
            'params' => [
                'date'            => ['type' => 'string', 'description' => 'تاریخ (طبیعی یا ISO)', 'required' => true],
                'start_time'      => ['type' => 'string', 'description' => 'ساعت شروع HH:MM', 'required' => true],
                'duration_minutes' => ['type' => 'integer', 'description' => 'مدت به دقیقه (پیش‌فرض ۶۰)', 'required' => false],
            ],
        ],
        [
            'name' => 'find_free_time',
            'description' => 'زمان‌های آزاد واقعی کاربر را در بازهٔ کاری‌اش پیدا می‌کند. برای «کی وقت دارم؟»، «چه ساعتی برای مسافرت خوبه؟» و پیشنهاد زمان مناسب.',
            'params' => [
                'duration_minutes' => ['type' => 'integer', 'description' => 'مدت لازم به دقیقه', 'required' => true],
                'from_date' => ['type' => 'string', 'description' => 'از چه تاریخی (پیش‌فرض امروز)', 'required' => false],
                'days'      => ['type' => 'integer', 'description' => 'چند روز جلوتر بررسی شود (پیش‌فرض ۷)', 'required' => false],
            ],
        ],
        [
            'name' => 'create_task',
            'description' => 'ثبت کار جدید. فقط وقتی کاربر صریحاً خواسته یا جملهٔ خبری از یک تعهد است («فردا باید...»، «یادت باشه...»). اگر ساعت نگفته time را خالی بگذار.',
            'params' => [
                'title'      => ['type' => 'string', 'description' => 'عنوان کوتاه کار', 'required' => true],
                'date'       => ['type' => 'string', 'description' => 'تاریخ (طبیعی یا ISO)', 'required' => true],
                'time'       => ['type' => 'string', 'description' => 'ساعت HH:MM — اگر کاربر نگفته خالی بگذار', 'required' => false],
                'duration_minutes' => ['type' => 'integer', 'description' => 'مدت تخمینی به دقیقه', 'required' => false],
                'priority'   => ['type' => 'string', 'description' => 'low | medium | high', 'required' => false],
                'category'   => ['type' => 'string', 'description' => 'work | personal | health | finance | education | social | other', 'required' => false],
                'recurrence' => ['type' => 'string', 'description' => 'none | daily | weekly | monthly | yearly', 'required' => false],
            ],
        ],
        [
            'name' => 'create_event',
            'description' => 'ثبت رویداد/جلسه/قرار جدید با ساعت مشخص.',
            'params' => [
                'title'      => ['type' => 'string', 'description' => 'عنوان رویداد', 'required' => true],
                'date'       => ['type' => 'string', 'description' => 'تاریخ (طبیعی یا ISO)', 'required' => true],
                'start_time' => ['type' => 'string', 'description' => 'ساعت شروع HH:MM', 'required' => false],
                'end_time'   => ['type' => 'string', 'description' => 'ساعت پایان HH:MM', 'required' => false],
                'location'   => ['type' => 'string', 'description' => 'مکان', 'required' => false],
                'category'   => ['type' => 'string', 'description' => 'work | personal | meeting | other', 'required' => false],
            ],
        ],
        [
            'name' => 'create_reminder',
            'description' => 'ثبت یادآوری ساده (مثل «یادم بنداز فردا ساعت ۱۰ زنگ بزنم»).',
            'params' => [
                'title' => ['type' => 'string', 'description' => 'متن یادآوری', 'required' => true],
                'date'  => ['type' => 'string', 'description' => 'تاریخ (طبیعی یا ISO)', 'required' => true],
                'time'  => ['type' => 'string', 'description' => 'ساعت HH:MM', 'required' => false],
            ],
        ],
        [
            'name' => 'update_item',
            'description' => 'تغییر زمان یا عنوان یک کار/رویداد موجود. برای «جابه‌جاش کن»، «بذارش ساعت ۴»، «کنسل کن و ...».',
            'params' => [
                'id'   => ['type' => 'string', 'description' => 'شناسهٔ آیتم از نتیجهٔ get_schedule یا search_items', 'required' => true],
                'date' => ['type' => 'string', 'description' => 'تاریخ جدید', 'required' => false],
                'time' => ['type' => 'string', 'description' => 'ساعت جدید HH:MM', 'required' => false],
                'title' => ['type' => 'string', 'description' => 'عنوان جدید', 'required' => false],
                'duration_minutes' => ['type' => 'integer', 'description' => 'مدت جدید', 'required' => false],
            ],
        ],
        [
            'name' => 'cancel_item',
            'description' => 'حذف/کنسل کردن یک کار یا رویداد با شناسه.',
            'params' => [
                'id' => ['type' => 'string', 'description' => 'شناسهٔ آیتم', 'required' => true],
            ],
        ],
        [
            'name' => 'complete_task',
            'description' => 'علامت‌زدن یک کار به‌عنوان انجام‌شده.',
            'params' => [
                'id' => ['type' => 'string', 'description' => 'شناسهٔ کار', 'required' => true],
            ],
        ],
        [
            'name' => 'search_items',
            'description' => 'جست‌وجو در کارها، رویدادها و مناسبت‌ها بر اساس عنوان/مکان/شخص.',
            'params' => [
                'query' => ['type' => 'string', 'description' => 'متن جست‌وجو', 'required' => true],
            ],
        ],
        [
            'name' => 'days_until',
            'description' => 'فاصلهٔ روزها تا یک تاریخ یا مناسبت («تا سال تحویل چند روز مونده؟»، «تا یلدا چند روزه؟»).',
            'params' => [
                'target' => ['type' => 'string', 'description' => 'تاریخ یا نام مناسبت به‌صورت طبیعی', 'required' => true],
            ],
        ],
        [
            'name' => 'get_occasions',
            'description' => 'فهرست مناسبت‌ها و تعطیلات رسمی پیش‌رو.',
            'params' => [
                'days' => ['type' => 'integer', 'description' => 'چند روز جلوتر (پیش‌فرض ۳۰)', 'required' => false],
            ],
        ],
    ];
}

/** تبدیل مشخصات به قالب OpenAI tools */
function hm_tool_schemas_openai(): array {
    $out = [];
    foreach (hm_tool_specs() as $t) {
        $props = [];
        $required = [];
        foreach ($t['params'] as $pname => $p) {
            $props[$pname] = ['type' => $p['type'], 'description' => $p['description']];
            if (!empty($p['required'])) $required[] = $pname;
        }
        $out[] = [
            'type' => 'function',
            'function' => [
                'name' => $t['name'],
                'description' => $t['description'],
                'parameters' => ['type' => 'object', 'properties' => $props, 'required' => $required],
            ],
        ];
    }
    return $out;
}

/** خلاصهٔ متنی ابزارها برای پرامپت fallback */
function hm_tools_prompt(): string {
    $lines = [];
    foreach (hm_tool_specs() as $t) {
        $ps = [];
        foreach ($t['params'] as $pname => $p) {
            $ps[] = $pname . (empty($p['required']) ? '?' : '');
        }
        $lines[] = sprintf('- %s(%s): %s', $t['name'], implode(', ', $ps), $t['description']);
    }
    return implode("\n", $lines);
}

// ─────────────────────────────────────────────────────────────────────────────
// اجرای ابزارها
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @return array{ok:bool,data:array,block:?array,action:?array}
 */
function hm_execute_tool(string $name, array $p, array $state): array {
    $ctx = $state['ctx'];
    $tasks = $state['tasks'];
    $events = $state['events'];
    $holidays = $state['holidays'];
    $prefs = $state['prefs'];

    $fail = function (string $msg) {
        return ['ok' => false, 'data' => ['error' => $msg], 'block' => null, 'action' => null];
    };

    switch ($name) {

        case 'get_schedule': {
            $days = max(1, min(31, (int)($p['days'] ?? 1)));
            $r = hm_resolve_date($p['date'] ?? 'امروز', $ctx, $holidays);
            $from = $r['iso'];
            $to = hm_add_days_iso($from, $days - 1);
            $result = [];
            $allItems = [];
            $iso = $from;
            $guard = 0;
            while ($iso <= $to && $guard++ < 32) {
                $busy = hm_busy_intervals($tasks, $events, $iso);
                $occ = [];
                foreach ($holidays as $h) {
                    if (substr((string)($h['gregorianDate'] ?? $h['gregorian_date'] ?? ''), 0, 10) === $iso) {
                        $occ[] = [
                            'title' => (string)($h['title'] ?? ''),
                            'is_official_holiday' => !empty($h['isOfficialHoliday']) || !empty($h['is_official_holiday']),
                        ];
                    }
                }
                $items = [];
                foreach ($busy as $b) {
                    $items[] = [
                        'id' => $b['id'],
                        'kind' => $b['kind'],
                        'title' => $b['title'],
                        'time' => $b['time'],
                        'end_time' => !empty($b['all_day']) ? '' : hm_to_time($b['end']),
                        'all_day' => !empty($b['all_day']),
                        'location' => $b['location'] ?? '',
                    ];
                    $allItems[] = $items[count($items) - 1];
                }
                $j = hm_j_of_iso($iso);
                $result[] = [
                    'date' => $iso,
                    'jalali' => hm_jalali_str($j[0], $j[1], $j[2]),
                    'jalali_pretty' => sprintf('%d %s %d', $j[2], HM_JALALI_MONTHS[$j[1] - 1], $j[0]),
                    'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)],
                    'items' => $items,
                    'occasions' => $occ,
                    'is_holiday' => count(array_filter($occ, fn($o) => $o['is_official_holiday'])) > 0,
                ];
                $iso = hm_add_days_iso($iso, 1);
            }
            return [
                'ok' => true,
                'data' => ['from' => $from, 'to' => $to, 'days' => $result, 'resolved_note' => $r['note']],
                'block' => ['type' => 'day_schedule', 'days' => $result],
                'action' => null,
            ];
        }

        case 'check_conflicts': {
            $r = hm_resolve_date($p['date'] ?? 'امروز', $ctx, $holidays);
            $start = hm_to_min($p['start_time'] ?? '');
            if ($start === null) return $fail('ساعت شروع نامعتبر است');
            $dur = max(5, min(720, (int)($p['duration_minutes'] ?? 60)));
            $busy = hm_busy_intervals($tasks, $events, $r['iso']);
            $hits = hm_find_conflicts($busy, $start, $start + $dur);
            $free = hm_free_slots($tasks, $events, $holidays, $ctx, $r['iso'], $r['iso'], $dur,
                (string)($prefs['workStart'] ?? '08:00'), (string)($prefs['workEnd'] ?? '20:00'),
                is_array($prefs['workDays'] ?? null) ? $prefs['workDays'] : [0,1,2,3,4]);
            $suggestions = [];
            foreach ($free['slots'] as $s) {
                $suggestions[] = ['start' => $s['start_time'], 'end' => $s['end_time'], 'minutes' => $s['minutes']];
                if (count($suggestions) >= 3) break;
            }
            $has = count($hits) > 0;
            return [
                'ok' => true,
                'data' => [
                    'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                    'requested_start' => hm_to_time($start), 'requested_end' => hm_to_time($start + $dur),
                    'has_conflict' => $has, 'conflicts' => $hits,
                    'free_suggestions' => $suggestions,
                ],
                'block' => $has ? [
                    'type' => 'conflict',
                    'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                    'requested' => ['start' => hm_to_time($start), 'end' => hm_to_time($start + $dur), 'minutes' => $dur],
                    'conflicts' => $hits,
                    'suggestions' => $suggestions,
                ] : null,
                'action' => null,
            ];
        }

        case 'find_free_time': {
            $dur = max(5, min(720, (int)($p['duration_minutes'] ?? 60)));
            $days = max(1, min(30, (int)($p['days'] ?? 7)));
            $r = hm_resolve_date($p['from_date'] ?? 'امروز', $ctx, $holidays);
            $to = hm_add_days_iso($r['iso'], $days - 1);
            $free = hm_free_slots($tasks, $events, $holidays, $ctx, $r['iso'], $to, $dur,
                (string)($prefs['workStart'] ?? '08:00'), (string)($prefs['workEnd'] ?? '20:00'),
                is_array($prefs['workDays'] ?? null) ? $prefs['workDays'] : [0,1,2,3,4]);
            return [
                'ok' => true,
                'data' => [
                    'duration_minutes' => $dur, 'from' => $r['iso'], 'to' => $to,
                    'slots' => $free['slots'], 'total_free_minutes' => $free['total_free_minutes'],
                ],
                'block' => [
                    'type' => 'free_slots', 'duration_minutes' => $dur,
                    'from' => $r['iso'], 'to' => $to, 'slots' => $free['slots'],
                ],
                'action' => null,
            ];
        }

        case 'create_task':
        case 'create_reminder': {
            $title = trim((string)($p['title'] ?? ''));
            if ($title === '') return $fail('عنوان کار خالی است');
            $r = hm_resolve_date($p['date'] ?? 'امروز', $ctx, $holidays);
            $time = isset($p['time']) ? trim((string)$p['time']) : '';
            if ($time === 'null') $time = '';
            $start = hm_to_min($time);
            $dur = max(5, min(720, (int)($p['duration_minutes'] ?? 60)));

            if ($start !== null) {
                $busy = hm_busy_intervals($tasks, $events, $r['iso']);
                $hits = hm_find_conflicts($busy, $start, $start + $dur);
                if (count($hits) > 0) {
                    $free = hm_free_slots($tasks, $events, $holidays, $ctx, $r['iso'], $r['iso'], $dur,
                        (string)($prefs['workStart'] ?? '08:00'), (string)($prefs['workEnd'] ?? '20:00'),
                        is_array($prefs['workDays'] ?? null) ? $prefs['workDays'] : [0,1,2,3,4]);
                    $sug = [];
                    foreach ($free['slots'] as $s) {
                        $sug[] = ['start' => $s['start_time'], 'end' => $s['end_time'], 'minutes' => $s['minutes']];
                        if (count($sug) >= 3) break;
                    }
                    return [
                        'ok' => true,
                        'data' => [
                            'blocked' => true, 'date' => $r['iso'], 'jalali' => $r['jalali'],
                            'conflicts' => $hits, 'free_suggestions' => $sug,
                            'message' => 'تداخل دارد — کار ثبت نشد. کاربر باید کنسل کند یا زمان را عوض کند.',
                        ],
                        'block' => [
                            'type' => 'conflict', 'pending_title' => $title,
                            'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                            'requested' => ['start' => hm_to_time($start), 'end' => hm_to_time($start + $dur), 'minutes' => $dur],
                            'conflicts' => $hits, 'suggestions' => $sug,
                        ],
                        'action' => null,
                    ];
                }
            }

            $action = [
                'type' => 'create_task',
                'label' => 'ثبت کار',
                'payload' => [
                    'title' => $title,
                    'dueDate' => $r['iso'],
                    'dueTime' => $start !== null ? hm_to_time($start) : '',
                    'duration' => $dur,
                    'priority' => in_array((string)($p['priority'] ?? 'medium'), ['low','medium','high'], true) ? (string)$p['priority'] : 'medium',
                    'category' => (string)($p['category'] ?? 'other'),
                    'recurrence' => (string)($p['recurrence'] ?? 'none'),
                    'status' => 'pending',
                ],
                'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
            ];
            return [
                'ok' => true,
                'data' => ['pending' => true, 'title' => $title, 'date' => $r['iso'],
                           'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                           'time' => $start !== null ? hm_to_time($start) : null,
                           'resolved_note' => $r['note']],
                'block' => [
                    'type' => 'pending',
                    'kind' => $name === 'create_reminder' ? 'reminder' : 'task',
                    'title' => $title,
                    'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                    'time' => $start !== null ? hm_to_time($start) : '',
                    'duration_minutes' => $dur,
                    'needs_time' => $start === null,
                ],
                'action' => $action,
            ];
        }

        case 'create_event': {
            $title = trim((string)($p['title'] ?? ''));
            if ($title === '') return $fail('عنوان رویداد خالی است');
            $r = hm_resolve_date($p['date'] ?? 'امروز', $ctx, $holidays);
            $start = hm_to_min($p['start_time'] ?? '');
            $end = hm_to_min($p['end_time'] ?? '');
            $dur = 60;
            if ($start !== null) {
                if ($end === null || $end <= $start) $end = $start + 60;
                $dur = $end - $start;
                $busy = hm_busy_intervals($tasks, $events, $r['iso']);
                $hits = hm_find_conflicts($busy, $start, $end);
                if (count($hits) > 0) {
                    $free = hm_free_slots($tasks, $events, $holidays, $ctx, $r['iso'], $r['iso'], $dur,
                        (string)($prefs['workStart'] ?? '08:00'), (string)($prefs['workEnd'] ?? '20:00'),
                        is_array($prefs['workDays'] ?? null) ? $prefs['workDays'] : [0,1,2,3,4]);
                    $sug = [];
                    foreach ($free['slots'] as $s) {
                        $sug[] = ['start' => $s['start_time'], 'end' => $s['end_time'], 'minutes' => $s['minutes']];
                        if (count($sug) >= 3) break;
                    }
                    return [
                        'ok' => true,
                        'data' => ['blocked' => true, 'date' => $r['iso'], 'jalali' => $r['jalali'],
                                   'conflicts' => $hits, 'free_suggestions' => $sug,
                                   'message' => 'تداخل دارد — رویداد ثبت نشد. کاربر باید کنسل کند یا زمان را عوض کند.'],
                        'block' => [
                            'type' => 'conflict', 'pending_title' => $title,
                            'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                            'requested' => ['start' => hm_to_time($start), 'end' => hm_to_time($end), 'minutes' => $dur],
                            'conflicts' => $hits, 'suggestions' => $sug,
                        ],
                        'action' => null,
                    ];
                }
            }
            return [
                'ok' => true,
                'data' => ['pending' => true, 'title' => $title, 'date' => $r['iso'], 'jalali' => $r['jalali']],
                'block' => [
                    'type' => 'pending', 'kind' => 'event', 'title' => $title,
                    'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                    'time' => $start !== null ? hm_to_time($start) : '',
                    'end_time' => $start !== null ? hm_to_time($end) : '',
                    'location' => (string)($p['location'] ?? ''),
                    'needs_time' => $start === null,
                ],
                'action' => [
                    'type' => 'create_event', 'label' => 'ثبت رویداد',
                    'payload' => [
                        'title' => $title, 'date' => $r['iso'],
                        'startTime' => $start !== null ? hm_to_time($start) : '10:00',
                        'endTime' => $start !== null ? hm_to_time($end) : '',
                        'location' => (string)($p['location'] ?? ''),
                        'category' => (string)($p['category'] ?? 'work'),
                    ],
                    'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                ],
            ];
        }

        case 'update_item': {
            $id = trim((string)($p['id'] ?? ''));
            if ($id === '') return $fail('شناسه لازم است');
            $kind = null; $item = null;
            foreach ($tasks as $t) { if ((string)($t['id'] ?? '') === $id) { $kind = 'task'; $item = $t; break; } }
            if (!$item) foreach ($events as $e) { if ((string)($e['id'] ?? '') === $id) { $kind = 'event'; $item = $e; break; } }
            if (!$item) return $fail('آیتمی با این شناسه پیدا نشد');

            $dateR = isset($p['date']) && trim((string)$p['date']) !== ''
                ? hm_resolve_date($p['date'], $ctx, $holidays) : null;
            $newDate = $dateR ? $dateR['iso'] : substr((string)($item['dueDate'] ?? $item['date'] ?? ''), 0, 10);
            $timeRaw = isset($p['time']) ? trim((string)$p['time']) : '';
            $newTime = $timeRaw !== '' && $timeRaw !== 'null' ? hm_to_time(hm_to_min($timeRaw) ?? 0) : null;
            $dur = (int)($p['duration_minutes'] ?? $item['duration'] ?? 60);
            $title = trim((string)($p['title'] ?? '')) ?: (string)($item['title'] ?? '');

            $start = $newTime !== null ? hm_to_min($newTime) : hm_to_min((string)($item['dueTime'] ?? $item['startTime'] ?? ''));
            if ($start !== null) {
                $busy = hm_busy_intervals($tasks, $events, $newDate);
                $hits = hm_find_conflicts($busy, $start, $start + max(5, $dur), $id);
                if (count($hits) > 0) {
                    return [
                        'ok' => true,
                        'data' => ['blocked' => true, 'date' => $newDate, 'conflicts' => $hits,
                                   'message' => 'زمان جدید هم تداخل دارد.'],
                        'block' => [
                            'type' => 'conflict', 'pending_title' => $title,
                            'date' => $newDate, 'jalali' => hm_jalali_of_iso($newDate), 'weekday' => HM_WEEKDAYS[hm_jalali_dow($newDate)],
                            'requested' => ['start' => hm_to_time($start), 'end' => hm_to_time($start + max(5, $dur)), 'minutes' => max(5, $dur)],
                            'conflicts' => $hits, 'suggestions' => [],
                        ],
                        'action' => null,
                    ];
                }
            }
            $payload = ['id' => $id];
            if ($dateR) $payload['date'] = $newDate;
            if ($newTime !== null) $payload[$kind === 'task' ? 'dueTime' : 'startTime'] = $newTime;
            if (isset($p['duration_minutes'])) $payload['duration'] = max(5, $dur);
            if (isset($p['title'])) $payload['title'] = $title;
            return [
                'ok' => true,
                'data' => ['pending' => true, 'id' => $id, 'kind' => $kind, 'date' => $newDate,
                           'jalali' => hm_jalali_of_iso($newDate), 'time' => $newTime],
                'block' => [
                    'type' => 'pending', 'kind' => $kind === 'task' ? 'task_update' : 'event_update',
                    'title' => $title, 'date' => $newDate, 'jalali' => hm_jalali_of_iso($newDate),
                    'weekday' => HM_WEEKDAYS[hm_jalali_dow($newDate)], 'time' => (string)$newTime,
                ],
                'action' => ['type' => 'update_item', 'label' => 'تغییر بده',
                             'payload' => $payload, 'kind' => $kind,
                             'date' => $newDate, 'jalali' => hm_jalali_of_iso($newDate)],
            ];
        }

        case 'cancel_item': {
            $id = trim((string)($p['id'] ?? ''));
            if ($id === '') return $fail('شناسه لازم است');
            $kind = null; $item = null;
            foreach ($tasks as $t) { if ((string)($t['id'] ?? '') === $id) { $kind = 'task'; $item = $t; break; } }
            if (!$item) foreach ($events as $e) { if ((string)($e['id'] ?? '') === $id) { $kind = 'event'; $item = $e; break; } }
            if (!$item) return $fail('آیتمی با این شناسه پیدا نشد');
            $iso = substr((string)($item['dueDate'] ?? $item['date'] ?? ''), 0, 10);
            return [
                'ok' => true,
                'data' => ['pending' => true, 'id' => $id, 'kind' => $kind, 'title' => (string)$item['title']],
                'block' => [
                    'type' => 'pending', 'kind' => $kind === 'task' ? 'task_cancel' : 'event_cancel',
                    'title' => (string)$item['title'], 'date' => $iso, 'jalali' => hm_jalali_of_iso($iso),
                    'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)],
                    'time' => (string)($item['dueTime'] ?? $item['startTime'] ?? ''),
                ],
                'action' => ['type' => 'cancel_item', 'label' => 'کنسل کن',
                             'payload' => ['id' => $id], 'kind' => $kind, 'title' => (string)$item['title']],
            ];
        }

        case 'complete_task': {
            $id = trim((string)($p['id'] ?? ''));
            if ($id === '') return $fail('شناسه لازم است');
            $item = null;
            foreach ($tasks as $t) { if ((string)($t['id'] ?? '') === $id) { $item = $t; break; } }
            if (!$item) return $fail('کاری با این شناسه پیدا نشد');
            return [
                'ok' => true,
                'data' => ['pending' => true, 'id' => $id, 'title' => (string)$item['title']],
                'block' => ['type' => 'pending', 'kind' => 'task_done', 'title' => (string)$item['title'],
                            'date' => substr((string)$item['dueDate'], 0, 10),
                            'jalali' => hm_jalali_of_iso(substr((string)$item['dueDate'], 0, 10)),
                            'weekday' => HM_WEEKDAYS[hm_jalali_dow(substr((string)$item['dueDate'], 0, 10))],
                            'time' => (string)($item['dueTime'] ?? '')],
                'action' => ['type' => 'complete_task', 'label' => 'انجام شد',
                             'payload' => ['id' => $id], 'kind' => 'task', 'title' => (string)$item['title']],
            ];
        }

        case 'search_items': {
            $q = hm_normalize_fa(trim((string)($p['query'] ?? '')));
            if ($q === '') return $fail('متن جست‌وجو خالی است');
            $hits = [];
            foreach ($tasks as $t) {
                $hay = hm_normalize_fa((string)($t['title'] ?? '') . ' ' . (string)($t['description'] ?? ''));
                if (mb_strpos($hay, $q) !== false) {
                    $iso = substr((string)($t['dueDate'] ?? ''), 0, 10);
                    $hits[] = ['id' => (string)$t['id'], 'kind' => 'task', 'title' => (string)$t['title'],
                               'date' => $iso, 'jalali' => hm_jalali_of_iso($iso),
                               'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)],
                               'time' => (string)($t['dueTime'] ?? ''), 'status' => (string)($t['status'] ?? '')];
                }
            }
            foreach ($events as $e) {
                $hay = hm_normalize_fa((string)($e['title'] ?? '') . ' ' . (string)($e['location'] ?? ''));
                if (mb_strpos($hay, $q) !== false) {
                    $iso = substr((string)($e['date'] ?? ''), 0, 10);
                    $hits[] = ['id' => (string)$e['id'], 'kind' => 'event', 'title' => (string)$e['title'],
                               'date' => $iso, 'jalali' => hm_jalali_of_iso($iso),
                               'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)],
                               'time' => (string)($e['startTime'] ?? ''), 'location' => (string)($e['location'] ?? '')];
                }
            }
            $occ = [];
            foreach ($holidays as $h) {
                $hay = hm_normalize_fa((string)($h['title'] ?? ''));
                if (mb_strpos($hay, $q) !== false) {
                    $iso = substr((string)($h['gregorianDate'] ?? $h['gregorian_date'] ?? ''), 0, 10);
                    $occ[] = ['title' => (string)$h['title'], 'date' => $iso,
                              'jalali' => hm_jalali_of_iso($iso),
                              'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)],
                              'is_official_holiday' => !empty($h['isOfficialHoliday'])];
                }
            }
            usort($hits, fn($a, $b) => strcmp($a['date'], $b['date']));
            return [
                'ok' => true,
                'data' => ['query' => $q, 'items' => array_slice($hits, 0, 15),
                           'occasions' => array_slice($occ, 0, 8),
                           'total' => count($hits) + count($occ)],
                'block' => (count($hits) + count($occ)) > 0
                    ? ['type' => 'search', 'query' => (string)$p['query'],
                       'items' => array_slice($hits, 0, 15), 'occasions' => array_slice($occ, 0, 8)]
                    : null,
                'action' => null,
            ];
        }

        case 'days_until': {
            $r = hm_resolve_date($p['target'] ?? 'امروز', $ctx, $holidays);
            $days = hm_diff_days($ctx['today_iso'], $r['iso']);
            $label = (string)($p['target'] ?? '');
            return [
                'ok' => true,
                'data' => ['target' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                           'days_remaining' => $days, 'is_past' => $days < 0,
                           'resolved_note' => $r['note'], 'today_iso' => $ctx['today_iso'],
                           'today_jalali' => $ctx['today_jalali']],
                'block' => ['type' => 'countdown', 'label' => $label,
                            'date' => $r['iso'], 'jalali' => $r['jalali'], 'weekday' => $r['weekday'],
                            'days' => $days, 'is_past' => $days < 0],
                'action' => null,
            ];
        }

        case 'get_occasions': {
            $days = max(1, min(365, (int)($p['days'] ?? 30)));
            $to = hm_add_days_iso($ctx['today_iso'], $days);
            $list = [];
            foreach ($holidays as $h) {
                $iso = substr((string)($h['gregorianDate'] ?? $h['gregorian_date'] ?? ''), 0, 10);
                if ($iso === '' || $iso < $ctx['today_iso'] || $iso > $to) continue;
                $list[] = [
                    'title' => (string)($h['title'] ?? ''),
                    'date' => $iso,
                    'jalali' => hm_jalali_of_iso($iso),
                    'weekday' => HM_WEEKDAYS[hm_jalali_dow($iso)],
                    'days_remaining' => hm_diff_days($ctx['today_iso'], $iso),
                    'is_official_holiday' => !empty($h['isOfficialHoliday']) || !empty($h['is_official_holiday']),
                ];
            }
            usort($list, fn($a, $b) => strcmp($a['date'], $b['date']));
            $list = array_slice($list, 0, 20);
            return [
                'ok' => true,
                'data' => ['from' => $ctx['today_iso'], 'to' => $to, 'occasions' => $list],
                'block' => count($list) > 0 ? ['type' => 'occasions', 'items' => $list] : null,
                'action' => null,
            ];
        }

        default:
            return $fail('ابزار ناشناخته: ' . $name);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// پرامپت سیستم
// ─────────────────────────────────────────────────────────────────────────────

function hm_system_prompt(array $ctx, array $state, string $mode): string {
    $prefs = $state['prefs'];
    $workStart = (string)($prefs['workStart'] ?? '08:00');
    $workEnd = (string)($prefs['workEnd'] ?? '20:00');

    // خلاصهٔ فشردهٔ داده‌های کاربر (برای اینکه مدل بتواند بدون ابزار هم پاسخ درست بدهد)
    $compactTasks = [];
    foreach ($state['tasks'] as $t) {
        if (($t['status'] ?? 'pending') !== 'pending') continue;
        $iso = substr((string)($t['dueDate'] ?? ''), 0, 10);
        if ($iso === '') continue;
        $compactTasks[] = ['id' => (string)($t['id'] ?? ''), 't' => (string)($t['title'] ?? ''),
                           'd' => $iso, 'h' => (string)($t['dueTime'] ?? '')];
        if (count($compactTasks) >= 60) break;
    }
    $compactEvents = [];
    foreach ($state['events'] as $e) {
        $iso = substr((string)($e['date'] ?? ''), 0, 10);
        if ($iso === '' || $iso < $ctx['today_iso']) continue;
        $compactEvents[] = ['id' => (string)($e['id'] ?? ''), 't' => (string)($e['title'] ?? ''),
                            'd' => $iso, 's' => (string)($e['startTime'] ?? ''),
                            'l' => (string)($e['location'] ?? '')];
        if (count($compactEvents) >= 40) break;
    }
    $compactOcc = [];
    foreach ($state['holidays'] as $h) {
        $iso = substr((string)($h['gregorianDate'] ?? $h['gregorian_date'] ?? ''), 0, 10);
        if ($iso === '' || $iso < $ctx['today_iso']) continue;
        $compactOcc[] = ['t' => (string)($h['title'] ?? ''), 'd' => $iso,
                         'j' => hm_jalali_of_iso($iso), 'off' => !empty($h['isOfficialHoliday'])];
        if (count($compactOcc) >= 25) break;
    }

    $data = [
        'today_iso'        => $ctx['today_iso'],
        'today_jalali'     => $ctx['today_jalali'],
        'today_pretty'     => $ctx['today_jalali_pretty'] . ' (' . $ctx['today_weekday'] . ')',
        'now_time'         => $ctx['now_time'],
        'tomorrow_iso'     => $ctx['tomorrow_iso'],
        'day_after_iso'    => $ctx['day_after_iso'],
        'week_start_iso'   => $ctx['week_start_iso'],
        'week_end_iso'     => $ctx['week_end_iso'],
        'next_week_start'  => $ctx['next_week_start_iso'],
        'nowruz_next_iso'  => $ctx['nowruz_next_iso'],
        'nowruz_next_jalali' => $ctx['nowruz_next_jalali'],
        'week_days'        => $ctx['this_week_days'],
        'work_hours'       => $workStart . '-' . $workEnd,
        'pending_tasks'    => $compactTasks,
        'upcoming_events'  => $compactEvents,
        'upcoming_occasions' => $compactOcc,
    ];

    $p = "تو «دستیار همدم» هستی؛ مدیر برنامهٔ شخصی کاربر فارسی‌زبان. وظیفه‌ات این است که مثل یک مدیر برنامهٔ واقعی، برنامهٔ کاربر را بدانی، به سؤال‌هایش دقیق جواب بدهی و کار/رویداد/یادآوری برایش ثبت، جابه‌جا یا کنسل کنی.\n\n";

    $p .= "═══ زمان حال (منبع حقیقت) ═══\n";
    $p .= "امروز: " . $ctx['today_jalali'] . " جلالی / " . $ctx['today_iso'] . " میلادی — " . $ctx['today_weekday'] . "\n";
    $p .= "ساعت فعلی تهران: " . $ctx['now_time'] . "\n";
    $p .= "فردا: " . $ctx['tomorrow_iso'] . " — پس‌فردا: " . $ctx['day_after_iso'] . "\n";
    $p .= "هفتهٔ جاری (شنبه تا جمعه): " . $ctx['week_start_iso'] . " تا " . $ctx['week_end_iso'] . "\n";
    $p .= "هفتهٔ آینده از " . $ctx['next_week_start_iso'] . " شروع می‌شود.\n";
    $p .= "ساعات کاری کاربر: " . $workStart . " تا " . $workEnd . "\n\n";

    $p .= "═══ قواعد قطعی (نقض نکن) ═══\n";
    $p .= "۱. هرگز از خودت تاریخ، ساعت، مناسبت یا برنامه نساز. هر عدد و هر فهرست باید از نتیجهٔ ابزار یا از دادهٔ زیر بیاید. اگر داده‌ای نداری، ابزار را صدا بزن؛ اگر ابزار جواب نداد، صریح بگو «اطلاعاتش را ندارم».\n";
    $p .= "۲. برای هر سؤال دربارهٔ برنامه (امروز، فردا، یک روز خاص، این هفته) حتماً ابزار get_schedule را صدا بزن — حتی اگر در دادهٔ زیر چیزی می‌بینی. دادهٔ زیر فقط خلاصه است.\n";
    $p .= "۳. برای هر سؤال «چند روز مانده؟» یا «تا فلان تاریخ چقدر وقت دارم؟» حتماً days_until را صدا بزن.\n";
    $p .= "۴. برای هر سؤال دربارهٔ مناسبت‌ها و تعطیلات، get_occasions یا search_items را صدا بزن.\n";
    $p .= "۵. هرگز خودت محاسبهٔ تاریخ انجام نده و ISO ننویس؛ به ابزارها تاریخ را به زبان طبیعی بده («چهارشنبه»، «فردا»، «۱۵ آبان»، «شب یلدا»، «سال تحویل»). سرور تاریخ را دقیق حل می‌کند.\n";
    $p .= "۶. قبل از هر ثبت زمان‌دار، تداخل با create_task/create_event خودکار بررسی می‌شود. اگر ابزار گفت «تداخل دارد»، تو هم باید صریح بگویی تداخل دارد و از کاربر بخواه یا مورد متداخل را کنسل کند یا زمان را عوض کند. هرگز در این حالت نگو «ثبت شد».\n";
    $p .= "۷. برای تغییر یا کنسل کردن، اول با get_schedule یا search_items شناسهٔ (id) آیتم را پیدا کن، بعد update_item یا cancel_item را با همان id صدا بزن. هیچ‌وقت id از خودت نساز.\n";
    $p .= "۸. اگر کاربر ساعت نگفته و ثبت نیاز به ساعت دارد، time را خالی بگذار تا از کاربر پرسیده شود.\n";
    $p .= "۹. اگر درخواست کاربر مبهم است (مثلاً «یه کاری برام ثبت کن») فقط یک سؤال کوتاه بپرس و پاسخ را در قالب JSON با کلید clarify برگردان.\n";
    $p .= "۱۰. پاسخ نهایی‌ات همیشه فارسی، کوتاه (۱ تا ۴ خط)، دوستانه و با اعداد فارسی باشد. از ایموجی فقط در حد یکی‌دو تا استفاده کن. فهرست‌های بلند را در متن تکرار نکن — کارت‌های رابط کاربری خودشان نمایش داده می‌شوند.\n";
    $p .= "۱۱. هرگز از Markdown استفاده نکن (نه ** نه ### نه جدول). متن ساده بنویس.\n\n";

    $p .= "═══ دادهٔ فعلی سامانه (خلاصه) ═══\n" . j_encode($data) . "\n\n";

    if ($mode === 'native') {
        $p .= "═══ نحوهٔ کار ═══\n";
        $p .= "ابزارهای موجود:\n" . hm_tools_prompt() . "\n";
        $p .= "ابزارها در اختیارت هستند. برای هر پیام کاربر، ابزار مناسب را با پارامترها صدا بزن. بعد از دیدن نتیجهٔ ابزار، پاسخ نهایی فارسی را بنویس. اگر به چند ابزار نیاز داری، پشت سر هم صدا بزن.\n";
        $p .= "اگر پیام کاربر فقط سلام/احوال‌پرسی/تشکر است یا سؤال عمومی بی‌ربط به تقویم، هیچ ابزاری صدا نزن و مستقیم جواب بده.\n";
    } else {
        $p .= "═══ ابزارها ═══\n" . hm_tools_prompt() . "\n\n";
        $p .= "═══ قالب پاسخ ═══\n";
        $p .= "برای صدا زدن ابزار، فقط یک JSON بده و هیچ متن اضافه‌ای ننویس:\n";
        $p .= "{\"tool\":\"نام_ابزار\",\"params\":{...}}\n";
        $p .= "برای پاسخ نهایی (وقتی دیگر ابزاری لازم نیست):\n";
        $p .= "{\"reply\":\"متن پاسخ فارسی\",\"clarify\":{\"quick_replies\":[\"گزینه ۱\",\"گزینه ۲\"]}}\n";
        $p .= "کلید clarify فقط وقتی لازم است که باید از کاربر سؤال بپرسی؛ در غیر این صورت حذفش کن.\n";
        $p .= "به یاد داشته باش: هیچ متن غیر JSON ننویس و هیچ عددی از خودت نساز.\n";
    }
    return $p;
}

// ─────────────────────────────────────────────────────────────────────────────
// حلقهٔ عامل
// ─────────────────────────────────────────────────────────────────────────────

/** فراخوانی مدل */
function hm_call_model(string $endpoint, string $key, string $model, array $messages, ?array $tools, float $temp, int $maxTokens): array {
    $payload = [
        'model' => $model,
        'messages' => $messages,
        'temperature' => $temp,
        'max_tokens' => $maxTokens,
    ];
    if ($tools !== null && count($tools) > 0) {
        $payload['tools'] = $tools;
        $payload['tool_choice'] = 'auto';
    }
    $r = http_post_json($endpoint, $payload, ["Authorization: Bearer {$key}"]);
    if ($r['error']) return ['ok' => false, 'error' => $r['error'], 'body' => null];
    if ($r['code'] >= 400) return ['ok' => false, 'error' => 'HTTP ' . $r['code'] . ' ' . substr((string)($r['raw'] ?? ''), 0, 300), 'body' => null];
    if ($r['body'] === null) return ['ok' => false, 'error' => 'پاسخ خالی', 'body' => null];
    $body = $r['body'];
    if (isset($body['choices'][0]['message'])) {
        $m = $body['choices'][0]['message'];
        if (empty($m['content']) && !empty($m['reasoning'])) {
            $body['choices'][0]['message']['content'] = $m['reasoning'];
        }
    }
    return ['ok' => true, 'error' => '', 'body' => $body];
}

/** استخراج JSON از متن مدل */
function hm_extract_json(string $raw): ?array {
    $cleaned = preg_replace('/```(?:json)?/i', '', $raw);
    $cleaned = trim((string)$cleaned);
    if ($cleaned === '') return null;
    $d = json_decode($cleaned, true);
    if (is_array($d)) return $d;
    $first = strpos($cleaned, '{');
    $last = strrpos($cleaned, '}');
    if ($first === false || $last === false || $last <= $first) return null;
    $d = json_decode(substr($cleaned, $first, $last - $first + 1), true);
    return is_array($d) ? $d : null;
}

/**
 * اجرای دستیار — حلقهٔ tool-calling با fallback.
 * @return array قرارداد نهایی برای فرانت‌اند
 */
function hm_assistant_run(array $user, array $b): array {
    $s = get_settings();
    if (!$s['ai_api_key']) {
        return ['error' => 'سرویس هوش مصنوعی هنوز در سرور تنظیم نشده است', 'code' => 503];
    }
    $aiUrl = rtrim((string)($s['ai_api_url'] ?: 'https://ai.parspack.com/v1'), '/');
    $aiKey = (string)$s['ai_api_key'];
    $models = array_values(array_filter(array_map('trim', explode(',', (string)($s['ai_models'] ?? '')))));
    $model = trim((string)($b['model'] ?? '')) ?: ($models[0] ?? 'qwen/qwen3-32b');
    $endpoint = $aiUrl . '/chat/completions';

    // ─── ورودی‌ها
    $incoming = $b['messages'] ?? [];
    if (!is_array($incoming) || count($incoming) === 0) {
        return ['error' => 'پیام نامعتبر', 'code' => 400];
    }
    $cal = is_array($b['calendar'] ?? null) ? $b['calendar'] : (is_array($b['context'] ?? null) ? $b['context'] : []);
    $tasks = is_array($cal['tasks'] ?? null) ? $cal['tasks'] : [];
    $events = is_array($cal['events'] ?? null) ? $cal['events'] : [];
    $holidays = is_array($cal['holidays'] ?? null) ? $cal['holidays'] : [];
    $prefs = is_array($cal['preferences'] ?? null) ? $cal['preferences'] : [];
    $clientToday = isset($cal['today_iso']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$cal['today_iso'])
        ? (string)$cal['today_iso'] : null;

    // مناسبت‌های سرور را هم اضافه کن (اگر کلاینت نداده باشد)
    if (count($holidays) === 0) {
        try {
            $stmt = db()->query("SELECT id, title, jalali_date, gregorian_date, type, is_official_holiday FROM occasions ORDER BY gregorian_date LIMIT 800");
            foreach ($stmt->fetchAll() as $row) {
                $holidays[] = [
                    'id' => $row['id'], 'title' => $row['title'],
                    'jalaliDate' => str_replace('-', '/', (string)$row['jalali_date']),
                    'gregorianDate' => substr((string)$row['gregorian_date'], 0, 10),
                    'type' => $row['type'], 'isOfficialHoliday' => (bool)$row['is_official_holiday'],
                ];
            }
        } catch (Throwable $e) { /* بی‌اهمیت */ }
    }

    $ctx = hm_time_context($clientToday);
    $state = ['ctx' => $ctx, 'tasks' => $tasks, 'events' => $events, 'holidays' => $holidays, 'prefs' => $prefs];

    // ─── پیام‌ها
    $history = [];
    foreach ($incoming as $m) {
        if (!is_array($m)) continue;
        $role = (string)($m['role'] ?? '');
        if (!in_array($role, ['user', 'assistant'], true)) continue;
        $content = (string)($m['content'] ?? '');
        if ($content === '') continue;
        $history[] = ['role' => $role, 'content' => mb_substr($content, 0, 2000)];
    }
    if (count($history) === 0) return ['error' => 'پیام نامعتبر', 'code' => 400];
    $history = array_slice($history, -10);

    $blocks = [];
    $actions = [];
    $trace = [];
    $needsTime = false;
    $clarify = null;
    $reply = '';
    $modelCalls = 0;
    $nativeFailed = false;

    $messages = array_merge(
        [['role' => 'system', 'content' => hm_system_prompt($ctx, $state, 'native')]],
        $history
    );
    $tools = hm_tool_schemas_openai();

    for ($iter = 0; $iter < HM_MAX_ITERATIONS; $iter++) {
        if ($modelCalls >= HM_MAX_MODEL_CALLS) break;
        $useNative = !$nativeFailed;
        $res = hm_call_model($endpoint, $aiKey, $model, $messages, $useNative ? $tools : null, 0.2, 1200);
        $modelCalls++;

        if (!$res['ok']) {
            if ($useNative) {
                // بعضی پروایدرها پارامتر tools را نمی‌پذیرند → مسیر JSON
                $nativeFailed = true;
                $messages[0] = ['role' => 'system', 'content' => hm_system_prompt($ctx, $state, 'json')];
                continue;
            }
            return ['error' => 'خطا در ارتباط با سرور هوش مصنوعی: ' . $res['error'], 'code' => 502];
        }

        $msg = $res['body']['choices'][0]['message'] ?? [];
        $content = (string)($msg['content'] ?? '');
        $toolCalls = $msg['tool_calls'] ?? null;

        // ── مسیر native function calling
        if ($useNative && is_array($toolCalls) && count($toolCalls) > 0) {
            $assistantMsg = ['role' => 'assistant', 'content' => $content !== '' ? $content : null, 'tool_calls' => $toolCalls];
            $messages[] = $assistantMsg;
            foreach ($toolCalls as $tc) {
                $fn = $tc['function']['name'] ?? '';
                $args = json_decode((string)($tc['function']['arguments'] ?? '{}'), true);
                if (!is_array($args)) $args = [];
                $exec = hm_execute_tool($fn, $args, $state);
                $trace[] = ['tool' => $fn, 'args' => $args, 'ok' => $exec['ok']];
                if ($exec['block']) $blocks[] = $exec['block'];
                if ($exec['action']) { $actions[] = $exec['action']; if (!empty($exec['action']['payload']['needs_time'])) $needsTime = true; }
                if ($exec['block'] && ($exec['block']['type'] ?? '') === 'pending' && !empty($exec['block']['needs_time'])) $needsTime = true;
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => (string)($tc['id'] ?? 'call_' . count($trace)),
                    'content' => j_encode($exec['data']),
                ];
            }
            continue;
        }

        // ── مسیر JSON (fallback یا نبود tool_calls)
        $parsed = hm_extract_json($content);
        if ($parsed && isset($parsed['tool'])) {
            $fn = (string)$parsed['tool'];
            $args = is_array($parsed['params'] ?? null) ? $parsed['params'] : [];
            $exec = hm_execute_tool($fn, $args, $state);
            $trace[] = ['tool' => $fn, 'args' => $args, 'ok' => $exec['ok']];
            if ($exec['block']) $blocks[] = $exec['block'];
            if ($exec['action']) $actions[] = $exec['action'];
            if ($exec['block'] && ($exec['block']['type'] ?? '') === 'pending' && !empty($exec['block']['needs_time'])) $needsTime = true;
            $messages[] = ['role' => 'assistant', 'content' => $content];
            $messages[] = ['role' => 'user', 'content' => "نتیجهٔ ابزار {$fn}:\n" . j_encode($exec['data']) . "\n\nحالا پاسخ نهایی را بده. اگر هنوز به ابزار دیگری نیاز داری همان JSON ابزار را بده؛ وگرنه فقط {\"reply\":\"متن فارسی\"} را بده. هیچ عددی از خودت نساز."];
            continue;
        }

        // ── پاسخ نهایی
        if ($parsed && isset($parsed['reply'])) {
            $reply = trim((string)$parsed['reply']);
            if (isset($parsed['clarify']['quick_replies']) && is_array($parsed['clarify']['quick_replies'])) {
                $qr = array_values(array_filter(array_map('strval', $parsed['clarify']['quick_replies'])));
                if (count($qr) > 0) $clarify = ['quick_replies' => array_slice($qr, 0, 4)];
            }
        } else {
            $reply = trim($content);
            // اگر مدل متن JSON ناقص برگرداند، بخش reply را با regex دربیاور
            if ($reply === '' || (isset($reply[0]) && $reply[0] === '{')) {
                if (preg_match('/"reply"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/u', $content, $mm)) {
                    $reply = json_decode('"' . $mm[1] . '"');
                    $reply = is_string($reply) ? $reply : '';
                }
            }
        }
        break;
    }

    // ─── اگر مدل متن نداد، پاسخ را از کارت‌ها بساز (تضمین می‌کند هیچ‌وقت خالی نماند)
    if (trim((string)$reply) === '') {
        $reply = hm_compose_reply($blocks, $ctx);
    }

    $planLimits = ['free' => 3, 'basic' => 20, 'pro' => 80];
    $limit = $planLimits[$user['plan_type'] ?? 'free'] ?? 3;
    $used = (int)($user['ai_assistant_usage_this_month'] ?? 0);

    return [
        'reply' => $reply,
        'blocks' => $blocks,
        'actions' => $actions,
        'clarify' => $clarify,
        'needs_time' => $needsTime,
        'tool_trace' => $trace,
        'today' => ['iso' => $ctx['today_iso'], 'jalali' => $ctx['today_jalali'], 'weekday' => $ctx['today_weekday']],
        'usage_summary' => ['plan_type' => $user['plan_type'] ?? 'free', 'remaining' => max(0, $limit - $used)],
    ];
}

/** ساخت پاسخ متنی از کارت‌ها — تضمین پاسخ غیرخالی */
function hm_compose_reply(array $blocks, array $ctx): string {
    if (count($blocks) === 0) {
        return 'متوجه نشدم. می‌تونی واضح‌تر بگی؟ مثلاً «فردا ساعت ۱۰ جلسه دارم» یا «چهارشنبه چیکارم؟».';
    }
    $last = $blocks[count($blocks) - 1];
    switch ($last['type'] ?? '') {
        case 'day_schedule': {
            $total = 0;
            foreach ($last['days'] as $d) $total += count($d['items']);
            if ($total === 0) return 'برای آن روز برنامه‌ای ثبت نشده — روزت خالیه.';
            return 'برنامه‌ات را پایین آوردم.';
        }
        case 'conflict':
            $c = $last['conflicts'][0] ?? null;
            if ($c) {
                return 'این زمان با «' . $c['title'] . '» تداخل دارد. یا آن را کنسل کن یا زمان را عوض کن.';
            }
            return 'این زمان تداخل دارد.';
        case 'pending':
            return 'آماده‌ام ثبتش کنم — تأیید کن.';
        case 'free_slots':
            return 'این زمان‌ها آزادی:';
        case 'countdown':
            return 'فاصله‌اش را حساب کردم.';
        case 'occasions':
            return 'مناسبت‌های پیش‌رو:';
        case 'search':
            return 'این‌ها را پیدا کردم:';
    }
    return 'انجام شد.';
}


/* ─── aliases: legacy helper names still referenced elsewhere (admin occasions) ─── */
function hd_mod($a, $b) { return hm_mod($a, $b); }
function jal_cal_h(int $jy): array { return hm_jal_cal($jy); }
function g2d_h($gy, $gm, $gd) { return hm_g2d($gy, $gm, $gd); }
function d2g_h($jdn) { return hm_d2g($jdn); }
function j2g_h($jy, $jm, $jd): array { $g = hm_j2g((int)$jy, (int)$jm, (int)$jd); return [$g['gy'], $g['gm'], $g['gd']]; }
function g2j_h($gy, $gm, $gd): array { $j = hm_g2j((int)$gy, (int)$gm, (int)$gd); return [$j['jy'], $j['jm'], $j['jd']]; }
function iso_from_jdn($jdn): string { $g = hm_d2g($jdn); return hm_iso($g['gy'], $g['gm'], $g['gd']); }

    /**
     * ai_assist — structured natural-language parsing for the Hamdam assistant.
     * Request: { messages: [{role, content}...], temperature?, max_tokens? }
     * The system prompt embeds server-resolved Jalali context + upcoming
     * occasions; the model must answer with strict JSON.
     */
    // ─── Hamdam assistant v2 — real tool-calling agent ───────────
    if ($act === 'ai_assist') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $res = hm_assistant_run($user, $b);
        if (isset($res['error'])) json_error((string)$res['error'], (int)($res['code'] ?? 500));
        json_out($res);
    }

    // ─── Hamdam: public occasions (reference data — no auth required) ───
    if ($act === 'holidays_all') {
        $stmt = db()->query("SELECT id, title, jalali_date, gregorian_date, type, is_official_holiday, description FROM occasions ORDER BY gregorian_date ASC LIMIT 500");
        json_out(['data' => $stmt->fetchAll()]);
    }

    // ─── Hamdam: local-first sync of assistant-created items (auth) ───
    if ($act === 'manager_event_save') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $id = (string)($b['id'] ?? '');
        $title = trim((string)($b['title'] ?? ''));
        $date = (string)($b['date'] ?? '');
        if (!preg_match('/^[0-9a-f-]{10,36}$/i', $id) || $title === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('داده نامعتبر', 400);
        db()->prepare("INSERT INTO calendar_events (id, user_id, title, description, event_date, start_time, end_time, location, category, color, reminder_minutes, recurrence, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), event_date = VALUES(event_date),
              start_time = VALUES(start_time), end_time = VALUES(end_time), location = VALUES(location), category = VALUES(category),
              color = VALUES(color), reminder_minutes = VALUES(reminder_minutes), recurrence = VALUES(recurrence), source = VALUES(source)")
            ->execute([
                $id, $user['id'], $title,
                (isset($b['description']) && (string)$b['description'] !== '') ? (string)$b['description'] : null,
                $date,
                substr((string)($b['start_time'] ?? '10:00'), 0, 5),
                (isset($b['end_time']) && (string)$b['end_time'] !== '') ? substr((string)$b['end_time'], 0, 5) : null,
                (isset($b['location']) && (string)$b['location'] !== '') ? (string)$b['location'] : null,
                substr((string)($b['category'] ?? 'other'), 0, 20),
                substr((string)($b['color'] ?? '#2563eb'), 0, 9),
                max(0, (int)($b['reminder_minutes'] ?? 30)),
                substr((string)($b['recurrence'] ?? 'none'), 0, 20),
                substr((string)($b['source'] ?? 'manual'), 0, 20),
            ]);
        json_out(['success' => true, 'data' => ['id' => $id]]);
    }

    if ($act === 'manager_task_save') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $id = (string)($b['id'] ?? '');
        $title = trim((string)($b['title'] ?? ''));
        $date = (string)($b['due_date'] ?? '');
        if (!preg_match('/^[0-9a-f-]{10,36}$/i', $id) || $title === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('داده نامعتبر', 400);
        db()->prepare("INSERT INTO manager_tasks (id, user_id, title, description, due_date, due_time, duration_minutes, priority, category, status, recurrence, reminder_minutes, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), due_date = VALUES(due_date),
              due_time = VALUES(due_time), duration_minutes = VALUES(duration_minutes), priority = VALUES(priority), category = VALUES(category),
              status = VALUES(status), recurrence = VALUES(recurrence), reminder_minutes = VALUES(reminder_minutes), source = VALUES(source)")
            ->execute([
                $id, $user['id'], $title,
                (isset($b['description']) && (string)$b['description'] !== '') ? (string)$b['description'] : null,
                $date,
                (isset($b['due_time']) && (string)$b['due_time'] !== '') ? substr((string)$b['due_time'], 0, 5) : null,
                max(5, (int)($b['duration_minutes'] ?? 60)),
                substr((string)($b['priority'] ?? 'medium'), 0, 10),
                substr((string)($b['category'] ?? 'other'), 0, 20),
                substr((string)($b['status'] ?? 'pending'), 0, 20),
                substr((string)($b['recurrence'] ?? 'none'), 0, 20),
                max(0, (int)($b['reminder_minutes'] ?? 30)),
                substr((string)($b['source'] ?? 'manual'), 0, 20),
            ]);
        json_out(['success' => true, 'data' => ['id' => $id]]);
    }

    // ─── Hamdam: delete task/event (auth + ownership) ───
    if ($act === 'manager_task_delete') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $id = (string)($b['id'] ?? '');
        if (!preg_match('/^[0-9a-f-]{10,36}$/i', $id)) json_error('شناسه نامعتبر', 400);
        $stmt = db()->prepare("DELETE FROM manager_tasks WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $user['id']]);
        json_out(['success' => true, 'deleted' => $stmt->rowCount()]);
    }

    if ($act === 'manager_event_delete') {
        $user = get_session_user();
        if (!$user) json_error('احراز هویت نشده', 401);
        $id = (string)($b['id'] ?? '');
        if (!preg_match('/^[0-9a-f-]{10,36}$/i', $id)) json_error('شناسه نامعتبر', 400);
        $stmt = db()->prepare("DELETE FROM calendar_events WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $user['id']]);
        json_out(['success' => true, 'deleted' => $stmt->rowCount()]);
    }

    // ─── Hamdam admin: occasions management ───
    if ($act === 'admin_occasion_save') {
        $user = get_session_user();
        if (!$user || !$user['is_admin']) json_error('دسترسی غیرمجاز', 403);
        $title = trim((string)($b['title'] ?? ''));
        $jal = (string)($b['jalali_date'] ?? '');
        if ($title === '' || !preg_match('/^\d{4}[-\/]\d{2}[-\/]\d{2}$/', $jal)) json_error('عنوان یا تاریخ جلالی نامعتبر است', 400);
        $jal = str_replace('/', '-', $jal);
        $parts = array_map('intval', explode('-', $jal));
        if ($parts[1] < 1 || $parts[1] > 12 || $parts[2] < 1 || $parts[2] > 31) json_error('تاریخ جلالی نامعتبر است', 400);
        $g = j2g_h($parts[0], $parts[1], $parts[2]);
        $iso = sprintf('%04d-%02d-%02d', $g[0], $g[1], $g[2]);
        $id = md5($jal . $title);
        db()->prepare("INSERT INTO occasions (id, title, jalali_date, gregorian_date, type, is_official_holiday, description) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE title = VALUES(title), type = VALUES(type), is_official_holiday = VALUES(is_official_holiday), description = VALUES(description)")
            ->execute([
                $id, $title, $jal, $iso,
                substr((string)($b['type'] ?? 'cultural'), 0, 20),
                !empty($b['is_official_holiday']) ? 1 : 0,
                (isset($b['description']) && (string)$b['description'] !== '') ? (string)$b['description'] : null,
            ]);
        json_out(['success' => true, 'data' => ['id' => $id, 'gregorian_date' => $iso]]);
    }

    if ($act === 'admin_occasion_delete') {
        $user = get_session_user();
        if (!$user || !$user['is_admin']) json_error('دسترسی غیرمجاز', 403);
        db()->prepare("DELETE FROM occasions WHERE id = ?")->execute([(string)($b['id'] ?? '')]);
        json_out(['success' => true]);
    }

    json_error('Unknown action', 404);

} catch (Throwable $e) {
    json_error($e->getMessage() ?: 'Internal error', 500);
}
