import { setDefaultResultOrder } from "node:dns";
import { createApp } from "./app.js";
setDefaultResultOrder("ipv4first");
const port = Number(process.env.UEM_PORT ?? 5177);
const host = process.env.UEM_HOST ?? "0.0.0.0";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid UEM_PORT");
const app = createApp({ production: process.env.NODE_ENV === "production" });
app.listen(port, host, () =>
  console.log(`UEM Connect Web: http://${host}:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => app.close(() => process.exit(0)));
