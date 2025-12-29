# OBF Node

Node.js implementation of the Open Board Format (OBF) validator and converter. This tool allows you to validate OBF/OBZ files and convert them to PDF.

## Installation

```bash
npm install obf-node
```

## CLI Usage

### Validate a file
```bash
obf-node validate path/to/board.obf
```

### Convert to PDF
```bash
obf-node convert path/to/board.obf output.pdf
```

## Library Usage

```javascript
const { Validator, PdfBuilder, Utils } = require('obf-node');

// Validate
const result = await Validator.validate_file('path/to/board.obf');
console.log(result.valid ? "Valid!" : "Invalid");

// Convert
const board = await Utils.load_obf('path/to/board.obf');
await PdfBuilder.build(board, 'output.pdf');
```

## License

Licensed under the MIT License.