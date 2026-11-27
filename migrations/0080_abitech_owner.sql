update integration_settings
set email = 'yossi@managetechservice.com',
    subdomain = 'managetechservicehelp'
where id = 1;

update portal_staff
set role = 'owner', active = true
where lower(email) = 'yossi@managetechservice.com';
