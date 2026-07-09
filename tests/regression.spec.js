const { test, expect } = require('@playwright/test');

const appPath = '/publish/index.html';

async function gotoApp(page, search = '') {
  await page.goto(`${appPath}${search}`);
}

async function openHeaderMenu(page) {
  const menuBtn = page.getByRole('button', { name: 'Header controls' });
  if ((await menuBtn.getAttribute('aria-expanded')) !== 'true') {
    await menuBtn.click();
  }
}

async function clearGrid(page) {
  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Clear' }).click();
}

function trackSelector(trackId, variantIndex = 0) {
  return `.track-row[data-variant="${variantIndex}"][data-instrument="${trackId}"]`;
}

function stepSelector(trackId, stepIndex, variantIndex = 0) {
  return `${trackSelector(trackId, variantIndex)} .step[data-step="${stepIndex}"]`;
}

async function clickStep(page, trackId, stepIndex, options = {}) {
  const position = options.position || { x: 12, y: 28 };
  const button = options.button || 'left';
  const variantIndex = options.variantIndex || 0;
  await page.locator(stepSelector(trackId, stepIndex, variantIndex)).evaluate((step, payload) => {
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

async function stepClasses(page, trackId, stepIndex, variantIndex = 0) {
  return page.locator(stepSelector(trackId, stepIndex, variantIndex)).evaluate((step) => ({
    active: step.classList.contains('active'),
    right: step.classList.contains('hand-R'),
    left: step.classList.contains('hand-L'),
    accent: step.classList.contains('accent')
  }));
}

async function activeSteps(page, trackId, variantIndex = 0) {
  return page.evaluate(({ id, variant }) => {
    return Array.from(document.querySelectorAll(`.track-row[data-variant="${variant}"][data-instrument="${id}"] .step`))
      .filter((step) => step.classList.contains('active') || step.classList.contains('hand-R') || step.classList.contains('hand-L'))
      .map((step) => ({
        index: Number(step.dataset.step),
        state: step.classList.contains('active') ? 'A' : step.classList.contains('hand-R') ? 'R' : 'L',
        accent: step.classList.contains('accent')
      }));
  }, { id: trackId, variant: variantIndex });
}

test('loads the default groove and share state', async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator('.track-row.header-row')).toHaveCount(1);
  await expect(page.locator('.track-row[data-variant="0"]')).toHaveCount(3);
  await expect(page.locator('#headerMenuPanel')).toBeHidden();
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
    qr: expect.stringContaining(encodeURIComponent('/publish/index.html'))
  });
});

test('opens and closes the header controls hamburger menu', async ({ page }) => {
  await gotoApp(page);

  const menuBtn = page.getByRole('button', { name: 'Header controls' });
  const menuPanel = page.locator('#headerMenuPanel');

  await expect(menuPanel).toBeHidden();
  await menuBtn.click();
  await expect(menuPanel).toBeVisible();
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(menuPanel).toBeHidden();
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
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
  await page.locator('.track-row[data-variant="0"][data-instrument="snare"] .instrument-label-input').fill('backbeat');
  await page.locator('.track-row[data-variant="0"][data-instrument="snare"] .symbol-cycle-btn').click();

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
  await expect(page.locator('.track-row[data-variant="0"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');
  await expect(page.locator('.track-row[data-variant="0"][data-instrument="snare"] .symbol-cycle-btn')).toHaveText('✕');
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
  await openHeaderMenu(page);
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
  await openHeaderMenu(page);
  await page.locator('#barsSelect').fill('1');

  await expect(page.locator('.bar-copy-menu .del-btn')).toHaveCount(0);
});

test('reorders tracks and persists the new order in the share payload', async ({ page }) => {
  await gotoApp(page);

  await page.locator('.track-row[data-variant="0"][data-instrument="bass"] .drag-handle').dragTo(
    page.locator('.track-row[data-variant="0"][data-instrument="snare"]'),
    { targetPosition: { x: 10, y: 2 } }
  );

  await expect.poll(async () => {
    return page.locator('.track-row[data-variant="0"]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-instrument')));
  }).toEqual(['hihat', 'bass', 'snare']);

  await expect.poll(async () => {
    return page.evaluate(() => JSON.parse(new URLSearchParams(window.location.search).get('tracks')).map((track) => track.id));
  }).toEqual(['hihat', 'bass', 'snare']);
});

test('saves and reloads grooves with stacked variants', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
  });
  await clearGrid(page);
  await openHeaderMenu(page);
  await page.locator('#variantsSelect').fill('2');

  const titleInput = page.locator('#projectTitle');
  await titleInput.fill('Test Groove');
  await page.locator('#compositionNotes').fill('Save both variants');
  await page.locator('.track-row[data-variant="1"][data-instrument="snare"] .instrument-label-input').fill('backbeat');
  await expect(page.locator('.track-row[data-variant="0"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');
  await expect(page.locator('.track-row[data-variant="1"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');

  await clickStep(page, 'hihat', 0, { variantIndex: 0 });
  await clickStep(page, 'snare', 4, { variantIndex: 1 });
  await clickStep(page, 'snare', 4, { variantIndex: 1 });

  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Save Groove' }).click();
  await expect(page.locator('#grooveName')).toBeVisible();
  await page.locator('#grooveName').fill('My Test Groove');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#saveConfirmBtn').click();
  await expect(page.locator('#saveDialog')).toBeHidden();

  const savedGrooves = await page.evaluate(() => JSON.parse(localStorage.getItem('drukkit_grooves')));
  expect(savedGrooves).toHaveLength(1);
  expect(savedGrooves[0].state.variants).toHaveLength(2);
  expect(savedGrooves[0].state.variants[0].tracks.find((track) => track.id === 'hihat').notes).toEqual([
    { i: 0, s: 'A' }
  ]);
  expect(savedGrooves[0].state.variants[1].tracks.find((track) => track.id === 'snare').notes).toEqual([
    { i: 4, s: 'R' }
  ]);

  await clearGrid(page);
  await titleInput.fill('Modified');
  await openHeaderMenu(page);
  await page.locator('#variantsSelect').fill('1');
  await page.getByRole('button', { name: 'Load Groove' }).click();
  await expect(page.locator('#loadModal')).toBeVisible();
  await expect(page.locator('.groove-item')).toHaveCount(1);
  await page.locator('.groove-load-btn').first().click();
  await expect(page.locator('#loadModal')).toBeHidden();

  await expect(titleInput).toHaveValue('Test Groove');
  await expect(page.locator('#compositionNotes')).toHaveValue('Save both variants');
  await expect(page.locator('#variantsSelect')).toHaveValue('2');
  await expect(page.locator('.track-row[data-variant="0"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');
  await expect(page.locator('.track-row[data-variant="1"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');
  expect(await stepClasses(page, 'hihat', 0, 0)).toEqual({ active: true, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'hihat', 0, 1)).toEqual({ active: false, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'snare', 4, 1)).toEqual({ active: false, right: true, left: false, accent: false });
});

test('delete saved groove from localStorage', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
  });

  await page.locator('#projectTitle').fill('Groove to Delete');
  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Save Groove' }).click();
  await page.locator('#grooveName').fill('Delete Me');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#saveConfirmBtn').click();
  await expect(page.locator('#saveDialog')).toBeHidden();

  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Load Groove' }).click();
  const loadModal = page.locator('#loadModal');
  await expect(loadModal).toBeVisible();
  await expect(page.locator('.groove-item')).toHaveCount(1);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('.groove-delete-btn').first().click();

  await expect(page.locator('.groove-item')).toHaveCount(0);
  await expect(page.locator('#noGroovesMsg')).toBeVisible();
  await page.locator('#modalClose').click();
  await expect(loadModal).toBeHidden();
});

test('multiple saves and loads work correctly', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
  });

  const titleInput = page.locator('#projectTitle');
  await titleInput.fill('Groove 1');
  await clickStep(page, 'hihat', 0);

  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Save Groove' }).click();
  await page.locator('#grooveName').fill('First Groove');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#saveConfirmBtn').click();
  await expect(page.locator('#saveDialog')).toBeHidden();

  await clearGrid(page);
  await titleInput.fill('Groove 2');
  await clickStep(page, 'snare', 4);

  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Save Groove' }).click();
  await page.locator('#grooveName').fill('Second Groove');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#saveConfirmBtn').click();
  await expect(page.locator('#saveDialog')).toBeHidden();

  await openHeaderMenu(page);
  await page.getByRole('button', { name: 'Load Groove' }).click();
  const loadModal = page.locator('#loadModal');
  await expect(loadModal).toBeVisible();
  await expect(page.locator('.groove-item')).toHaveCount(2);

  const grooveNames = await page.locator('.groove-item-name').evaluateAll((items) => items.map((item) => item.textContent));
  expect(grooveNames).toEqual(['Second Groove', 'First Groove']);

  await page.locator('.groove-load-btn').first().click();
  await expect(loadModal).toBeHidden();

  await expect(titleInput).toHaveValue('Groove 2');
  expect(await stepClasses(page, 'snare', 4)).toEqual({ active: true, right: false, left: false, accent: false });
});

test('stacks groove variants with independent notes and shared track metadata', async ({ page }) => {
  await gotoApp(page);
  await clearGrid(page);
  await openHeaderMenu(page);
  await page.locator('#variantsSelect').fill('2');

  await expect(page.locator('.variant-section')).toHaveCount(2);
  await expect(page.locator('.track-row[data-variant="0"]')).toHaveCount(3);
  await expect(page.locator('.track-row[data-variant="1"]')).toHaveCount(3);

  await clickStep(page, 'hihat', 1, { variantIndex: 0 });
  await clickStep(page, 'snare', 2, { variantIndex: 1 });
  await clickStep(page, 'snare', 2, { variantIndex: 1 });

  expect(await stepClasses(page, 'hihat', 1, 0)).toEqual({ active: true, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'hihat', 1, 1)).toEqual({ active: false, right: false, left: false, accent: false });
  expect(await stepClasses(page, 'snare', 2, 1)).toEqual({ active: false, right: true, left: false, accent: false });

  await page.locator('.track-row[data-variant="1"][data-instrument="snare"] .instrument-label-input').fill('backbeat');
  await expect(page.locator('.track-row[data-variant="0"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');
  await expect(page.locator('.track-row[data-variant="1"][data-instrument="snare"] .instrument-label-input')).toHaveValue('backbeat');

  const serialized = await page.evaluate(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      tracks: JSON.parse(params.get('tracks')),
      variants: JSON.parse(params.get('variants'))
    };
  });

  expect(serialized.tracks.find((track) => track.id === 'snare').name).toBe('backbeat');
  expect(serialized.variants).toHaveLength(2);
  expect(serialized.variants[0].tracks.find((track) => track.id === 'hihat').notes).toEqual([
    { i: 1, s: 'A' }
  ]);
  expect(serialized.variants[1].tracks.find((track) => track.id === 'snare').notes).toEqual([
    { i: 2, s: 'R' }
  ]);
});

test('uses print-safe variant sections and portrait mode for narrow stacked layouts', async ({ page }) => {
  await gotoApp(page);
  await openHeaderMenu(page);
  await page.locator('#barsSelect').fill('1');
  await page.locator('#variantsSelect').fill('3');

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('body')).toHaveClass(/print-portrait/);
  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('body')).toHaveClass(/print-portrait/);

  const printStyles = await page.locator('.variant-section').first().evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      breakInside: styles.breakInside,
      pageBreakInside: styles.pageBreakInside
    };
  });

  expect(printStyles.breakInside).toContain('avoid');
  expect(printStyles.pageBreakInside).toContain('avoid');
});
