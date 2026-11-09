import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(frontendDir, "../backend");
const frontendCommand = process.env.PLAYWRIGHT_FRONTEND_MODE === "production"
  ? `npm run preview -- --host 127.0.0.1 --port 5174 --strictPort --outDir "${process.env.PLAYWRIGHT_BUILD_DIR || "dist"}"`
  : "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/playwright-report.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: [
    {
      command: "node tests/browserTestServer.js",
      cwd: backendDir,
      url: "http://127.0.0.1:8010/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NODE_ENV: "test",
        PORT: "8010",
        JWT_SECRET: "playwright-local-test-secret-0123456789abcdef",
        JWT_EXPIRES_IN: "15m",
        CLIENT_URL: "http://127.0.0.1:5174",
        FRONTEND_URL: "http://127.0.0.1:5174",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        GOOGLE_REDIRECT_URI: "http://localhost:8010/api/auth/google/callback",
        EMAIL_HOST: "127.0.0.1",
        EMAIL_PORT: "8025",
        EMAIL_FROM: "ALFREDO Store <no-reply@alfredo.test>",
      },
    },
    {
      command: frontendCommand,
      cwd: frontendDir,
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        VITE_API_URL: "http://127.0.0.1:8010",
        VITE_GOOGLE_CLIENT_ID: "",
      },
    },
  ],
});
