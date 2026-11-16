import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function TripShareControls({ tripId }: { tripId: number }) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const { toast } = useToast();
  const queryKey = ["/api/trips", tripId, "share-link"];
  const { data } = useQuery<{ active: boolean }>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/trips/${tripId}/share-link`);
      if (!response.ok) throw new Error("Could not check the share link");
      return response.json();
    },
  });
  const createLink = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/share-link`);
      return response.json() as Promise<{ token: string }>;
    },
    onSuccess: ({ token }) => {
      setShareUrl(`${window.location.origin}/shared-trip/${token}`);
      queryClient.setQueryData(queryKey, { active: true });
      toast({ title: "Share link ready", description: "Anyone with this link can view the trip schedule." });
    },
    onError: () => toast({ title: "Could not create the link", variant: "destructive" }),
  });
  const revokeLink = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/trips/${tripId}/share-link`),
    onSuccess: () => {
      setShareUrl("");
      queryClient.setQueryData(queryKey, { active: false });
      toast({ title: "Share link revoked" });
    },
    onError: () => toast({ title: "Could not revoke the link", variant: "destructive" }),
  });
  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied" });
  }

  return (
    <>
      <Button
        type="button" variant="outline" size="sm" className="h-8 gap-1.5"
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        data-testid={`button-share-trip-${tripId}`}
      >
        <Share2 className="h-3.5 w-3.5" /> Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Share trip schedule</DialogTitle>
            <DialogDescription>
              The link shows appointment time, name, city, status, appointment notes, and personal calendar items. It does not show prices or trip flight and budget details. Anyone with the link can view it.
            </DialogDescription>
          </DialogHeader>
          {shareUrl ? (
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} aria-label="Share link" />
              <Button type="button" variant="outline" size="icon" onClick={copyLink} aria-label="Copy share link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : data?.active ? (
            <p className="text-sm text-muted-foreground">A link is active. Generate a new one to copy it; this replaces the old link.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Create a private, hard-to-guess link for your parents.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {data?.active && (
              <Button type="button" variant="destructive" onClick={() => revokeLink.mutate()} disabled={revokeLink.isPending}>
                {revokeLink.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                Revoke link
              </Button>
            )}
            <Button type="button" onClick={() => createLink.mutate()} disabled={createLink.isPending}>
              {createLink.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              {data?.active ? "Create new link" : "Create link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
