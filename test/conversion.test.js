const { Sfy, Sgrid, External, Utils } = require('../src');
const path = require('path');
const fs = require('fs-extra');

describe('Converters', () => {
  const samplesDir = path.join(__dirname, 'samples');

  test('converts sfy.data to OBF', async () => {
    const filePath = path.join(samplesDir, 'sfy.data');
    const result = await Sfy.to_external(filePath);
    expect(result.boards).toBeDefined();
    expect(result.boards.length).toBeGreaterThan(0);
    expect(result.boards[0].format).toBeUndefined(); // External hash doesn't have format yet
  });

  test('converts grid.xml to OBF', async () => {
    const filePath = path.join(samplesDir, 'grid.xml');
    const result = await Sgrid.to_external(filePath);
    expect(result.buttons).toBeDefined();
    expect(result.grid.rows).toBeGreaterThan(0);
  });

  test('packages OBF into OBZ', async () => {
    const board = {
      id: 'test-board',
      name: 'Test Board',
      buttons: [{ id: '1', label: 'Hello' }],
      grid: { rows: 1, columns: 1, order: [['1']] },
    };
    const destPath = path.join(__dirname, 'test_package.obz');
    await External.to_obz(board, destPath);
    expect(await fs.pathExists(destPath)).toBe(true);

    // Verify it's a valid OBZ
    const type = await Utils.identify_file(destPath);
    expect(type).toBe('obz');

    await fs.remove(destPath);
  });
});
