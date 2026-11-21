"use client";

import { Toaster } from "sonner";

/** Bottom-right toasts sit above the floating + action. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      offset={{ bottom: "5.75rem", right: "1.25rem" }}
      mobileOffset={{ bottom: "5.75rem", right: "1.25rem" }}
      swipeDirections={["right", "bottom"]}
      closeButton
      gap={10}
      toastOptions={{
        classNames: {
          toast: "atrium-toast",
          title: "atrium-toast-title",
          description: "atrium-toast-description",
          closeButton: "atrium-toast-close",
          success: "atrium-toast-success",
          error: "atrium-toast-error",
        },
      }}
    />
  );
}
