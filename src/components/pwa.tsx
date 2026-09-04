import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Banner exibido quando o dispositivo fica sem conexão. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
      <WifiOff className="h-4 w-4" aria-hidden />
      Você está offline — os envios serão guardados na fila e sincronizados depois.
    </div>
  );
}

/** Botão de instalação do app, visível apenas quando o navegador oferece o prompt. */
export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const installed = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!promptEvent) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await promptEvent.prompt();
        setPromptEvent(null);
      }}
      className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
    >
      <Download className="h-4 w-4" aria-hidden />
      Instalar app
    </button>
  );
}
