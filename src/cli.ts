import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { Validator } from './validator';
import PdfBuilder from './pdf';
import Utils from './utils';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';

import External from './external';
import Sfy from './converters/sfy';
import Sgrid from './converters/sgrid';
import TouchChat from './converters/touchchat';
import Snap from './converters/snap';
import Grid3 from './converters/grid3';

export function run() {
  yargs(hideBin(process.argv))
    .command(
      'validate <file>',
      'Validate an OBF/OBZ file',
      (yargs) => {
        return yargs
          .positional('file', { describe: 'Path to file', type: 'string' })
          .option('json', { describe: 'Output JSON', type: 'boolean' });
      },
      async (argv: any) => {
        const filePath = path.resolve(argv.file);
        if (!argv.json) console.log(`Validating ${filePath}...`);
        try {
          const result = await Validator.validate_file(filePath);
          if (argv.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (result.valid) {
              console.log('VALID');
            } else {
              console.error('INVALID');
              console.error(`Errors: ${result.errors}`);
              console.error(`Warnings: ${result.warnings}`);
              if (result.results) {
                result.results.forEach((r) => {
                  if (!r.valid) console.error(`  - ${r.description}: ${r.error}`);
                });
              }
            }
          }
        } catch (e: any) {
          if (argv.json) {
            console.log(JSON.stringify({ valid: false, error: e.message }, null, 2));
          } else {
            console.error('Validation failed with exception:', e);
          }
        }
      }
    )
    .command(
      'convert <file> <dest>',
      'Convert OBF/OBZ/SFY/SGRID to PDF/PNG/OBF/OBZ',
      (yargs) => {
        return yargs
          .positional('file', { describe: 'Input file', type: 'string' })
          .positional('dest', { describe: 'Output file', type: 'string' });
      },
      async (argv: any) => {
        const inputFile = path.resolve(argv.file);
        const destFile = path.resolve(argv.dest);
        const outExt = path.extname(destFile).toLowerCase();

        console.log(`Converting ${inputFile} to ${destFile}...`);

        // Load input
        let obj: any;
        try {
          const type = await Utils.identify_file(inputFile);
          if (type === 'sfy') {
            obj = await Sfy.to_external(inputFile);
          } else if (type === 'sgrid') {
            obj = await Sgrid.to_external(inputFile);
          } else if (type === 'touchchat') {
            obj = await TouchChat.to_external(inputFile);
          } else if (type === 'snap') {
            obj = await Snap.to_external(inputFile);
          } else if (type === 'grid3') {
            obj = await Grid3.to_external(inputFile);
          } else {
            obj = await Utils.load_obf(inputFile);
          }
        } catch (e: any) {
          console.error(`Error loading file: ${e.message}`);
          return;
        }

        if (outExt === '.pdf') {
          await PdfBuilder.build(obj, destFile);
        } else if (outExt === '.png') {
          // Generate PDF first then convert
          const tempPdf = destFile + '.pdf';
          await PdfBuilder.build(obj, tempPdf);
          // Shell out to convert
          exec(`convert -density 300 ${tempPdf} ${destFile}`, (err, _stdout, _stderr) => {
            if (err) {
              console.error('Error converting to PNG:', err);
            } else {
              console.log('Done.');
              fs.unlink(tempPdf);
            }
          });
        } else if (outExt === '.obf') {
          let toConvert = obj;
          if (obj.boards && obj.boards.length > 0) {
            toConvert = obj.boards[0];
            toConvert.images = obj.images || [];
            toConvert.sounds = obj.sounds || [];
          }
          await External.to_obf(toConvert, destFile, null, { images: true, sounds: true });
        } else if (outExt === '.obz') {
          await External.to_obz(obj, destFile);
        } else if (outExt === '.gridset') {
          await Grid3.from_external(obj, destFile);
        } else if (outExt === '.spb') {
          await Snap.from_external(obj, destFile);
        } else if (outExt === '.ce') {
          await TouchChat.from_external(obj, destFile);
        } else {
          console.error('Unsupported output format');
        }
      }
    )
    .parse();
}
