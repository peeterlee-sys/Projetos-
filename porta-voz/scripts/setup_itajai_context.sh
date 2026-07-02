#!/usr/bin/env bash
# Popula city_context de Itajaí (org_id fixo: 63403984-d772-4337-8646-778a0032f31d).
# Ajuste ITAJAI_ORG_ID se necessário.

set -euo pipefail

API="${API_BASE:-http://localhost:8000}"
ITAJAI_ORG_ID="${ITAJAI_ORG_ID:-63403984-d772-4337-8646-778a0032f31d}"

echo "==> Atualizando city_context de Itajaí ($ITAJAI_ORG_ID)..."

curl -s -X PATCH "$API/organizations/$ITAJAI_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "city_context": {
      "city": "Itajaí",
      "state": "SC",
      "prefeito": "Prefeito Volnei Morastoni",
      "autarquias": "Samae (Saneamento) | Transitar (Trânsito) | Defesa Civil",
      "programas": "Hospital Municipal Pequeno Anjo | UPA Itajaí | Porto de Itajaí | Praia do Atalaia | Complexo do Sertão",
      "bairros": "Centro | São João | Ressacada | Fazenda | Cordeiros | São Vicente | Limoeiro | Praia Brava | Espinheiros",
      "temas_prioritarios": "Porto e economia portuária | Saúde pública (hospital, UPA) | Obras e saneamento | Turismo (Praia Brava) | Trânsito | Educação municipal | Pesca e aquicultura | Segurança pública"
    }
  }
}' | python3 -m json.tool

echo ""
echo "==> Itajaí configurado."
