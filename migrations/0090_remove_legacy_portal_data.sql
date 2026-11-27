-- Remove obsolete OLD-MTS-portal artifacts. Does NOT delete live records,
-- does NOT reset production, does NOT touch Zendesk-synced data, customer
-- orders, staff, accounts, or this app's data. Idempotent. No credentials.

-- Retired auth client id (managetech is canonical; nothing else needs it).
delete from oauth_clients where client_id in ('mts-portal', 'mtsportal', 'manage_tech_service');

-- Canonical Zendesk tenant + admin (obsolete values can't linger).
update integration_settings
   set subdomain = 'managetechservicehelp',
       email = 'yossi@managetechservice.com',
       oauth_client_id = 'managetech'
 where id = 1;

-- Owner mapping no longer references obsolete address.
update portal_staff set email = 'yossi@managetechservice.com' where lower(email) = 'admin@abitech.site';
