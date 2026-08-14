import { HospitalLogo } from "@/components/shared/hospital-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-24 items-center justify-center overflow-hidden rounded-2xl border bg-white"><HospitalLogo size={88} className="size-full p-1" /></div>
          <CardTitle className="text-xl">Meenakshi Hospital</CardTitle>
          <CardDescription>Sign in with your staff account</CardDescription>
        </CardHeader>
        <CardContent><LoginForm next={next} /></CardContent>
      </Card>
    </main>
  );
}
