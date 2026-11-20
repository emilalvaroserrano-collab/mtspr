update integration_settings
set oauth_client_id = 'mts-portal',
    oauth_client_secret = 'fde58d0c97f7cb1210516024066bcc732e49e057b288f8ef3e1fea6db40b7ad6',
    oauth_scopes = 'read write',
    subdomain = 'mts-portal'
where id = 1
  and (
    oauth_client_id = 'mts-portal'
    or oauth_client_secret = '2323b62739554021211eaa17dc81221200a1dda3f362d1d7323ae09ecde4aee1'
    or coalesce(oauth_client_secret, '') = ''
  );
