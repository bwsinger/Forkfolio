import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Pixel 7'],
    serviceWorkers: 'allow',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && node .test-build',
    port: 4173,
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: '4173',
      ORIGIN: 'http://127.0.0.1:4173',
      FORKFOLIO_SECRET: 'forkfolio-automated-test-secret-only',
      FORKFOLIO_DATA_DIR: './test-results/server-data',
      BODY_SIZE_LIMIT: '16M',
      FORKFOLIO_BUILD_DIR: '.test-build'
    },
    timeout: 60000
  }
});
