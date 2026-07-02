#!/usr/bin/env bash
# Cria assinaturas para BC, Itapema e Itajaí em todas as rádios cadastradas.
# Ignora 409 (já existe). Usa city_filter para cada cidade.

set -euo pipefail

API="${API_BASE:-http://localhost:8000/api/v1}"

BC_ORG_ID="d458d761-3c21-45c1-a101-8a7de5c2ffe4"
ITAPEMA_ORG_ID="743cdba0-2b1d-40d4-bbd2-8c9177a60d1a"
ITAJAI_ORG_ID="63403984-d772-4337-8646-778a0032f31d"

echo "==> Buscando todas as rádios cadastradas..."
STATIONS=$(curl -sL "$API/stations/")

# Extrai station_ids
STATION_IDS=$(echo "$STATIONS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data:
    print(s['id'], s['name'])
")

echo "Rádios encontradas:"
echo "$STATION_IDS"
echo ""

subscribe() {
  local STATION_ID=$1
  local STATION_NAME=$2
  local ORG_ID=$3
  local CITY=$4
  local CITY_FILTER=$5

  STATUS=$(curl -sL -o /dev/null -w "%{http_code}" -X POST "$API/subscriptions/" \
    -H "Content-Type: application/json" \
    -d "{\"station_id\": \"$STATION_ID\", \"org_id\": \"$ORG_ID\", \"city_filter\": \"$CITY_FILTER\"}")

  if [ "$STATUS" = "201" ]; then
    echo "  ✓ $CITY → $STATION_NAME (criada)"
  elif [ "$STATUS" = "409" ]; then
    echo "  - $CITY → $STATION_NAME (já existe)"
  else
    echo "  ✗ $CITY → $STATION_NAME (erro HTTP $STATUS)"
  fi
}

echo "==> Criando assinaturas para todas as rádios..."
echo ""

while IFS=" " read -r STATION_ID STATION_NAME_PARTS; do
  STATION_NAME=$(echo "$STATION_ID $STATION_NAME_PARTS" | awk '{$1=""; print $0}' | xargs)

  # Re-read properly
  STATION_NAME=$(echo "$STATIONS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data:
    if s['id'] == '$STATION_ID':
        print(s['name'])
        break
")

  echo "📻 $STATION_NAME ($STATION_ID)"
  subscribe "$STATION_ID" "$STATION_NAME" "$BC_ORG_ID"      "BC"      "Balneário Camboriú"
  subscribe "$STATION_ID" "$STATION_NAME" "$ITAPEMA_ORG_ID" "Itapema" "Itapema"
  subscribe "$STATION_ID" "$STATION_NAME" "$ITAJAI_ORG_ID"  "Itajaí"  "Itajaí"
  echo ""

done < <(echo "$STATIONS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data:
    print(s['id'])
")

echo "==> Pronto! Todas as assinaturas configuradas."
echo ""
echo "Verificando assinaturas ativas..."
curl -sL "$API/subscriptions/" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Total de assinaturas ativas: {len(data)}')
"
