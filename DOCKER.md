# Docker Setup Guide for Payslip v2

Complete guide to running the Payslip application stack using Docker and Docker Compose.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Services Overview](#services-overview)
4. [Configuration](#configuration)
5. [Common Commands](#common-commands)
6. [Development Workflow](#development-workflow)
7. [Production Deployment](#production-deployment)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required
- **Docker Desktop** (includes Docker Engine and Docker Compose)
  - Windows: [Download Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
  - Mac: [Download Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
  - Linux: [Install Docker Engine](https://docs.docker.com/engine/install/) + [Install Docker Compose](https://docs.docker.com/compose/install/)

- **Git** (for cloning the project)

### Recommended
- Make (for Makefile commands)
  - Windows: Install via [Chocolatey](https://community.chocolatey.org/packages/make) or [GNU Make for Windows](https://gnuwin32.sourceforge.io/packages/make.htm)
  - Mac: Pre-installed or via `brew install make`
  - Linux: `sudo apt-get install make`

### System Requirements
- Disk space: ~2GB for Docker images + 1GB for database
- RAM: Minimum 2GB, recommended 4GB+
- CPU: Modern multi-core processor

## Quick Start

### Option 1: Using Make (Recommended on Mac/Linux)

```bash
# Clone the project
git clone <repo-url> payslip-v2
cd payslip-v2

# Initial setup (creates .env file and builds images)
make setup

# Start all services with hot reload
make up

# View logs
make logs

# Stop services
make down
```

### Option 2: Using Docker Compose Directly (Windows/All Platforms)

```bash
# Clone and navigate to project
git clone <repo-url> payslip-v2
cd payslip-v2

# Copy environment template
cp .env.docker .env

# Build Docker images
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Access the Application

Once services are running:

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend (React) | http://localhost:5173 | - |
| Backend API | http://localhost:3000 | - |
| pgAdmin (Database) | http://localhost:5050 | admin@example.com / admin |
| API Health Check | http://localhost:3000/health | - |

## Services Overview

### 1. PostgreSQL Database
- **Image:** `postgres:16-alpine`
- **Port:** 5432 (internal), configurable via `DB_PORT`
- **Data Storage:** Docker volume `postgres_data` (persistent)
- **Health Check:** Enabled (waits for DB to be ready)
- **Environment:**
  - `POSTGRES_USER` - Database user (default: payslip_user)
  - `POSTGRES_PASSWORD` - Database password (default: payslip_password)
  - `POSTGRES_DB` - Database name (default: payslip_dev)

### 2. Node.js Backend
- **Image:** Built from `./backend/Dockerfile`
- **Port:** 3000 (configurable via `BACKEND_PORT`)
- **Language:** Node.js 20 Alpine
- **Features:**
  - Express.js API server
  - Prisma ORM with PostgreSQL
  - JWT authentication
  - Auto-migration on startup
  - Health check endpoint
- **Hot Reload:** Enabled in development via nodemon

### 3. React Frontend
- **Image:** Built from `./frontend/Dockerfile`
- **Port:** 5173 (configurable via `FRONTEND_PORT`)
- **Language:** Node.js 20 Alpine
- **Features:**
  - Vite dev server (hot reload)
  - React 18 TypeScript
  - Axios HTTP client
  - Zustand state management
- **Build:** Multi-stage build (optimized size)

### 4. pgAdmin (Optional)
- **Image:** `dpage/pgadmin4:latest`
- **Port:** 5050
- **Purpose:** Web UI for PostgreSQL management
- **Profile:** Only starts when explicitly enabled
- **Credentials:**
  - Email: admin@example.com (configurable)
  - Password: admin (configurable)

## Configuration

### Environment Variables

Configuration is managed via `.env` file (created from `.env.docker` template):

```env
# Database
DB_USER=payslip_user
DB_PASSWORD=secure_password_change_me
DB_NAME=payslip_dev
DB_PORT=5432

# Backend
NODE_ENV=development
BACKEND_PORT=3000
JWT_SECRET=your-long-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-long-refresh-secret-min-32-chars
CORS_ORIGIN=http://localhost:5173

# Frontend
FRONTEND_PORT=5173
VITE_API_URL=http://localhost:3000/api

# pgAdmin (optional)
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050
```

### Customizing Configuration

1. **Create/Edit `.env` file:**
   ```bash
   cp .env.docker .env
   nano .env  # Edit as needed
   ```

2. **Change ports:**
   ```env
   BACKEND_PORT=4000      # Backend on port 4000
   FRONTEND_PORT=3000     # Frontend on port 3000
   DB_PORT=5433           # PostgreSQL on port 5433
   PGADMIN_PORT=5051      # pgAdmin on port 5051
   ```

3. **Change database credentials:**
   ```env
   DB_USER=myuser
   DB_PASSWORD=mypassword
   DB_NAME=my_database
   ```

4. **Production JWT secrets:**
   ```env
   JWT_SECRET=your-secure-random-string-minimum-32-characters-long
   JWT_REFRESH_SECRET=another-secure-random-string-minimum-32-characters-long
   ```

## Common Commands

### Using Make (Recommended)

```bash
# Show all available commands
make help

# Setup and start
make setup
make up

# View logs
make logs
make logs-backend
make logs-frontend
make logs-db

# Database operations
make migrate           # Run database migrations
make seed             # Seed database with data
make reset-db         # Drop and recreate database
make studio           # Open Prisma Studio

# Shell access
make shell            # Bash in backend container
make db-shell         # PostgreSQL CLI

# Cleanup
make down
make clean            # Stop and remove containers
make clean-all        # Remove everything (containers, volumes, networks)
```

### Using Docker Compose Directly

```bash
# Start services (foreground)
docker-compose up

# Start services (background)
docker-compose up -d

# View logs
docker-compose logs -f
docker-compose logs -f backend

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Execute command in container
docker-compose exec backend npm run build
docker-compose exec frontend npm run build

# Connect to PostgreSQL
docker-compose exec postgres psql -U payslip_user -d payslip_dev

# View running services
docker-compose ps

# Restart a service
docker-compose restart backend
```

### Building & Deployment

```bash
# Build without cache (fresh build)
docker-compose build --no-cache

# Build specific service
docker-compose build backend
docker-compose build frontend

# Push to registry (configure registry first)
docker-compose push

# Pull latest images
docker-compose pull
```

## Development Workflow

### File Changes & Hot Reload

The `docker-compose.override.yml` enables **hot reload** for both backend and frontend:

```
Your Editor → Save File → Container Detects Change → Auto Reload → Browser Updates
```

**Backend Changes:**
1. Edit files in `backend/src/`
2. Nodemon automatically restarts the server
3. Check backend logs: `make logs-backend`

**Frontend Changes:**
1. Edit files in `frontend/src/`
2. Vite hot reload applies changes instantly
3. No page refresh needed in most cases

### Running Migrations

When you modify Prisma schema:

```bash
# Option 1: Using Make
make migrate

# Option 2: Using Docker Compose
docker-compose exec backend npx prisma migrate dev --name your_migration_name

# Option 3: Using Prisma Studio (visual database editor)
make studio
```

### Testing in Containers

```bash
# Run backend tests
docker-compose exec backend npm test

# Run frontend tests (when configured)
docker-compose exec frontend npm test

# Run linting
docker-compose exec backend npm run lint
docker-compose exec frontend npm run lint
```

### Debugging

```bash
# View logs in real-time
docker-compose logs -f

# Follow specific service logs
docker-compose logs -f backend

# View last 100 lines
docker-compose logs --tail=100 backend

# Search logs for errors
docker-compose logs | grep ERROR

# Enter backend container shell
docker-compose exec backend /bin/sh

# Check database connectivity
docker-compose exec backend npx prisma studio

# Test API endpoint
docker-compose exec backend curl -X GET http://localhost:3000/health
```

## Production Deployment

### Preparation

1. **Update `.env` for production:**
   ```env
   NODE_ENV=production
   JWT_SECRET=<generate-secure-random-string>
   JWT_REFRESH_SECRET=<generate-secure-random-string>
   CORS_ORIGIN=https://yourdomain.com
   VITE_API_URL=https://api.yourdomain.com
   DB_PASSWORD=<strong-password>
   PGADMIN_PASSWORD=<change-to-strong-password>
   ```

2. **Build production images:**
   ```bash
   docker-compose build
   ```

3. **Security checklist:**
   - [ ] Changed all default passwords
   - [ ] Generated secure JWT secrets (min 32 chars, random)
   - [ ] Set `CORS_ORIGIN` to production domain
   - [ ] Enabled HTTPS/SSL
   - [ ] Configured database backups
   - [ ] Set resource limits in docker-compose
   - [ ] Removed pgAdmin from production (or secure it)

### Deployment to Server

```bash
# On your production server
git clone <repo-url>
cd payslip-v2
cp .env.docker .env
# Edit .env with production values
nano .env

# Build and start
docker-compose up -d

# Verify services
docker-compose ps
docker-compose logs
```

### Container Orchestration (Kubernetes)

For larger deployments, convert Docker Compose to Kubernetes:

```bash
# Install kompose
curl -L https://github.com/kubernetes/kompose/releases/download/v1.28.0/kompose-linux-amd64 -o kompose
chmod +x kompose

# Convert to Kubernetes manifests
./kompose convert

# Deploy to Kubernetes
kubectl create -f backend-service.yaml
kubectl create -f frontend-service.yaml
# ... etc
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
docker-compose logs

# Ensure all ports are available
docker ps
lsof -i :3000  # Check port 3000
lsof -i :5432  # Check port 5432

# Rebuild images
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Failed

```bash
# Check PostgreSQL container health
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Verify connection string in backend logs
docker-compose logs backend | grep DATABASE

# Test connection manually
docker-compose exec postgres psql -U payslip_user -d payslip_dev -c "SELECT 1"
```

### Frontend/Backend Not Communicating

```bash
# Check CORS_ORIGIN setting
docker-compose exec backend env | grep CORS

# Test API endpoint
curl -X GET http://localhost:3000/health

# Check frontend environment
docker-compose exec frontend env | grep VITE_API_URL

# View network
docker network inspect payslip-payslip_network
```

### Container Keeps Restarting

```bash
# Check restart policy
docker-compose ps

# View logs for crash reason
docker-compose logs <service-name>

# Get detailed info
docker inspect <container-id>

# Disable auto-restart temporarily (for debugging)
docker-compose run -it --entrypoint /bin/sh <service>
```

### Out of Disk Space

```bash
# Clean up Docker system
docker system prune -a

# Remove all unused volumes
docker volume prune

# Remove specific volume
docker volume rm payslip-postgres

# Check disk usage
docker system df
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000  # Replace with your port

# Kill the process
kill -9 <pid>

# Or change the port in .env
echo "BACKEND_PORT=4000" >> .env
docker-compose up -d
```

## Performance Tuning

### Increase Resource Limits

Edit `docker-compose.yml` to add resource limits:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Database Performance

```bash
# Check database size
docker-compose exec postgres psql -U payslip_user -d payslip_dev -c "SELECT pg_size_pretty(pg_database_size(current_database()))"

# View slow queries
docker-compose exec postgres psql -U payslip_user -d payslip_dev -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10"
```

### Cache Docker Layers

```bash
# Leverage build cache (don't use --no-cache unless necessary)
docker-compose build backend

# Reorder Dockerfile for better caching
# Put commands that change less frequently first
```

## Security Best Practices

1. **Never commit `.env` to version control**
   - Add to `.gitignore` (already done)
   - Use separate `.env` for each environment

2. **Rotate secrets regularly**
   ```bash
   # Generate new secrets
   openssl rand -base64 32  # JWT_SECRET
   openssl rand -base64 32  # JWT_REFRESH_SECRET
   ```

3. **Run containers as non-root**
   - Dockerfiles already configured with user nodejs

4. **Use secrets management in production**
   - Docker Secrets (Swarm)
   - Kubernetes Secrets
   - AWS Secrets Manager
   - HashiCorp Vault

5. **Network isolation**
   - Services communicate via internal network
   - Only expose necessary ports
   - Use firewall rules

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Best Practices for Node.js Docker Images](https://github.com/nodejs/docker-node/blob/main/docs/README.md)
- [PostgreSQL Docker Documentation](https://hub.docker.com/_/postgres)

---

**Happy coding! 🐳** If you encounter issues, check the troubleshooting section or open an issue in the repository.
