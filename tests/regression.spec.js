<<<<<<< HEAD
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

=======
const { test, expect } = require('@playwright/test');

const appPath = '/publish/drukkit.html';

async function gotoApp(page, search = '') {
  await page.goto(`${appPath}${search}`);
}

async function clearGrid(page) {
  await page.getByRole('button', { name: 'Clear' }).click();
}

function stepSelector(trackId, stepIndex) {
  return `.track-row[data-instrument="${trackId}"] .step[data-step="${stepIndex}"]`;
}

async function clickStep(page, trackId, stepIndex, options = {}) {
  const position = options.position || { x: 12, y: 28 };
  const button = options.button || 'left';
  await page.locator(stepSelector(trackId, stepIndex)).evaluate((step, payload) => {
    const type = payload.button === 'right' ? 'contextmenu' : 'click';
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: payload.button === 'right' ? 2 : 0
    });
    Object.defineProperty(event, 'offsetY', {
      configurable: true,
      get: () => payload.position.y
    });
    Object.defineProperty(event, 'offsetX', {
      configurable: true,
      get: () => payload.position.x
    });
    step.dispatchEvent(event);
  }, { button, position });
}

async function stepClasses(page, trackId, stepIndex) {
  return page.locator(stepSelector(trackId, stepIndex)).evaluate((step) => ({
    active: step.classList.contains('active'),
    right: step.classList.contains('hand-R'),
    left: step.classList.contains('hand-L'),
    accent: step.classList.contains('accent')
  }));
}

async function activeSteps(page, trackId) {
  return page.evaluate((id) => {
    return Array.from(document.querySelectorAll(`.track-row[data-instrument="${id}"] .step`))
      .filter((step) => step.classList.contains('active') || step.classList.contains('hand-R') || step.classList.contains('hand-L'))
      .map((step) => ({
        index: Number(step.dataset.step),
        state: step.classList.contains('active') ? 'A' : step.classList.contains('hand-R') ? 'R' : 'L',
        accent: step.classList.contains('accent')
      }));
  }, trackId);
}

test('loads the default groove and share state', async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator('.track-row.header-row')).toHaveCount(1);
  await expect(page.locator('.track-row:not(.header-row)')).toHaveCount(3);
  await expect(page.locator('#barsSelect')).toHaveValue('2');
  await expect(page.locator('#subdivisionSelect')).toHaveValue('16th');

  expect(await activeSteps(page, 'hihat')).toEqual([
    { index: 0, state: 'A', accent: false },
    { index: 4, state: 'A', accent: false },
    { index: 8, state: 'A', accent: false },
    { index: 12, state: 'A', accent: false },
    { index: 16, state: 'A', accent: false },
    { index: 20, state: 'A', accent: false },
    { index: 24, state: 'A', accent: false },
    { index: 28, state: 'A', accent: false }
  ]);
  expect(await activeSteps(page, 'snare')).toEqual([
    { index: 4, state: 'A', accent: false },
    { index: 12, state: 'A', accent: false },
    { index: 20, state: 'A', accent: false },
    { index: 28, state: 'A', accent: false }
  ]);
  expect(await activeSteps(page, 'bass')).toEqual([
    { index: 0, state: 'A', accent: false },
    { index: 8, state: 'A', accent: false },
    { index: 16, state: 'A', accent: false },
    { index: 24, state: 'A', accent: false }
  ]);

  await expect.poll(async () => {
    return page.evaluate(() => {
      return {
        search: window.location.search,
        qr: document.getElementById('printQrCode').src
      };
    });
  }).toMatchObject({
    search: expect.stringContaining('tracks='),
    qr: expect.stringContaining(encodeURIComponent('/publish/drukkit.html'))
  });
});

test('cycles note states and toggles accents without losing hand annotations', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);

  await clickStep(page, 'hihat', 1);
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: true, right: false, left: false, accent: false });

  await clickStep(page, 'hihat', 1, { button: 'right' });
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: true, right: false, left: false, accent: true });

  await clickStep(page, 'hihat', 1);
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: true, left: false, accent: true });

  await clickStep(page, 'hihat', 1, { position: { x: 12, y: 3 } });
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: true, left: false, accent: false });

  await clickStep(page, 'hihat', 1);
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: false, left: true, accent: false });

  await clickStep(page, 'hihat', 1);
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: false, left: false, accent: false });
});

test('serializes custom edits into the URL and restores them on reload', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);

  await page.locator('#projectTitle').fill('Linear Fusion');
  await page.locator('#compositionNotes').fill('Practice with alternating accents');
  await page.locator('.track-row[data-instrument="snare"] .instrument-label-input').fill('backbeat');
  await page.locator('.track-row[data-instrument="snare"] .symbol-select').selectOption('cross');

  await clickStep(page, 'snare', 2);
  await clickStep(page, 'snare', 2, { button: 'right' });
  await clickStep(page, 'snare', 3);
  await clickStep(page, 'snare', 3);
  await clickStep(page, 'bass', 7);
  await clickStep(page, 'bass', 7);
  await clickStep(page, 'bass', 7);

  const serialized = await page.evaluate(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      title: params.get('title'),
      notes: params.get('notes'),
      tracks: JSON.parse(params.get('tracks'))
    };
  });

  expect(serialized.title).toBe('Linear Fusion');
  expect(serialized.notes).toBe('Practice with alternating accents');
  expect(serialized.tracks.find((track) => track.id === 'snare')).toEqual({
    id: 'snare',
    name: 'backbeat',
    sym: 'cross',
    notes: [
      { i: 2, s: 'A', a: 1 },
      { i: 3, s: 'R' }
    ]
  });
  expect(serialized.tracks.find((track) => track.id === 'bass')).toEqual({
    id: 'bass',
    name: 'bass',
    sym: 'circle',
    notes: [
      { i: 7, s: 'L' }
    ]
  });

  const savedUrl = page.url();
  await page.goto(savedUrl);

  await expect(page.locator('#projectTitle')).toHaveValue('Linear Fusion');
  await expect(page.locator('#compositionNotes')).toHaveValue('Practice with alternating accents');
  await expect(page.locator('.track-row[data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');
  await expect(page.locator('.track-row[data-instrument="snare"] .symbol-select')).toHaveValue('cross');
  expect(await stepClasses(page, 'snare', 2)).toEqual({ active: true, right: false, left: false, accent: true });
  expect(await stepClasses(page, 'snare', 3)).toEqual({ active: false, right: true, left: false, accent: false });
  expect(await stepClasses(page, 'bass', 7)).toEqual({ active: false, right: false, left: true, accent: false });
});

test('restores legacy integer note arrays as active notes', async ({ page }) => {
  const params = new URLSearchParams({
    title: 'Legacy Groove',
    time: '4/4',
    bars: '1',
    sub: '16th',
    notes: '',
    tracks: JSON.stringify([
      { id: 'hihat', name: 'hihat', sym: 'cross', notes: [0, 5] },
      { id: 'snare', name: 'snare', sym: 'circle', notes: [] },
      { id: 'bass', name: 'bass', sym: 'circle', notes: [] }
    ])
  });

  await gotoApp(page, `?${params.toString()}`);

  expect(await stepClasses(page, 'hihat', 0)).toEqual({ active: true, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'hihat', 5)).toEqual({ active: true, right: false, left: false, accent: false });
});

test('copies bars with hand states and accents intact', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);

  await clickStep(page, 'hihat', 0);
  await clickStep(page, 'hihat', 0, { button: 'right' });
  await clickStep(page, 'hihat', 1);
  await clickStep(page, 'hihat', 1);
  await clickStep(page, 'snare', 2);
  await clickStep(page, 'snare', 2);
  await clickStep(page, 'snare', 2);

  await page.evaluate(() => executeBarCopy(0, 1));

  expect(await stepClasses(page, 'hihat', 16)).toEqual({ active: true, right: false, left: false, accent: true });
  expect(await stepClasses(page, 'hihat', 17)).toEqual({ active: false, right: true, left: false, accent: false });
  expect(await stepClasses(page, 'snare', 18)).toEqual({ active: false, right: false, left: true, accent: false });
});

test('deletes bars and shifts later notes left', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);
  await page.locator('#barsSelect').fill('3');

  await clickStep(page, 'hihat', 18);
  await clickStep(page, 'snare', 33);
  await clickStep(page, 'snare', 33);

  await page.evaluate(() => executeBarDeletion(0));

  await expect(page.locator('#barsSelect')).toHaveValue('2');
  expect(await stepClasses(page, 'hihat', 2)).toEqual({ active: true, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'snare', 17)).toEqual({ active: false, right: true, left: false, accent: false });
  expect(await stepClasses(page, 'hihat', 18)).toEqual({ active: false, right: false, left: false, accent: false });
});

test('duplicates the first bar when extending from the start boundary', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);

  await clickStep(page, 'hihat', 1);
  await clickStep(page, 'snare', 3);
  await clickStep(page, 'snare', 3);

  await page.evaluate(() => executeOuterBarAddition('start'));

  await expect(page.locator('#barsSelect')).toHaveValue('3');
  expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: true, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'hihat', 17)).toEqual({ active: true, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'snare', 3)).toEqual({ active: false, right: true, left: false, accent: false });
  expect(await stepClasses(page, 'snare', 19)).toEqual({ active: false, right: true, left: false, accent: false });
});

test('hides delete controls when the chart has only one bar', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#barsSelect').fill('1');

  await expect(page.locator('.bar-copy-menu .del-btn')).toHaveCount(0);
});

test('reorders tracks and persists the new order in the share payload', async ({ page }) => {
  await gotoApp(page);

  await page.locator('.track-row[data-instrument="bass"] .drag-handle').dragTo(
    page.locator('.track-row[data-instrument="snare"]'),
    { targetPosition: { x: 10, y: 2 } }
  );

  await expect.poll(async () => {
    return page.locator('.track-row:not(.header-row)').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-instrument')));
  }).toEqual(['hihat', 'bass', 'snare']);

  await expect.poll(async () => {
    return page.evaluate(() => JSON.parse(new URLSearchParams(window.location.search).get('tracks')).map((track) => track.id));
  }).toEqual(['hihat', 'bass', 'snare']);
>>>>>>> origin/main
});
