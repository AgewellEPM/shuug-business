<?php
if (!defined('WP_UNINSTALL_PLUGIN')) { exit; }
// Local connection/session data only. Never delete backend business records.
delete_option('shuug_business_settings');
global $wpdb;
$keys = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_shuug_session_') . '%'));
foreach ($keys as $key) { delete_transient(substr($key, strlen('_transient_'))); }
