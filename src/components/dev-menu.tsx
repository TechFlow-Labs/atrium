"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Eye, EyeOff, FlaskConical, RefreshCw } from "lucide-react";
import { reseedDevMocksAction, setDevMocksVisibleAction } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DevMenu({
  mocksVisible,
  envLabel,
}: {
  mocksVisible: boolean;
  envLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setVisible(next: boolean) {
    if (pending || next === mocksVisible) return;
    const formData = new FormData();
    formData.set("visible", next ? "1" : "0");
    startTransition(async () => {
      await setDevMocksVisibleAction(formData);
      router.refresh();
    });
  }

  function reseed() {
    if (pending) return;
    startTransition(async () => {
      await reseedDevMocksAction();
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Dev menu"
        title="Dev"
        className="inline-flex size-9 items-center justify-center rounded-md border border-dashed border-amber-500/50 bg-card text-amber-700 transition hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300"
      >
        <FlaskConical className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-sm font-medium text-foreground">Dev</span>
          <span className="mt-0.5 block truncate text-xs font-normal text-muted">{envLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mock data</DropdownMenuLabel>
        <DropdownMenuItem disabled={pending} onSelect={() => setVisible(true)}>
          <Eye className="size-4 text-muted" aria-hidden="true" />
          <span className="flex-1">Show mock data</span>
          {mocksVisible ? <Check className="size-4" aria-hidden="true" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending} onSelect={() => setVisible(false)}>
          <EyeOff className="size-4 text-muted" aria-hidden="true" />
          <span className="flex-1">Hide mock data</span>
          {!mocksVisible ? <Check className="size-4" aria-hidden="true" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => reseed()}>
          <RefreshCw className="size-4 text-muted" aria-hidden="true" />
          Reseed mock data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
