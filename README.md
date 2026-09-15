# HRM System

Standalone Human Resource Management system for EasyOffice2026. Bilingual (English / Arabic, RTL),
multi-company and multi-branch, with role-based access.

Modules

- Employees, staff transfers, loans & advances, benefits & deductions, leave records, resignations
- Attendance
- Payroll generation and payslips (PDF/Excel export)
- Document & licence renewals with expiry alerts and renewal requests
- Petty cash (HRD / Mandoob / Administration) per branch, with replenishment, expenses and daily balances
- Expenses
- End of Service settlements under Kuwait Labour Law No. 6/2010 (indemnity, leave encashment, notice, deductions)
- Users, branches, permissions, SMTP settings

## Stack

- `backend/` — FastAPI + SQLAlchemy (Python 3.12). PostgreSQL (Supabase) in production, SQLite locally.
- `frontend/` — React 19 + TypeScript + Vite + Tailwind, react-i18next.

## Local development

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install . pytest
cp .env.example .env        # optional; without DATABASE_URL a local hrm.db is created
uvicorn app.main:app --reload --port 8000
```

Frontend (proxies `/api` to `localhost:8000`):

```bash
cd frontend
npm install
npm run dev
```

Default login (development only): `admin` / `admin123`. Override with `HRM_ADMIN_USER` / `HRM_ADMIN_PASSWORD`
before the first start.

Tests / checks:

```bash
cd backend && pytest tests
cd frontend && npm run lint && npm run build
```

## Production (Supabase)

1. Create a **new** Supabase project dedicated to the HRM (do not reuse any other system's database).
2. Set `DATABASE_URL` to the project's Session-pooler Postgres URI and `JWT_SECRET` to a random 32+ byte secret.
3. Start the backend once; tables are created automatically (`Base.metadata.create_all`) and the default
   company, branch, admin user and renewal types are seeded.
4. Build the frontend (`npm run build`) and serve `frontend/dist` behind the same origin as the API, or set up a
   reverse proxy for `/api` and `/uploads`.

See `backend/.env.example` for all environment variables.

## Demo data (client walkthroughs)

```bash
cd backend
python -m scripts.demo_data seed    # 8 employees + attendance, overtime, leave, loans, benefits,
                                    # 2 payroll months, documents, renewal requests, petty cash, EOS
python -m scripts.demo_data purge   # removes only the seeded rows (tagged DEMO-*)
```

Point `DATABASE_URL` at the target database (on Fly: `flyctl ssh console -C "python -m scripts.demo_data seed"`).

## Deployment (Fly.io)

The root `Dockerfile` builds the frontend and serves it from the FastAPI backend on port 8000; `fly.toml` configures the `hrm-system` app with a `hrm_data` volume for uploads.

One-time setup:

```bash
flyctl auth login
flyctl apps create hrm-system
flyctl volumes create hrm_data --region fra --size 1
flyctl secrets set DATABASE_URL='<supabase session pooler uri>' JWT_SECRET="$(openssl rand -hex 32)" HRM_ADMIN_PASSWORD='<strong password>'
flyctl deploy
```

Custom domain: `flyctl certs add hr.example.com`, then add the DNS records Fly prints (A/AAAA or CNAME to `hrm-system.fly.dev`).

Pushes to `main` deploy automatically via `.github/workflows/fly-deploy.yml` (requires the `FLY_API_TOKEN` repository secret).
