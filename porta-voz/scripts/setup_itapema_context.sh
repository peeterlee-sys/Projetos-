#!/usr/bin/env bash
# Popula city_context e keywords de Itapema.
# Uso: ITAPEMA_ORG_ID=<uuid> bash scripts/setup_itapema_context.sh
# (org_id padrão: 743cdba0-2b1d-40d4-bbd2-8c9177a60d1a)

set -euo pipefail

API="${API_BASE:-http://localhost:8000/api/v1}"
ITAPEMA_ORG_ID="${ITAPEMA_ORG_ID:-743cdba0-2b1d-40d4-bbd2-8c9177a60d1a}"

echo "==> Atualizando city_context de Itapema ($ITAPEMA_ORG_ID)..."

curl -sL -X PATCH "$API/organizations/$ITAPEMA_ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "city_context": {
      "city": "Itapema",
      "state": "SC",
      "prefeito": "Prefeito Carlos Alexandre de Souza Ribeiro (Alexandre Xepa)",
      "vice_prefeito": "Eurico Osmari",
      "secretarios": "Saúde: Íris Bispo da Silva | Educação: Caroline Poerner | Obras: Marcelo Correia | Planejamento: Daniel de Amorim | Turismo: Jean Idimar da Silva | Segurança: Paulo Roberto Camargo | Assistência Social: Ana Maria Vedana | Meio Ambiente: Luciana Saramento | Fazenda: Nicolau Domingos da Silva Neto | Administração: Alvadi Fernando Henrique (Dico) | Comunicação: Patrícia Marin (Pati Marin) | Outros: Fabrício Lazzari (Fafá), Gabriela Fernandes Nascimento, Raphael Sargilo Saramento",
      "autarquias": "Defesa Civil | Conasa/Águas de Itapema (Água e Saneamento) | Departamento de Trânsito",
      "vereadores": "Zulma Souza (presidente) | Jaison Simas (vice) | Márcio José da Silva | João Vitor de Souza | Lorita Duro Montagner | Rute Maurina Correia Guedes | Sidnei Sassaki | Leonardo Arlindo Cordeiro | Saulo Salustiano Ramos Neto | Yagan Dadam | Raquel Aparecida Josino | André de Oliveira | Mauro Roberto Alves Cordeiro",
      "programas": "Hospital Santo Antônio | Pronto Atendimento | UBS | SAMU | Farmácia Municipal | CEIs | Calçadão | Orla | Marginal Leste | Marginal Oeste",
      "bairros": "Meia Praia | Centro | Canto da Praia | Morretes | Ilhota | Várzea | Casa Branca | Tabuleiro dos Oliveiras | Sertão do Trombudo | Alto São Bento | Praia Grossa",
      "temas_prioritarios": "Saúde (Hospital Santo Antônio, UBS, pronto atendimento, falta de médico) | Obras e infraestrutura (buracos, drenagem, calçadas, alagamentos) | Turismo e temporada (Meia Praia, Praia Central, temporada de verão) | Trânsito e mobilidade (BR-101, Marginal Leste/Oeste, congestionamento) | Saneamento e água (Conasa/Águas de Itapema, falta de água, esgoto, balneabilidade) | Segurança pública (Guarda Municipal, PM) | Educação (creches, CEIs, escola municipal) | Meio ambiente e praia | Licitações e contratos | Câmara de Vereadores"
    }
  }
}' | python3 -m json.tool

echo ""
echo "==> Adicionando keywords de Itapema (bulk)..."

curl -sL -X POST "$API/keywords/bulk" \
  -H "Content-Type: application/json" \
  -d "[
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Alexandre Xepa\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Xepa\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Eurico Osmari\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Alvadi Fernando\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Dico\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Caroline Poerner\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Daniel de Amorim\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Fabrício Lazzari\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Fafá\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Gabriela Fernandes Nascimento\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Íris Bispo\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Jean Idimar\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Luciana Saramento\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Marcelo Correia\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Ana Maria Vedana\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Nicolau Domingos\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Patrícia Marin\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Pati Marin\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Paulo Camargo\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Raphael Sargilo\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Zulma Souza\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Jaison Simas\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Lorita Montagner\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Sidnei Sassaki\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Yagan Dadam\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Saulo Ramos Neto\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Hospital Santo Antônio\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Santo Antônio\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"pronto atendimento\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"UBS Itapema\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Farmácia Municipal\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Conasa\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Águas de Itapema\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Câmara de Itapema\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Câmara de Vereadores\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Meia Praia\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Morretes\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Ilhota\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Canto da Praia\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Tabuleiro dos Oliveiras\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Marginal Leste\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Marginal Oeste\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Avenida Nereu Ramos\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"prefeitura de Itapema\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"prefeito de Itapema\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Defesa Civil\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"CEI\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"escola municipal\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"transporte escolar\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"falta de vaga\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"falta de médico\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"falta de remédio\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"fila de espera\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"balneabilidade\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"falta de água\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"alagamento\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"drenagem\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"BR-101\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"congestionamento\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"licitação\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"obra irregular\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"iluminação pública\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"coleta de lixo\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"esgoto\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"CRAS\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"CREAS\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Guarda Municipal\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Réveillon\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"temporada\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"IPTU\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"Plano Diretor\", \"is_active\": true},
    {\"org_id\": \"$ITAPEMA_ORG_ID\", \"term\": \"concurso público\", \"is_active\": true}
  ]" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'  Adicionadas {len(data)} keywords.')"

echo ""
echo "==> Pronto! Itapema configurado com city_context completo e keywords expandidas."
echo "    Reinicie o servidor se necessário: systemctl restart porta-voz"
