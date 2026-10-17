import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { installFonts } from "./lib/fonts";

// The CRT screen is rasterised from the DOM, so fonts must be ready first.
await installFonts();

export default mount(App, { target: document.getElementById("app")! });
