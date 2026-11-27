update integration_settings
set oauth_client_id = 'managetech',
    -- Secret is intentionally NOT committed. Set ZENDESK_OAUTH_CLIENT_SECRET in the environment.
    -- The production secret is provisioned in Vercel and remains in integration_settings.
    oauth_scopes = 'read write',
    subdomain = 'managetechservicehelp',
    email = 'yossi@managetechservice.com',
    last_status = 'saved',
    last_error = ''
where id = 1;
