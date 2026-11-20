alter table shop_customers add column if not exists payment_method text not null default 'card';
alter table shop_customers add column if not exists card_brand text not null default '';
alter table shop_customers add column if not exists card_last4 text not null default '';
alter table shop_customers add column if not exists card_exp text not null default '';
