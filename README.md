# OBF Node

Node.js implementation of the Open Board Format (OBF) validator and converter. This tool allows you to validate OBF/OBZ files and convert them between various formats including PDF, PNG, SFY, and SGRID.

## Installation

```bash
npm install
npm run build
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

## Library Usage (TypeScript/ESM)

```typescript
import { Validator, PdfBuilder, Utils, External } from 'obf-node';

// Validate
const result = await Validator.validate_file('path/to/board.obf');
console.log(result.valid ? 'Valid!' : 'Invalid');

// Load and Convert
const board = await Utils.load_obf('path/to/board.obf');
await PdfBuilder.build(board, 'output.pdf');

// Package OBF into OBZ
await External.to_obz(board, 'output.obz');
```

### Browser Usage

The library is now universal and can be used in the browser. File-system based methods (`validate_file`, `load_obf`) are only available in Node.js, but you can use `validate_content` and `load_obf_content` with a `Buffer`, `Uint8Array`, or `Blob`.

```typescript
import { Validator, Utils } from 'obf-node';

const file = // ... get from input type="file"
const arrayBuffer = await file.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);

// Validate content
const result = await Validator.validate_content(uint8Array, file.name, file.size);

// Load OBF data
const board = await Utils.load_obf_content(uint8Array, file.name);
```

## Development

-   `npm run build`: Compile TypeScript to `dist`
-   `npm run dev`: Run the CLI directly from TS source using `ts-node`
-   `npm test`: Run tests
-   `npm run lint`: Lint the codebase
-   `npm run format`: Format the codebase with Prettier


## Requirements for PNG Conversion

PNG conversion currently requires **ImageMagick** (`convert` command) to be installed on your system.

## License

Licensed under the MIT License.
