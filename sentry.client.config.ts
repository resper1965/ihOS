// sentry.client.config.ts
// Sentry configuration for the browser (client-side) runtime.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://6fcca660c2a5231a7256af2c83a835ae@o4509995422515200.ingest.us.sentry.io/4511521301921792",

  // Adjust tracesSampleRate in production or control volume
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console regarding SDK integration.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can define profilesSampleRate here if you use profiling
});
