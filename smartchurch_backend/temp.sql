CREATE ROLE "AI_Database" WITH
	LOGIN
	NOSUPERUSER
	NOCREATEDB
	NOCREATEROLE
	NOINHERIT
	NOREPLICATION
	NOBYPASSRLS
	CONNECTION LIMIT -1
	PASSWORD 'AI_Database';

GRANT CONNECT ON DATABASE smartchurch_db TO "AI_Database";


GRANT SELECT ON TABLE public.t_summary_report, public.t_guest, public.t_attendance, public.tm_member, public.tm_worship_session, public.tm_followup_members TO "AI_Database";