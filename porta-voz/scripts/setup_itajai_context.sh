#!/usr/bin/env bash
# Popula city_context e keywords de Itajaí.
# Uso: ITAJAI_ORG_ID=<uuid> bash scripts/setup_itajai_context.sh
# (org_id padrão: 63403984-d772-4337-8646-778a0032f31d)

set -euo pipefail

API="${API_BASE:-http://localhost:8000/api/v1}"
ITAJAI_ORG_ID="${ITAJAI_ORG_ID:-63403984-d772-4337-8646-778a0032f31d}"

echo "==> Atualizando city_context de Itajaí ($ITAJAI_ORG_ID)..."

curl -sL -X PATCH "$API/organizations/$ITAJAI_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "city_context": {
      "city": "Itajaí",
      "state": "SC",
      "prefeito": "Prefeito Robison José Coelho (Robison Coelho)",
      "vice_prefeito": "Rubens Angioletti",
      "secretarios": "Saúde: Mylene Lavado | Obras: Tarcísio Zanelatto | Assistência Social: Leonardo Severino (Léo Severino) | Segurança: Ettore Stenghele",
      "autarquias": "Semasa (Água e Saneamento) | Codetran (Trânsito) | Defesa Civil | Porto de Itajaí | INIS (Instituto Itajaí Sustentável)",
      "vereadores": "Fernando Pegorini (presidente da Câmara)",
      "programas": "Hospital Marieta Konder Bornhausen | Hospital Pequeno Anjo | UPA Cordeiros | UPA CIS | SAMU | Farmácia Municipal | CEIs | Centreventos | Marina de Itajaí | Mercado Público",
      "bairros": "Centro | Fazenda | Praia Brava | Cabeçudas | Atalaia | Cordeiros | São Vicente | Cidade Nova | São João | Espinheiros | Itaipava | Ressacada | Canhanduba | Rio do Meio | Nossa Senhora das Graças | Morro da Cruz",
      "temas_prioritarios": "Saúde (Hospital Marieta, Pequeno Anjo, UPA Cordeiros, UPA CIS, falta de médico) | Enchentes e Defesa Civil (Rio Itajaí-Açu, Rio Itajaí-Mirim, alagamento) | Obras e infraestrutura (buracos, drenagem, Beira-Rio) | Saneamento e água (Semasa, falta de água, esgoto) | Trânsito e mobilidade (BR-101, BR-470, Porto, caminhões) | Segurança pública (Guarda Municipal, Operação Recomeço) | Porto de Itajaí e economia | Turismo (Praia Brava, Marejada) | Educação (creches, CEIs) | Licitações e contratos"
    }
  }
}' | python3 -m json.tool

echo ""
echo "==> Adicionando keywords de Itajaí (bulk)..."

curl -sL -X POST "$API/keywords/bulk" \
  -H "Content-Type: application/json" \
  -d "[
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Robison Coelho\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Prefeito Robison\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Rubens Angioletti\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Mylene Lavado\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Tarcísio Zanelatto\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Léo Severino\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Leonardo Severino\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Ettore Stenghele\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Fernando Pegorini\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Hospital Marieta\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Marieta Konder Bornhausen\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Hospital Pequeno Anjo\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"UPA Cordeiros\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"UPA CIS\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Semasa\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Codetran\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Defesa Civil\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Porto de Itajaí\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"INIS\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Instituto Itajaí Sustentável\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Câmara de Itajaí\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"prefeitura de Itajaí\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"prefeito de Itajaí\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Rio Itajaí-Açu\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Rio Itajaí-Mirim\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"enchente\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"alagamento\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Operação Recomeço\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Transpiedade\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"BR-470\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Avenida Beira-Rio\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Avenida Marcos Konder\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Avenida Joca Brandão\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Avenida Adolfo Konder\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Praia Brava\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Cabeçudas\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Cordeiros\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Espinheiros\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Fazenda\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Itaipava\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Canhanduba\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Marejada\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Marina de Itajaí\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Centreventos\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Univali\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"falta de água\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"baixa pressão de água\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"rompimento de adutora\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"esgoto\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"balneabilidade\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"falta de médico\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"fila de espera\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"CEI\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"CEMESPI\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"transporte escolar\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"escola municipal\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"buraco\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"pavimentação\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"iluminação pública\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"coleta de lixo\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"CRAS\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"CREAS\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Guarda Municipal\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"licitação\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"IPTU\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"desabrigados\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"pesca\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"indústria naval\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"The Ocean Race\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Terminal Fazenda\", \"is_active\": true},
    {\"org_id\": \"$ITAJAI_ORG_ID\", \"term\": \"Terminal Cordeiros\", \"is_active\": true}
  ]" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'  Adicionadas {len(data)} keywords.')"

echo ""
echo "==> Pronto! Itajaí configurado com city_context completo e keywords expandidas."
echo "    Reinicie o servidor se necessário: systemctl restart porta-voz"
