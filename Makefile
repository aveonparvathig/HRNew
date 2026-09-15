.PHONY: help build up down logs clean migrate seed

# Variables
COMPOSE := docker-compose
DOCKER := docker

help:
	@echo "Payslip v2 - Docker Commands"
	@echo "=============================="
	@echo ""
	@echo "Setup & Build:"
	@echo "  make setup      - Initial setup (copy env, build images)"
	@echo "  make build      - Build Docker images"
	@echo "  make pull       - Pull latest Docker images"
	@echo ""
	@echo "Running:"
	@echo "  make up         - Start all services (development with hot reload)"
	@echo "  make dev        - Alias for 'make up'"
	@echo "  make down       - Stop all services"
	@echo "  make restart    - Restart all services"
	@echo ""
	@echo "Database:"
	@echo "  make migrate    - Run database migrations"
	@echo "  make seed       - Seed database with initial data"
	@echo "  make reset-db   - Drop and recreate database"
	@echo "  make studio     - Open Prisma Studio"
	@echo ""
	@echo "Logs & Debugging:"
	@echo "  make logs       - Show all service logs"
	@echo "  make logs-backend   - Show backend logs"
	@echo "  make logs-frontend  - Show frontend logs"
	@echo "  make logs-db    - Show database logs"
	@echo "  make shell      - Open bash shell in backend"
	@echo "  make db-shell   - Connect to PostgreSQL"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean      - Stop services and remove containers"
	@echo "  make clean-all  - Remove everything (containers, volumes, networks)"
	@echo "  make prune      - Docker system prune (deep cleanup)"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  make test       - Run backend tests"
	@echo "  make lint       - Run linting"
	@echo "  make format     - Format code"
	@echo ""

# Setup
setup: .env
	@echo "Setting up Payslip v2..."
	$(COMPOSE) build
	@echo "Setup complete! Run 'make up' to start the services."

.env:
	@echo "Creating .env from .env.docker template..."
	cp .env.docker .env
	@echo "✓ .env created. Please review and adjust settings if needed."

build:
	@echo "Building Docker images..."
	$(COMPOSE) build --no-cache

pull:
	@echo "Pulling Docker images..."
	$(COMPOSE) pull

# Running Services
up:
	@echo "Starting Payslip v2 services..."
	$(COMPOSE) up -d
	@echo ""
	@echo "✓ Services started!"
	@echo ""
	@echo "Access points:"
	@echo "  Frontend:  http://localhost:5173"
	@echo "  Backend:   http://localhost:3000"
	@echo "  pgAdmin:   http://localhost:5050 (admin@example.com / admin)"
	@echo ""
	@echo "View logs with: make logs"

dev: up

down:
	@echo "Stopping services..."
	$(COMPOSE) down

restart: down up

# Database
migrate:
	@echo "Running database migrations..."
	$(COMPOSE) exec backend npx prisma migrate deploy

seed:
	@echo "Seeding database..."
	$(COMPOSE) exec backend npx prisma db seed

reset-db: down
	@echo "Removing database volume..."
	$(COMPOSE) volume rm payslip-postgres || true
	$(COMPOSE) up postgres -d
	@sleep 5
	$(COMPOSE) up -d
	$(MAKE) migrate

studio:
	@echo "Opening Prisma Studio..."
	$(COMPOSE) exec backend npx prisma studio

# Logs
logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-db:
	$(COMPOSE) logs -f postgres

# Shell Access
shell:
	@echo "Opening bash shell in backend container..."
	$(COMPOSE) exec backend /bin/sh

db-shell:
	@echo "Connecting to PostgreSQL..."
	$(COMPOSE) exec postgres psql -U $${DB_USER:-payslip_user} -d $${DB_NAME:-payslip_dev}

# Cleanup
clean: down
	@echo "Removing Docker containers..."
	$(COMPOSE) rm -f

clean-all: down
	@echo "Removing all Docker artifacts..."
	$(COMPOSE) down -v
	@echo "✓ All containers, volumes, and networks removed"

prune:
	@echo "Pruning Docker system..."
	$(DOCKER) system prune -f
	$(DOCKER) volume prune -f

# Testing & Quality
test:
	@echo "Running backend tests..."
	$(COMPOSE) exec backend npm test

lint:
	@echo "Running linting..."
	$(COMPOSE) exec backend npm run lint || true
	$(COMPOSE) exec frontend npm run lint || true

format:
	@echo "Formatting code..."
	$(COMPOSE) exec backend npm run format || true
	$(COMPOSE) exec frontend npm run format || true

# Status
status:
	@echo "Checking service status..."
	$(COMPOSE) ps

# Health Check
health:
	@echo "Running health checks..."
	@$(COMPOSE) exec -T backend curl -s http://localhost:3000/health | jq . || echo "Backend health check failed"
	@echo ""
	@echo "PostgreSQL status:"
	@$(COMPOSE) exec -T postgres pg_isready -U $${DB_USER:-payslip_user} || echo "PostgreSQL not ready"

.DEFAULT_GOAL := help
