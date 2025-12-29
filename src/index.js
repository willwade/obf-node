const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const Validator = require('./validator-node');
const PdfBuilder = require('./pdf-node');
const Utils = require('./utils-node');
const path = require('path');
const fs = require('fs-extra');

yargs(hideBin(process.argv))
  .command('validate <file>', 'Validate an OBF/OBZ file', (yargs) => {
    return yargs.positional('file', { describe: 'Path to file', type: 'string' })
                .option('json', { describe: 'Output JSON', type: 'boolean' });
  }, async (argv) => {
    const filePath = path.resolve(argv.file);
    if (!argv.json) console.log(`Validating ${filePath}...`);
    try {
      const result = await Validator.validate_file(filePath);
      if (argv.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.valid) {
          console.log("VALID");
        } else {
          console.error("INVALID");
          console.error(`Errors: ${result.errors}`);
          console.error(`Warnings: ${result.warnings}`);
          if (result.results) {
             result.results.forEach(r => {
                 if (!r.valid) console.error(`  - ${r.description}: ${r.error}`);
             });
          }
        }
      }
    } catch (e) {
      if (argv.json) {
        console.log(JSON.stringify({ valid: false, error: e.message }, null, 2));
      } else {
        console.error("Validation failed with exception:", e);
      }
    }
  })
  .command('convert <file> <dest>', 'Convert OBF/OBZ to PDF/PNG', (yargs) => {
    return yargs.positional('file', { describe: 'Input file', type: 'string' })
                .positional('dest', { describe: 'Output file', type: 'string' });
  }, async (argv) => {
    const inputFile = path.resolve(argv.file);
    const destFile = path.resolve(argv.dest);
    const ext = path.extname(destFile).toLowerCase();

    console.log(`Converting ${inputFile} to ${destFile}...`);

    // Load input
    let obj;
    try {
      obj = await Utils.load_obf(inputFile);
    } catch (e) {
      console.error(`Error loading file: ${e.message}`);
      return;
    }

    if (ext === '.pdf') {
      await PdfBuilder.build(obj, destFile);
    } else if (ext === '.png') {
      // Generate PDF first then convert
      const tempPdf = destFile + '.pdf';
      await PdfBuilder.build(obj, tempPdf);
      // Shell out to convert
      const { exec } = require('child_process');
      exec(`convert -density 300 ${tempPdf} ${destFile}`, (err, stdout, stderr) => {
        if (err) {
          console.error("Error converting to PNG:", err);
        } else {
          console.log("Done.");
          fs.unlink(tempPdf);
        }
      });
    } else {
      console.error("Unsupported output format");
    }
  })
  .parse();
