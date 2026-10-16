-- ============================================================
--  Hamdam — additive migration (Persian AI calendar assistant)
--  Run once in phpMyAdmin/CLI on the SAME MySQL database as the
--  legacy Kateb API. Safe to run multiple times (IF NOT EXISTS +
--  INSERT IGNORE). No legacy table is touched. Rollback script:
--  rollback-hamdam.sql
-- ============================================================

-- 1. Occasions (holidays + cultural reference data, admin-managed)
CREATE TABLE IF NOT EXISTS occasions (
    id VARCHAR(32) PRIMARY KEY,
    title TEXT NOT NULL,
    jalali_date VARCHAR(10) NOT NULL,
    gregorian_date DATE NOT NULL,
    type VARCHAR(20) DEFAULT 'cultural',
    is_official_holiday TINYINT(1) DEFAULT 0,
    description TEXT NULL,
    UNIQUE KEY uk_occasion (jalali_date, title(80)),
    INDEX idx_occasions_gregorian (gregorian_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Calendar events created in the new product
CREATE TABLE IF NOT EXISTS calendar_events (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Manager tasks created in the new product
CREATE TABLE IF NOT EXISTS manager_tasks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Seed occasions (Jalali↔Gregorian pairs verified against ICU Persian
--    calendar and published 1405 calendars; INSERT IGNORE keeps admin edits)
INSERT IGNORE INTO occasions (id, title, jalali_date, gregorian_date, type, is_official_holiday) VALUES
(MD5(CONCAT('1405-01-01','عید سعید فطر - آغاز نوروز')), 'عید سعید فطر - آغاز نوروز', '1405-01-01', '2026-03-21', 'religious', 1),
(MD5(CONCAT('1405-01-02','تعطیل به مناسبت عید سعید فطر - نوروز')), 'تعطیل به مناسبت عید سعید فطر - نوروز', '1405-01-02', '2026-03-22', 'religious', 1),
(MD5(CONCAT('1405-01-03','عید نوروز')), 'عید نوروز', '1405-01-03', '2026-03-23', 'cultural', 1),
(MD5(CONCAT('1405-01-04','عید نوروز')), 'عید نوروز', '1405-01-04', '2026-03-24', 'cultural', 1),
(MD5(CONCAT('1405-01-12','روز جمهوری اسلامی ایران')), 'روز جمهوری اسلامی ایران', '1405-01-12', '2026-04-01', 'national', 1),
(MD5(CONCAT('1405-01-13','روز طبیعت (سیزده‌به‌در)')), 'روز طبیعت (سیزده‌به‌در)', '1405-01-13', '2026-04-02', 'cultural', 1),
(MD5(CONCAT('1405-01-25','شهادت امام جعفر صادق (ع)')), 'شهادت امام جعفر صادق (ع)', '1405-01-25', '2026-04-14', 'religious', 1),
(MD5(CONCAT('1405-02-12','شهادت استاد مرتضی مطهری - روز معلم')), 'شهادت استاد مرتضی مطهری - روز معلم', '1405-02-12', '2026-05-02', 'cultural', 0),
(MD5(CONCAT('1405-03-06','عید سعید قربان')), 'عید سعید قربان', '1405-03-06', '2026-05-27', 'religious', 1),
(MD5(CONCAT('1405-03-14','عید سعید غدیر خم - رحلت امام خمینی')), 'عید سعید غدیر خم - رحلت امام خمینی', '1405-03-14', '2026-06-04', 'religious', 1),
(MD5(CONCAT('1405-03-15','قیام خونین ۱۵ خرداد')), 'قیام خونین ۱۵ خرداد', '1405-03-15', '2026-06-05', 'national', 1),
(MD5(CONCAT('1405-04-03','تاسوعای حسینی')), 'تاسوعای حسینی', '1405-04-03', '2026-06-24', 'religious', 1),
(MD5(CONCAT('1405-04-04','عاشورای حسینی')), 'عاشورای حسینی', '1405-04-04', '2026-06-25', 'religious', 1),
(MD5(CONCAT('1405-05-13','اربعین حسینی')), 'اربعین حسینی', '1405-05-13', '2026-08-04', 'religious', 1),
(MD5(CONCAT('1405-05-21','رحلت حضرت رسول اکرم (ص) - شهادت امام حسن مجتبی (ع)')), 'رحلت حضرت رسول اکرم (ص) - شهادت امام حسن مجتبی (ع)', '1405-05-21', '2026-08-12', 'religious', 1),
(MD5(CONCAT('1405-05-22','شهادت امام رضا (ع)')), 'شهادت امام رضا (ع)', '1405-05-22', '2026-08-13', 'religious', 1),
(MD5(CONCAT('1405-05-30','شهادت امام حسن عسکری (ع) - آغاز امامت حضرت ولیعصر (عج)')), 'شهادت امام حسن عسکری (ع) - آغاز امامت حضرت ولیعصر (عج)', '1405-05-30', '2026-08-21', 'religious', 1),
(MD5(CONCAT('1405-06-08','ولادت حضرت رسول اکرم (ص) - ولادت امام جعفر صادق (ع)')), 'ولادت حضرت رسول اکرم (ص) - ولادت امام جعفر صادق (ع)', '1405-06-08', '2026-08-30', 'religious', 1),
(MD5(CONCAT('1405-08-22','شهادت حضرت فاطمه زهرا (س)')), 'شهادت حضرت فاطمه زهرا (س)', '1405-08-22', '2026-11-13', 'religious', 1),
(MD5(CONCAT('1405-09-30','شب یلدا - شب چلّه')), 'شب یلدا - شب چلّه', '1405-09-30', '2026-12-21', 'cultural', 0),
(MD5(CONCAT('1405-10-02','ولادت امام علی (ع) - روز پدر')), 'ولادت امام علی (ع) - روز پدر', '1405-10-02', '2026-12-23', 'religious', 1),
(MD5(CONCAT('1405-10-16','مبعث حضرت رسول اکرم (ص)')), 'مبعث حضرت رسول اکرم (ص)', '1405-10-16', '2027-01-06', 'religious', 1),
(MD5(CONCAT('1405-11-04','ولادت حضرت قائم (عج)')), 'ولادت حضرت قائم (عج)', '1405-11-04', '2027-01-24', 'religious', 1),
(MD5(CONCAT('1405-11-22','پیروزی انقلاب اسلامی ایران')), 'پیروزی انقلاب اسلامی ایران', '1405-11-22', '2027-02-11', 'national', 1),
(MD5(CONCAT('1405-12-09','شهادت حضرت علی (ع)')), 'شهادت حضرت علی (ع)', '1405-12-09', '2027-02-28', 'religious', 1),
(MD5(CONCAT('1405-12-19','عید سعید فطر')), 'عید سعید فطر', '1405-12-19', '2027-03-10', 'religious', 1),
(MD5(CONCAT('1405-12-20','تعطیل به مناسبت عید سعید فطر')), 'تعطیل به مناسبت عید سعید فطر', '1405-12-20', '2027-03-11', 'religious', 1),
(MD5(CONCAT('1405-12-26','چهارشنبه‌سوری - آخرین چهارشنبه سال')), 'چهارشنبه‌سوری - آخرین چهارشنبه سال', '1405-12-26', '2027-03-17', 'cultural', 0),
(MD5(CONCAT('1405-12-29','روز ملی شدن صنعت نفت ایران')), 'روز ملی شدن صنعت نفت ایران', '1405-12-29', '2027-03-20', 'national', 1),
(MD5(CONCAT('1406-01-01','عید نوروز - آغاز سال ۱۴۰۶')), 'عید نوروز - آغاز سال ۱۴۰۶', '1406-01-01', '2027-03-21', 'cultural', 1),
(MD5(CONCAT('1406-01-02','عید نوروز')), 'عید نوروز', '1406-01-02', '2027-03-22', 'cultural', 1),
(MD5(CONCAT('1406-01-03','عید نوروز')), 'عید نوروز', '1406-01-03', '2027-03-23', 'cultural', 1),
(MD5(CONCAT('1406-01-04','عید نوروز')), 'عید نوروز', '1406-01-04', '2027-03-24', 'cultural', 1),
(MD5(CONCAT('1406-01-12','روز جمهوری اسلامی ایران')), 'روز جمهوری اسلامی ایران', '1406-01-12', '2027-04-01', 'national', 1),
(MD5(CONCAT('1406-01-13','روز طبیعت (سیزده‌به‌در)')), 'روز طبیعت (سیزده‌به‌در)', '1406-01-13', '2027-04-02', 'cultural', 1);
