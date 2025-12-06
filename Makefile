.PHONY: help
help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build Core API binary
	@echo "Building stagely-core..."
	@go build -o bin/stagely-core ./cmd/core

.PHONY: test
test: ## Run all tests
	@echo "Running tests..."
	@go test -v -race -coverprofile=coverage.out ./...

.PHONY: test-unit
test-unit: ## Run unit tests only
	@echo "Running unit tests..."
	@go test -v -short -race ./...

.PHONY: test-integration
test-integration: ## Run integration tests only
	@echo "Running integration tests..."
	@go test -v -run Integration ./...

.PHONY: lint
lint: ## Run linters
	@echo "Running linters..."
	@if command -v golangci-lint > /dev/null; then \
		golangci-lint run ./...; \
	else \
		echo "golangci-lint not installed. Install: https://golangci-lint.run/usage/install/"; \
	fi

.PHONY: migrate-up
migrate-up: ## Run database migrations
	@echo "Running migrations..."
	@migrate -path migrations -database "$(DATABASE_URL)" up

.PHONY: migrate-down
migrate-down: ## Rollback last migration
	@echo "Rolling back migration..."
	@migrate -path migrations -database "$(DATABASE_URL)" down 1

.PHONY: migrate-create
migrate-create: ## Create new migration file (usage: make migrate-create NAME=create_users)
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME is required. Usage: make migrate-create NAME=create_users"; \
		exit 1; \
	fi
	@migrate create -ext sql -dir migrations -seq $(NAME)

.PHONY: docker-up
docker-up: ## Start Docker Compose services
	@echo "Starting Docker services..."
	@docker-compose up -d

.PHONY: docker-down
docker-down: ## Stop Docker Compose services
	@echo "Stopping Docker services..."
	@docker-compose down

.PHONY: clean
clean: ## Clean build artifacts
	@echo "Cleaning..."
	@rm -rf bin/ coverage.out

.PHONY: install-tools
install-tools: ## Install development tools
	@echo "Installing tools..."
	@go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	@echo "Tools installed successfully"

.DEFAULT_GOAL := help
