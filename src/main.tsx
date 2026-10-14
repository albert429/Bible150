import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initAppearance } from "./navigation/appearance";
import "./styles.css";

initAppearance();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
