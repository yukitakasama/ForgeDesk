import { useEffect } from "react";
import {
  AlertTriangle,
  Blocks,
  Cloud,
  Cpu,
  Inbox,
  Settings,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "./store/useAppStore";
import Sidebar from "./components/Sidebar";
import Workspace from "./components/Workspace";
import ApprovalDialog from "./components/ApprovalDialog";
import SettingsView from "./components/SettingsView";
import CloudView from "./components/CloudView";
import AutomationsView from "./components/AutomationsView";
import ExtensionsView from "./components/ExtensionsView";

export default function App() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const activeView = useAppStore((state) => state.activeView);
  const error = useAppStore((state) => state.error);
  const clearError = useAppStore((state) => state.clearError);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void bootstrap().then((unlisten) => {
      cleanup = unlisten;
    });
    return () => cleanup?.();
  }, [bootstrap]);

  return (
    <div
      className={`app-shell${activeView === "settings" ? " is-settings" : ""}`}
    >
      {activeView !== "settings" && <Sidebar />}
      <main className="app-main">
        {activeView === "workspace" && <Workspace />}
        {activeView === "automations" && <AutomationsView />}
        {activeView === "cloud" && <CloudView />}
        {activeView === "extensions" && <ExtensionsView />}
        {activeView === "settings" && <SettingsView />}
      </main>
      <ApprovalDialog />
      {error && (
        <div className="error-toast" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={clearError} aria-label="关闭错误">
            关闭
          </button>
        </div>
      )}
      <div className="sr-only" aria-hidden="true">
        <Sparkles />
        <Cloud />
        <Cpu />
        <Inbox />
        <Blocks />
        <Settings />
      </div>
    </div>
  );
}
