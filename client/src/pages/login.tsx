import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Music } from "lucide-react";

export default function LoginPage() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [passcode, setPasscode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || isLoggingIn) return;
    try {
      await login(passcode.trim());
    } catch {
      // error surfaced via loginError
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Music className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">John Willis Piano</CardTitle>
          <CardDescription>Enter your passcode to open JWP Books</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              data-testid="input-login-passcode"
            />
            {loginError && (
              <p className="text-sm text-destructive" data-testid="text-login-error">
                {loginError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={!passcode.trim() || isLoggingIn}
              data-testid="button-login-submit"
            >
              {isLoggingIn ? "Unlocking…" : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
