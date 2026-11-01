#!/bin/sh

# Nunca atualizar schemas na inicialização (nem Heart, nem tenants).
# Atualizações são acionadas exclusivamente por Lucas no Sys-Init.
echo "🔒 Schemas não serão atualizados na inicialização. Use o Sys-Init manualmente."

# ── Modo Demo: importar demo-seed.sql se o banco demo estiver sem produtos ──
if [ "$APP_MODE" = "demo" ] && [ -f "/app/demo-seed.sql" ]; then
  echo "🧪 Verificando dados do banco demo..."
  PASS="${MYSQL_ROOT_PASSWORD:-7bar@2025}"
  PROD_COUNT=$(mysql -h mysql -u root -p"$PASS" demo_adega -N -e "SELECT COUNT(*) FROM products;" 2>/dev/null || echo "0")

  if [ "$PROD_COUNT" = "0" ] || [ -z "$PROD_COUNT" ]; then
    echo "📦 Banco demo sem produtos! Populando via demo-seed.sql..."
    mysql -h mysql -u root -p"$PASS" demo_adega < /app/demo-seed.sql 2>/dev/null || true
    echo "✅ Seed concluído!"
  else
    echo "✅ Banco demo OK ($PROD_COUNT produtos)."
  fi

  echo "⏳ Recalibrando timestamps de vendas relativas a HOJE (últimos 14 dias)..."
  mysql -h mysql -u root -p"$PASS" demo_adega -e "UPDATE sales SET createdAt = DATE_SUB(NOW(), INTERVAL (ABS(CAST(CONV(SUBSTRING(id, 1, 4), 16, 10) AS UNSIGNED)) % 14) DAY);" 2>/dev/null || true
  echo "✅ Vendas recalibradas dinamicamente para o dia de hoje!"
fi

echo "🚀 Iniciando servidor NestJS..."
exec node dist/main
