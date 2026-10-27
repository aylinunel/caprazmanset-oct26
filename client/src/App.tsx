import { useEffect, useRef, useState } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { isLegacyAdminHash } from "./public/hash";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

function PublicWebsite() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    // Start the ~1 MB dataset request while the renderer chunk downloads,
    // instead of after it (they were fetched one after the other).
    const dataset = isLegacyAdminHash(window.location.hash)
      ? undefined
      : window.fetch("/api/public/dataset", {
          headers: { accept: "application/json" },
        });
    dataset?.catch(() => undefined); // bootstrap reports failures
    const mount = async () => {
      try {
        const { mountPublicWebsite } = await import("./public/bootstrap");
        if (disposed || !host.current) return;
        const stop = await mountPublicWebsite(host.current, dataset);
        if (typeof stop === "function") {
          if (disposed) stop();
          else cleanup = stop;
        }
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error ? cause.message : "Site could not load"
          );
      }
    };
    void mount();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return (
    <>
      {error && (
        <main className="load-error">
          <h1>Çapraz Manşet yüklenemedi</h1>
          <p role="alert">{error}</p>
          <button onClick={() => window.location.reload()}>Yeniden dene</button>
        </main>
      )}
      <div ref={host} id="public-site-host" />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/yonetim" component={Admin} />
        <Route path="/" component={PublicWebsite} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}
