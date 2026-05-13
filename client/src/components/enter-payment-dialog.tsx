import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, CheckCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_METHODS = ["Zelle", "Venmo", "CashApp", "PayPal", "Cash", "Check", "Other"];

const VENMO_RATE = 0.019;
const VENMO_FLAT = 0.10;

function parseDollar(str: string | null | undefined): number {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function formatDollar(n: number): string {
  return `$${n.toFixed(2)}`;
}

function venmoNet(raw: number): number {
  return Math.max(0, raw - (raw * VENMO_RATE + VENMO_FLAT));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: number;
  invoiceNumber: string;
  invoiceTotal: string;
  onSuccess?: () => void;
}

export function EnterPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  invoiceTotal,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const totalNum = parseDollar(invoiceTotal);

  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState(invoiceTotal ?? "$0.00");

  useEffect(() => {
    if (open) {
      setMethod("");
      setAmount(invoiceTotal ?? "$0.00");
    }
  }, [open, invoiceTotal]);

  const amountNum = parseDollar(amount);
  const isVenmo = method === "Venmo";
  const netReceived = isVenmo ? venmoNet(amountNum) : null;

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/invoices/${invoiceId}`, {
        status: "paid",
        paymentMethod: method || null,
        paidAmount: formatDollar(amountNum),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
      toast({ title: `Invoice #${invoiceNumber} marked as paid` });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            Enter Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-muted/50 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Invoice #{invoiceNumber}</span>
            <span className="font-semibold tabular-nums">{invoiceTotal}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payment method</Label>
            <Select value={method || "_none"} onValueChange={v => setMethod(v === "_none" ? "" : v)}>
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Select method</SelectItem>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Amount received</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                className="pl-7 tabular-nums"
                value={amount.replace(/^\$/, "")}
                onChange={e => setAmount(`$${e.target.value}`)}
                placeholder={totalNum.toFixed(2)}
                data-testid="input-payment-amount"
              />
            </div>
          </div>

          {isVenmo && netReceived !== null && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Venmo fee (1.9% + $0.10)</span>
                <span className="text-destructive tabular-nums">
                  −{formatDollar(amountNum - netReceived)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1.5 font-semibold">
                <span>You receive</span>
                <span className="text-green-700 dark:text-green-400 tabular-nums">
                  {formatDollar(netReceived)}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || amountNum <= 0 || !method}
              className="gap-1.5"
              data-testid="button-record-payment"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {mutation.isPending ? "Saving…" : "Record Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
