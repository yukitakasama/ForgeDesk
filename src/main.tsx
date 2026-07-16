import ReactDOM from "react-dom/client";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import App from "./App";
import "./styles.css";
import "@xterm/xterm/css/xterm.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <TooltipProvider delayDuration={350}>
    <App />
  </TooltipProvider>,
);
