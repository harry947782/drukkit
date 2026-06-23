// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:3000',
        ...devices['Desktop Chrome'],
    },
    webServer: {
        command: 'node server.js',
        port: 3000,
        reuseExistingServer: !process.env.CI,
    },
});
