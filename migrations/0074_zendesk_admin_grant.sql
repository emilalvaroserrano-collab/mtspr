alter table integration_settings add column if not exists oauth_refresh_token text not null default '';
alter table integration_settings add column if not exists oauth_user_email text not null default '';
alter table integration_settings add column if not exists oauth_user_role text not null default '';
