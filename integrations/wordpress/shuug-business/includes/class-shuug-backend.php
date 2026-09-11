<?php
if (!defined('ABSPATH')) { exit; }

final class Shuug_Backend {
    const OPTION = 'shuug_business_settings';

    public static function local_allowed($url) {
        $host = wp_parse_url($url, PHP_URL_HOST);
        return defined('SHUUG_ALLOW_LOCAL_BACKEND') && SHUUG_ALLOW_LOCAL_BACKEND === true
            && wp_get_environment_type() === 'local' && in_array($host, array('127.0.0.1', 'localhost', '[::1]'), true);
    }

    public static function valid_url($url) {
        $parts = wp_parse_url($url);
        if (!$parts || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || !empty(trim($parts['path'] ?? '', '/'))) {
            return new WP_Error('shuug_url', __('Enter only the backend origin, for example https://business.example.org.', 'shuug-business'));
        }
        if (self::local_allowed($url) && in_array($parts['scheme'] ?? '', array('http', 'https'), true)) { return untrailingslashit($url); }
        if (($parts['scheme'] ?? '') !== 'https' || !wp_http_validate_url($url)) {
            return new WP_Error('shuug_url', __('Use a public HTTPS backend address. Private network targets are blocked.', 'shuug-business'));
        }
        return untrailingslashit($url);
    }

    public static function url() {
        $settings = get_option(self::OPTION, array());
        if (empty($settings['backend_url'])) { return new WP_Error('shuug_setup', __('A WordPress administrator must configure the backend address first.', 'shuug-business')); }
        return self::valid_url($settings['backend_url']);
    }

    private static function storage_key() {
        // Bind the backend session to this particular WordPress login and origin.
        // Changing the backend address must never forward an existing credential.
        $settings = get_option(self::OPTION, array());
        return 'shuug_session_' . hash('sha256', get_current_blog_id() . '|' . get_current_user_id() . '|' . wp_get_session_token() . '|' . ($settings['backend_url'] ?? ''));
    }

    public static function remember($data) {
        if (!function_exists('openssl_encrypt')) { return new WP_Error('shuug_crypto', __('Enable the PHP OpenSSL extension to connect accounts.', 'shuug-business')); }
        if (empty($data['token']) || !preg_match('/^[a-f0-9]{64}$/D', $data['token']) || empty($data['user']['id'])) { return new WP_Error('shuug_session', __('The backend did not return a valid account.', 'shuug-business')); }
        $key = hash('sha256', wp_salt('auth') . '|shuug-session', true);
        $iv = random_bytes(12); $tag = '';
        $sealed = openssl_encrypt(wp_json_encode(array('token' => $data['token'], 'owner' => !empty($data['user']['isOwner']))), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($sealed === false) { return new WP_Error('shuug_crypto', __('The server could not protect the session.', 'shuug-business')); }
        set_transient(self::storage_key(), base64_encode($iv . $tag . $sealed), min(43200, max(60, (int) ($data['expiresIn'] ?? 43200))));
        return true;
    }

    public static function session() {
        if (!function_exists('openssl_decrypt')) { return null; }
        $value = get_transient(self::storage_key());
        if (!is_string($value)) { return null; }
        $bytes = base64_decode($value, true);
        if ($bytes === false || strlen($bytes) < 29) { self::forget(); return null; }
        $key = hash('sha256', wp_salt('auth') . '|shuug-session', true);
        $plain = openssl_decrypt(substr($bytes, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($bytes, 0, 12), substr($bytes, 12, 16));
        $data = $plain === false ? null : json_decode($plain, true);
        if (!is_array($data) || empty($data['token']) || !preg_match('/^[a-f0-9]{64}$/D', $data['token']) || (!empty($data['owner']) && !current_user_can('manage_options'))) { self::forget(); return null; }
        return $data;
    }

    public static function forget() { delete_transient(self::storage_key()); }

    public static function call($operation, $input = array(), $token = null) {
        $base = self::url(); if (is_wp_error($base)) { return $base; }
        $arguments = array(
            'method' => 'POST', 'timeout' => $operation === 'planning.chat' ? 130 : 25,
            'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 4194304,
            'headers' => array('Content-Type' => 'application/json', 'Accept' => 'application/json'),
            'body' => wp_json_encode(array('operation' => $operation, 'input' => (object) $input)),
            'data_format' => 'body',
        );
        if ($token !== null) { $arguments['headers']['Authorization'] = 'Bearer ' . $token; }
        // Local HTTP exists solely for an explicitly configured local test install.
        $response = self::local_allowed($base) ? wp_remote_request($base . '/api/wordpress', $arguments) : wp_safe_remote_request($base . '/api/wordpress', $arguments);
        if (is_wp_error($response)) { return new WP_Error('shuug_unreachable', __('The backend could not be reached. Check its address and availability.', 'shuug-business'), array('status' => 502)); }
        $status = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if ($status === 401) { self::forget(); }
        if ($status < 200 || $status >= 300 || !is_array($data) || !array_key_exists('data', $data)) {
            $message = is_array($data) && isset($data['error']) && is_string($data['error']) ? mb_substr($data['error'], 0, 500) : __('The backend returned an unexpected response.', 'shuug-business');
            return new WP_Error('shuug_backend', $message, array('status' => $status === 401 ? 401 : 400));
        }
        return $data['data'];
    }

    public static function disconnect() {
        $session = self::session();
        if ($session) { self::call('session.logout', array(), $session['token']); }
        self::forget();
    }
}
