alter table integration_settings add column if not exists oauth_access_expires_at timestamptz;
alter table integration_settings add column if not exists oauth_refresh_lock_at timestamptz;
