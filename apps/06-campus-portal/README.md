# 06 — Campus Portal (static UI shell)

Light, MyCamu-style multi-page prototype for school/college use.
Plain HTML + CSS + tiny JS — open `index.html` (or serve the folder) and log in.

## Pages

| File | View |
| ---- | ---- |
| `login.html` | Role chooser: Student / Staff / HOD |
| `login-student.html` | Mail ID + Roll No + Password |
| `login-staff.html` | Staff Mail ID + Password |
| `login-hod.html` | Name + Email ID + Password |
| `index.html` | Role-aware dashboard |
| `students.html` | Register (staff) / My Profile (student) |
| `attendance.html` | Marking (staff) / My attendance + leave (student) |
| `lms.html` | Courses & assignments |
| `analytics.html` | Grades & bands (staff) / My performance (student) |
| `library.html` | Catalog & dues |
| `access.html` | Role matrix & notices |
| `settings.html` | Data-source connections (admin) |

Shared: `campus.css` (theme), `campus.js` (menu, active nav, role views,
demo login gate in `localStorage`).

## Status

- **No real data, no backend.** Every data point is an empty `data-slot`
  placeholder (e.g. `table-students`, `chart-attendance-trend`).
- **Demo login only.** Forms validate locally and store the role in
  `localStorage`; real authentication plugs in at each form's submit handler.
- No animations, light theme, keyboard-operable nav.

## Preview

```sh
npx -y http-server apps/06-campus-portal -p 8324 -a 127.0.0.1
# open http://127.0.0.1:8324/login.html
```
