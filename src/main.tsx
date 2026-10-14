import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Marca de arranque para la trampa de diagnostico de index.html.
(window as unknown as { __snapxBooted: boolean }).__snapxBooted = true;
