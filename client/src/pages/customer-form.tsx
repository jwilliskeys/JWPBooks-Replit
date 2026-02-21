import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function CustomerForm() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    pianoType: "",
    lastTuned: "",
    personalNotes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer added successfully" });
      navigate("/customers");
    },
    onError: () => {
      toast({ title: "Failed to add customer", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      toast({ title: "First and last name are required", variant: "destructive" });
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon" data-testid="button-back-form">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Customer</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Add a new customer to your database
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="John"
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Smith"
                  required
                  data-testid="input-last-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="Company name"
                  data-testid="input-company"
                />
              </div>
              <div className="space-y-2">
                <Label>Piano Type</Label>
                <Input
                  value={form.pianoType}
                  onChange={(e) => setForm({ ...form, pianoType: e.target.value })}
                  placeholder="e.g. Kawai Grand"
                  data-testid="input-piano"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="john@example.com"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="801-555-1234"
                  data-testid="input-phone"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St"
                  data-testid="input-address"
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Salt Lake City"
                  data-testid="input-city"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    placeholder="UT"
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zip Code</Label>
                  <Input
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    placeholder="84101"
                    data-testid="input-zip"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Last Tuned (M/D/YY)</Label>
                <Input
                  value={form.lastTuned}
                  onChange={(e) => setForm({ ...form, lastTuned: e.target.value })}
                  placeholder="1/15/25"
                  data-testid="input-last-tuned"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Personal Notes</Label>
              <Textarea
                value={form.personalNotes}
                onChange={(e) => setForm({ ...form, personalNotes: e.target.value })}
                placeholder="Any notes about this customer or their piano..."
                className="min-h-[100px]"
                data-testid="input-notes"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 flex-wrap">
              <Link href="/customers">
                <Button variant="secondary" type="button" data-testid="button-cancel-form">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-form"
              >
                {createMutation.isPending ? "Adding..." : "Add Customer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
