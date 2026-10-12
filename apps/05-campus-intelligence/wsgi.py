"""WSGI entry point for Gunicorn / Render."""
from app import app

# Render and most WSGI servers look for 'application'
application = app
