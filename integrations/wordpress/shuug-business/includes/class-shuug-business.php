<?php
if (!defined('ABSPATH')) { exit; }

final class Shuug_Business {
    public static function boot() {
        add_action('admin_menu', array(__CLASS__, 'menu'));
        add_action('admin_init', array(__CLASS__, 'settings'));
        add_action('rest_api_init', array(__CLASS__, 'routes'));
        add_action('wp_enqueue_scripts', array(__CLASS__, 'register_assets'));
        add_action('admin_enqueue_scripts', array(__CLASS__, 'register_assets'));
        add_action('template_redirect', array(__CLASS__, 'private_page'));
        add_action('clear_auth_cookie', array('Shuug_Backend', 'disconnect'));
        add_shortcode('shuug_workspace', array(__CLASS__, 'shortcode'));
        add_shortcode('shuug_login', array(__CLASS__, 'shortcode'));
    }

    public static function menu() {
        add_menu_page(__('Business workspace', 'shuug-business'), __('Business', 'shuug-business'), 'read', 'shuug-business', array(__CLASS__, 'admin_workspace'), 'dashicons-building', 30);
        add_submenu_page('shuug-business', __('Backend connection', 'shuug-business'), __('Connection', 'shuug-business'), 'manage_options', 'shuug-business-connection', array(__CLASS__, 'connection_page'));
    }

    public static function settings() {
        register_setting('shuug_business', Shuug_Backend::OPTION, array('type' => 'array', 'sanitize_callback' => array(__CLASS__, 'sanitize_settings'), 'show_in_rest' => false, 'default' => array()));
    }

    public static function sanitize_settings($input) {
        $old = get_option(Shuug_Backend::OPTION, array());
        if (!current_user_can('manage_options')) { return $old; }
        $url = is_array($input) && is_string($input['backend_url'] ?? null) ? trim($input['backend_url']) : '';
        if ($url !== '') {
            $validated = Shuug_Backend::valid_url($url);
            if (is_wp_error($validated)) { add_settings_error(Shuug_Backend::OPTION, 'invalid_url', $validated->get_error_message()); return $old; }
            $url = $validated;
        }
        return array('backend_url' => $url, 'website' => Shuug_Website::sanitize(is_array($input) ? ($input['website'] ?? array()) : array()));
    }

    public static function connection_page() {
        if (!current_user_can('manage_options')) { return; }
        $settings = get_option(Shuug_Backend::OPTION, array());
        echo '<div class="wrap"><h1>' . esc_html__('Business backend connection', 'shuug-business') . '</h1>';
        settings_errors(Shuug_Backend::OPTION);
        echo '<p>' . esc_html__('Connect this WordPress site to your self-hosted Shuug Business application. Accounts and business data stay in that backend.', 'shuug-business') . '</p><form method="post" action="options.php">';
        settings_fields('shuug_business');
        echo '<table class="form-table"><tr><th><label for="shuug-backend-url">' . esc_html__('Backend HTTPS address', 'shuug-business') . '</label></th><td><input id="shuug-backend-url" class="regular-text" type="url" name="shuug_business_settings[backend_url]" value="' . esc_attr($settings['backend_url'] ?? '') . '" placeholder="https://business.example.org"><p class="description">' . esc_html__('Use the origin only, without /api or a page path. No owner password or API key belongs in this setting.', 'shuug-business') . '</p></td></tr></table>';
        Shuug_Website::settings_fields($settings);
        submit_button(__('Save connection and capabilities', 'shuug-business')); echo '</form>';
        echo '<h2>' . esc_html__('Add a workspace page', 'shuug-business') . '</h2><p>' . esc_html__('Add the shortcode below to any WordPress page. Visitors sign in to WordPress, then connect their own business account.', 'shuug-business') . '</p><code>[shuug_workspace]</code>';
        echo '<p>' . esc_html__('Exclude this page and /wp-json/shuug-business/v1/* from full-page/CDN caches. The plugin also sends private no-store headers.', 'shuug-business') . '</p>';
        echo '<p><a class="button button-primary" href="' . esc_url(admin_url('admin.php?page=shuug-business')) . '">' . esc_html__('Open workspace and test sign-in', 'shuug-business') . '</a></p></div>';
    }

    public static function register_assets() {
        wp_register_style('shuug-business', plugins_url('assets/workspace.css', SHUUG_BUSINESS_FILE), array(), SHUUG_BUSINESS_VERSION);
        wp_register_script('shuug-business', plugins_url('assets/workspace.js', SHUUG_BUSINESS_FILE), array(), SHUUG_BUSINESS_VERSION, true);
    }

    public static function private_page() {
        if (!is_singular()) { return; }
        $post = get_post();
        if ($post && (has_shortcode($post->post_content, 'shuug_workspace') || has_shortcode($post->post_content, 'shuug_login'))) {
            if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE', true); }
            nocache_headers();
        }
    }

    public static function shortcode() {
        if (!is_user_logged_in()) {
            return '<div class="shuug-login"><h2>' . esc_html__('Sign in to your employee workspace', 'shuug-business') . '</h2>' . wp_login_form(array('echo' => false, 'redirect' => get_permalink())) . '</div>';
        }
        if (!current_user_can('read')) { return '<p>' . esc_html__('Your WordPress account cannot open this workspace.', 'shuug-business') . '</p>'; }
        self::register_assets(); wp_enqueue_style('shuug-business'); wp_enqueue_script('shuug-business');
        $url = Shuug_Backend::url();
        $config = array('endpoint' => rest_url('shuug-business/v1/command'), 'nonce' => wp_create_nonce('wp_rest'), 'administrator' => current_user_can('manage_options'), 'configured' => !is_wp_error($url), 'backendUrl' => is_wp_error($url) ? '' : $url, 'logoutUrl' => wp_logout_url(home_url('/')));
        return '<div class="shuug-workspace" data-shuug-config="' . esc_attr(wp_json_encode($config)) . '"><p role="status">' . esc_html__('Loading your business workspace…', 'shuug-business') . '</p><noscript>' . esc_html__('Enable JavaScript to use the interactive workspace.', 'shuug-business') . '</noscript></div>';
    }

    public static function admin_workspace() {
        if (!current_user_can('read')) { return; }
        nocache_headers(); echo '<div class="wrap">' . self::shortcode() . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- shortcode escapes its own output.
    }

    public static function routes() {
        register_rest_route('shuug-business/v1', '/command', array('methods' => 'POST', 'callback' => array(__CLASS__, 'command'), 'permission_callback' => array(__CLASS__, 'permission')));
    }

    public static function permission($request) {
        if (!is_user_logged_in() || !current_user_can('read') || !wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return new WP_Error('shuug_forbidden', __('Sign in to WordPress and refresh this page.', 'shuug-business'), array('status' => 403));
        }
        return true;
    }

    public static function command($request) {
        if (strlen($request->get_body()) > 150000) { return new WP_Error('shuug_size', __('Keep each request below 150 KB.', 'shuug-business'), array('status' => 413)); }
        $body = $request->get_json_params();
        $operations = array('session.login', 'session.logout', 'session.launch', 'workspace', 'me', 'task.save', 'task.status', 'password', 'notes', 'note.save', 'planning', 'planning.chat', 'planning.save', 'records', 'record.save', 'record.transition', 'record.history', 'employees', 'employee.save', 'branding.save', 'business.read', 'team.tasks', 'team.task.save', 'team.task.assign');
        if (!is_array($body) || !is_string($body['operation'] ?? null) || !in_array($body['operation'], $operations, true) || !is_array($body['input'] ?? array())) { return new WP_Error('shuug_command', __('Unknown workspace command.', 'shuug-business'), array('status' => 400)); }
        $operation = $body['operation']; $input = $body['input'] ?? array();
        if ($operation === 'session.login') {
            if (!is_string($input['email'] ?? null) || !is_string($input['password'] ?? null) || strlen($input['password']) > 200 || strlen($input['email']) > 160) { return new WP_Error('shuug_login', __('Enter your business email and password.', 'shuug-business'), array('status' => 400)); }
            if (trim($input['email']) === '' && !current_user_can('manage_options')) { return new WP_Error('shuug_owner', __('Owner connections require a WordPress administrator.', 'shuug-business'), array('status' => 403)); }
            $result = Shuug_Backend::call($operation, array('email' => $input['email'], 'password' => $input['password']));
            if (is_wp_error($result)) { return $result; }
            $old = Shuug_Backend::session(); if ($old) { Shuug_Backend::call('session.logout', array(), $old['token']); }
            $saved = Shuug_Backend::remember($result); if (is_wp_error($saved)) { return $saved; }
            $result = array('user' => $result['user']); // Never return the backend session token to page JavaScript.
        } else {
            $session = Shuug_Backend::session();
            if (!$session) { return new WP_Error('shuug_connect', __('Connect your business account to this WordPress session.', 'shuug-business'), array('status' => 401)); }
            $result = Shuug_Backend::call($operation, $input, $session['token']);
            if ($operation === 'session.logout' || ($operation === 'password' && !is_wp_error($result))) { Shuug_Backend::forget(); }
            if (is_wp_error($result)) { return $result; }
        }
        $response = new WP_REST_Response(array('data' => $result));
        $response->header('Cache-Control', 'private, no-store, max-age=0'); $response->header('Vary', 'Cookie');
        return $response;
    }
}
