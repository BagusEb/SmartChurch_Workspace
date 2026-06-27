#!/bin/sh
# Exit immediately if any command fails (except where we explicitly use || true)
set -e

# Create and apply any pending database migrations before the server starts.
# --noinput skips confirmation prompts.
echo "Making migrations..."
python manage.py makemigrations --noinput

echo "Running migrations..."
python manage.py migrate --noinput

# Create the Django superuser on first run using credentials from env vars:
# DJANGO_SUPERUSER_USERNAME, DJANGO_SUPERUSER_EMAIL, DJANGO_SUPERUSER_PASSWORD
# || true prevents the script from failing on restarts when the user already exists.
echo "Creating superuser..."
python manage.py createsuperuser --noinput || true

# Create a read-only PostgreSQL role for the AI chatbot (defined in temp.sql).
# || true prevents failure if the role already exists (e.g. on container restart).
echo "Setting up AI database user..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f /app/temp.sql || true

# Collect all static files into STATIC_ROOT so nginx / whitenoise can serve them.
echo "Collecting static files..."
python manage.py collectstatic --noinput

# exec replaces the shell process with uvicorn so Docker signals (SIGTERM)
# go directly to the server instead of being swallowed by the shell.
echo "Starting server..."
exec uvicorn smartchurch_backend.asgi:application --host 0.0.0.0 --port 8000
