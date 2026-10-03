-- Run after creating the first user in Supabase Auth. Replace placeholders locally.
-- Never commit real user IDs or secrets.

insert into public.tenants (name, slug) values ('Ecojoi Demo', 'ecojoi-demo') returning id;
-- insert into public.profiles (id, tenant_id, full_name, role)
-- values ('AUTH_USER_UUID', 'TENANT_UUID', 'Administrador Ecojoi', 'company_admin');
-- insert into public.feature_flags (tenant_id, feature_name, enabled) values
-- ('TENANT_UUID','atendimento',true),('TENANT_UUID','automacoes',true),('TENANT_UUID','relatorios',true);
