import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

function execSyncCapture(cmd: string): string {
  // Use shell to combine stdout and stderr
  return execSync(cmd, { encoding: 'utf8', shell: '/bin/sh', stdio: 'pipe' });
}

describe('CLI', () => {
  const samplesDir = path.join(__dirname, 'samples');
  const cliPath = path.join(__dirname, '../bin/obf-node');

  test('shows help when no arguments provided', () => {
    expect(() => {
      execSyncCapture(`node ${cliPath}`);
    }).not.toThrow();
  });

  test('validates a valid OBF file', () => {
    const filePath = path.join(samplesDir, 'simple.obf');
    const output = execSyncCapture(`node ${cliPath} validate "${filePath}" 2>&1`);
    expect(output.toUpperCase()).toContain('VALID');
  });

  test('validates an invalid OBF file and shows errors', () => {
    const filePath = path.join(samplesDir, 'aboutme.json');
    const output = execSyncCapture(`node ${cliPath} validate "${filePath}" 2>&1`);
    expect(output.toUpperCase()).toContain('INVALID');
  });

  test('validates an OBZ package', () => {
    const filePath = path.join(samplesDir, 'links.obz');
    const output = execSyncCapture(`node ${cliPath} validate "${filePath}" 2>&1`);
    expect(output.toUpperCase()).toContain('VALIDATING');
  });

  test('converts OBF to PDF', () => {
    const inputFile = path.join(samplesDir, 'simple.obf');
    const outputFile = '/tmp/test-output.pdf';

    // Remove output file if it exists
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    try {
      execSyncCapture(`node ${cliPath} convert "${inputFile}" "${outputFile}" 2>&1`);
      expect(fs.existsSync(outputFile)).toBe(true);
    } finally {
      // Clean up
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  test('converts OBF to OBZ', () => {
    const inputFile = path.join(samplesDir, 'simple.obf');
    const outputFile = '/tmp/test-output.obz';

    // Remove output file if it exists
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    try {
      execSyncCapture(`node ${cliPath} convert "${inputFile}" "${outputFile}" 2>&1`);
      expect(fs.existsSync(outputFile)).toBe(true);
    } finally {
      // Clean up
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  test('outputs JSON format when requested', () => {
    const filePath = path.join(samplesDir, 'simple.obf');
    const output = execSyncCapture(`node ${cliPath} validate "${filePath}" --json 2>&1`);
    const json = JSON.parse(output);
    expect(json).toHaveProperty('valid');
    expect(json).toHaveProperty('errors');
    expect(json).toHaveProperty('warnings');
  });

  test('handles non-existent file gracefully', () => {
    const output = execSyncCapture(`node ${cliPath} validate "/nonexistent/file.obf" 2>&1`);
    expect(output).toContain('Validation failed');
  });

  test('handles unsupported file format', () => {
    const filePath = path.join(samplesDir, 'hash.json');
    const output = execSyncCapture(`node ${cliPath} validate "${filePath}" 2>&1`);
    expect(output.toUpperCase()).toContain('INVALID');
  });
});
