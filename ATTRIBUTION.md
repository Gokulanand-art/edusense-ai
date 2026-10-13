# Attribution

This monorepo aggregates code from the following open-source projects for educational / integration purposes.
All rights remain with original authors.

1. **College-ERP** by samarth-p
   - https://github.com/samarth-p/College-ERP
   - Django college management system (attendance, marks, timetable)
   - License: none stated in source. Treat as all-rights-reserved by author, used here for study.

2. **TimetableScheduler** by PROxZIMA
   - https://github.com/PROxZIMA/TimetableScheduler
   - Intelligent timetable generator using Genetic Algorithm
   - License: GPL-3.0 (see apps/02-timetable-scheduler/LICENSE)

3. **RAG-Based-College-Chatbot** by 25A31A4264
   - https://github.com/25A31A4264/RAG-Based-College-Chatbot
   - Next.js + pgvector RAG chatbot with admin dashboard
   - License: none stated. Retain author credit.

4. **RFID-Library-Management-System** by AliShahram (Earlham College Capstone 2019)
   - https://github.com/AliShahram/RFID-Library-Management-System
   - Self-service RFID library, tested with 800 tags / 150 students
   - License: none stated. Retain author credit.

5. **smart-campus-intelligence-system** by mahesh-lute-9
   - https://github.com/mahesh-lute-9/smart-campus-intelligence-system
   - Flask + PostgreSQL multi-tenant placement analytics SaaS
   - License: MIT (see apps/05-campus-intelligence/LICENSE)

Imported 2026-10-12 via shallow clone (--depth 1), binaries (db.sqlite3, __pycache__) excluded.

---

## 07 — Campus Connect

Original work; no upstream repository was imported. See
`apps/07-campus-connect/README.md` for what it does and how to run it.

Note on data: this app can import a real placement register (student names, roll
numbers, login IDs). No such file is committed here. The spreadsheet, the local
database (`./data/`) and the generated credential listing are all excluded by
`.gitignore`.
