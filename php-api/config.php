<?php
/**
 * Kateb API — Database Configuration
 *
 * ONLY database connection credentials live here.
 * All other settings (AI, SMS, Zarinpal) are stored in and
 * read from the kateb_settings table in the database.
 *
 * Edit these values to match your hosting's MySQL database.
 */

return [
    'db_host' => getenv('KATEB_DB_HOST') ?: 'localhost',
    'db_name' => getenv('KATEB_DB_NAME') ?: 'kateb',
    'db_user' => getenv('KATEB_DB_USER') ?: 'kateb',
    'db_pass' => getenv('KATEB_DB_PASS') ?: 'CHANGE_THIS_PASSWORD',
    'db_charset' => 'utf8mb4',
];
