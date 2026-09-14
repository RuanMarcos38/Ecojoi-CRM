# Security model

## Isolation
Every tenant-owned entity carries `tenant_id`. API handlers derive tenant identity from the authenticated profile and filter every query. PostgreSQL RLS independently enforces the same boundary.

## IDOR resistance
Object routes always constrain both `id` and `tenant_id`. Cross-tenant identifiers resolve to 404/empty rather than leaking object existence.

## Authorization
Roles: `super_admin`, `company_admin`, `manager`, `user`. Permission checks run server-side. UI hiding is never treated as an authorization mechanism.

## Feature flags
Feature flags are tenant-scoped. Administrative writes require privileged roles. Backend routes must check feature availability before executing gated features.

## Secrets
Real `.env` files are ignored. Service-role keys are server-only and are not required for ordinary user requests.
