import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import Admin from "./admin";

const root = createRoot(document.getElementById("root")!);
const isAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";
root.render(isAdmin ? <Admin /> : <App />);
