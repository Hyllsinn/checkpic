import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { supabase } from "./lib/supabase";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App client={supabase()} />
  </StrictMode>,
);
