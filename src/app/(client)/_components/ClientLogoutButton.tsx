"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logout } from "@/app/actions/auth/logout.actions";

export default function ClientLogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="na-logout-link"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await logout().catch(() => undefined);
          router.replace("/login");
          router.refresh();
        });
      }}
    >
      {isPending ? "Logging out..." : <><span aria-hidden="true">✕</span> Log out</>}
    </button>
  );
}
