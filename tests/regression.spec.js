// @ts-check
const { test, expect } = require('@playwright/test');

// Helpers
const DEFAULT_TITLE = 'My Drum Groove Composition';

test.describe('Drukkit Regression Suite', () => {

    // ── Basic load ─────────────────────────────────────────────────────────

    test('index.html loads with default project title', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page.locator('#projectTitle')).toHaveValue(DEFAULT_TITLE);
    });

    test('page title reflects project title on load', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page).toHaveTitle(DEFAULT_TITLE);
    });

    test('default 3 instrument tracks are rendered', async ({ page }) => {
        await page.goto('/index.html');
        const rows = page.locator('.track-row:not(.header-row)');
        await expect(rows).toHaveCount(3);
    });

    test('default tracks have expected instrument IDs', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page.locator('.track-row[data-instrument="hihat"]')).toBeVisible();
        await expect(page.locator('.track-row[data-instrument="snare"]')).toBeVisible();
        await expect(page.locator('.track-row[data-instrument="bass"]')).toBeVisible();
    });

    // ── Step click state machine ────────────────────────────────────────────

    test('step cycles: empty → active → hand-R → hand-L → empty', async ({ page }) => {
        await page.goto('/index.html');
        // Clear the default rhythm so every step starts in the empty state
        await page.click('#clearBtn');
        const step = page.locator('.track-row[data-instrument="hihat"] .step').first();

        // empty → active
        await step.click();
        await expect(step).toHaveClass(/active/);

        // active → hand-R
        await step.click();
        await expect(step).toHaveClass(/hand-R/);
        await expect(step).not.toHaveClass(/active/);

        // hand-R → hand-L
        await step.click();
        await expect(step).toHaveClass(/hand-L/);
        await expect(step).not.toHaveClass(/hand-R/);

        // hand-L → empty
        await step.click();
        await expect(step).not.toHaveClass(/active|hand-R|hand-L/);
    });

    test('right-click on active step toggles accent class', async ({ page }) => {
        await page.goto('/index.html');
        const step = page.locator('.track-row[data-instrument="snare"] .step').first();

        // Activate the step first
        await step.click();
        await expect(step).toHaveClass(/active/);

        // Right-click should add accent
        await step.click({ button: 'right' });
        await expect(step).toHaveClass(/accent/);

        // Right-click again should remove accent
        await step.click({ button: 'right' });
        await expect(step).not.toHaveClass(/accent/);
    });

    // ── URL serialisation ───────────────────────────────────────────────────

    test('URL contains tracks parameter after app initialises', async ({ page }) => {
        await page.goto('/index.html');
        // updateURL() is called on init
        const url = page.url();
        expect(url).toContain('tracks=');
    });

    test('clicking a step updates the tracks parameter in the URL', async ({ page }) => {
        await page.goto('/index.html');

        // Record URL before click
        const urlBefore = page.url();
        const paramsBefore = new URL(urlBefore).searchParams.get('tracks');

        // Step 1 is an off-beat subdivision cell, empty by default in 4/4 16th mode
        const step = page.locator('.track-row[data-instrument="hihat"] .step[data-step="1"]');
        await step.click();

        const urlAfter = page.url();
        const paramsAfter = new URL(urlAfter).searchParams.get('tracks');

        // The tracks payload must have changed
        expect(paramsAfter).not.toEqual(paramsBefore);

        // Parsed payload must contain step 1 as active for hihat
        const tracks = JSON.parse(paramsAfter);
        const hihat = tracks.find(t => t.id === 'hihat');
        expect(hihat).toBeTruthy();
        expect(hihat.notes.some(n => n.i === 1 && n.s === 'A')).toBe(true);
    });

    test('project title input updates URL title parameter', async ({ page }) => {
        await page.goto('/index.html');
        const input = page.locator('#projectTitle');
        await input.fill('My Test Groove');
        await input.dispatchEvent('input');
        const url = page.url();
        expect(url).toContain('title=');
        const title = new URL(url).searchParams.get('title');
        expect(title).toBe('My Test Groove');
    });

    // ── URL hydration ───────────────────────────────────────────────────────

    test('shareable link restores project title', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross',   notes: [] },
            { id: 'snare', name: 'snare', sym: 'circle', notes: [] },
            { id: 'bass',  name: 'bass',  sym: 'circle', notes: [] },
        ]);
        await page.goto('/index.html?title=Shred+Fest&time=4%2F4&bars=2&sub=16th&notes=&tracks=' + encodeURIComponent(tracks));
        await expect(page.locator('#projectTitle')).toHaveValue('Shred Fest');
        await expect(page).toHaveTitle('Shred Fest');
    });

    test('shareable link restores active note positions', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross',   notes: [{ i: 0, s: 'A' }, { i: 4, s: 'R' }] },
            { id: 'snare', name: 'snare', sym: 'circle', notes: [{ i: 8, s: 'L' }] },
            { id: 'bass',  name: 'bass',  sym: 'circle', notes: [] },
        ]);
        await page.goto('/index.html?title=Test&time=4%2F4&bars=2&sub=16th&notes=&tracks=' + encodeURIComponent(tracks));

        await expect(page.locator('.track-row[data-instrument="hihat"] .step[data-step="0"]')).toHaveClass(/active/);
        await expect(page.locator('.track-row[data-instrument="hihat"] .step[data-step="4"]')).toHaveClass(/hand-R/);
        await expect(page.locator('.track-row[data-instrument="snare"] .step[data-step="8"]')).toHaveClass(/hand-L/);
    });

    test('shareable link restores accent modifiers', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross', notes: [{ i: 0, s: 'A', a: 1 }] },
            { id: 'snare', name: 'snare', sym: 'circle', notes: [] },
            { id: 'bass',  name: 'bass',  sym: 'circle', notes: [] },
        ]);
        await page.goto('/index.html?title=T&time=4%2F4&bars=2&sub=16th&notes=&tracks=' + encodeURIComponent(tracks));
        await expect(page.locator('.track-row[data-instrument="hihat"] .step[data-step="0"]')).toHaveClass(/accent/);
    });

    test('legacy flat-integer notes array is hydrated as active state', async ({ page }) => {
        // Backward compat: notes may be a plain integer array instead of object tuples
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross', notes: [0, 4, 8] },
            { id: 'snare', name: 'snare', sym: 'circle', notes: [] },
            { id: 'bass',  name: 'bass',  sym: 'circle', notes: [] },
        ]);
        await page.goto('/index.html?title=T&time=4%2F4&bars=2&sub=16th&notes=&tracks=' + encodeURIComponent(tracks));
        await expect(page.locator('.track-row[data-instrument="hihat"] .step[data-step="0"]')).toHaveClass(/active/);
        await expect(page.locator('.track-row[data-instrument="hihat"] .step[data-step="4"]')).toHaveClass(/active/);
        await expect(page.locator('.track-row[data-instrument="hihat"] .step[data-step="8"]')).toHaveClass(/active/);
    });

    test('shareable link restores bar count and subdivision', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross', notes: [] },
        ]);
        await page.goto('/index.html?title=T&time=4%2F4&bars=4&sub=8th&notes=&tracks=' + encodeURIComponent(tracks));
        await expect(page.locator('#barsSelect')).toHaveValue('4');
        await expect(page.locator('#subdivisionSelect')).toHaveValue('8th');
    });

    // ── Controls ────────────────────────────────────────────────────────────

    test('Add Track button appends a new instrument row', async ({ page }) => {
        await page.goto('/index.html');
        const rowsBefore = await page.locator('.track-row:not(.header-row)').count();
        await page.click('#addTrackBtn');
        await expect(page.locator('.track-row:not(.header-row)')).toHaveCount(rowsBefore + 1);
    });

    test('Clear button removes all active states from every step', async ({ page }) => {
        await page.goto('/index.html');

        // Activate a step first
        await page.locator('.track-row[data-instrument="hihat"] .step').first().click();
        await expect(page.locator('.step.active').first()).toBeVisible();

        await page.click('#clearBtn');
        await expect(page.locator('.step.active')).toHaveCount(0);
        await expect(page.locator('.step.hand-R')).toHaveCount(0);
        await expect(page.locator('.step.hand-L')).toHaveCount(0);
    });

    test('Theme button toggles light-mode class on body', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page.locator('body')).not.toHaveClass(/light-mode/);
        await page.click('#themeBtn');
        await expect(page.locator('body')).toHaveClass(/light-mode/);
        await page.click('#themeBtn');
        await expect(page.locator('body')).not.toHaveClass(/light-mode/);
    });

    test('Delete track button removes the track row', async ({ page }) => {
        await page.goto('/index.html');
        await page.locator('.track-row[data-instrument="snare"] .delete-track-btn').click();
        await expect(page.locator('.track-row[data-instrument="snare"]')).toHaveCount(0);
        await expect(page.locator('.track-row:not(.header-row)')).toHaveCount(2);
    });

    // ── Time signature / subdivision ────────────────────────────────────────

    test('switching to 6/8 limits subdivision options to 8th and 16th', async ({ page }) => {
        await page.goto('/index.html');
        await page.selectOption('#timeSigSelect', '6/8');
        const options = page.locator('#subdivisionSelect option');
        await expect(options).toHaveCount(2);
    });

    test('4/4 time signature offers four subdivision options', async ({ page }) => {
        await page.goto('/index.html');
        await page.selectOption('#timeSigSelect', '4/4');
        const options = page.locator('#subdivisionSelect option');
        await expect(options).toHaveCount(4);
    });

    test('changing bars count rebuilds grid with more steps', async ({ page }) => {
        await page.goto('/index.html');
        const stepsBefore = await page.locator('.track-row[data-instrument="hihat"] .step').count();

        await page.fill('#barsSelect', '4');
        await page.dispatchEvent('#barsSelect', 'input');

        const stepsAfter = await page.locator('.track-row[data-instrument="hihat"] .step').count();
        expect(stepsAfter).toBeGreaterThan(stepsBefore);
    });

    test('step count matches expected formula for 2 bars 4/4 16th', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross', notes: [] },
        ]);
        await page.goto('/index.html?title=T&time=4%2F4&bars=2&sub=16th&notes=&tracks=' + encodeURIComponent(tracks));
        // stepsPerBar = 4 beats × 4 = 16; 2 bars = 32 steps
        const stepCount = await page.locator('.track-row[data-instrument="hihat"] .step').count();
        expect(stepCount).toBe(32);
    });

    test('step count matches expected formula for 1 bar 3/4 8th', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'hihat', name: 'hihat', sym: 'cross', notes: [] },
        ]);
        await page.goto('/index.html?title=T&time=3%2F4&bars=1&sub=8th&notes=&tracks=' + encodeURIComponent(tracks));
        // stepsPerBar = 3 beats × 2 = 6; 1 bar = 6 steps
        const stepCount = await page.locator('.track-row[data-instrument="hihat"] .step').count();
        expect(stepCount).toBe(6);
    });

    // ── Redirect shim ───────────────────────────────────────────────────────

    test('drukkit.html redirects to index.html', async ({ page }) => {
        await page.goto('/drukkit.html');
        await page.waitForURL(/index\.html/);
        await expect(page.locator('#projectTitle')).toBeVisible();
    });

    test('drukkit.html redirect preserves query string', async ({ page }) => {
        const tracks = JSON.stringify([
            { id: 'snare', name: 'snare', sym: 'circle', notes: [{ i: 0, s: 'A' }] },
        ]);
        const qs = '?title=Preserved&time=4%2F4&bars=2&sub=16th&notes=&tracks=' + encodeURIComponent(tracks);
        await page.goto('/drukkit.html' + qs);
        await page.waitForURL(/index\.html/);
        await expect(page.locator('#projectTitle')).toHaveValue('Preserved');
    });

});
