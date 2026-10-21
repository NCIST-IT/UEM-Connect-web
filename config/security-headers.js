export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export const productionHeaders = {
  ...securityHeaders,
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
};

// Vite's static-file headers alone do not cover preflight/404/Host-rejection responses.
export function securityHeadersPlugin() {
  const apply = (headers) => (_request, response, next) => {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    next();
  };
  return {
    name: "uem-security-headers",
    configureServer(server) {
      server.middlewares.use(apply(securityHeaders));
    },
    configurePreviewServer(server) {
      server.middlewares.use(apply(productionHeaders));
    },
  };
}
