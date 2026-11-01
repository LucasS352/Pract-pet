#!/bin/bash
# ─────────────────────────────────────────────────────────
# deploy.sh — Script de deploy para produção 7Bar PDV
# Uso: ./deploy.sh [all|frontend|backend|both]
# ─────────────────────────────────────────────────────────
set -e

BRANCH="${2:-main}"
TARGET="${1:-both}"

echo "🚀 Iniciando deploy 7Bar PDV..."
echo "   Branch: $BRANCH | Alvo: $TARGET"
echo ""

# 1. Atualiza o código
echo "📥 Atualizando código do Git..."
git pull origin "$BRANCH"
echo ""

# 2. Rebuild conforme o alvo
case "$TARGET" in
  frontend)
    echo "🔨 Reconstruindo apenas o Frontend..."
    docker compose build --no-cache frontend
    docker compose up -d frontend
    ;;
  backend)
    echo "🔨 Reconstruindo apenas o Backend..."
    docker compose build --no-cache backend
    docker compose up -d backend
    ;;
  all)
    echo "🔨 Reconstruindo todos os serviços..."
    docker compose build --no-cache
    docker compose up -d
    ;;
  both|*)
    echo "🔨 Reconstruindo Frontend e Backend..."
    docker compose build --no-cache frontend backend
    docker compose up -d frontend backend
    ;;
esac

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📊 Status dos containers:"
docker compose ps
