import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Pencil, Plus, RotateCcw, Trash2, Wrench } from "lucide-react";
import type { PianoIssue } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PianoIssues({ pianoId }: { pianoId: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PianoIssue | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reportedDate, setReportedDate] = useState(todayKey());
  const queryKey = ["/api/pianos", String(pianoId), "issues"];
  const { data: issues = [] } = useQuery<PianoIssue[]>({ queryKey });

  const save = useMutation({
    mutationFn: async () => {
      const data = { title: title.trim(), description: description.trim() || null, reportedDate };
      if (editing) return apiRequest("PATCH", `/api/piano-issues/${editing.id}`, data);
      return apiRequest("POST", `/api/pianos/${pianoId}/issues`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
      toast({ title: editing ? "Issue updated" : "Issue logged" });
    },
    onError: () => toast({ title: "Could not save issue", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ issue, fixed }: { issue: PianoIssue; fixed: boolean }) =>
      apiRequest("PATCH", `/api/piano-issues/${issue.id}`, {
        status: fixed ? "fixed" : "open",
        fixedDate: fixed ? todayKey() : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => toast({ title: "Could not update issue", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/piano-issues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Issue deleted" });
    },
    onError: () => toast({ title: "Could not delete issue", variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setTitle("");
    setDescription("");
    setReportedDate(todayKey());
    setDialogOpen(true);
  }

  function openEdit(issue: PianoIssue) {
    setEditing(issue);
    setTitle(issue.title);
    setDescription(issue.description ?? "");
    setReportedDate(issue.reportedDate);
    setDialogOpen(true);
  }

  const openIssues = issues.filter((issue) => issue.status !== "fixed");
  const fixedIssues = issues.filter((issue) => issue.status === "fixed");

  return (
    <>
      <Card data-testid="piano-issues-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Issues <Badge variant={openIssues.length ? "destructive" : "secondary"}>{openIssues.length} open</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openNew} data-testid="button-log-piano-issue">
            <Plus className="mr-1 h-3.5 w-3.5" /> Log issue
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {issues.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No issues logged for this piano.</p>
          ) : (
            <div className="space-y-2">
              {[...openIssues, ...fixedIssues].map((issue) => {
                const fixed = issue.status === "fixed";
                return (
                  <div key={issue.id} className="rounded-lg border p-3" data-testid={`piano-issue-${issue.id}`}>
                    <div className="flex items-start gap-2">
                      <Wrench className={`mt-0.5 h-4 w-4 shrink-0 ${fixed ? "text-muted-foreground" : "text-amber-600"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`text-sm font-medium ${fixed ? "line-through text-muted-foreground" : ""}`}>{issue.title}</p>
                          <Badge variant={fixed ? "secondary" : "outline"} className="text-[10px]">{fixed ? "Fixed" : "Open"}</Badge>
                        </div>
                        {issue.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{issue.description}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Reported {issue.reportedDate}{issue.fixedDate ? ` · Fixed ${issue.fixedDate}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={fixed ? "Reopen issue" : "Mark issue fixed"}
                          onClick={() => update.mutate({ issue, fixed: !fixed })} data-testid={`button-toggle-issue-${issue.id}`}>
                          {fixed ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit issue"
                          onClick={() => openEdit(issue)} data-testid={`button-edit-issue-${issue.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Delete issue"
                          onClick={() => { if (confirm(`Delete "${issue.title}"?`)) remove.mutate(issue.id); }} data-testid={`button-delete-issue-${issue.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit issue" : "Log an issue"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="piano-issue-title">Issue</Label>
              <Input id="piano-issue-title" autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Loose key, sticking action…" data-testid="input-issue-title" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="piano-issue-description">Notes / needed repair</Label>
              <Textarea id="piano-issue-description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Add details that will help later" data-testid="input-issue-description" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="piano-issue-date">Date reported</Label>
              <Input id="piano-issue-date" type="date" value={reportedDate} onChange={(e) => setReportedDate(e.target.value)} data-testid="input-issue-date" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={!title.trim() || save.isPending} onClick={() => save.mutate()} data-testid="button-save-issue">
                {save.isPending ? "Saving…" : "Save issue"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
