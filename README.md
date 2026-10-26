<!-- Proyecto: Sistema de Monitoreo Sísmico V2. Base técnica de la Fase 1. -->

# Sistema de Monitoreo Sísmico V2

Monorepositorio para consultar y analizar **eventos sísmicos ya ocurridos** en Perú. El módulo de ML será **exploratorio/retrospectivo** y los avisos serán **internos, basados en eventos observados**, nunca predicciones ni alertas oficiales.

## Estructura

- `apps/web`: React, TypeScript, Vite, Tailwind CSS v4 y Lucide React.
- `services/api`: FastAPI y servicios REST.
- `services/ingestion`: conectores sísmicos (Fase 3).
- `services/ml`: experimentos retrospectivos (Fase 6).
- `database`: migraciones, seeds y diagramas.
- `infra`: infraestructura y despliegue.
- `tests`: pruebas automatizadas.
- `docs`: decisiones y estado de cada fase.
- `.github/workflows/ci.yml`: compilación frontend y pruebas backend en GitHub Actions.

## Prerrequisitos en Windows + Git Bash

Node.js compatible con Vite (>=20.19 o >=22.12), npm, Python >=3.11, Git y Docker Desktop con motor iniciado si se quiere usar PostgreSQL.

## Inicio rápido: desde la carpeta `sismo-platform`

### Preparación, una sola vez

```bash
cp .env.example .env
# Editar .env: POSTGRES_PASSWORD y la misma clave en DATABASE_URL.
docker compose up -d db

cd services/api
python -m venv .venv
source .venv/Scripts/activate  # Git Bash en Windows; en Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
cd ../..

cd apps/web
npm install
cp .env.example .env.local
cd ../..
```

### Terminal 1: backend

```bash
cd services/api
source .venv/Scripts/activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Revisar `http://127.0.0.1:8000/docs` y `http://127.0.0.1:8000/api/v1/health`.

### Terminal 2: frontend

```bash
cd apps/web
npm run dev
```

Revisar `http://localhost:5173`.

### Terminal 3: pruebas

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
```

### Verificar PostgreSQL

Desde la carpeta raíz, `docker compose ps`; o consultar `http://127.0.0.1:8000/api/v1/db/health`. El endpoint responde `503` cuando la base no está disponible, sin revelar credenciales.

## Estado

La navegación y los módulos son **pantallas base**; no se presentan datos sísmicos ficticios. La conexión USGS/IGP, la ingesta, tablas y métricas reales corresponden a fases siguientes. Consultar `docs/FASE_1.md` para lo implementado, pruebas y pendientes.
