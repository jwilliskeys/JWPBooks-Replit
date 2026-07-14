import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImagePlus, X, Star, ChevronLeft, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// The first photo in the array is treated as the "primary" photo everywhere
// else in the app (the piano hero image uses photos[0]). So "set as primary"
// just moves the chosen photo to the front of the array via PATCH.

interface PianoPhotoGalleryProps {
  pianoId: string | number;
  photos: string[];
  onChanged: () => void;
}

export function PianoPhotoGallery({ pianoId, photos, onChanged }: PianoPhotoGalleryProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // index of the photo open in the fullscreen viewer, or null when closed
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const uploadPhotos = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/pianos/${pianoId}/photos`, {
        method: "POST",
        body: fd,
        credentials: "include", // send the session cookie — without this the server returns 401
      });
      if (!res.ok) {
        let msg = "Upload failed";
        try {
          const data = await res.json();
          if (data?.message) msg = data.message;
        } catch {
          msg = `Upload failed (${res.status})`;
        }
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      onChanged();
      toast({ title: "Photos uploaded" });
    },
    onError: (err: any) =>
      toast({ title: err?.message || "Upload failed", variant: "destructive" }),
  });

  const deletePhoto = useMutation({
    mutationFn: (url: string) =>
      apiRequest("DELETE", `/api/pianos/${pianoId}/photos`, { photoUrl: url }),
    onSuccess: () => {
      onChanged();
      toast({ title: "Photo removed" });
    },
    onError: () => toast({ title: "Couldn't remove photo", variant: "destructive" }),
  });

  const setPrimary = useMutation({
    mutationFn: (url: string) => {
      const reordered = [url, ...photos.filter((p) => p !== url)];
      return apiRequest("PATCH", `/api/pianos/${pianoId}`, { photos: reordered });
    },
    onSuccess: () => {
      onChanged();
      toast({ title: "Primary photo set" });
    },
    onError: () => toast({ title: "Couldn't set primary photo", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Photos</CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              // Capture the files synchronously into a stable array BEFORE
              // clearing the input — resetting value="" empties the FileList,
              // and the mutation runs a tick later, so reading it then would
              // send zero files ("No files uploaded").
              const picked = e.target.files ? Array.from(e.target.files) : [];
              if (picked.length) {
                uploadPhotos.mutate(picked);
                e.target.value = "";
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhotos.isPending}
            data-testid="button-add-photos"
          >
            <ImagePlus className="h-3 w-3 mr-1" />
            {uploadPhotos.isPending ? "Uploading…" : "Add"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {!photos.length ? (
          <p className="text-xs text-muted-foreground text-center py-3">No photos yet</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, idx) => (
              <div key={photo} className="relative shrink-0 group">
                <button
                  type="button"
                  onClick={() => setViewerIndex(idx)}
                  className="block"
                  data-testid={`piano-photo-${idx}`}
                >
                  <img
                    src={photo}
                    alt={`Photo ${idx + 1}`}
                    className="h-20 w-20 object-cover rounded-md border"
                  />
                </button>
                {idx === 0 && (
                  <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-primary/90 px-1 py-0.5 text-[9px] font-medium text-primary-foreground">
                    <Star className="h-2.5 w-2.5 fill-current" /> Primary
                  </span>
                )}
                <button
                  onClick={() => deletePhoto.mutate(photo)}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`button-remove-photo-${idx}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PhotoViewer
        photos={photos}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onIndexChange={setViewerIndex}
        onSetPrimary={(url) => setPrimary.mutate(url)}
        onDelete={(url) => {
          deletePhoto.mutate(url);
          setViewerIndex(null);
        }}
        settingPrimary={setPrimary.isPending}
      />
    </Card>
  );
}

interface PhotoViewerProps {
  photos: string[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onSetPrimary: (url: string) => void;
  onDelete: (url: string) => void;
  settingPrimary: boolean;
}

function PhotoViewer({
  photos,
  index,
  onClose,
  onIndexChange,
  onSetPrimary,
  onDelete,
  settingPrimary,
}: PhotoViewerProps) {
  const open = index !== null;
  const safeIndex = index ?? 0;

  const goPrev = () => onIndexChange((safeIndex - 1 + photos.length) % photos.length);
  const goNext = () => onIndexChange((safeIndex + 1) % photos.length);

  // Arrow-key navigation while the viewer is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, safeIndex, photos.length]);

  if (!open || !photos.length) return null;
  const current = photos[safeIndex];
  const isPrimary = safeIndex === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0" data-testid="photo-viewer">
        <div className="relative bg-black flex items-center justify-center min-h-[50vh] max-h-[75vh]">
          <img
            src={current}
            alt={`Photo ${safeIndex + 1}`}
            className="max-h-[75vh] w-auto max-w-full object-contain"
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white h-9 w-9 flex items-center justify-center hover:bg-black/70"
                data-testid="photo-viewer-prev"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white h-9 w-9 flex items-center justify-center hover:bg-black/70"
                data-testid="photo-viewer-next"
                aria-label="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                {safeIndex + 1} / {photos.length}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-background">
          <Button
            variant={isPrimary ? "secondary" : "default"}
            size="sm"
            disabled={isPrimary || settingPrimary}
            onClick={() => onSetPrimary(current)}
            data-testid="photo-viewer-set-primary"
          >
            {settingPrimary ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Star className={`h-4 w-4 mr-1 ${isPrimary ? "fill-current" : ""}`} />
            )}
            {isPrimary ? "Primary photo" : "Set as primary"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(current)}
            data-testid="photo-viewer-delete"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
