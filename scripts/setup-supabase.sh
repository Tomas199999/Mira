#!/usr/bin/env bash
# Crea el proyecto de Supabase, aplica migraciones y seed, y carga las
# variables en Vercel. Requiere `npx supabase login` hecho de antemano.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_NAME="${PROJECT_NAME:-mira}"
REGION="${REGION:-sa-east-1}"          # São Paulo
DB_PASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2-)"

if [ -z "$DB_PASSWORD" ]; then
  echo "Falta SUPABASE_DB_PASSWORD en .env" >&2; exit 1
fi

echo "· organizaciones disponibles:"
npx supabase orgs list

ORG_ID="${ORG_ID:-}"
if [ -z "$ORG_ID" ]; then
  echo "Definí ORG_ID con el id de la organización y volvé a correr." >&2; exit 1
fi

echo "· creando proyecto $PROJECT_NAME en $REGION…"
npx supabase projects create "$PROJECT_NAME" \
  --org-id "$ORG_ID" \
  --region "$REGION" \
  --db-password "$DB_PASSWORD"

echo "· esperando a que la base esté lista…"
npx supabase projects list

echo
echo "Siguiente paso manual (necesita el project-ref de la línea anterior):"
echo "  npx supabase link --project-ref <ref>"
echo "  npx supabase db push"
echo "  psql \"\$DATABASE_URL\" -f supabase/seed/01_challenge_objects.sql"
echo "  psql \"\$DATABASE_URL\" -f supabase/seed/02_achievements.sql"
