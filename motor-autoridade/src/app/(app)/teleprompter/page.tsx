import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import Teleprompter from "./Teleprompter";

export const metadata: Metadata = {
  title: "Teleprompter — Take",
};

/** Teleprompter avulso: o usuário cola ou digita o próprio roteiro. */
export default async function TeleprompterPage() {
  await requireUser();
  return <Teleprompter backHref="/hoje" backLabel="Hoje" />;
}
