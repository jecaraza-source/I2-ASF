"use client";

import { ErrorPantalla } from "@/components/error-pantalla";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="flex-1 px-8 py-8">
      <ErrorPantalla reset={reset} />
    </main>
  );
}
