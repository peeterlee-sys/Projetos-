import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Renova a sessão do Supabase a cada requisição e aplica proteção de rotas.
 * Rotas públicas: /login, /signup, /auth/*, ativos estáticos.
 * Usuário sem onboarding é redirecionado para /onboarding.
 */
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/offline"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Não autenticado tentando acessar área protegida → login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Autenticado: onboarding obrigatório só para clientes/colaboradores.
  // Admin e super_admin não passam pelo onboarding editorial.
  // Otimização: uma vez liberado, gravamos um cookie e pulamos a consulta ao
  // banco nas próximas navegações (o gate só precisa rodar uma vez por sessão).
  const onboardingCleared = request.cookies.get("mo_onb")?.value === "1";
  if (user && !isPublic && pathname !== "/onboarding" && !onboardingCleared) {
    const { data: profile } = await supabase
      .from("users")
      .select("onboarded_at, role")
      .eq("id", user.id)
      .maybeSingle();

    const needsOnboarding =
      profile &&
      !profile.onboarded_at &&
      profile.role !== "admin" &&
      profile.role !== "super_admin";

    if (needsOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Liberado: marca por 12h para não reconsultar a cada página.
    if (profile) {
      response.cookies.set("mo_onb", "1", {
        maxAge: 60 * 60 * 12,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
  }

  // Já logado em página de auth → manda para o app.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/hoje";
    return NextResponse.redirect(url);
  }

  return response;
}
