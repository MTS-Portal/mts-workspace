update integration_settings
set oauth_client_id = 'managetech',
    -- Secret is intentionally NOT committed. Set ZENDESK_OAUTH_CLIENT_SECRET in the environment.
    oauth_scopes = 'read write',
    subdomain = 'managetechservicehelp',
    email = 'yossi@managetechservice.com',
    api_token = '',
    last_status = 'saved',
    last_error = ''
where id = 1;
