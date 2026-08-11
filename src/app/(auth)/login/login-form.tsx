"use client";

import { useActionState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { signIn } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/types/hospital";

const initialState: ActionState = { ok: false };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {state.message ? <Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required aria-invalid={Boolean(state.fieldErrors?.email)} />
        {state.fieldErrors?.email?.map((error) => <p className="text-xs text-destructive" key={error}>{error}</p>)}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.fieldErrors?.password)} />
        {state.fieldErrors?.password?.map((error) => <p className="text-xs text-destructive" key={error}>{error}</p>)}
      </div>
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="animate-spin" /> : <LogIn />} Sign In
      </Button>
    </form>
  );
}
