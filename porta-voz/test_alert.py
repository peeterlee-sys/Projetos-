"""
Script de teste: envia um alerta de replay no novo formato.
Uso: python test_alert.py
"""
import asyncio
import sys
import os

# garante que o módulo src é encontrado
sys.path.insert(0, os.path.dirname(__file__))

from src.analyzer.claude_analyzer import AnalysisResult
from src.alerts.formatter import format_alert_message
from src.alerts.whatsapp import send_to_recipients
from src.core.config import settings


MOCK_ANALYSIS = AnalysisResult(
    is_relevant=True,
    confidence_score=0.94,
    theme="Falta de iluminação pública no bairro",
    sentiment="negative",
    urgency="high",
    content_type="complaint",
    source_type="listener_call",
    summary="Ouvinte relata que a rua principal do bairro Morretes está há 3 semanas sem iluminação pública, causando insegurança e já tendo registrado um assalto.",
    excerpt="'tô ligando porque a rua ali no Morretes tá no escuro faz três semanas, já teve assalto lá e a prefeitura não resolve'",
    reason="Falha de serviço público de alta visibilidade com risco à segurança dos moradores.",
    suggested_action="Acionar Secretaria de Obras ou concessionária responsável para vistoria emergencial.",
    response_draft="A Prefeitura de Itapema informa que a ocorrência foi registrada e a Secretaria de Obras já foi acionada para vistoria e reparo da iluminação no bairro Morretes com prioridade.",
    entities_mentioned=["Bairro Morretes", "Secretaria de Obras", "Prefeitura de Itapema"],
    duration_ms=1240,
    raw_response={},
)


async def main():
    phone = settings.alert_recipients_list[0] if settings.alert_recipients_list else None
    if not phone:
        print("❌ Nenhum destinatário configurado em DEFAULT_ALERT_RECIPIENTS no .env")
        return

    message = format_alert_message(
        analysis=MOCK_ANALYSIS,
        station_name="Rádio Bote a Boca no Trombone",
        program_name="Bote a Boca no Trombone",
        chunk_time="07:23:15",
        recurrence_count=2,
        cross_radio_stations=["Rádio Cidade Itapema", "Menina FM"],
        dashboard_url=settings.DASHBOARD_URL,
    )

    print("=" * 60)
    print("MENSAGEM QUE SERÁ ENVIADA:")
    print("=" * 60)
    print(message)
    print("=" * 60)
    print(f"\nEnviando para: {phone[-4:].rjust(len(phone), '*')}")

    results = await send_to_recipients([phone], message)
    if results.get(phone):
        print("✅ Alerta de teste enviado com sucesso!")
    else:
        print("❌ Falha ao enviar. Verifique as credenciais Z-API no .env")


if __name__ == "__main__":
    asyncio.run(main())
