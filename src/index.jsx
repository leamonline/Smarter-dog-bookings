import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import CustomerApp from "./CustomerApp.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/customer/*" element={<CustomerApp />} />
      <Route path="/*" element={<App />} />
    </Routes>
  </BrowserRouter>
);
