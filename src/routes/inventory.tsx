import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const STOCKWISE_URL = "https://stockwiseinventory.lovable.app/";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — StockWise" },
      { name: "description", content: "Manage stock and materials with StockWise Inventory." },
      { property: "og:title", content: "Inventory — StockWise" },
      { property: "og:description", content: "Manage stock and materials with StockWise Inventory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <div className="flex h-[calc(100vh-2rem)] flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Inventory</h1>
            <Button variant="outline" size="sm" asChild>
              <a href={STOCKWISE_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
              </a>
            </Button>
          </div>
          <iframe
            src={STOCKWISE_URL}
            title="StockWise Inventory"
            className="w-full flex-1 rounded-lg border bg-background"
            allow="clipboard-write; camera"
          />
        </div>
      </AppLayout>
    </RequireAuth>
  );
}
