import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The FOIA workspace keeps its data in the browser, so it only renders after hydration.
const FoiaRoot = lazy(() => import("@/foia/FoiaRoot"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FOIA Case Management" },
      {
        name: "description",
        content:
          "Register, track, assign, and manage FOIA requests with clear visibility into cases, deadlines, tasks, and processing stages.",
      },
      { property: "og:title", content: "FOIA Case Management" },
      {
        property: "og:description",
        content:
          "Register, track, assign, and manage FOIA requests with clear visibility into cases, deadlines, tasks, and processing stages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Loading FOIA workspace…
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <FoiaRoot />
      </Suspense>
    </ClientOnly>
  );
}
