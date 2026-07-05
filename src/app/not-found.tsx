import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-dark p-4 text-center">
      <div className="pointer-events-none absolute -left-20 -top-20 h-[350px] w-[350px] rounded-full bg-primary/5 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-[350px] w-[350px] rounded-full bg-primary/5 blur-[100px]" />

      <div className="glass-card flex max-w-md flex-col items-center p-8 shadow-2xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-6">
          <SearchX className="h-8 w-8 text-primary" />
        </div>
        
        <h1 className="text-4xl font-bold tracking-tight text-text-primary mb-2">404</h1>
        <h2 className="text-xl font-semibold text-text-primary mb-3">Page Not Found</h2>
        
        <p className="text-text-muted mb-8 leading-relaxed">
          The page you are looking for doesn't exist or has been moved to a different URL.
        </p>

        <Link href="/">
          <Button variant="primary" icon={<Home className="h-4 w-4" />}>
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
