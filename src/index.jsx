import React from "react";
import ReactDOM from "react-dom/client";

import { createPortal } from "react-dom";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter basename={import.meta.env.VITE_BROWSER_ROUTER}>
    <App />
  </BrowserRouter>
);

// Hot Module Replacement (HMR) - Remove this snippet to remove HMR.
// Learn more: https://vitejs.dev/guide/api-hmr.html
if (import.meta.hot) {
  import.meta.hot.accept();
}
