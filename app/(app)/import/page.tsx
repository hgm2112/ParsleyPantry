import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportUploader } from "@/components/import/import-uploader";

export const metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/settings" />}
          aria-label="Back to settings"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-lg font-extrabold">Import from KitchenOwl</h1>
          <p className="text-xs text-muted-foreground">
            One-time migration of your catalog and recipes.
          </p>
        </div>
      </div>
      <ImportUploader />
    </div>
  );
}
