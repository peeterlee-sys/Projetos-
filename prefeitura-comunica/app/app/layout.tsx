import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.papel === "admin") redirect("/admin");
  return <>{children}</>;
}
