import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  TimeStepperWidget,
  formatTimeMinutes,
} from "@/components/time-stepper";

/** Round up to the next half hour (12:20 → 12:30, 12:35 → 1:00). */
export function roundUpToHalfHour(mins: number): number {
  return Math.ceil(mins / 30) * 30;
}

export interface MoveRequestPrev {
  /** Minutes-from-midnight when the previous appointment ends */
  endMinutes: number;
  /** e.g. "Salim Hanna (ends 12:00 PM)" */
  label: string;
  /** Address of the previous appointment, for the drive-time lookup */
  address: string | null;
}

interface MoveAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Client name of the appointment being moved */
  clientName: string;
  /** Human-readable target day, e.g. "Tuesday, Nov 24" */
  targetDateLabel: string;
  /** True when the appointment is moving to a different day */
  isDayChange: boolean;
  /** The appointment it now follows (null = first / empty day) */
  prev: MoveRequestPrev | null;
  /** Address of the appointment being moved (drive-time destination) */
  toAddress: string | null;
  /** Fallback suggestion when there's no previous appointment */
  fallbackMinutes: number;
  onConfirm: (minutes: number) => void;
  isPending?: boolean;
}

/**
 * Confirmation dialog shown after dragging an appointment to a new position.
 * Suggests a start time = previous appointment's end + drive time, rounded UP
 * to the next half hour, with the usual +/- stepper to fine-tune.
 */
export function MoveAppointmentDialog({
  open,
  onOpenChange,
  clientName,
  targetDateLabel,
  isDayChange,
  prev,
  toAddress,
  fallbackMinutes,
  onConfirm,
  isPending,
}: MoveAppointmentDialogProps) {
  const [timeMinutes, setTimeMinutes] = useState(fallbackMinutes);
  const [touched, setTouched] = useState(false);

  const canFetchDrive = !!(open && prev && prev.address && toAddress);
  const { data: driveData, isLoading: driveLoading } = useQuery<{ durations: number[] | null }>({
    queryKey: ["/api/driving-times", prev?.address ?? "", toAddress ?? ""],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/driving-times", {
        addresses: [prev!.address, toAddress],
      });
      return res.json();
    },
    enabled: canFetchDrive,
    staleTime: 15 * 60 * 1000,
  });

  const rawDrive = driveData?.durations?.[0];
  const driveMinutes = rawDrive != null && rawDrive >= 0 ? rawDrive : 0;

  const suggested = prev
    ? roundUpToHalfHour(prev.endMinutes + driveMinutes)
    : roundUpToHalfHour(fallbackMinutes);

  // Track the suggestion until the user touches the stepper
  useEffect(() => {
    if (open && !touched) setTimeMinutes(suggested);
  }, [open, suggested, touched]);

  useEffect(() => {
    if (open) setTouched(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="text-base font-bold">
            {isDayChange ? "Move Appointment" : "Reschedule Appointment"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{clientName}</span>
            {" → "}
            <span className="font-medium">{targetDateLabel}</span>
          </p>

          {prev ? (
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                After {prev.label}
              </p>
              <p className="flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5 shrink-0" />
                {canFetchDrive && driveLoading
                  ? "Calculating drive time…"
                  : driveMinutes > 0
                    ? `~${driveMinutes} min drive, rounded up to the half hour`
                    : "No drive time added"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              First appointment of the day — pick a start time.
            </p>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Suggested start: {formatTimeMinutes(suggested)}
            </p>
            <TimeStepperWidget
              minutes={timeMinutes}
              onChange={(m) => { setTouched(true); setTimeMinutes(m); }}
              testIdPrefix="move-appt-time"
            />
          </div>
        </div>

        <div className="border-t bg-muted/30 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(timeMinutes)}
            disabled={isPending}
            data-testid="button-confirm-move-appt"
          >
            {isPending ? "Moving…" : `Set ${formatTimeMinutes(timeMinutes)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
