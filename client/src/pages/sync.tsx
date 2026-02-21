import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";

export default function SyncPage() {
  const { toast } = useToast();
  const [syncResult, setSyncResult] = useState<{
    imported: number;
    updated: number;
    total: number;
  } | null>(null);

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync");
      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Sync complete",
        description: `${data.imported} new, ${data.updated} updated out of ${data.total} rows`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sync Data</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import client data from your Google Spreadsheet
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Google Sheets Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Connected</p>
              <p className="text-xs text-muted-foreground">
                Your Google Sheets account is linked
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {customers?.length ?? 0} clients in database
              </p>
              <p className="text-xs text-muted-foreground">
                Syncing will update existing and add new clients
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CloudDownload className="h-4 w-4" />
            Import from Spreadsheet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will read all rows from your Google Spreadsheet and sync them with your local
            database. Existing clients (matched by first + last name) will be updated,
            and new ones will be added.
          </p>

          {syncMutation.isPending && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Syncing data from Google Sheets...
              </div>
              <Progress value={50} className="h-1.5" />
            </div>
          )}

          {syncResult && !syncMutation.isPending && (
            <div className="p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Sync completed successfully
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="text-center">
                  <p className="text-lg font-bold" data-testid="text-sync-total">{syncResult.total}</p>
                  <p className="text-xs text-muted-foreground">Total rows</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold" data-testid="text-sync-imported">{syncResult.imported}</p>
                  <p className="text-xs text-muted-foreground">New added</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold" data-testid="text-sync-updated">{syncResult.updated}</p>
                  <p className="text-xs text-muted-foreground">Updated</p>
                </div>
              </div>
            </div>
          )}

          {syncMutation.isError && (
            <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm text-destructive font-medium">
                  Sync failed: {syncMutation.error.message}
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="w-full"
            data-testid="button-sync"
          >
            {syncMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Syncing...
              </>
            ) : (
              <>
                <CloudDownload className="h-4 w-4 mr-2" /> Sync from Google Sheets
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
