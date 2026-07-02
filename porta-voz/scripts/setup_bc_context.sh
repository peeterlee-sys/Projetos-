#!/usr/bin/env bash
# Popula city_context e keywords de Balneário Camboriú.
# Uso: BC_ORG_ID=<uuid> bash scripts/setup_bc_context.sh

set -euo pipefail

API="${API_BASE:-http://localhost:8000}"
BC_ORG_ID="${BC_ORG_ID:?Defina a variável BC_ORG_ID com o org_id de Balneário Camboriú}"

echo "==> Atualizando city_context de BC ($BC_ORG_ID)..."

curl -s -X PATCH "$API/organizations/$BC_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "city_context": {
      "city": "Balneário Camboriú",
      "state": "SC",
      "prefeito": "Prefeita Juliana Pavan Von Borstel (Juliana Pavan)",
      "vice_prefeito": "Nilson Probst",
      "secretarios": "Saúde: Aline Leal | Educação: Zélia Zanella | Fazenda: Magda Bez | Casa Civil: Leandro Índio | Governo e Inovação: Gilson Bordin | Obras: Aldemar Pereira (Bola) | Planejamento: Carlos Humberto | Turismo: Evandro Neiva | Meio Ambiente: Nelson Oliveira | Assistência Social: Dão Koeddermann | Pessoa Idosa: Claudir Maciel | Segurança: Araújo Gomes",
      "autarquias": "Emasa (Água e Saneamento — Dir. Auri Antonio Pavoni) | BC Trânsito | Defesa Civil",
      "programas": "Hospital Ruth Cardoso | UPA das Nações | UPA da Barra | Terminal Rodoviário | Calçadão | Orla Central | Píer Turístico",
      "bairros": "Centro | Barra Sul | Barra Norte | Nações | Municípios | Pioneiros | Tabuleiro | Iate Clube",
      "temas_prioritarios": "Saúde pública (hospital, UPA, postos) | Obras e infraestrutura (ruas, calçadas, drenagem) | Saneamento e água (Emasa) | Trânsito e mobilidade (BC Trânsito) | Segurança pública | Turismo e temporada | Meio ambiente e praia | Assistência social | Educação municipal | Licitações e contratos"
    }
  }
}' | python3 -m json.tool

echo ""
echo "==> Adicionando keywords extras de BC (bulk)..."

curl -s -X POST "$API/keywords/bulk" \
  -H "Content-Type: application/json" \
  -d "[
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Juliana Pavan\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Von Borstel\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Nilson Probst\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Aline Leal\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Zélia Zanella\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Magda Bez\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Leandro Índio\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Gilson Bordin\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Aldemar Pereira\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Carlos Humberto\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Evandro Neiva\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Nelson Oliveira\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Dão Koeddermann\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Claudir Maciel\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Araújo Gomes\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Auri Pavoni\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Emasa\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"BC Trânsito\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Hospital Ruth Cardoso\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Ruth Cardoso\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"UPA das Nações\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"UPA da Barra\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Defesa Civil\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"prefeitura de Balneário\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"prefeita de BC\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"vereador\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"câmara municipal\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"licitação\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"concurso público\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"obra pública\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Terminal Rodoviário\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Calçadão\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Orla Central\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"Píer Turístico\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"balneabilidade\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"coleta de lixo\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"falta de água\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"abastecimento\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"esgoto\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"iluminação pública\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"CRAS\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"CREAS\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"escola municipal\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"creche\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"guarda municipal\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"IPTU\", \"is_active\": true},
    {\"org_id\": \"$BC_ORG_ID\", \"term\": \"ISS\", \"is_active\": true}
  ]" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'  Adicionadas {len(data)} keywords.')"

echo ""
echo "==> Pronto! BC configurado com city_context e keywords expandidas."
echo "    Reinicie o servidor para que as mudancas tenham efeito nos jobs em andamento."
