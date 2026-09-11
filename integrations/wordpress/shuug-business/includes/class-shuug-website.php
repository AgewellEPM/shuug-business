<?php
if (!defined('ABSPATH')) { exit; }

/** Thin website surfaces: public forms and links into the private customer app. */
final class Shuug_Website {
    const LINKS = array('restaurant_booking' => 'Reserve a restaurant table', 'restaurant_ordering' => 'Order food for pickup', 'pay_invoice' => 'Pay an invoice', 'donations' => 'Make a donation', 'book_service' => 'Book a service', 'customer_login' => 'Customer login', 'pricing' => 'Your product prices', 'wholesale' => 'Place a wholesale order', 'order_status' => 'View your orders');
    const FORMS = array('contact' => 'Contact form', 'quote' => 'Request a quote', 'volunteer' => 'Volunteer signup', 'booking' => 'Appointment request', 'job' => 'Job application request');
    public static function boot() {
        add_shortcode('shuug_website', array(__CLASS__, 'shortcode'));
        foreach (array_merge(array_keys(self::LINKS), array_keys(self::FORMS)) as $capability) {
            add_shortcode('shuug_' . $capability, static function($attributes = array()) use ($capability) { return self::shortcode(array('capability' => $capability, 'special' => is_array($attributes) ? ($attributes['special'] ?? '') : '')); });
        }
    }
    public static function sanitize($input) {
        if (!is_array($input)) { return array(); }
        $clean = array();
        foreach (self::LINKS as $id => $label) { if (($input[$id] ?? '') === '1') { $clean[$id] = '1'; } }
        foreach (self::FORMS as $id => $label) {
            $value = $input[$id] ?? '';
            if (is_string($value) && preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $value)) { $clean[$id] = $value; }
        }
        return $clean;
    }
    public static function manifest() {
        $base = Shuug_Backend::url(); if (is_wp_error($base)) { return $base; }
        $args = array('timeout' => 10, 'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 65536, 'headers' => array('Accept' => 'application/json'));
        $response = Shuug_Backend::local_allowed($base) ? wp_remote_get($base . '/api/website/capabilities', $args) : wp_safe_remote_get($base . '/api/website/capabilities', $args);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) { return new WP_Error('shuug_manifest', __('Save a reachable backend address, then reload this screen to choose website capabilities.', 'shuug-business')); }
        $value = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($value) || ($value['version'] ?? 0) !== 1 || !is_array($value['capabilities'] ?? null) || !is_array($value['forms'] ?? null)) { return new WP_Error('shuug_manifest', __('Update the Shuug backend to load website capabilities.', 'shuug-business')); }
        return $value;
    }
    public static function settings_fields($settings) {
        echo '<h2>' . esc_html__('Choose website capabilities', 'shuug-business') . '</h2>';
        echo '<p>' . esc_html__('Configure customer accounts and publish forms in Shuug → Setup → Attach. Reload this screen, select the capabilities to expose, and add their shortcodes to your pages.', 'shuug-business') . '</p>';
        $manifest = self::manifest(); $chosen = self::sanitize($settings['website'] ?? array());
        if (is_wp_error($manifest)) {
            echo '<p>' . esc_html($manifest->get_error_message()) . '</p>';
            // An unavailable backend must not silently clear previously saved choices.
            foreach ($chosen as $id => $value) { echo '<input type="hidden" name="shuug_business_settings[website][' . esc_attr($id) . ']" value="' . esc_attr($value) . '">'; }
            return;
        }
        $enabled = array(); foreach ($manifest['capabilities'] as $cap) { if (is_array($cap) && is_string($cap['id'] ?? null)) { $enabled[] = $cap['id']; } }
        foreach (self::LINKS as $id => $label) {
            $available = in_array($id, $enabled, true);
            echo '<p><label><input type="checkbox" name="shuug_business_settings[website][' . esc_attr($id) . ']" value="1" ' . checked(isset($chosen[$id]), true, false) . disabled(!$available, true, false) . '> ' . esc_html($label) . '</label> <code>[shuug_' . esc_html($id) . ']</code>';
            if (!$available) { echo ' <small>' . esc_html__('Enable this capability in the Shuug backend first.', 'shuug-business') . '</small>'; }
            echo '</p>';
        }
        $parts = wp_parse_url(home_url());
        $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : '');
        foreach (self::FORMS as $id => $label) {
            echo '<p><label>' . esc_html($label) . ' <select name="shuug_business_settings[website][' . esc_attr($id) . ']"><option value="">' . esc_html__('Hidden', 'shuug-business') . '</option>';
            foreach ($manifest['forms'] as $form) {
                if (!is_array($form) || ($form['kind'] ?? '') !== $id || !is_string($form['id'] ?? null) || !is_string($form['title'] ?? null)) { continue; }
                $allowed = in_array($origin, is_array($form['origins'] ?? null) ? $form['origins'] : array(), true);
                echo '<option value="' . esc_attr($form['id']) . '" ' . selected($chosen[$id] ?? '', $form['id'], false) . disabled(!$allowed, true, false) . '>' . esc_html($form['title'] . ($allowed ? '' : ' — allow this website origin in Shuug first')) . '</option>';
            }
            echo '</select></label> <code>[shuug_' . esc_html($id) . ']</code></p>';
        }
        echo '<p>' . esc_html__('Customer links open the secure Shuug account page. Public forms appear inside your website. Appointment request forms collect requests for staff review. Volunteer signup creates a volunteer record awaiting onboarding review.', 'shuug-business') . '</p>';
        echo '<p>' . esc_html__('Invoice payments and one-time donations use Stripe Checkout through Shuug. Restaurant pickup ordering uses published pickup times and payment at pickup. Restaurant table reservations use published service hours and shared floor capacity. Service bookings require published times for agreed work in a customer account.', 'shuug-business') . '</p>';
    }
    public static function shortcode($attributes = array()) {
        $attributes = shortcode_atts(array('capability' => 'contact', 'special' => ''), $attributes, 'shuug_website');
        $id = $attributes['capability']; $settings = get_option(Shuug_Backend::OPTION, array());
        $chosen = self::sanitize($settings['website'] ?? array()); $base = Shuug_Backend::url();
        if (!is_string($id) || !isset($chosen[$id]) || is_wp_error($base)) { return ''; }
        if (isset(self::LINKS[$id])) {
            $fragment = $id === 'pay_invoice' ? '#invoices' : ($id === 'book_service' ? '#appointments' : (in_array($id, array('pricing', 'wholesale'), true) ? '#pricing' : ($id === 'order_status' ? '#orders' : '')));
            $destinations = array('restaurant_booking' => '/api/website/reservations', 'restaurant_ordering' => '/api/website/restaurant', 'donations' => '/api/website/donate');
            $destination = $destinations[$id] ?? '/api/website/customer' . $fragment;
            if ($id === 'restaurant_ordering' && $attributes['special'] !== '') {
                if (!is_string($attributes['special'])) { return ''; }
                $special = strtoupper(trim($attributes['special']));
                if (!preg_match('/^[A-Z0-9-]{3,30}$/D', $special)) { return ''; }
                $destination .= '?special=' . rawurlencode($special);
            }
            return '<p class="shuug-customer-link"><a href="' . esc_url($base . $destination) . '" rel="noreferrer">' . esc_html(self::LINKS[$id]) . '</a></p>';
        }
        if (!isset(self::FORMS[$id])) { return ''; }
        return '<iframe class="shuug-website-form" src="' . esc_url($base . '/api/website/forms/' . $chosen[$id]) . '" title="' . esc_attr(self::FORMS[$id]) . '" width="100%" height="650" loading="lazy" referrerpolicy="no-referrer" style="border:0;max-width:100%"></iframe>';
    }
}
