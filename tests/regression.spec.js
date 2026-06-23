const { test, expect } = require('@playwright/test');

const appPath = '/publish/index.html';

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
    qr: expect.stringContaining(encodeURIComponent('/publish/index.html'))
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
  await page.locator('.track-row[data-instrument="snare"] .symbol-cycle-btn').click();

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
  await expect(page.locator('.track-row[data-instrument="snare"] .symbol-cycle-btn')).toHaveText('✕');
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
});

test('save groove to localStorage and load it back', async ({ page }) => {
  // Navigate to app and clear localStorage via the page
  await gotoApp(page);
  
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) { }
  });

  // Set up the groove with some modifications
  const titleInput = page.locator('#projectTitle');
  await titleInput.fill('Test Groove');

  // Click some steps to create a pattern
  await clickStep(page, 'hihat', 0);
  await clickStep(page, 'snare', 4);

  // Save the groove
  const saveBtn = page.getByRole('button', { name: 'Save Groove' });
  await saveBtn.click();

  // Enter groove name in save dialog
  const grooveNameInput = page.locator('#grooveName');
  await expect(grooveNameInput).toBeVisible();
  await grooveNameInput.fill('My Test Groove');

  // Click save confirm and handle alert
  const saveConfirmBtn = page.locator('#saveConfirmBtn');
  page.once('dialog', dialog => dialog.accept());
  await saveConfirmBtn.click();

  // Give time for save dialog to close
  await page.waitForTimeout(800);

  // Verify save dialog is closed
  const saveDialog = page.locator('#saveDialog');
  await expect(saveDialog).toBeHidden();

  // Load the groove back via load modal
  const loadBtn = page.getByRole('button', { name: 'Load Groove' });
  await loadBtn.click();

  // Wait for the modal to appear
  const loadModal = page.locator('#loadModal');
  await expect(loadModal).toBeVisible();

  // Check that the groove is listed
  const grooveItems = page.locator('.groove-item');
  await expect(grooveItems).toHaveCount(1);

  // Click load button
  const grooveLoadBtn = page.locator('.groove-load-btn').first();
  await grooveLoadBtn.click();

  // Wait for modal to close and time for page to update
  await page.waitForTimeout(500);
  await expect(loadModal).toBeHidden();

  // Verify the groove was loaded
  await expect(titleInput).toHaveValue('Test Groove');
  
  // Verify the steps were restored
  await expect.poll(async () => {
    return page.locator(stepSelector('hihat', 0)).evaluate((step) => step.classList.contains('active'));
  }).toBe(true);
});

test('delete saved groove from localStorage', async ({ page }) => {
  // Navigate to app and clear localStorage via the page
  await gotoApp(page);
  
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) { }
  });

  // Save a groove
  const titleInput = page.locator('#projectTitle');
  await titleInput.fill('Groove to Delete');

  const saveBtn = page.getByRole('button', { name: 'Save Groove' });
  await saveBtn.click();

  const grooveNameInput = page.locator('#grooveName');
  await grooveNameInput.fill('Delete Me');

  const saveConfirmBtn = page.locator('#saveConfirmBtn');
  page.once('dialog', dialog => dialog.accept());
  await saveConfirmBtn.click();

  // Give time for save dialog to close
  await page.waitForTimeout(800);

  // Open load modal to see the groove
  const loadBtn = page.getByRole('button', { name: 'Load Groove' });
  await loadBtn.click();

  const loadModal = page.locator('#loadModal');
  await expect(loadModal).toBeVisible();

  // Verify groove exists
  const grooveItems = page.locator('.groove-item');
  await expect(grooveItems).toHaveCount(1);

  // Click delete button
  const deleteBtn = page.locator('.groove-delete-btn').first();
  
  // Handle the confirmation dialog
  page.once('dialog', dialog => dialog.accept());
  await deleteBtn.click();

  // Give time for deletion to process
  await page.waitForTimeout(500);

  // Verify groove is deleted - check the count should be 0
  await expect(grooveItems).toHaveCount(0);
  
  // Verify "no grooves" message is shown
  const noGroovesMsg = page.locator('#noGroovesMsg');
  await expect(noGroovesMsg).toBeVisible();

  // Close modal
  const modalClose = page.locator('#modalClose');
  await modalClose.click();
  await expect(loadModal).toBeHidden();
});

test('multiple saves and loads work correctly', async ({ page }) => {
  // Navigate to app and clear localStorage via the page
  await gotoApp(page);
  
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) { }
  });

  // Save first groove
  const titleInput = page.locator('#projectTitle');
  await titleInput.fill('Groove 1');

  await clickStep(page, 'hihat', 0);

  let saveBtn = page.getByRole('button', { name: 'Save Groove' });
  await saveBtn.click();

  let grooveNameInput = page.locator('#grooveName');
  await grooveNameInput.fill('First Groove');

  let saveConfirmBtn = page.locator('#saveConfirmBtn');
  page.once('dialog', dialog => dialog.accept());
  await saveConfirmBtn.click();

  // Give time for save dialog to close
  await page.waitForTimeout(800);

  // Clear and save second groove
  let clearBtn = page.getByRole('button', { name: 'Clear' });
  await clearBtn.click();

  await titleInput.fill('Groove 2');
  await clickStep(page, 'snare', 4);

  saveBtn = page.getByRole('button', { name: 'Save Groove' });
  await saveBtn.click();

  grooveNameInput = page.locator('#grooveName');
  await grooveNameInput.fill('Second Groove');

  saveConfirmBtn = page.locator('#saveConfirmBtn');
  page.once('dialog', dialog => dialog.accept());
  await saveConfirmBtn.click();

  // Give time for save dialog to close
  await page.waitForTimeout(800);

  // Open load modal
  let loadBtn = page.getByRole('button', { name: 'Load Groove' });
  await loadBtn.click();

  let loadModal = page.locator('#loadModal');
  await expect(loadModal).toBeVisible();

  // Verify both grooves are listed
  const grooveItems = page.locator('.groove-item');
  await expect(grooveItems).toHaveCount(2);

  // Get all groove names to identify them correctly
  const firstGrooveNameText = await page.locator('.groove-item-name').first().textContent();
  const secondGrooveNameText = await page.locator('.groove-item-name').last().textContent();

  // Load the second groove (most recent - first in the list due to reverse order)
  const loadBtns = page.locator('.groove-load-btn');
  await loadBtns.first().click();

  await page.waitForTimeout(500);
  await expect(loadModal).toBeHidden();

  // Verify the second groove is loaded
  await expect(titleInput).toHaveValue('Groove 2');
  
  // Verify the step pattern from second groove
  await expect.poll(async () => {
    return page.locator(stepSelector('snare', 4)).evaluate((step) => step.classList.contains('active'));
  }).toBe(true);
});

