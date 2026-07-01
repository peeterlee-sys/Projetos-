export function formatarMoeda(valor?: number | null) {
  if (valor === undefined || valor === null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

export function formatarDataHora(data: Date | string | number) {
  const d = new Date(data);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}
