const { test, expect } = require('@playwright/test');

const appPath = '/publish/drukkit.html';

async function gotoApp(page, search = '') {
  await page.goto(`${appPath}${search}`);
}

async function clearGrid(page) {
  await page.getByRole('button', { name: 'Clear All Notes' }).click();
}

function stepSelector(trackId, stepIndex) {
  return `.track-row[data-instrument="${trackId}"] .step[data-step="${stepIndex}"]`;
}

async function clickStep(page, trackId, stepIndex, options = {}) {
  await page.locator(stepSelector(trackId, stepIndex)).click({
    position: options.position || { x: 12, y: 28 },
    button: options.button || 'left'
  });
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

  await expect(await activeSteps(page, 'hihat')).toEqual([
    { index: 0, state: 'A', accent: false },
    { index: 4, state: 'A', accent: false },
    { index: 8, state: 'A', accent: false },
    { index: 12, state: 'A', accent: false },
    { index: 16, state: 'A', accent: false },
    { index: 20, state: 'A', accent: false },
    { index: 24, state: 'A', accent: false },
    { index: 28, state: 'A', accent: false }
  ]);
  await expect(await activeSteps(page, 'snare')).toEqual([
    { index: 4, state: 'A', accent: false },
    { index: 12, state: 'A', accent: false },
    { index: 20, state: 'A', accent: false },
    { index: 28, state: 'A', accent: false }
  ]);
  await expect(await activeSteps(page, 'bass')).toEqual([
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
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: true, right: false, left: false, accent: false });

  await clickStep(page, 'hihat', 1, { button: 'right' });
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: true, right: false, left: false, accent: true });

  await clickStep(page, 'hihat', 1);
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: true, left: false, accent: true });

  await clickStep(page, 'hihat', 1, { position: { x: 12, y: 3 } });
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: true, left: false, accent: false });

  await clickStep(page, 'hihat', 1);
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: false, left: true, accent: false });

  await clickStep(page, 'hihat', 1);
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: false, right: false, left: false, accent: false });
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

  await expect(serialized.title).toBe('Linear Fusion');
  await expect(serialized.notes).toBe('Practice with alternating accents');
  await expect(serialized.tracks.find((track) => track.id === 'snare')).toEqual({
    id: 'snare',
    name: 'backbeat',
    sym: 'cross',
    notes: [
      { i: 2, s: 'A', a: 1 },
      { i: 3, s: 'R' }
    ]
  });
  await expect(serialized.tracks.find((track) => track.id === 'bass')).toEqual({
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
  await expect(await stepClasses(page, 'snare', 2)).toEqual({ active: true, right: false, left: false, accent: true });
  await expect(await stepClasses(page, 'snare', 3)).toEqual({ active: false, right: true, left: false, accent: false });
  await expect(await stepClasses(page, 'bass', 7)).toEqual({ active: false, right: false, left: true, accent: false });
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

  await expect(await stepClasses(page, 'hihat', 0)).toEqual({ active: true, right: false, left: false, accent: false });
  await expect(await stepClasses(page, 'hihat', 5)).toEqual({ active: true, right: false, left: false, accent: false });
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

  await expect(await stepClasses(page, 'hihat', 16)).toEqual({ active: true, right: false, left: false, accent: true });
  await expect(await stepClasses(page, 'hihat', 17)).toEqual({ active: false, right: true, left: false, accent: false });
  await expect(await stepClasses(page, 'snare', 18)).toEqual({ active: false, right: false, left: true, accent: false });
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
  await expect(await stepClasses(page, 'hihat', 2)).toEqual({ active: true, right: false, left: false, accent: false });
  await expect(await stepClasses(page, 'snare', 17)).toEqual({ active: false, right: true, left: false, accent: false });
  await expect(await stepClasses(page, 'hihat', 18)).toEqual({ active: false, right: false, left: false, accent: false });
});

test('duplicates the first bar when extending from the start boundary', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);

  await clickStep(page, 'hihat', 1);
  await clickStep(page, 'snare', 3);
  await clickStep(page, 'snare', 3);

  await page.evaluate(() => executeOuterBarAddition('start'));

  await expect(page.locator('#barsSelect')).toHaveValue('3');
  await expect(await stepClasses(page, 'hihat', 1)).toEqual({ active: true, right: false, left: false, accent: false });
  await expect(await stepClasses(page, 'hihat', 17)).toEqual({ active: true, right: false, left: false, accent: false });
  await expect(await stepClasses(page, 'snare', 3)).toEqual({ active: false, right: true, left: false, accent: false });
  await expect(await stepClasses(page, 'snare', 19)).toEqual({ active: false, right: true, left: false, accent: false });
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
});
