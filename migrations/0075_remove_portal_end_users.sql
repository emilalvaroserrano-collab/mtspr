delete from shop_customers
where lower(email) not in (
  select lower(email) from portal_staff where email <> '' and active = true
);

delete from customer_users
where lower(coalesce(zendesk_role, 'end-user')) in ('', 'end-user')
  and lower(email) not in (
    select lower(email) from portal_staff where email <> '' and active = true
  );
