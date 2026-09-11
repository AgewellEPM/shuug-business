<?php
/**
 * Plugin Name: Shuug Business
 * Description: Employee work, notes, AI roadmaps and business workflows connected to your self-hosted Shuug backend.
 * Version: 0.1.0
 * Requires at least: 6.6
 * Requires PHP: 8.2
 * Author: Luke Kist and contributors
 * License: MIT
 * License URI: https://opensource.org/license/mit
 * Text Domain: shuug-business
 * Update URI: https://shuug.invalid/wordpress/shuug-business
 */
if (!defined('ABSPATH')) { exit; }
define('SHUUG_BUSINESS_VERSION', '0.1.0');
define('SHUUG_BUSINESS_FILE', __FILE__);
require_once __DIR__ . '/includes/class-shuug-backend.php';
require_once __DIR__ . '/includes/class-shuug-website.php';
require_once __DIR__ . '/includes/class-shuug-business.php';
Shuug_Business::boot();
Shuug_Website::boot();
