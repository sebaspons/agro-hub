.PHONY: help up down logs build seed migrate revision reset test lint fmt psql sh-api sh-web

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Levanta todos los servicios (db + api + web)
	docker compose up -d --build

down: ## Detiene los servicios
	docker compose down

logs: ## Sigue los logs de todos los servicios
	docker compose logs -f

build: ## Reconstruye las imágenes
	docker compose build

seed: ## Carga datos de demo (idempotente)
	docker compose run --rm api python -m app.seed

migrate: ## Aplica las migraciones pendientes
	docker compose run --rm api alembic upgrade head

revision: ## Genera una migración nueva (autogenerate). Uso: make revision m="mensaje"
	docker compose run --rm api alembic revision --autogenerate -m "$(m)"

reset: ## Borra la base y vuelve a migrar + seedear (¡destruye datos!)
	docker compose down -v
	docker compose up -d --build db api
	docker compose run --rm api alembic upgrade head
	docker compose run --rm api python -m app.seed

test: ## Corre los tests del backend
	docker compose run --rm api pytest -q

lint: ## Linter del backend
	docker compose run --rm api ruff check .

fmt: ## Formatea el backend
	docker compose run --rm api ruff format .

psql: ## Abre una consola psql en la base
	docker compose exec db psql -U agro -d agro_hub

sh-api: ## Shell dentro del contenedor api
	docker compose exec api sh

sh-web: ## Shell dentro del contenedor web
	docker compose exec web sh
