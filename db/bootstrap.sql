-- One-time setup of landing_db and its two roles, per docs/policy.md (one DB, two scoped roles).
-- Run as a Postgres superuser. No passwords live in this file: pass them as psql variables.
--
--   psql -v ON_ERROR_STOP=1 -v migrator_password="$LANDING_MIGRATOR_PASSWORD" \
--        -v app_password="$LANDING_APP_PASSWORD" -f db/bootstrap.sql
--
-- landing_migrator  owns the database and schema; used only by the `migrate` step (DDL).
-- landing_app       used by the running site; DML only, owns nothing, cannot change the schema.
-- Safe to re-run: roles and the database are created only if missing, passwords are reset.

\set ON_ERROR_STOP on

SELECT 'CREATE ROLE landing_migrator LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'landing_migrator') \gexec
SELECT 'CREATE ROLE landing_app LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'landing_app') \gexec

ALTER ROLE landing_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER ROLE landing_app      WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';

SELECT 'CREATE DATABASE landing_db OWNER landing_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'landing_db') \gexec

REVOKE ALL ON DATABASE landing_db FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE landing_db TO landing_migrator;
GRANT CONNECT ON DATABASE landing_db TO landing_app;

\connect landing_db

-- The public schema belongs to the database owner (landing_migrator) on PG 15+.
ALTER SCHEMA public OWNER TO landing_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO landing_app;

-- Tables and sequences the migrator creates later are usable by the app without manual grants.
ALTER DEFAULT PRIVILEGES FOR ROLE landing_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO landing_app;
ALTER DEFAULT PRIVILEGES FOR ROLE landing_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO landing_app;

-- And anything that already exists (re-runs after migrations).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO landing_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO landing_app;
