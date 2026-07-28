import "server-only";

/**
 * Cliente mínimo da API do Asaas (assinaturas do Assessor 24h).
 * `ASAAS_ENV=sandbox` (padrão, mais seguro) aponta pro ambiente de testes;
 * troque para `production` só quando o fluxo estiver validado ponta a ponta.
 */
const BASE_URL =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

function apiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return key;
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey(),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body?.errors?.[0]?.description as string | undefined) ?? `Asaas respondeu ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export type AsaasCustomer = { id: string; cpfCnpj: string };

/** Busca o cliente pelo CPF; cria se ainda não existir. */
export async function findOrCreateCustomer(input: {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
}): Promise<AsaasCustomer> {
  const cpfCnpj = input.cpfCnpj.replace(/\D/g, "");
  const existing = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`
  );
  if (existing.data?.[0]) return existing.data[0];

  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({ ...input, cpfCnpj }),
  });
}

export type AsaasSubscription = { id: string; customer: string; status: string };

const PLAN_VALUE: Record<"monthly" | "yearly", number> = {
  monthly: 197,
  yearly: 1970,
};
const PLAN_CYCLE: Record<"monthly" | "yearly", string> = {
  monthly: "MONTHLY",
  yearly: "YEARLY",
};

/** Cria a assinatura recorrente e devolve o link de pagamento da 1ª cobrança. */
export async function createSubscriptionCheckout(input: {
  customerId: string;
  plan: "monthly" | "yearly";
  externalReference: string; // user_id do vereador, pra casar com o webhook
}): Promise<{ subscriptionId: string; invoiceUrl: string }> {
  const subscription = await asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "UNDEFINED", // cliente escolhe Pix, cartão ou boleto no checkout
      cycle: PLAN_CYCLE[input.plan],
      value: PLAN_VALUE[input.plan],
      nextDueDate: new Date().toISOString().slice(0, 10),
      description: `Assessor 24h — plano ${input.plan === "monthly" ? "mensal" : "anual"}`,
      externalReference: input.externalReference,
    }),
  });

  const payments = await asaasFetch<{ data: { invoiceUrl: string }[] }>(
    `/payments?subscription=${subscription.id}&limit=1`
  );
  const invoiceUrl = payments.data?.[0]?.invoiceUrl;
  if (!invoiceUrl) throw new Error("Asaas não devolveu o link de pagamento");

  return { subscriptionId: subscription.id, invoiceUrl };
}
