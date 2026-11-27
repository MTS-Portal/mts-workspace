update integration_settings
set oauth_client_id = 'managetech',
    -- Secret is intentionally NOT committed. Set ZENDESK_OAUTH_CLIENT_SECRET in the
    -- environment; readZendesk() prefers real env over any value saved in the DB.
    oauth_scopes = 'read write',
    subdomain = 'managetechservicehelp',
    email = 'yossi@managetechservice.com',
    last_status = 'saved',
    last_error = ''
where id = 1;
