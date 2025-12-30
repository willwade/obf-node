import { Sfy, Sgrid, External, Utils } from '../src';
import path from 'path';
import fs from 'fs-extra';

describe('Converters', () => {
  const samplesDir = path.join(__dirname, 'samples');

  test('converts sfy.data to OBF', async () => {
    const filePath = path.join(samplesDir, 'sfy.data');
    const result = await Sfy.to_external(filePath);
    expect(result.boards).toBeDefined();
    expect(result.boards.length).toBeGreaterThan(0);
    // In the new TS version, boards returned by Sfy.to_external are OBFPage objects which have format
    expect(result.boards[0].format).toBe('open-board-0.1');
  });

  test('converts grid.xml to OBF', async () => {
    const filePath = path.join(samplesDir, 'grid.xml');
    const result = await Sgrid.to_external(filePath);
    expect(result.buttons).toBeDefined();
    expect(result.grid!.rows).toBeGreaterThan(0);
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
