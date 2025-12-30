# OBF Node

Node.js implementation of the Open Board Format (OBF) validator and converter. This tool allows you to validate OBF/OBZ files and convert them between various formats including PDF, PNG, SFY, and SGRID.

## Installation

```bash
npm install obf-node
```

## CLI Usage

### Validate a file

```bash
obf-node validate path/to/board.obf
```

### Supported formats for conversion to OBF:

- **.sfy** (Sensory Grid Player)
- **.sgrid** (Sensory Grid)
- **.ce** (TouchChat)
- **.spb / .sps** (Snap)
- **.gridset** (Grid3)
- **.obz** (Open Board Zip)
- **.obf** (Open Board Format)
- **.avz** (Asterics Grid)
- **.json** (Generic OBF JSON)

### Convert between formats

You can convert from OBF, OBZ, SFY, SGRID, TouchChat (.ce), Snap (.spb/.sps), or Grid3 (.gridset) to PDF, PNG, OBF, or OBZ.

_Note: The SFY and SGRID converters are ported from the original Ruby codebase and serve as demonstration of how native/proprietary AAC formats can be converted to the Open Board Format._

```bash
# Convert OBF to PDF
obf-node convert path/to/board.obf output.pdf

# Convert OBZ to PNG
obf-node convert path/to/board.obz output.png

# Convert SFY to OBZ (packages the board with its assets)
obf-node convert path/to/board.sfy output.obz

# Convert SGRID to OBF
obf-node convert path/to/board.sgrid output.obf
```

## Library Usage

```javascript
const { Validator, PdfBuilder, Utils, External } = require('obf-node');

// Validate
const result = await Validator.validate_file('path/to/board.obf');
console.log(result.valid ? 'Valid!' : 'Invalid');

// Load and Convert
const board = await Utils.load_obf('path/to/board.obf');
await PdfBuilder.build(board, 'output.pdf');

// Package OBF into OBZ
await External.to_obz(board, 'output.obz');
```

## Requirements for PNG Conversion

PNG conversion currently requires **ImageMagick** (`convert` command) to be installed on your system.

## License

Licensed under the MIT License.
