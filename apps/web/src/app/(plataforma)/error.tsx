"use client";

import { ErrorPantalla } from "@/components/error-pantalla";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <ErrorPantalla reset={reset} />
    </main>
  );
}
