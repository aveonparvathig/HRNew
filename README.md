# Payslip v2 - Modern Tech Stack Migration

A complete architectural migration of the Payslip application (Aveon HR Suite) from Django/Python to **Node.js/Express (backend) + React/TypeScript (frontend) + PostgreSQL (database)**.

## Project Status: Phase 1 ✅ Completed

### Phase 1: Project Setup & Foundation (Completed)
- ✅ Created folder structure: `backend/` and `frontend/`
- ✅ Initialized Node.js backend with Express.js and TypeScript
- ✅ Initialized React frontend with Vite and TypeScript
- ✅ Configured TypeScript for both backend and frontend
- ✅ Set up Prisma ORM with PostgreSQL schema
- ✅ Created database schema with all 14+ models
- ✅ Implemented JWT authentication middleware
- ✅ Created error handling middleware
- ✅ Set up Zustand for state management (frontend)
- ✅ Created API client with token refresh interceptors
- ✅ Installed all core dependencies

## Project Structure

```
Payslip-v2/
├── backend/                    # Node.js Express backend
│   ├── src/
│   │   ├── config/            # Configuration (env, database)
│   │   ├── middleware/        # Express middleware (auth, error)
│   │   ├── routes/            # API route definitions
│   │   ├── controllers/       # Request handlers
│   │   ├── services/          # Business logic
│   │   │   ├── payroll/
│   │   │   ├── income/
│   │   │   ├── documents/
│   │   │   └── auth/
│   │   ├── models/            # TypeScript types
│   │   ├── utils/             # Helper functions
│   │   └── __tests__/         # Test files
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema (migrated from Django)
│   │   └── migrations/        # Auto-generated SQL migrations
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example           # Environment template
│   └── server.ts              # Entry point
│
├── frontend/                   # React TypeScript frontend
│   ├── src/
│   │   ├── api/               # API client modules
│   │   ├── store/             # Zustand stores
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable components
│   │   ├── hooks/             # Custom hooks
│   │   ├── types/             # TypeScript types
│   │   ├── utils/             # Helper functions
│   │   ├── styles/            # CSS files
│   │   └── __tests__/         # Test files
│   ├── public/                # Static assets
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── .env.example           # Environment template
│   └── main.tsx               # Entry point
│
└── docs/                      # Documentation (to be created)
    ├── ARCHITECTURE.md
    ├── DATABASE_MIGRATION.md
    ├── API_DOCS.md
    └── DEPLOYMENT.md
```

## Technology Stack

### Backend (Node.js)
- **Runtime:** Node.js 20+ (LTS)
- **Framework:** Express.js 4.x
- **ORM:** Prisma (type-safe database queries)
- **Validation:** Zod (runtime type validation)
- **Authentication:** JWT with refresh tokens
- **Password Hashing:** bcryptjs
- **Language:** TypeScript
- **File Generation:** pdfkit, exceljs (to be added)
- **Testing:** Jest + Supertest (to be added)

### Frontend (React)
- **Library:** React 18.x
- **Build Tool:** Vite (fast HMR bundler)
- **Language:** TypeScript
- **State Management:** Zustand
- **HTTP Client:** Axios with JWT interceptors
- **Routing:** React Router v6
- **Form Handling:** React Hook Form + Zod (to be added)
- **Styling:** CSS (or Tailwind - to be configured)
- **Testing:** Vitest + React Testing Library (to be added)

### Database
- **PostgreSQL** 14+ (same as current production)
- **Migrations:** Prisma Migrate (auto-generated SQL)

## Getting Started

### Option 1: Using Docker (Recommended) 🐳

**Quickest way to get everything running with a single command!**

#### Prerequisites
- Docker Desktop ([Install Guide](https://docs.docker.com/get-docker/))
- Git

#### Quick Start
```bash
# Clone project
git clone <repo-url> payslip-v2
cd payslip-v2

# Copy environment template
cp .env.docker .env

# Start all services (PostgreSQL + Backend + Frontend)
docker-compose up -d

# View logs
docker-compose logs -f
```

#### Access Points
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- pgAdmin (Database UI): http://localhost:5050
- API Health: http://localhost:3000/health

#### Using Make Commands (Recommended on Mac/Linux)
```bash
make setup      # Initial setup
make up         # Start services
make logs       # View logs
make migrate    # Run migrations
make down       # Stop services
make help       # See all available commands
```

**For detailed Docker setup, see [DOCKER.md](./DOCKER.md)**

---

### Option 2: Traditional Setup (Without Docker)

#### Prerequisites
- Node.js 20+ and npm
- PostgreSQL 14+
- Git

#### Environment Setup

##### Backend
```bash
cd backend
cp .env.example .env.local
# Edit .env.local with your PostgreSQL connection string
npm install
npm run dev
```

#### Frontend
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your API URL (default: http://localhost:3000/api)
npm install
npm run dev
```

### Database Setup

```bash
cd backend

# Generate Prisma client
npm run prisma:generate

# Create migrations (if schema changed)
npm run prisma:migrate

# View database in Prisma Studio
npm run prisma:studio
```

## Available Scripts

### Backend
- `npm run dev` — Start development server with hot reload (port 3000)
- `npm run build` — Build TypeScript to JavaScript
- `npm start` — Run production build
- `npm run prisma:generate` — Generate Prisma client
- `npm run prisma:migrate` — Run database migrations
- `npm run prisma:studio` — Open Prisma Studio (database GUI)

### Frontend
- `npm run dev` — Start Vite development server (port 5173)
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- `npm run lint` — Run ESLint (to be configured)

## Database Schema

Migrated from Django models:

### Core Models (Multi-tenancy)
- `Organization` — Company/tenant
- `User` — User accounts
- `Membership` — User-org relationships with role + module access

### Income Module
- `IncomeClient` — Client master
- `ClientBilling` — Annual billing per client
- `ClientPayment` — Payment receipts
- `AcademicYear` — Fiscal year tracking

### Payroll Module
- `Employee` — Staff master
- `SalaryStructure` — Earning/deduction templates
- `SalaryComponent` — Individual salary components
- `PayrollRun` — Monthly payroll batch (draft → finalized)
- `PayrollEntry` — Employee payslip line items

### People & Recruitment
- `Person` — HR registry (employees, contractors, applicants)
- `JobOpening` — Job requisition
- `JobPosting` — Public job listing
- `JobApplication` — Application tracking
- `Interview` — Interview feedback

### Proposals & Documents
- `ProposalHistory` — Generated document audit trail
- `ImplementationProject` — Project tracking

### File Management
- `GeneratedFile` — Temp storage for PDFs/ZIPs (24h retention)

## API Endpoints (To Be Implemented)

### Authentication
- `POST /api/auth/signup` — Register new user + organization
- `POST /api/auth/login` — User login
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — User logout
- `GET /api/auth/me` — Get current user

### Payroll
- `GET /api/payroll/runs` — List payroll runs
- `POST /api/payroll/runs` — Create payroll run
- `GET /api/payroll/runs/:id/entries` — Get payslips
- `PUT /api/payroll/entries/:id` — Update payslip
- `POST /api/payroll/export` — Excel export
- `POST /api/payroll/payslip/:id/pdf` — Generate payslip PDF

### Income
- `GET /api/income/clients` — List clients
- `GET /api/income/billing/:clientId` — Client billing
- `POST /api/income/payments` — Record payment

### People & Recruitment
- `GET /api/people/employees` — Employee registry
- `POST /api/people/employees` — Add employee
- `GET /api/recruitment/postings` — Job postings
- `POST /api/recruitment/applications` — Submit application

### Documents
- `POST /api/documents/offer-letter` — Generate offer letter
- `POST /api/documents/experience-cert` — Generate cert
- `POST /api/documents/proposal` — Generate proposal

## Next Steps (Phase 2-3)

### Phase 2: Data Model & Database
- [ ] Run Prisma migrations
- [ ] Test database connectivity
- [ ] Create data migration script (Django → Prisma)
- [ ] Validate data integrity

### Phase 3: Backend API Development
- [ ] Implement authentication endpoints
- [ ] Implement payroll module APIs
- [ ] Implement income module APIs
- [ ] Implement people & recruitment APIs
- [ ] Implement document generation endpoints
- [ ] Add API documentation (Swagger)
- [ ] Add unit and integration tests

### Phase 4: Frontend Development
- [ ] Implement auth pages (login, signup)
- [ ] Build layout components
- [ ] Implement payroll module UI
- [ ] Implement income module UI
- [ ] Implement people & recruitment UI
- [ ] Implement document generators
- [ ] Connect to backend APIs
- [ ] Add end-to-end tests

### Phase 5-6: Testing & Deployment
- [ ] Performance testing
- [ ] Security testing
- [ ] Data integrity verification
- [ ] Deployment configuration (Vercel/Railway/Render)
- [ ] Production database setup
- [ ] Blue-green deployment strategy
- [ ] User acceptance testing

## Key Design Decisions

1. **Separate Backend/Frontend Folders** — Independent scaling, separate deployments
2. **Prisma ORM** — Type-safe, excellent PostgreSQL support, auto-migrations
3. **Zustand for State** — Lightweight, persisted auth state
4. **Zod for Validation** — Runtime type checking (frontend + backend)
5. **JWT with Refresh Tokens** — Secure, scalable authentication
6. **PostgreSQL** — Existing database, ACID compliance, excellent Node support

## Deployment Targets

- **Backend:** Vercel, Railway, Render.com
- **Frontend:** Vercel, Netlify, AWS Amplify
- **Database:** Neon (current), Supabase, AWS RDS

## Contributing

1. Create a feature branch from `main`
2. Make changes in either `backend/` or `frontend/`
3. Test locally with `npm run dev`
4. Commit with descriptive messages
5. Submit PR with testing checklist

## License

ISC

## Support

For issues or questions, refer to:
- Backend docs: `docs/ARCHITECTURE.md`
- Frontend docs: `docs/DEVELOPER_SETUP.md`
- API reference: `docs/API_DOCS.md`
- Deployment: `docs/DEPLOYMENT.md`

---

**Migration Started:** 2026-09-12  
**Phase 1 Completed:** 2026-09-12  
**Next Phase:** Database Setup & Initial Migrations
