#!/usr/bin/env bash
# Backup diário do banco do Radar Público (SQLite, backup consistente via API
# oficial — seguro mesmo com o serviço rodando).
#
# Uso:      bash scripts/backup_db.sh
# Agendado: systemd timer (scripts/deploy/porta-voz-backup.{service,timer})
#
# Cópia externa (recomendado): defina BACKUP_REMOTE no .env ou ambiente, ex.:
#   BACKUP_REMOTE="root@outro-servidor:/backups/radar/"   (via scp)
# Sem BACKUP_REMOTE, mantém só as cópias locais em backups/ (retenção 14 dias).
set -euo pipefail

cd "$(dirname "$0")/.."
DB="porta_voz.db"
OUT_DIR="backups"
STAMP="$(date +%F_%H%M)"
OUT="$OUT_DIR/porta_voz-$STAMP.db"

[ -f "$DB" ] || { echo "ERRO: $DB não encontrado em $(pwd)"; exit 1; }
mkdir -p "$OUT_DIR"

# Backup consistente usando a API nativa do SQLite (não copia arquivo "quente")
python3 - "$DB" "$OUT" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close(); src.close()
PY

gzip -f "$OUT"
echo "✓ backup: $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"

# Retenção local: 14 dias
find "$OUT_DIR" -name "porta_voz-*.db.gz" -mtime +14 -delete

# Cópia externa opcional
REMOTE="${BACKUP_REMOTE:-$(grep -s '^BACKUP_REMOTE=' .env | cut -d= -f2- | tr -d '"' || true)}"
if [ -n "${REMOTE:-}" ]; then
  if scp -q "$OUT.gz" "$REMOTE"; then
    echo "✓ cópia externa: $REMOTE"
  else
    echo "✗ cópia externa FALHOU (backup local ok)"; exit 2
  fi
else
  echo "⚠ BACKUP_REMOTE não definido — só backup local (defina para cópia fora do servidor)"
fi
