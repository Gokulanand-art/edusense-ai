# EduSense AI — Smart Campus Monorepo

Unified monorepo combining 5 best-in-class open-source college systems into one place.

## Structure

```
apps/
  01-college-erp/          # Centralized College Academic Management Portal (Django)
  02-timetable-scheduler/  # AI-Based Conflict-Free Timetable Generator - Genetic Algorithm (Django)
  03-rag-college-chatbot/  # RAG-Based College AI Assistant (Next.js 14 + pgvector)
  04-rfid-library/         # RFID-Based Automated Library Checkout System (Django + UHF RFID)
  05-campus-intelligence/  # Smart Campus Intelligence & Placement System (Flask + PostgreSQL)
  06-campus-portal/         # Static multi-role campus shell (placeholder; superseded by 07)
  07-campus-connect/        # Attendance, marks & CGPA portal for one department (Next.js)
```

## Sources & Attribution

| App | Original Repo | License |
|-----|---------------|---------|
| 01-college-erp | https://github.com/samarth-p/College-ERP | No explicit LICENSE (retain original author rights, educational use) |
| 02-timetable-scheduler | https://github.com/PROxZIMA/TimetableScheduler | GPL-3.0 |
| 03-rag-college-chatbot | https://github.com/25A31A4264/RAG-Based-College-Chatbot | No explicit LICENSE (retain original author rights) |
| 04-rfid-library | https://github.com/AliShahram/RFID-Library-Management-System | No explicit LICENSE (Earlham Capstone, retain author rights) |
| 05-campus-intelligence | https://github.com/mahesh-lute-9/smart-campus-intelligence-system | MIT |
| 07-campus-connect | Original work (no upstream repo) | MIT |

All credit to original authors. See `ATTRIBUTION.md` for details.
Each sub-app retains its own README and license where provided.

## Quick Start

Each app runs independently. See its own README:

- **01-college-erp:** `python manage.py runserver` (Django, login: samarth / project123)
- **02-timetable-scheduler:** `python manage.py runserver` (Django + Genetic Algorithm)
- **03-rag-college-chatbot:** `docker compose up -d`, `npm install`, `npx prisma db push`, `npm run seed`, `npm run dev` (see app README)
- **04-rfid-library:** `python manage.py runserver` (Django + RFID hardware, see docs)
- **05-campus-intelligence:** `pip install -r requirements.txt`, `python app.py`, `pytest -q` (Flask + Postgres)

## Notes

- `db.sqlite3`, `__pycache__`, `*.pyc`, `.vscode`, build artifacts removed for clean history.
- Original `.git` histories squashed to single monorepo commit (shallow `--depth 1` import).
- Environment files (`.env`) not committed. Copy `.env.example` where available.
