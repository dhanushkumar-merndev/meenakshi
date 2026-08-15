import { HospitalLogo } from "@/components/shared/hospital-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <main className="login-bg flex min-h-screen items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md shadow-lg border-teal-900/10 bg-white/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-xs">
            <HospitalLogo size={52} className="size-full p-1" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-teal-950">Meenakshi Hospital</CardTitle>
          <CardDescription className="text-base text-teal-700/80">Sign in with your staff account</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6"><LoginForm next={next} /></CardContent>
      </Card>
    </main>
  );
}
