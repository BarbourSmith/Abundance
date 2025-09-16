import React, { useState, useEffect } from "react";
import {
  HashRouter as Router,
  // BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";

import GlobalVariables from "./js/globalvariables.js";
import LoginMode from "./components/main-routes/LoginMode.jsx";
import RunMode from "./components/main-routes/RunMode.jsx";
import CreateMode from "./components/main-routes/CreateMode.jsx";
import Callback from "./components/main-routes/CallBack.jsx";

import { QueryClient, QueryClientProvider } from "react-query";
import { CombinedProvider } from "./contexts/index.jsx";

/*Import style scripts*/
import "./styles/maslowCreate.css";
import "./styles/menuIcons.css";
import "./styles/login.css";
import "./styles/codemirror.css";
//

const queryClient = new QueryClient();

export default function ReplicadApp() {
  // Theme setup
  useEffect(() => {
    const element = document.querySelector("html");
    const storedClass = localStorage.getItem("displayTheme");

    if (element && storedClass) {
      element.className = storedClass;
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CombinedProvider>
        <main>
          <Routes>
            <Route
              exact
              path=""
              element={<LoginMode />}
            />
            <Route
              path="/callback"
              element={<Callback />}
            />
            <Route
              path="/:owner/:repoName"
              element={<CreateMode />}
            />
            <Route
              path="/run/:owner/:repoName"
              element={<RunMode />}
            />
          </Routes>
        </main>
      </CombinedProvider>
    </QueryClientProvider>
  );
}
