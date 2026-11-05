#!/bin/bash
# ─────────────────────────────────────────────────────────
# deploy.sh — Script de deploy para produção Pract Pet
# Uso: ./deploy.sh [all|frontend|backend|both]
# ─────────────────────────────────────────────────────────
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"

BRANCH="${2:-main}"
TARGET="${1:-both}"

echo "🚀 Iniciando deploy Pract Pet..."
echo "   Branch: $BRANCH | Alvo: $TARGET"
echo ""

# 1. Atualiza o código
echo "📥 Atualizando código do Git..."
git pull --ff-only origin "$BRANCH"
echo ""

# 2. Rebuild conforme o alvo
case "$TARGET" in
  frontend)
    echo "🔨 Reconstruindo apenas o Frontend..."
    docker compose -f "$COMPOSE_FILE" build --no-cache frontend
    docker compose -f "$COMPOSE_FILE" up -d frontend
    ;;
  backend)
    echo "🔨 Reconstruindo apenas o Backend..."
    docker compose -f "$COMPOSE_FILE" build --no-cache backend
    docker compose -f "$COMPOSE_FILE" up -d backend
    ;;
  all)
    echo "🔨 Reconstruindo todos os serviços..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  both|*)
    echo "🔨 Reconstruindo Frontend e Backend..."
    docker compose -f "$COMPOSE_FILE" build --no-cache frontend backend
    docker compose -f "$COMPOSE_FILE" up -d frontend backend
    ;;
esac

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📊 Status dos containers:"
docker compose -f "$COMPOSE_FILE" ps
