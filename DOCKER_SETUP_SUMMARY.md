# Docker Setup Summary ✅

## Files Created

### Docker Configuration Files
| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Multi-stage build for Node.js Express backend |
| `frontend/Dockerfile` | Multi-stage build for React frontend |
| `docker-compose.yml` | Orchestrate PostgreSQL, Backend, Frontend, pgAdmin |
| `docker-compose.override.yml` | Development overrides (hot reload, volumes) |
| `.dockerignore` (backend) | Exclude files from Docker build context |
| `.dockerignore` (frontend) | Exclude files from Docker build context |
| `.env.docker` | Environment template for Docker setup |
| `Makefile` | Convenient commands for Docker operations |
| `DOCKER.md` | Comprehensive Docker documentation |

## Services in Docker Compose

### 1. **PostgreSQL 16 Alpine** 🗄️
```
Container: payslip-postgres
Port: 5432 (configurable)
Volume: postgres_data (persistent)
Health: Auto-checks before starting other services
```

### 2. **Node.js Express Backend** ⚙️
```
Container: payslip-backend
Port: 3000 (configurable)
Image: Alpine Linux + Node 20
Auto-migrations on startup
Hot-reload in development (nodemon)
```

### 3. **React Vite Frontend** ⚛️
```
Container: payslip-frontend
Port: 5173 (configurable as FRONTEND_PORT)
Image: Alpine Linux + Node 20
Hot-reload with Vite dev server
Production serve with lightweight HTTP server
```

### 4. **pgAdmin** (Optional) 📊
```
Container: payslip-pgadmin
Port: 5050 (configurable)
Email: admin@example.com
Password: admin
Only starts in dev profile or if explicitly enabled
```

## Key Features Implemented

✅ **Multi-stage Docker builds** — Optimized image sizes
✅ **Health checks** — Services wait for dependencies
✅ **Hot reload in development** — nodemon (backend), Vite (frontend)
✅ **Volume mounts** — Persistent database, node_modules preservation
✅ **Environment configuration** — Single `.env` file for all services
✅ **Network isolation** — Internal Docker network for service communication
✅ **Non-root user** — Security: containers run as 'nodejs' user
✅ **Auto-migrations** — Prisma migrations run on backend startup
✅ **Resource limits** — Ready to be configured as needed
✅ **Graceful shutdown** — Using dumb-init for proper signal handling

## Quick Start Commands

### With Make (Recommended)
```bash
make setup              # Initial setup (copy .env, build images)
make up                 # Start all services
make logs               # View all logs
make migrate            # Run database migrations
make studio             # Open Prisma Studio
make down               # Stop services
make help               # Show all available commands
```

### With Docker Compose
```bash
# Setup
docker-compose build
cp .env.docker .env

# Run
docker-compose up -d
docker-compose logs -f

# Database
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npx prisma studio

# Stop
docker-compose down
```

## Environment Variables

All services are configured via `.env` file (created from `.env.docker`):

```env
# Database
DB_USER=payslip_user
DB_PASSWORD=payslip_password
DB_NAME=payslip_dev
DB_PORT=5432

# Backend
NODE_ENV=development
BACKEND_PORT=3000
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
CORS_ORIGIN=http://localhost:5173

# Frontend
FRONTEND_PORT=5173
VITE_API_URL=http://localhost:3000/api

# pgAdmin (optional)
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050
```

## Port Configuration

Default ports (all configurable via `.env`):

| Service | Port | Env Variable |
|---------|------|--------------|
| Frontend | 5173 | FRONTEND_PORT |
| Backend | 3000 | BACKEND_PORT |
| PostgreSQL | 5432 | DB_PORT |
| pgAdmin | 5050 | PGADMIN_PORT |

Change ports in `.env`:
```env
BACKEND_PORT=4000      # Changes to http://localhost:4000
FRONTEND_PORT=3001     # Changes to http://localhost:3001
DB_PORT=5433           # PostgreSQL on 5433
```

## Development Workflow

### File Changes & Auto-reload
1. **Edit backend code** → Nodemon restarts server
2. **Edit frontend code** → Vite hot reloads changes
3. **Edit Prisma schema** → Run `make migrate`

### Database Management
```bash
make migrate            # Create migrations
make studio             # Visual database editor
make seed               # Seed with sample data
make reset-db           # Drop and recreate DB
```

### Shell Access
```bash
make shell              # Bash in backend container
make db-shell           # PostgreSQL client
docker-compose exec frontend npm install pkg-name  # Install packages
```

## Docker Image Sizes

### Backend
- **Build:** ~2.5 GB (includes node_modules)
- **Runtime:** ~300 MB (optimized with multi-stage build)

### Frontend
- **Build:** ~1.5 GB (includes node_modules)
- **Runtime:** ~200 MB (optimized with multi-stage build)

### Database
- **PostgreSQL:** ~150 MB

**Total estimated disk space: ~2 GB**

## Production Deployment

When deploying to production:

1. **Update `.env` for production:**
   ```env
   NODE_ENV=production
   JWT_SECRET=<generate-secure-32-char-string>
   JWT_REFRESH_SECRET=<generate-secure-32-char-string>
   CORS_ORIGIN=https://yourdomain.com
   VITE_API_URL=https://api.yourdomain.com
   DB_PASSWORD=<strong-password>
   ```

2. **Remove pgAdmin:**
   ```bash
   # Don't include pgAdmin in production
   docker-compose down
   # Or modify docker-compose.yml to remove pgAdmin service
   ```

3. **Use environment-specific configs:**
   ```bash
   # For production, create separate env files
   cp .env.docker .env.prod
   docker-compose --env-file .env.prod up -d
   ```

4. **Set up backup strategy for PostgreSQL:**
   ```bash
   # Create backup
   docker-compose exec postgres pg_dump -U payslip_user payslip_dev > backup.sql
   
   # Restore from backup
   docker-compose exec postgres psql -U payslip_user payslip_dev < backup.sql
   ```

## Troubleshooting

### Services won't start?
```bash
docker-compose down -v              # Remove containers and volumes
docker-compose build --no-cache     # Rebuild from scratch
docker-compose up -d                # Start again
docker-compose logs                 # Check for errors
```

### Port already in use?
```bash
# Change port in .env
echo "BACKEND_PORT=4000" >> .env
docker-compose restart backend
```

### Database connection failed?
```bash
docker-compose logs postgres        # Check DB logs
docker-compose exec postgres pg_isready  # Test connection
```

### Out of disk space?
```bash
docker system prune -a              # Remove unused images/containers
docker volume prune                 # Remove unused volumes
docker image prune                  # Remove dangling images
```

## Useful Docker Commands

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# View Docker images
docker images

# View container logs
docker logs <container-id>
docker logs -f <container-id>       # Follow logs

# Execute command in container
docker exec -it <container-id> bash

# Remove container
docker rm <container-id>

# Remove image
docker rmi <image-id>

# Docker system info
docker system df
docker system prune
```

## Next Steps

1. **Create `.env` file:**
   ```bash
   cp .env.docker .env
   ```

2. **Start the stack:**
   ```bash
   docker-compose up -d
   # or
   make up
   ```

3. **Run migrations:**
   ```bash
   make migrate
   # or
   docker-compose exec backend npx prisma migrate deploy
   ```

4. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3000
   - pgAdmin: http://localhost:5050

## Security Considerations

✅ Containers run as non-root user  
✅ Services communicate via internal Docker network  
✅ Only necessary ports exposed  
✅ Environment variables not logged  
✅ Health checks ensure service readiness  
✅ Auto-restart on failure (unless-stopped)

## References

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Node.js Docker Guide](https://github.com/nodejs/docker-node/blob/main/docs/README.md)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)

---

**Status:** Docker setup complete and ready to use! 🚀

For detailed Docker documentation, see [DOCKER.md](./DOCKER.md)
