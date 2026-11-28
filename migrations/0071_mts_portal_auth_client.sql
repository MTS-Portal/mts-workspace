insert into oauth_clients (client_id, name, secret, grant_type, scopes)
select 'mts-portal', 'mts-portal', secret, 'authorization_code', coalesce(nullif(scopes, ''), 'read write')
from oauth_clients
where client_id = 'mts-auth'
on conflict (client_id) do update set
  name = 'mts-portal',
  grant_type = 'authorization_code',
  scopes = excluded.scopes,
  secret = case when oauth_clients.secret = '' then excluded.secret else oauth_clients.secret end;

insert into oauth_clients (client_id, name, secret, grant_type, scopes)
values (
  'mts-portal',
  'mts-portal',
  '',
  'authorization_code',
  'read write'
)
on conflict (client_id) do update set
  name = 'mts-portal';

update oauth_codes set client_id = 'mts-portal' where client_id = 'mts-auth';
update oauth_tokens set client_id = 'mts-portal' where client_id = 'mts-auth';
delete from oauth_clients where client_id = 'mts-auth';
