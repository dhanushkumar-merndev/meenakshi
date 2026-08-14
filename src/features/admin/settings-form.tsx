"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { saveHospitalSettings } from "./master-actions";
import type { ActionState } from "@/types/hospital";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Settings = { hospital_name: string; address: string | null; phone: string | null; email: string | null; prescription_footer: string | null; token_footer: string | null; digital_prescription_text: string | null };

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveHospitalSettings, { ok: false } as ActionState);
  return (
    <form action={action} className="space-y-5">
      {state.message ? <Alert variant={state.ok ? "default" : "destructive"}><AlertDescription>{state.message}</AlertDescription></Alert> : null}
      <Tabs defaultValue="hospital">
        <TabsList><TabsTrigger value="hospital">Hospital</TabsTrigger><TabsTrigger value="print">Print</TabsTrigger></TabsList>
        <TabsContent value="hospital">
          <Card><CardHeader><CardTitle className="text-base">Hospital identity</CardTitle><CardDescription>Used throughout patient documents and the operational shell.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Hospital Name</Label><Input name="hospitalName" defaultValue={settings.hospital_name} required /></div><div className="space-y-2"><Label>Phone</Label><Input name="phone" defaultValue={settings.phone ?? ""} /></div><div className="space-y-2"><Label>Email</Label><Input name="email" type="email" defaultValue={settings.email ?? ""} /></div><div className="space-y-2 sm:col-span-2"><Label>Address</Label><Textarea name="address" defaultValue={settings.address ?? ""} /></div></CardContent></Card>
        </TabsContent>
        <TabsContent value="print">
          <Card><CardHeader><CardTitle className="text-base">Print text</CardTitle><CardDescription>Concise footer text for clinical and token documents.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>Prescription footer</Label><Textarea name="prescriptionFooter" defaultValue={settings.prescription_footer ?? ""} /></div><div className="space-y-2"><Label>Token footer</Label><Textarea name="tokenFooter" defaultValue={settings.token_footer ?? ""} /></div><div className="space-y-2"><Label>Digital prescription statement</Label><Textarea name="digitalText" defaultValue={settings.digital_prescription_text ?? ""} /></div></CardContent></Card>
        </TabsContent>
      </Tabs>
      <div className="flex justify-end"><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <Save />} Save Settings</Button></div>
    </form>
  );
}
