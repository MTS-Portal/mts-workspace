insert into oauth_clients (client_id, name, secret, grant_type, scopes)
select 'managetech', 'managetech', secret, 'authorization_code', coalesce(nullif(scopes, ''), 'read write')
from oauth_clients
where client_id = 'mts-portal'
on conflict (client_id) do update set
  name = 'managetech',
  grant_type = 'authorization_code',
  scopes = excluded.scopes,
  secret = case when oauth_clients.secret = '' then excluded.secret else oauth_clients.secret end;

insert into oauth_clients (client_id, name, secret, grant_type, scopes)
values (
  'managetech',
  'managetech',
  '',
  'authorization_code',
  'read write'
)
on conflict (client_id) do update set
  name = 'managetech',
  grant_type = 'authorization_code';
