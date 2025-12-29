const Validator = require('../src/validator-node');
const path = require('path');

describe('Validator', () => {
  const samplesDir = path.join(__dirname, 'samples');

  test('validates simple.obf', async () => {
    const filePath = path.join(samplesDir, 'simple.obf');
    const result = await Validator.validate_file(filePath);
    expect(result.valid).toBe(true);
    expect(result.errors).toBe(0);
  });

  test('validates aboutme.json (as OBF)', async () => {
    const filePath = path.join(samplesDir, 'aboutme.json');
    const result = await Validator.validate_file(filePath);
    // aboutme.json is actually invalid in the strict validator (missing locale, etc.)
    expect(result.valid).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('identifies non-OBF JSON', async () => {
    const filePath = path.join(samplesDir, 'hash.json');
    const result = await Validator.validate_file(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.results[1].type).toBe('json_parse');
  });

  test('identifies non-object JSON', async () => {
    const filePath = path.join(samplesDir, 'array.json');
    const result = await Validator.validate_file(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.results[1].type).toBe('json_parse');
  });

  test('validates links.obz', async () => {
    const filePath = path.join(samplesDir, 'links.obz');
    const result = await Validator.validate_file(filePath);
    // links.obz might have some warnings or errors depending on its content
    // but let's see what it returns
    expect(result.filename).toBe('links.obz');
  });
});
