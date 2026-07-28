import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type OAuthNS = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthNS }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="p-8 text-center">
      <h1 className="text-lg font-semibold mb-2">Could not load this authorization request</h1>
      <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  const scopes: string[] = Array.isArray(details?.scopes)
    ? details.scopes
    : typeof details?.scope === "string"
      ? details.scope.split(" ").filter(Boolean)
      : [];

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Connect {clientName} to Trackr</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {clientName} will be able to call Trackr's enabled tools while you are signed in.
            This does not bypass Trackr's permissions or backend policies.
          </p>
        </div>
        {scopes.length > 0 && (
          <div className="text-sm">
            <div className="font-medium mb-1">Requested access</div>
            <ul className="list-disc list-inside text-muted-foreground">
              {scopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Cancel connection
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? "Working…" : "Approve"}
          </Button>
        </div>
      </Card>
    </main>
  );
}