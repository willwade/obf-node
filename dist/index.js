'use strict';
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, 'default', { value: mod, enumerable: true })
      : target,
    mod
  )
);
var __toCommonJS = (mod) => __copyProps(__defProp({}, '__esModule', { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  External: () => external_default,
  Grid3: () => grid3_default,
  PdfBuilder: () => pdf_default,
  Picto4me: () => picto4me_default,
  Sfy: () => sfy_default,
  Sgrid: () => sgrid_default,
  Snap: () => snap_default,
  TouchChat: () => touchchat_default,
  Utils: () => utils_default,
  Validator: () => Validator,
});
module.exports = __toCommonJS(index_exports);

// src/validator.ts
var import_jszip2 = __toESM(require('jszip'));

// src/utils.ts
var import_axios = __toESM(require('axios'));
var import_jszip = __toESM(require('jszip'));
var import_plist = __toESM(require('plist'));
var import_xml2js = __toESM(require('xml2js'));
var import_tinycolor2 = __toESM(require('tinycolor2'));
var import_mime_types = __toESM(require('mime-types'));
var fs = null;
var path = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    fs = require('fs-extra');
    path = require('path');
  } catch (_e) {}
}
var Utils = {
  async get_url(url) {
    if (!url) return null;
    let contentType = '';
    let data;
    if (url.match(/^data:/)) {
      const parts = url.split(',');
      const meta = parts[0].split(';');
      contentType = meta[0].split(':')[1];
      const base64 = parts[1];
      if (typeof Buffer !== 'undefined') {
        data = Buffer.from(base64, 'base64');
      } else {
        const bin = atob(base64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        data = arr.buffer;
      }
    } else {
      try {
        const response = await import_axios.default.get(url, { responseType: 'arraybuffer' });
        contentType = response.headers['content-type'];
        data = response.data;
      } catch (e) {
        console.error(`FAILED TO RETRIEVE ${url} ${e.message}`);
        return null;
      }
    }
    const extension = import_mime_types.default.extension(contentType)
      ? `.${import_mime_types.default.extension(contentType)}`
      : '';
    return {
      content_type: contentType,
      data,
      extension,
    };
  },
  async identify_content(content, filename) {
    const name = filename.toLowerCase();
    if (name.endsWith('.obf')) return 'obf';
    if (name.endsWith('.obz')) return 'obz';
    if (name.endsWith('.ce')) return 'touchchat';
    if (name.endsWith('.gridset')) return 'grid3';
    if (name.endsWith('.spb') || name.endsWith('.sps')) return 'snap';
    if (name.endsWith('.avz')) return 'avz';
    const contentStr = typeof content === 'string' ? content : content.toString();
    try {
      const json = JSON.parse(contentStr);
      if (json && typeof json === 'object') {
        if (json.format && json.format.match(/^open-board-/)) {
          return 'obf';
        }
        return 'json_not_obf';
      }
      return 'json_not_object';
    } catch (_e) {}
    try {
      const parsedPlist = import_plist.default.parse(contentStr);
      if (
        parsedPlist &&
        parsedPlist.$objects &&
        parsedPlist.$objects.some((o) => o.$classname === 'SYWord')
      ) {
        return 'sfy';
      }
    } catch (_e) {}
    try {
      const parser = new import_xml2js.default.Parser();
      const xml = await parser.parseStringPromise(contentStr);
      if (xml && xml.sensorygrid) {
        return 'sgrid';
      }
    } catch (_e) {}
    try {
      const zip = await import_jszip.default.loadAsync(content);
      if (zip.file('manifest.json')) {
        const manifestContent = await zip.file('manifest.json').async('string');
        const json = JSON.parse(manifestContent);
        if (json.root && json.format && json.format.match(/^open-board-/)) {
          return 'obz';
        }
      }
      const jsFiles = Object.keys(zip.files).filter((n) => n.endsWith('.js'));
      if (jsFiles.length > 0) {
        const jsContent = await zip.file(jsFiles[0]).async('string');
        const jsJson = JSON.parse(jsContent);
        if (jsJson.locale && jsJson.sheets) {
          return 'picto4me';
        }
      }
    } catch (_e) {}
    return 'unknown';
  },
  async identify_file(filePath) {
    if (!fs) throw new Error('File system access not available in this environment');
    const name = path.basename(filePath);
    const content = await fs.readFile(filePath);
    return this.identify_content(content, name);
  },
  fix_color(str, type = 'hex') {
    const color = (0, import_tinycolor2.default)(str);
    if (type === 'hex') {
      return color.toHexString();
    }
    return color.toString();
  },
  async load_obf_content(content, filename) {
    const type = await this.identify_content(content, filename);
    if (type === 'obf') {
      const contentStr = content.toString();
      return JSON.parse(contentStr);
    } else if (type === 'obz') {
      const zip = await import_jszip.default.loadAsync(content);
      const manifestStr = await zip.file('manifest.json').async('string');
      const manifest = JSON.parse(manifestStr);
      const rootPath = manifest.root;
      const rootStr = await zip.file(rootPath).async('string');
      const root = JSON.parse(rootStr);
      if (manifest.paths && manifest.paths.boards) {
        root.boards = [];
        for (const [_id, boardPath] of Object.entries(manifest.paths.boards)) {
          if (boardPath === rootPath) continue;
          const boardStr = await zip.file(boardPath).async('string');
          const board = JSON.parse(boardStr);
          root.boards.push(board);
        }
      }
      return root;
    } else {
      throw new Error(`Unsupported file type for OBF loading: ${type}`);
    }
  },
  async load_obf(filePath) {
    if (!fs) throw new Error('File system access not available in this environment');
    const content = await fs.readFile(filePath);
    return this.load_obf_content(content, path.basename(filePath));
  },
  parse_obf(obj, _opts = {}) {
    let json = obj;
    if (typeof obj === 'string') {
      json = JSON.parse(obj);
    }
    ['images', 'sounds', 'buttons'].forEach((key) => {
      if (json[key] && !Array.isArray(json[key])) {
        const arr = [];
        Object.keys(json[key]).forEach((id) => {
          const item = json[key][id];
          if (item) {
            item.id = item.id || id;
            arr.push(item);
          }
        });
        json[key] = arr;
      }
    });
    return json;
  },
};
var utils_default = Utils;

// src/validator.ts
var OBF_FORMAT = 'open-board-0.1';
var OBF_FORMAT_CURRENT_VERSION = 0.1;
var fs2 = null;
var path2 = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    fs2 = require('fs-extra');
    path2 = require('path');
  } catch (_e) {}
}
var ValidationError = class extends Error {
  constructor(message, blocker = false) {
    super(message);
    this.blocker = blocker;
  }
};
var Validator = class _Validator {
  constructor() {
    this._errors = 0;
    this._warnings = 0;
    this._checks = [];
    this._sub_checks = [];
    this._blocked = false;
    this._errors = 0;
    this._warnings = 0;
    this._checks = [];
    this._sub_checks = [];
    this._blocked = false;
  }
  async add_check(type, description, checkFn) {
    if (this._blocked) return;
    const checkObj = { type, description, valid: true };
    this._checks.push(checkObj);
    try {
      await checkFn();
    } catch (e) {
      if (e instanceof ValidationError) {
        this._errors++;
        checkObj.valid = false;
        checkObj.error = e.message;
        if (e.blocker) this._blocked = true;
      } else {
        throw e;
      }
    }
  }
  err(message, blocker = false) {
    throw new ValidationError(message, blocker);
  }
  warn(message) {
    this._warnings++;
    const lastCheck = this._checks[this._checks.length - 1];
    lastCheck.warnings = lastCheck.warnings || [];
    lastCheck.warnings.push(message);
  }
  get errors() {
    return this._errors;
  }
  get warnings() {
    return this._warnings;
  }
  static async validate_file(filePath) {
    if (!fs2) throw new Error('File system access not available in this environment');
    const content = await fs2.readFile(filePath);
    const stats = await fs2.stat(filePath);
    return this.validate_content(content, path2.basename(filePath), stats.size);
  }
  static async validate_content(content, filename, filesize) {
    const type = await utils_default.identify_content(content, filename);
    if (type === 'obf') {
      return await this.validate_obf_content_static(content.toString(), filename, filesize);
    } else if (type === 'obz') {
      return await this.validate_obz_content_static(content, filename, filesize);
    } else {
      const res = {
        filename,
        filesize,
        valid: false,
        errors: 1,
        warnings: 0,
        results: [
          {
            type: 'valid_file',
            description: 'valid .obf or .obz file',
            valid: false,
            error: 'file must be a single .obf JSON file or a .obz zip package',
          },
        ],
      };
      if (type === 'json_not_obf') {
        res.results.push({
          type: 'json_parse',
          description: 'valid JSON object',
          valid: false,
          error: 'file contains a JSON object but it does not appear to be an OBF-formatted object',
        });
      } else if (type === 'json_not_object') {
        res.results.push({
          type: 'json_parse',
          description: 'valid JSON object',
          valid: false,
          error:
            'file contains valid JSON, but a type other than Object. OBF files do not support arrays, strings, etc. as the root object',
        });
      }
      return res;
    }
  }
  static async validate_obf_content_static(content, filename, filesize, opts = {}) {
    const v = new _Validator();
    const results = await v.validate_obf_content(content, filename, opts);
    return {
      filename,
      filesize,
      valid: v.errors === 0,
      errors: v.errors,
      warnings: v.warnings,
      results,
    };
  }
  static async validate_obf_file(filePath, opts = {}) {
    if (!fs2) throw new Error('File system access not available in this environment');
    const fn = path2.basename(filePath);
    const content = await fs2.readFile(filePath, 'utf8');
    const filesize = (await fs2.stat(filePath)).size;
    return this.validate_obf_content_static(content, fn, filesize, opts);
  }
  static async validate_obz_content_static(content, filename, filesize) {
    const v = new _Validator();
    const [results, sub_results] = await v.validate_obz_content_buffer(content, filename);
    const totalErrors = v.errors + sub_results.reduce((acc, r) => acc + (r.errors || 0), 0);
    const totalWarnings = v.warnings + sub_results.reduce((acc, r) => acc + (r.warnings || 0), 0);
    return {
      filename,
      filesize,
      valid: totalErrors === 0,
      errors: totalErrors,
      warnings: totalWarnings,
      results,
      sub_results,
    };
  }
  static async validate_obz_file(filePath) {
    if (!fs2) throw new Error('File system access not available in this environment');
    const content = await fs2.readFile(filePath);
    const filesize = (await fs2.stat(filePath)).size;
    return this.validate_obz_content_static(content, path2.basename(filePath), filesize);
  }
  async validate_obz_content_buffer(zipContent, filename) {
    await this.add_check('filename', 'file name', async () => {
      if (!filename.match(/\.obz$/)) this.warn('filename should end with .obz');
    });
    let zip = null;
    let valid_zip = false;
    await this.add_check('zip', 'valid zip', async () => {
      try {
        zip = await import_jszip2.default.loadAsync(zipContent);
        valid_zip = true;
      } catch (_e) {
        this.err('file is not a valid zip package');
      }
    });
    const sub_results = [];
    if (valid_zip && zip) {
      let json = null;
      await this.add_check('manifest', 'manifest.json', async () => {
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) {
          this.err('manifest.json is required in the zip package');
          return;
        }
        try {
          const manifestStr = await manifestFile.async('string');
          json = JSON.parse(manifestStr);
        } catch (_e) {
          json = null;
        }
        if (!json) this.err('manifest.json must contain a valid JSON structure');
      });
      if (json) {
        await this.add_check('manifest_format', 'manifest.json format version', async () => {
          if (!json.format) {
            this.err('format attribute is required, set to ' + OBF_FORMAT);
            return;
          }
          const version = parseFloat(json.format.split('-').pop());
          if (version > OBF_FORMAT_CURRENT_VERSION) {
            this.err(
              `format version (${version}) is invalid, current version is ${OBF_FORMAT_CURRENT_VERSION}`
            );
          } else if (version < OBF_FORMAT_CURRENT_VERSION) {
            this.warn(
              `format version (${version}) is old, consider updating to ${OBF_FORMAT_CURRENT_VERSION}`
            );
          }
        });
        await this.add_check('manifest_root', 'manifest.json root attribute', async () => {
          if (!json.root) this.err('root attribute is required');
          if (!zip.file(json.root)) {
            this.err('root attribute must reference a file in the package');
          }
        });
        await this.add_check('manifest_paths', 'manifest.json paths attribute', async () => {
          if (!json.paths || typeof json.paths !== 'object') {
            this.err('paths attribute must be a valid hash');
          }
          if (!json.paths.boards || typeof json.paths.boards !== 'object') {
            this.err('paths.boards must be a valid hash');
          }
        });
        await this.add_check('manifest_extras', 'manifest.json extra attributes', async () => {
          const attrs = ['format', 'root', 'paths'];
          Object.keys(json).forEach((key) => {
            if (!attrs.includes(key) && !key.startsWith('ext_')) {
              this.warn(
                `${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });
          const pathAttrs = ['boards', 'images', 'sounds'];
          Object.keys(json.paths || {}).forEach((key) => {
            if (!pathAttrs.includes(key) && !key.startsWith('ext_')) {
              this.warn(
                `paths.${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });
        });
        const foundPaths = ['manifest.json'];
        if (json.paths && json.paths.boards) {
          for (const [id, boardPath] of Object.entries(json.paths.boards)) {
            foundPaths.push(boardPath);
            await this.add_check(
              `manifest_boards[${id}]`,
              `manifest.json path.boards.${id}`,
              async () => {
                const bFile2 = zip.file(boardPath);
                if (!bFile2) {
                  this.err(`board path (${boardPath}) not found in the zip package`);
                  return;
                }
                try {
                  const boardStr = await bFile2.async('string');
                  const boardJson = JSON.parse(boardStr);
                  if (!boardJson || boardJson.id !== id) {
                    const boardId = (boardJson && boardJson.id) || 'null';
                    this.err(
                      `board at path (${boardPath}) defined in manifest with id "${id}" but actually has id "${boardId}"`
                    );
                  }
                } catch (_e) {
                  this.err(`could not parse board at path (${boardPath})`);
                }
              }
            );
            const bFile = zip.file(boardPath);
            if (bFile) {
              const bStr = await bFile.async('string');
              const bData = await bFile.async('uint8array');
              const sub = await _Validator.validate_obf_content_static(
                bStr,
                boardPath,
                bData.length,
                { zipper: zip }
              );
              sub_results.push(sub);
            }
          }
        }
        if (json.paths && json.paths.images) {
          for (const [_id, imgPath] of Object.entries(json.paths.images)) {
            foundPaths.push(imgPath);
            await this.add_check(
              `manifest_images[${_id}]`,
              `manifest.json path.images.${_id}`,
              async () => {
                if (!zip.file(imgPath)) {
                  this.err(`image path (${imgPath}) not found in the zip package`);
                }
              }
            );
          }
        }
        if (json.paths && json.paths.sounds) {
          for (const [_id, soundPath] of Object.entries(json.paths.sounds)) {
            foundPaths.push(soundPath);
            await this.add_check(
              `manifest_sounds[${_id}]`,
              `manifest.json path.sounds.${_id}`,
              async () => {
                if (!zip.file(soundPath)) {
                  this.err(`sound path (${soundPath}) not found in the zip package`);
                }
              }
            );
          }
        }
        const actualPaths = Object.keys(zip.files);
        await this.add_check('extra_paths', 'manifest.json extra paths', async () => {
          actualPaths.forEach((p) => {
            if (!foundPaths.includes(p) && !p.endsWith('/')) {
              this.warn(`the file "${p}" isn't listed in manifest.json`);
            }
          });
        });
        this._sub_checks = sub_results;
      }
    }
    return [this._checks, this._sub_checks];
  }
  async validate_obf_content(content, filename, opts = {}) {
    await this.add_check('filename', 'file name', async () => {
      if (!filename.match(/\.obf$/)) this.warn('filename should end with .obf');
    });
    let json = null;
    await this.add_check('valid_json', 'JSON file', async () => {
      try {
        json = JSON.parse(content);
      } catch (_e) {
        this.err("Couldn't parse as JSON", true);
      }
    });
    if (!json) return this._checks;
    const ext = json;
    await this.add_check('format_version', 'format version', async () => {
      if (!ext.format) {
        this.err('format attribute is required, set to ' + OBF_FORMAT);
        return;
      }
      const versionStr = ext.format.split('-').pop();
      const version = parseFloat(versionStr);
      if (version > OBF_FORMAT_CURRENT_VERSION) {
        this.err(
          `format version (${version}) is invalid, current version is ${OBF_FORMAT_CURRENT_VERSION}`
        );
      } else if (version < OBF_FORMAT_CURRENT_VERSION) {
        this.warn(
          `format version (${version}) is old, consider updating to ${OBF_FORMAT_CURRENT_VERSION}`
        );
      }
    });
    await this.add_check('id', 'board ID', async () => {
      if (!ext.id) this.err('id attribute is required');
    });
    await this.add_check('locale', 'locale', async () => {
      if (!ext.locale) this.err('locale attribute is required, please set to "en" for English');
    });
    await this.add_check('extras', 'extra attributes', async () => {
      const attrs = [
        'format',
        'id',
        'locale',
        'url',
        'data_url',
        'name',
        'description_html',
        'default_layout',
        'buttons',
        'images',
        'sounds',
        'grid',
        'license',
      ];
      Object.keys(ext).forEach((key) => {
        if (!attrs.includes(key) && !key.startsWith('ext_')) {
          this.warn(
            `${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
          );
        }
      });
    });
    await this.add_check('description', 'descriptive attributes', async () => {
      if (!ext.name) this.warn('name attribute is strongly recommended');
      if (!ext.description_html) this.warn('description_html attribute is recommended');
    });
    await this.add_check('background', 'background attribute', async () => {
      if (ext.background && typeof ext.background !== 'object') {
        this.err('background attribute must be a hash');
      }
    });
    await this.add_check('buttons', 'buttons attribute', async () => {
      if (!ext.buttons) this.err('buttons attribute is required');
      if (!Array.isArray(ext.buttons)) this.err('buttons attribute must be an array');
    });
    await this.add_check('grid', 'grid attribute', async () => {
      if (!ext.grid) {
        this.err('grid attribute is required');
        return;
      }
      if (typeof ext.grid !== 'object') {
        this.err('grid attribute must be a hash');
        return;
      }
      if (typeof ext.grid.rows !== 'number' || ext.grid.rows < 1)
        this.err('grid.rows must be a positive number');
      if (typeof ext.grid.columns !== 'number' || ext.grid.columns < 1)
        this.err('grid.columns must be a positive number');
      if (!ext.grid.order || !Array.isArray(ext.grid.order)) {
        this.err('grid.order must be an array of arrays');
        return;
      }
      if (ext.grid.order.length !== ext.grid.rows)
        this.err(
          `grid.order length (${ext.grid.order.length}) must match grid.rows (${ext.grid.rows})`
        );
      if (!ext.grid.order.every((r) => Array.isArray(r) && r.length === ext.grid.columns)) {
        this.err(
          `grid.order must contain ${ext.grid.rows} arrays each of size ${ext.grid.columns}`
        );
      }
    });
    await this.add_check('grid_ids', 'button IDs in grid.order attribute', async () => {
      const buttonIds = (ext.buttons || []).map((b) => b.id);
      const usedButtonIds = [];
      if (ext.grid && ext.grid.order) {
        ext.grid.order.forEach((row) => {
          if (Array.isArray(row)) {
            row.forEach((id) => {
              if (id !== null && id !== void 0) {
                usedButtonIds.push(id);
                if (!buttonIds.includes(id)) {
                  this.err(
                    `grid.order references button with id ${id} but no button with that id found in buttons attribute`
                  );
                }
              }
            });
          }
        });
      }
      if (usedButtonIds.length === 0) this.warn('board has no buttons defined in the grid');
      const unusedIds = buttonIds.filter((id) => !usedButtonIds.includes(id));
      if (unusedIds.length > 0) {
        this.warn(
          `not all defined buttons were included in the grid order (${unusedIds.join(',')})`
        );
      }
    });
    await this.add_check('images', 'images attribute', async () => {
      if (!ext.images) this.err('images attribute is required');
      if (!Array.isArray(ext.images)) this.err('images attribute must be an array');
    });
    if (Array.isArray(ext.images)) {
      for (let i = 0; i < ext.images.length; i++) {
        const image = ext.images[i];
        await this.add_check(`image[${i}]`, `image at images[${i}]`, async () => {
          if (typeof image !== 'object') {
            this.err('image must be a hash');
            return;
          }
          if (!image.id) this.err('image.id is required');
          if (!image.width || typeof image.width !== 'number' || image.width < 1)
            this.warn('image.width should be a valid positive number');
          if (!image.height || typeof image.height !== 'number' || image.height < 1)
            this.warn('image.height should be a valid positive number');
          if (!image.content_type || !image.content_type.match(/^image\/.+$/))
            this.err('image.content_type must be a valid image mime type');
          if (!image.url && !image.data && !image.symbol && !image.path)
            this.err('image must have data, url, path or symbol attribute defined');
          const imageAttrs = [
            'id',
            'width',
            'height',
            'content_type',
            'data',
            'url',
            'symbol',
            'path',
            'data_url',
            'license',
          ];
          Object.keys(image).forEach((key) => {
            if (!imageAttrs.includes(key) && !key.startsWith('ext_')) {
              this.warn(
                `image.${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });
        });
      }
    }
    await this.add_check('sounds', 'sounds attribute', async () => {
      if (!ext.sounds) this.err('sounds attribute is required');
      if (!Array.isArray(ext.sounds)) this.err('sounds attribute must be an array');
    });
    if (Array.isArray(ext.sounds)) {
      for (let i = 0; i < ext.sounds.length; i++) {
        const sound = ext.sounds[i];
        await this.add_check(`sounds[${i}]`, `sound at sounds[${i}]`, async () => {
          if (typeof sound !== 'object') {
            this.err('sound must be a hash');
            return;
          }
          if (!sound.id) this.err('sound.id is required');
          if (
            sound.duration !== void 0 &&
            (typeof sound.duration !== 'number' || sound.duration < 0)
          )
            this.err('sound.duration must be a valid positive number');
          if (!sound.content_type || !sound.content_type.match(/^audio\/.+$/))
            this.err('sound.content_type must be a valid audio mime type');
          if (!sound.url && !sound.data && !sound.symbol && !sound.path)
            this.err('sound must have data, url, path or symbol attribute defined');
        });
      }
    }
    if (Array.isArray(ext.buttons)) {
      for (let i = 0; i < ext.buttons.length; i++) {
        const button = ext.buttons[i];
        await this.add_check(`buttons[${i}]`, `button at buttons[${i}]`, async () => {
          if (typeof button !== 'object') {
            this.err('button must be a hash');
            return;
          }
          if (!button.id) this.err('button.id is required');
          if (!button.label) this.err('button.label is required');
          ['top', 'left', 'width', 'height'].forEach((attr) => {
            if (button[attr] !== void 0 && (typeof button[attr] !== 'number' || button[attr] < 0)) {
              this.warn(`button.${attr} should be a positive number`);
            }
          });
          ['background_color', 'border_color'].forEach((color) => {
            if (button[color]) {
              if (
                !button[color].match(
                  /^\s*rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[01]?\.?\d*)?\)\s*/
                )
              ) {
                this.err(
                  `button.${color} must be a valid rgb or rgba value if defined ("${button[color]}" is invalid)`
                );
              }
            }
          });
          if (button.hidden !== void 0 && typeof button.hidden !== 'boolean') {
            this.err('button.hidden must be a boolean if defined');
          }
          if (!button.image_id) {
            this.warn('button.image_id is recommended');
          }
          if (
            button.action &&
            typeof button.action === 'string' &&
            !button.action.match(/^(:|\+)/)
          ) {
            this.err('button.action must start with either : or + if defined');
          }
          if (button.actions && !Array.isArray(button.actions)) {
            this.err('button.actions must be an array of strings');
          }
          const buttonAttrs = [
            'id',
            'label',
            'vocalization',
            'image_id',
            'sound_id',
            'hidden',
            'background_color',
            'border_color',
            'action',
            'actions',
            'load_board',
            'top',
            'left',
            'width',
            'height',
          ];
          Object.keys(button).forEach((key) => {
            if (!buttonAttrs.includes(key) && !key.startsWith('ext_')) {
              this.warn(
                `button.${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });
          if (button.load_board && button.load_board.path) {
            if (!opts.zipper) {
              this.err("button.load_board.path is set but this isn't a zipped file");
            } else {
              const loadBoardFile = opts.zipper.file(button.load_board.path);
              if (!loadBoardFile) {
                this.err(
                  `button.load_board.path references ${button.load_board.path} which isn't found in the zipped file`
                );
              } else {
                try {
                  const boardStr = await loadBoardFile.async('string');
                  const boardJson = JSON.parse(boardStr);
                  if (!boardJson || !boardJson.id) {
                    this.err(
                      `button.load_board.path references ${button.load_board.path} which isn't found in the zipped file`
                    );
                  }
                } catch (_e) {
                  this.err(
                    `button.load_board.path references ${button.load_board.path} which isn't found in the zipped file`
                  );
                }
              }
            }
          }
        });
      }
    }
    return this._checks;
  }
};

// src/pdf.ts
var import_pdfkit = __toESM(require('pdfkit'));
var import_fs_extra = __toESM(require('fs-extra'));
var import_axios2 = __toESM(require('axios'));
var PdfBuilder = class {
  static async build(obj, destPath, opts = {}) {
    const doc = new import_pdfkit.default({
      layout: 'landscape',
      size: [11 * 72, 8.5 * 72],
      // Letter landscape
      info: {
        Title: obj.name || 'Communication Board',
      },
      autoFirstPage: false,
    });
    const stream = import_fs_extra.default.createWriteStream(destPath);
    doc.pipe(stream);
    if (obj.boards && obj.boards.length > 0) {
      const pkg = obj;
      for (let i = 0; i < pkg.boards.length; i++) {
        const board = pkg.boards[i];
        doc.addPage();
        await this.buildPage(doc, board, {
          ...opts,
          pageNum: i + 1,
          totalPages: pkg.boards.length,
        });
      }
    } else {
      const board = obj;
      doc.addPage();
      await this.buildPage(doc, board, opts);
    }
    doc.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(destPath));
      stream.on('error', reject);
    });
  }
  static async buildPage(doc, board, opts) {
    const docWidth = doc.page.width;
    const docHeight = doc.page.height;
    const headerHeight = opts.headerless ? 0 : 80;
    const padding = 10;
    const textHeight = 20;
    if (!opts.headerless) {
      doc.rect(0, 0, docWidth, headerHeight).fill('#eeeeee');
      const buttons = [
        { label: 'Go Back', x: 10, color: '#6D81D1' },
        { label: 'Say that out loud', x: 120, w: 200, color: '#DDDB54' },
        { label: 'Start Over', x: docWidth - 320, color: '#5c9c6d' },
        { label: 'Oops', x: docWidth - 210, color: '#6653a6' },
        { label: 'Stop', x: docWidth - 100, color: '#944747' },
        { label: 'Clear', x: docWidth - 430, color: '#888888' },
      ];
      buttons.forEach((btn) => {
        doc
          .rect(btn.x, 10, btn.w || 80, 60)
          .fill(btn.color)
          .stroke('#888888');
        doc
          .fillColor('#000000')
          .fontSize(10)
          .text(btn.label, btn.x, 35, { width: btn.w || 80, align: 'center' });
      });
    }
    if (board.grid && board.grid.rows > 0 && board.grid.columns > 0) {
      const gridHeight = docHeight - headerHeight - textHeight - padding * 2;
      const gridWidth = docWidth;
      const buttonHeight = (gridHeight - padding * (board.grid.rows - 1)) / board.grid.rows;
      const buttonWidth = (gridWidth - padding * (board.grid.columns - 1)) / board.grid.columns;
      for (let row = 0; row < board.grid.rows; row++) {
        for (let col = 0; col < board.grid.columns; col++) {
          const buttonId = board.grid.order[row] ? board.grid.order[row][col] : null;
          const button = (board.buttons || []).find((b) => b.id === buttonId);
          if (!button || button.hidden) continue;
          const x = padding * col + col * buttonWidth;
          const y = headerHeight + padding + row * (buttonHeight + padding);
          const bgColor =
            button.background_color || button.style?.background_color
              ? utils_default.fix_color(
                  button.background_color || button.style?.background_color,
                  'hex'
                )
              : '#ffffff';
          const borderColor =
            button.border_color || button.style?.border_color
              ? utils_default.fix_color(button.border_color || button.style?.border_color, 'hex')
              : '#eeeeee';
          doc.roundedRect(x, y, buttonWidth, buttonHeight, 5).fillAndStroke(bgColor, borderColor);
          const label = button.label || button.vocalization || '';
          const fontColor = button.style?.font_color
            ? utils_default.fix_color(button.style.font_color, 'hex')
            : '#000000';
          doc.fillColor(fontColor).fontSize(12);
          const labelY = opts.text_on_top ? y + 5 : y + buttonHeight - textHeight - 5;
          doc.text(label, x, labelY, { width: buttonWidth, align: 'center' });
          if (button.image_id) {
            const image = (board.images || []).find((i) => i.id === button.image_id);
            if (image) {
              try {
                let imageBuffer = null;
                if (image.data) {
                  const base64Data = image.data.includes(',')
                    ? image.data.split(',')[1]
                    : image.data;
                  imageBuffer = Buffer.from(base64Data, 'base64');
                } else if (image.url) {
                  const response = await import_axios2.default.get(image.url, {
                    responseType: 'arraybuffer',
                  });
                  imageBuffer = Buffer.from(response.data);
                }
                if (imageBuffer) {
                  const imgY = opts.text_on_top ? y + textHeight + 5 : y + 5;
                  const imgHeight = buttonHeight - textHeight - 10;
                  doc.image(imageBuffer, x + 5, imgY, {
                    fit: [buttonWidth - 10, imgHeight],
                    align: 'center',
                    valign: 'center',
                  });
                }
              } catch (_e) {
                doc.rect(x + 10, y + 10, buttonWidth - 20, buttonHeight - 40).stroke();
                doc
                  .fontSize(8)
                  .text('Img Err', x + 10, y + 30, { width: buttonWidth - 20, align: 'center' });
              }
            }
          }
        }
      }
    }
  }
};
var pdf_default = PdfBuilder;

// src/external.ts
var import_fs_extra2 = __toESM(require('fs-extra'));
var import_jszip3 = __toESM(require('jszip'));
var import_tinycolor22 = __toESM(require('tinycolor2'));
var External = {
  trim_empties(hash) {
    const new_hash = {};
    Object.keys(hash).forEach((key) => {
      if (hash[key] != null) {
        new_hash[key] = hash[key];
      }
    });
    return new_hash;
  },
  parse_license(pre_license) {
    if (!pre_license || typeof pre_license !== 'object') {
      pre_license = {};
    }
    const license = {};
    const attrs = [
      'type',
      'copyright_notice_url',
      'source_url',
      'author_name',
      'author_url',
      'author_email',
      'uneditable',
      'copyright_notice_link',
      'source_link',
      'author_link',
    ];
    attrs.forEach((attr) => {
      if (pre_license[attr] != null) {
        if (attr === 'copyright_notice_link' && !pre_license['copyright_notice_url']) {
          license['copyright_notice_url'] = pre_license[attr];
        } else if (attr === 'source_link' && !pre_license['source_url']) {
          license['source_url'] = pre_license[attr];
        } else if (attr === 'author_link' && !pre_license['author_url']) {
          license['author_url'] = pre_license[attr];
        } else if (!attr.includes('_link')) {
          license[attr] = pre_license[attr];
        }
      }
    });
    license.type = license.type || 'private';
    return license;
  },
  fix_color(str, targetFormat = 'rgb') {
    const color = (0, import_tinycolor22.default)(str);
    if (targetFormat === 'hex') {
      return color.toHexString();
    }
    return color.toRgbString();
  },
  async to_obf(hash, destPath = null, pathHash = null, toInclude = {}) {
    const to_include = { images: true, sounds: true, ...toInclude };
    const res = {
      format: 'open-board-0.1',
      id: hash.id || Math.random().toString(36).substring(2, 15),
      locale: hash.locale || 'en',
      name: hash.name,
      description_html: hash.description_html,
      url: hash.url,
      data_url: hash.data_url,
      default_layout: hash.default_layout || 'landscape',
      background: hash.background,
      buttons: [],
      images: [],
      sounds: [],
      grid: hash.grid || { rows: 1, columns: 1, order: [[null]] },
    };
    if (hash.license) {
      res.license = this.parse_license(hash.license);
    }
    Object.keys(hash).forEach((key) => {
      if (key.startsWith('ext_')) {
        res[key] = hash[key];
      }
    });
    const images = hash.images || [];
    const sounds = hash.sounds || [];
    const buttons = hash.buttons || [];
    const imageSet = /* @__PURE__ */ new Set();
    const soundSet = /* @__PURE__ */ new Set();
    for (const originalButton of buttons) {
      const button = {
        id: originalButton.id,
        label: originalButton.label,
        vocalization: originalButton.vocalization,
        action: originalButton.action,
        actions: originalButton.actions,
        left: originalButton.left,
        top: originalButton.top,
        width: originalButton.width,
        height: originalButton.height,
        border_color: originalButton.border_color
          ? this.fix_color(originalButton.border_color, 'rgb')
          : void 0,
        background_color: originalButton.background_color
          ? this.fix_color(originalButton.background_color || '#ffffff', 'rgb')
          : void 0,
      };
      if (!button.border_color) delete button.border_color;
      if (!button.background_color) delete button.background_color;
      if (!button.left) delete button.left;
      if (!button.top) delete button.top;
      if (!button.width) delete button.width;
      if (!button.height) delete button.height;
      if (!button.action) delete button.action;
      if (!button.actions) delete button.actions;
      if (originalButton.load_board) {
        button.load_board = {
          id: originalButton.load_board.id,
          url: originalButton.load_board.url,
          data_url: originalButton.load_board.data_url,
        };
        if (
          pathHash &&
          pathHash.included_boards &&
          pathHash.included_boards[originalButton.load_board.id]
        ) {
          button.load_board.path = `board_${originalButton.load_board.id}.obf`;
        }
      }
      if (originalButton.translations) {
        button.translations = {};
        Object.keys(originalButton.translations).forEach((loc) => {
          const hash2 = originalButton.translations[loc];
          if (typeof hash2 === 'object') {
            button.translations[loc] = {};
            if (hash2.label) button.translations[loc].label = hash2.label.toString();
            if (hash2.vocalization)
              button.translations[loc].vocalization = hash2.vocalization.toString();
            if (hash2.inflections) {
              button.translations[loc].inflections = {};
              Object.keys(hash2.inflections).forEach((key) => {
                if (key.startsWith('ext_')) {
                  button.translations[loc].inflections[key] = hash2.inflections[key];
                } else {
                  button.translations[loc].inflections[key] = hash2.inflections[key].toString();
                }
              });
            }
            Object.keys(hash2).forEach((key) => {
              if (key.startsWith('ext_')) {
                button.translations[loc][key] = hash2[key];
              }
            });
          }
        });
      }
      if (originalButton.hidden !== void 0) {
        button.hidden = originalButton.hidden;
      }
      if (originalButton.url) {
        button.url = originalButton.url;
      }
      Object.keys(originalButton).forEach((key) => {
        if (key.startsWith('ext_')) {
          button[key] = originalButton[key];
        }
      });
      if (originalButton.image_id) {
        const image = images.find((i) => i.id === originalButton.image_id);
        if (image) {
          imageSet.add(image.id);
          button.image_id = image.id;
        }
      }
      if (originalButton.sound_id) {
        const sound = sounds.find((s) => s.id === originalButton.sound_id);
        if (sound) {
          soundSet.add(sound.id);
          button.sound_id = sound.id;
        }
      }
      res.buttons.push(this.trim_empties(button));
    }
    if (to_include.images) {
      for (const originalImage of images) {
        if (!imageSet.has(originalImage.id) && !images.includes(originalImage)) continue;
        const image = {
          id: originalImage.id,
          width: originalImage.width,
          height: originalImage.height,
          content_type: originalImage.content_type,
          license: originalImage.license ? this.parse_license(originalImage.license) : void 0,
          protected: originalImage.protected,
          protected_source: originalImage.protected_source,
          url: originalImage.url,
          data: originalImage.data,
          data_url: originalImage.data_url,
        };
        if (!image.license) delete image.license;
        if (pathHash && pathHash.zip) {
          const imageId = image.id.toString();
          if (pathHash.images && pathHash.images[imageId]) {
            image.path = pathHash.images[imageId].path;
            image.content_type = image.content_type || pathHash.images[imageId].content_type;
            image.width = image.width || pathHash.images[imageId].width;
            image.height = image.height || pathHash.images[imageId].height;
          } else {
            const imageFetch = await utils_default.get_url(image.url || image.data);
            if (imageFetch) {
              const zipPath = `images/image_${imageId}${imageFetch.extension}`;
              pathHash.images = pathHash.images || {};
              pathHash.images[imageId] = {
                path: zipPath,
                content_type: imageFetch.content_type,
                width: image.width || 300,
                height: image.height || 300,
              };
              await pathHash.zip.file(zipPath, imageFetch.data);
              image.path = zipPath;
              delete image.data;
            }
          }
        }
        res.images.push(this.trim_empties(image));
      }
    } else if (to_include.image_urls) {
      for (const originalImage of images) {
        if (!imageSet.has(originalImage.id)) continue;
        const image = {
          id: originalImage.id,
          width: originalImage.width,
          height: originalImage.height,
          license: originalImage.license ? this.parse_license(originalImage.license) : void 0,
          protected: originalImage.protected,
          protected_source: originalImage.protected_source,
          url: originalImage.url,
          data_url: originalImage.data_url,
          content_type: originalImage.content_type,
        };
        if (!image.license) delete image.license;
        res.images.push(this.trim_empties(image));
      }
    }
    if (to_include.sounds) {
      for (const originalSound of sounds) {
        if (!soundSet.has(originalSound.id)) continue;
        const sound = {
          id: originalSound.id,
          duration: originalSound.duration,
          content_type: originalSound.content_type,
          license: originalSound.license ? this.parse_license(originalSound.license) : void 0,
          protected: originalSound.protected,
          protected_source: originalSound.protected_source,
          url: originalSound.url,
          data: originalSound.data,
          data_url: originalSound.data_url,
        };
        if (!sound.license) delete sound.license;
        if (pathHash && pathHash.zip) {
          const soundId = sound.id.toString();
          if (pathHash.sounds && pathHash.sounds[soundId]) {
            sound.path = pathHash.sounds[soundId].path;
          } else {
            const soundFetch = await utils_default.get_url(sound.url || sound.data);
            if (soundFetch) {
              const zipPath = `sounds/sound_${soundId}${soundFetch.extension}`;
              pathHash.sounds = pathHash.sounds || {};
              pathHash.sounds[soundId] = { path: zipPath };
              await pathHash.zip.file(zipPath, soundFetch.data);
              sound.path = zipPath;
              delete sound.data;
            }
          }
        }
        res.sounds.push(this.trim_empties(sound));
      }
    } else if (to_include.sound_urls) {
      for (const originalSound of sounds) {
        if (!soundSet.has(originalSound.id)) continue;
        const sound = {
          id: originalSound.id,
          duration: originalSound.duration,
          content_type: originalSound.content_type,
          license: originalSound.license ? this.parse_license(originalSound.license) : void 0,
          protected: originalSound.protected,
          protected_source: originalSound.protected_source,
          url: originalSound.url,
          data_url: originalSound.data_url,
        };
        if (!sound.license) delete sound.license;
        res.sounds.push(this.trim_empties(sound));
      }
    }
    if (pathHash && pathHash.zip) {
      const zipPath = `board_${res.id}.obf`;
      pathHash.boards = pathHash.boards || {};
      pathHash.boards[res.id] = { path: zipPath };
      await pathHash.zip.file(zipPath, JSON.stringify(res, null, 2));
    } else if (destPath) {
      await import_fs_extra2.default.writeJson(destPath, res, { spaces: 2 });
    }
    return destPath;
  },
  async to_obz(content, destPath, opts = {}) {
    let boards = content.boards;
    if (content.id && !boards) {
      boards = [content];
    }
    const paths = {
      images: {},
      sounds: {},
      boards: {},
      included_boards: {},
      zip: new import_jszip3.default(),
    };
    const rootBoard = boards[0];
    const to_include = opts.to_include || { images: true, sounds: true };
    boards.forEach((b) => {
      paths.included_boards[b.id] = b;
    });
    for (const b of boards) {
      b.images = content.images || b.images || [];
      b.sounds = content.sounds || b.sounds || [];
      await this.to_obf(b, null, paths, to_include);
    }
    const manifest = {
      format: 'open-board-0.1',
      root: paths.boards[rootBoard.id].path,
      paths: {
        boards: {},
        images: {},
        sounds: {},
      },
    };
    Object.keys(paths.boards).forEach((id) => (manifest.paths.boards[id] = paths.boards[id].path));
    Object.keys(paths.images).forEach((id) => (manifest.paths.images[id] = paths.images[id].path));
    Object.keys(paths.sounds).forEach((id) => (manifest.paths.sounds[id] = paths.sounds[id].path));
    await paths.zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const buffer = await paths.zip.generateAsync({ type: 'nodebuffer' });
    await import_fs_extra2.default.writeFile(destPath, buffer);
    return destPath;
  },
  async from_obf(obfJsonOrPath, opts = {}) {
    let obj;
    if (typeof obfJsonOrPath === 'string') {
      const content = await import_fs_extra2.default.readFile(obfJsonOrPath, 'utf8');
      obj = JSON.parse(content);
    } else {
      obj = obfJsonOrPath;
    }
    if (opts.zipper && opts.manifest) {
      const manifest = opts.manifest;
      if (obj.images) {
        for (const image of obj.images) {
          if (image.image_id && !image.path && !image.data) {
            const img = obj.images?.find((i) => i.id === image.image_id);
            if (img && manifest.paths?.images?.[image.image_id]) {
              image.path = manifest.paths.images[image.image_id];
            }
          }
        }
      }
      if (obj.sounds) {
        for (const sound of obj.sounds) {
          if (sound.sound_id && !sound.path && !sound.data) {
            const snd = obj.sounds?.find((s) => s.id === sound.sound_id);
            if (snd && manifest.paths?.sounds?.[sound.sound_id]) {
              sound.path = manifest.paths.sounds[sound.sound_id];
            }
          }
        }
      }
    }
    ['images', 'sounds', 'buttons'].forEach((key) => {
      if (obj[key] && !Array.isArray(obj[key])) {
        const arr = [];
        Object.keys(obj[key]).forEach((id) => {
          const item = obj[key][id];
          if (item) {
            item.id = item.id || id;
            arr.push(item);
          }
        });
        obj[key] = arr;
      }
    });
    if (obj.license) {
      obj.license = this.parse_license(obj.license);
    }
    return obj;
  },
  async from_obz(obzPath) {
    const content = await import_fs_extra2.default.readFile(obzPath);
    const zip = await import_jszip3.default.loadAsync(content);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('No manifest.json found in OBZ file');
    }
    const manifestContent = await manifestFile.async('string');
    const manifest = JSON.parse(manifestContent);
    const boards = [];
    const images = [];
    const sounds = [];
    const visitedBoardIds = /* @__PURE__ */ new Set();
    const unvisitedBoards = [];
    const rootPath = manifest.root;
    const rootFile = zip.file(rootPath);
    if (!rootFile) {
      throw new Error(`Root board file not found: ${rootPath}`);
    }
    const rootContent = await rootFile.async('string');
    const rootBoard = await this.from_obf(JSON.parse(rootContent), { zipper: zip, manifest });
    rootBoard.path = rootPath;
    unvisitedBoards.push(rootBoard);
    visitedBoardIds.add(rootBoard.id);
    while (unvisitedBoards.length > 0) {
      const board = unvisitedBoards.shift();
      boards.push(board);
      if (board.buttons) {
        for (const button of board.buttons) {
          if (button.load_board?.id) {
            const linkedBoardId = button.load_board.id;
            if (!visitedBoardIds.has(linkedBoardId)) {
              const linkedPath = button.load_board.path || manifest.paths?.boards?.[linkedBoardId];
              if (linkedPath) {
                const linkedFile = zip.file(linkedPath);
                if (linkedFile) {
                  const linkedContent = await linkedFile.async('string');
                  const linkedBoard = await this.from_obf(JSON.parse(linkedContent), {
                    zipper: zip,
                    manifest,
                  });
                  linkedBoard.path = linkedPath;
                  button.load_board.id = linkedBoard.id;
                  unvisitedBoards.push(linkedBoard);
                  visitedBoardIds.add(linkedBoard.id);
                }
              }
            }
          }
        }
      }
    }
    boards.forEach((board) => {
      if (board.images) {
        images.push(...board.images);
      }
      if (board.sounds) {
        sounds.push(...board.sounds);
      }
    });
    const uniqueImages = images.filter(
      (img, index, self) => index === self.findIndex((i) => i.id === img.id)
    );
    const uniqueSounds = sounds.filter(
      (snd, index, self) => index === self.findIndex((s) => s.id === snd.id)
    );
    if (uniqueImages.length !== images.length) {
      throw new Error('Image ids must be present and unique');
    }
    if (uniqueSounds.length !== sounds.length) {
      throw new Error('Sound ids must be present and unique');
    }
    return {
      boards,
      images: uniqueImages,
      sounds: uniqueSounds,
    };
  },
};
var external_default = External;

// src/converters/sfy.ts
var import_plist2 = __toESM(require('plist'));
var import_fs_extra3 = __toESM(require('fs-extra'));
var Sfy = {
  async to_external(filePath) {
    const content = await import_fs_extra3.default.readFile(filePath, 'utf8');
    const data = import_plist2.default.parse(content);
    const objects = data['$objects'];
    const items = {
      strings: {},
      buttons: [],
    };
    const boardIds = {};
    const images = [];
    objects.forEach((item, idx) => {
      if (typeof item === 'string') {
        items.strings[idx] = item;
      } else if (item && typeof item === 'object' && item.mScreen !== void 0) {
        if (item.wordKey !== void 0) item.word = objects[item.wordKey];
        if (item.imageName !== void 0) item.symbol = objects[item.imageName];
        boardIds[item.mScreen] = true;
        items.buttons.push(item);
      }
    });
    const boards = [];
    let imageCounter = 0;
    const colors = {
      0: 'rgb(255, 255, 255)',
      // white
      1: 'rgb(255, 0, 0)',
      // red
      3: 'rgb(255, 112, 156)',
      // red pink
      2: 'rgb(255, 115, 222)',
      // pinky purple
      4: 'rgb(250, 196, 140)',
      // light red-orange
      5: 'rgb(255, 196, 87)',
      // orange
      6: 'rgb(255, 234, 117)',
      // yellow
      7: 'rgb(255, 241, 92)',
      // yellowy
      8: 'rgb(252, 242, 134)',
      // light yellow
      9: 'rgb(82, 209, 86)',
      // dark green
      10: 'rgb(149, 189, 42)',
      // navy green
      11: 'rgb(161, 245, 113)',
      // green
      12: 'rgb(196, 252, 141)',
      // pale green
      13: 'rgb(94, 207, 255)',
      // strong blue
      14: 'rgb(148, 223, 255)',
      // happy blue
      15: 'rgb(176, 223, 255)',
      // bluey
      16: 'rgb(194, 241, 255)',
      // light blue
      17: 'rgb(118, 152, 199)',
      // dark purple
      18: 'rgb(208, 190, 232)',
      // light purple
      19: 'rgb(153, 79, 0)',
      // brown
      20: 'rgb(0, 109, 235)',
      // dark blue
      21: 'rgb(0, 0, 0)',
      // black
      22: 'rgb(161, 161, 161)',
      // gray
      23: 'rgb(255, 108, 59)',
      // dark orange
    };
    Object.keys(boardIds).forEach((screenIdx) => {
      const idx = parseInt(screenIdx);
      const name = idx === 0 ? 'HOME' : `Screen ${idx}`;
      const rawButtons = items.buttons.filter((b) => b.mScreen === idx);
      let maxRow = 0;
      let maxCol = 0;
      rawButtons.forEach((b) => {
        maxRow = Math.max(maxRow, b.mRow);
        maxCol = Math.max(maxCol, b.mColumn);
      });
      const rows = maxRow + 1;
      const columns = maxCol + 1;
      const grid = {
        rows,
        columns,
        order: Array.from({ length: rows }, () => Array(columns).fill(null)),
      };
      const buttons = [];
      let buttonCounter = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
          const rawButton = rawButtons.find((b) => b.mRow === i && b.mColumn === j);
          if (rawButton) {
            let imageId = null;
            if (rawButton.symbol) {
              images.push({
                id: imageCounter.toString(),
                content_type: 'image/png',
                symbol: {
                  set: 'sfy',
                  name: rawButton.symbol,
                },
              });
              imageId = imageCounter;
              imageCounter++;
            }
            const button = {
              id: buttonCounter.toString(),
              label: rawButton.word || ' ',
              background_color: colors[rawButton.backgroundColorID] || 'rgb(255,255,255)',
              image_id: imageId !== null ? imageId.toString() : null,
              hidden: !rawButton.isOpen,
              ext_sfy_isLinked: rawButton.isLinked,
              ext_sfy_isProtected: rawButton.isProtected,
              ext_sfy_backgroundColorID: rawButton.backgroundColorID,
            };
            if (rawButton.customLabel && objects[rawButton.customLabel]) {
              button.vocalization = button.label;
              button.label = objects[rawButton.customLabel];
            }
            if (idx === 0 && rawButton.isLinked && boardIds[buttonCounter + 1]) {
              button.load_board = { id: (buttonCounter + 1).toString() };
            }
            grid.order[i][j] = button.id;
            buttons.push(button);
          }
          buttonCounter++;
        }
      }
      boards.push({
        id: idx.toString(),
        name,
        format: 'open-board-0.1',
        buttons,
        grid,
        images: [],
        sounds: [],
        ext_sfy_screen: idx,
      });
    });
    return {
      boards,
      images,
      sounds: [],
    };
  },
};
var sfy_default = Sfy;

// src/converters/sgrid.ts
var import_xml2js2 = __toESM(require('xml2js'));
var import_fs_extra4 = __toESM(require('fs-extra'));
var Sgrid = {
  async to_external(filePath) {
    const content = await import_fs_extra4.default.readFile(filePath, 'utf8');
    const parser = new import_xml2js2.default.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(content);
    const gridData = result.sensorygrid.grid;
    const rows = parseInt(gridData.rows);
    const columns = parseInt(gridData.cols);
    const board = {
      id: 'sgrid',
      format: 'open-board-0.1',
      name: gridData.titlebartext || 'board',
      grid: {
        rows,
        columns,
        order: Array.from({ length: rows }, () => Array(columns).fill(null)),
      },
      buttons: [],
      images: [],
      sounds: [],
    };
    const extPrefix = 'ext_sgrid_';
    [
      'selfclosing',
      'titlebartext',
      'customblockscan',
      'predictionsource',
      'oskcellratio',
      'workspace_x',
      'workspace_y',
      'eyegazemonitor_x',
      'eyegazemonitor_y',
    ].forEach((attr) => {
      if (gridData[attr]) board[extPrefix + attr] = gridData[attr];
    });
    if (gridData.background) {
      board[extPrefix + 'background'] = {
        style: gridData.background.$.style,
        backcolour: gridData.background.backcolour,
        backcolour2: gridData.background.backcolour2,
        picformat: gridData.background.picformat,
        tilepicture: gridData.background.tilepicture,
      };
    }
    const cellsArr = Array.isArray(gridData.cells.cell)
      ? gridData.cells.cell
      : [gridData.cells.cell];
    let imageIdCounter = 0;
    cellsArr.forEach((cell, idx) => {
      const col = parseInt(cell.$.x) - 1;
      const row = parseInt(cell.$.y) - 1;
      const button = {
        id: idx.toString(),
        label: cell.caption || ' ',
      };
      ['stylepreset', 'scanblock', 'magnifyx', 'magnifyy', 'tooltip', 'directactivate'].forEach(
        (attr) => {
          if (cell[attr]) button[extPrefix + attr] = cell[attr];
        }
      );
      const preset = button[extPrefix + 'stylepreset'];
      if (preset === 'Blank cell (no style)') {
        button.background_color = 'rgb(255, 255, 255)';
        button.border_color = 'rgb(150, 150, 150)';
      } else if (preset === 'Jump cell') {
        button.background_color = 'rgb(200, 225, 255)';
        button.border_color = 'rgb(95, 135, 185)';
      } else if (preset === 'Action cell') {
        button.background_color = 'rgb(255, 200, 200)';
        button.border_color = 'rgb(155, 75, 75)';
      } else if (preset === 'Vocab cell') {
        button.background_color = 'rgb(255, 255, 155)';
        button.border_color = 'rgb(150, 135, 32)';
      }
      if (cell.commands && cell.commands.command) {
        const commands = Array.isArray(cell.commands.command)
          ? cell.commands.command
          : [cell.commands.command];
        commands.forEach((cmd) => {
          const type = cmd.id;
          if (type === 'type') {
            button.vocalization = Array.isArray(cmd.parameter)
              ? cmd.parameter[0]._
              : cmd.parameter._;
          } else if (type === 'action.clear') {
            button.action = ':clear';
          } else {
            button.action = ':' + extPrefix + type;
          }
        });
      }
      if (cell.hidden === 'true') button.hidden = true;
      if (cell.picture) {
        const match = cell.picture.match(/^(\[\w+\])?(.+)$/);
        const symbolSet = match && match[1] ? match[1].slice(1, -1) : null;
        const filename = match && match[2] ? match[2] : cell.picture;
        const image = {
          id: imageIdCounter.toString(),
          content_type: 'image/png',
        };
        if (symbolSet) {
          image.symbol = { set: symbolSet, filename };
        } else {
          image[extPrefix + 'filename'] = filename;
        }
        board.images.push(image);
        button.image_id = image.id;
        imageIdCounter++;
      }
      board.buttons.push(button);
      if (row >= 0 && row < rows && col >= 0 && col < columns) {
        board.grid.order[row][col] = button.id;
      }
    });
    return board;
  },
};
var sgrid_default = Sgrid;

// src/converters/touchchat.ts
var import_fs_extra5 = __toESM(require('fs-extra'));
var import_path = __toESM(require('path'));
var import_os = __toESM(require('os'));
var import_adm_zip = __toESM(require('adm-zip'));
var import_better_sqlite3 = __toESM(require('better-sqlite3'));
var TouchChat = {
  async to_external(filePath) {
    const tmpDir = import_fs_extra5.default.mkdtempSync(
      import_path.default.join(import_os.default.tmpdir(), 'touchchat-')
    );
    let db = null;
    let imageDb = null;
    try {
      const zip = new import_adm_zip.default(filePath);
      zip.extractAllTo(tmpDir, true);
      const files = import_fs_extra5.default.readdirSync(tmpDir);
      const vocabFile = files.find((f) => f.endsWith('.c4v'));
      if (!vocabFile) {
        throw new Error('No .c4v vocab DB found in TouchChat export');
      }
      const dbPath = import_path.default.join(tmpDir, vocabFile);
      db = new import_better_sqlite3.default(dbPath, { readonly: true });
      const idMappings = /* @__PURE__ */ new Map();
      try {
        const mappings = db.prepare('SELECT numeric_id, string_id FROM page_id_mapping').all();
        mappings.forEach((m) => idMappings.set(m.numeric_id, m.string_id));
      } catch (_e) {}
      const variables = {};
      try {
        db.prepare('SELECT name, value FROM variables')
          .all()
          .forEach((v) => {
            variables[v.name] = v.value;
          });
      } catch (_e) {}
      const buttonStyles = /* @__PURE__ */ new Map();
      const pageStyles = /* @__PURE__ */ new Map();
      try {
        db.prepare('SELECT * FROM button_styles')
          .all()
          .forEach((s) => buttonStyles.set(s.id, s));
        db.prepare('SELECT * FROM page_styles')
          .all()
          .forEach((s) => pageStyles.set(s.id, s));
      } catch (_e) {}
      const intToHex = (colorInt) => {
        if (colorInt === null || typeof colorInt === 'undefined') return void 0;
        return `#${(colorInt & 16777215).toString(16).padStart(6, '0')}`;
      };
      const imageDbPath = import_path.default.join(tmpDir, 'Images.c4s');
      const imagesMap = /* @__PURE__ */ new Map();
      if (import_fs_extra5.default.existsSync(imageDbPath)) {
        imageDb = new import_better_sqlite3.default(imageDbPath, { readonly: true });
        try {
          const symbolLinks = db.prepare('SELECT id, rid FROM symbol_links').all();
          const ridToImage = /* @__PURE__ */ new Map();
          const symbols = imageDb.prepare('SELECT rid, data FROM symbols').all();
          symbols.forEach((s) => {
            ridToImage.set(s.rid, s.data);
          });
          symbolLinks.forEach((link) => {
            const data = ridToImage.get(link.rid);
            if (data) {
              const imageId = `img_${link.id}`;
              imagesMap.set(link.id, {
                id: imageId,
                data: data.toString('base64'),
                content_type: 'image/png',
                // Assuming PNG for symbols
              });
            }
          });
        } catch (_e) {}
      }
      const pages = db
        .prepare(
          `
        SELECT p.*, r.name
        FROM pages p
        JOIN resources r ON r.id = p.resource_id
      `
        )
        .all();
      const result = {
        format: 'open-board-0.1',
        boards: [],
        images: [],
        sounds: [],
      };
      const boardsMap = /* @__PURE__ */ new Map();
      pages.forEach((pageRow) => {
        const pageId = idMappings.get(pageRow.id) || String(pageRow.id);
        const style = pageStyles.get(pageRow.page_style_id);
        const board = {
          id: pageId,
          name: pageRow.name || '',
          format: 'open-board-0.1',
          buttons: [],
          grid: {
            rows: 1,
            columns: 1,
            order: [[null]],
          },
          style: {
            background_color: intToHex(style?.bg_color),
          },
          images: [],
          sounds: [],
          ext_touchchat_variables: variables,
        };
        boardsMap.set(pageRow.id, board);
        result.boards.push(board);
      });
      const buttonBoxCells = db
        .prepare(
          `
        SELECT bbc.*, b.*, bb.id as box_id, bb.layout_x, bb.layout_y
        FROM button_box_cells bbc
        JOIN buttons b ON b.resource_id = bbc.resource_id
        JOIN button_boxes bb ON bb.id = bbc.button_box_id
      `
        )
        .all();
      const buttonBoxes = /* @__PURE__ */ new Map();
      buttonBoxCells.forEach((cell) => {
        if (!buttonBoxes.has(cell.box_id)) {
          buttonBoxes.set(cell.box_id, {
            cells: [],
            layout_x: cell.layout_x,
            layout_y: cell.layout_y,
          });
        }
        buttonBoxes.get(cell.box_id).cells.push(cell);
      });
      const navActions = /* @__PURE__ */ new Map();
      try {
        db.prepare(
          `
          SELECT b.id as button_id, ad.value as target_page_id
          FROM buttons b
          JOIN actions a ON a.resource_id = b.resource_id
          JOIN action_data ad ON ad.action_id = a.id
          WHERE a.code = 1
        `
        )
          .all()
          .forEach((nav) => {
            navActions.set(nav.button_id, parseInt(nav.target_page_id));
          });
      } catch (_e) {}
      const boxInstances = db.prepare('SELECT * FROM button_box_instances').all();
      boxInstances.forEach((instance) => {
        const board = boardsMap.get(instance.page_id);
        const box = buttonBoxes.get(instance.button_box_id);
        if (board && box) {
          const cols = box.layout_x || instance.size_x || 1;
          const rows = box.layout_y || instance.size_y || 1;
          board.grid.columns = Math.max(board.grid.columns, cols);
          board.grid.rows = Math.max(board.grid.rows, rows);
          if (board.grid.order.length < rows || board.grid.order[0].length < cols) {
            const newOrder = Array.from({ length: rows }, () => Array(cols).fill(null));
            board.grid.order.forEach((r, rowIdx) => {
              r.forEach((cell, colIdx) => {
                if (newOrder[rowIdx]) newOrder[rowIdx][colIdx] = cell;
              });
            });
            board.grid.order = newOrder;
          }
          box.cells.forEach((cell) => {
            const style = buttonStyles.get(cell.button_style_id);
            const buttonId = String(cell.id);
            const targetId = navActions.get(cell.id);
            const button = {
              id: buttonId,
              label: cell.label || ' ',
              vocalization: cell.message || ' ',
              style: {
                background_color: intToHex(style?.body_color),
                border_color: intToHex(style?.border_color),
                font_color: intToHex(style?.font_color),
              },
            };
            if (cell.visible === 0) {
              button.hidden = true;
            }
            if (cell.symbol_link_id && imagesMap.has(cell.symbol_link_id)) {
              const img = imagesMap.get(cell.symbol_link_id);
              if (!board.images.find((i) => i.id === img.id)) {
                board.images.push(img);
              }
              button.image_id = img.id;
            }
            if (cell.pronunciation) {
              button.ext_touchchat_pronunciation = cell.pronunciation;
            }
            if (targetId) {
              const mappedTargetId = idMappings.get(targetId) || String(targetId);
              button.load_board = { id: mappedTargetId };
            }
            board.buttons.push(button);
            const x = cell.location % cols;
            const y = Math.floor(cell.location / cols);
            if (board.grid.order[y]) {
              board.grid.order[y][x] = buttonId;
            }
          });
        }
      });
      result.boards = result.boards.filter((b) =>
        b.buttons.some(
          (btn) => !btn.hidden && ((btn.label && btn.label.trim() !== '') || btn.image_id)
        )
      );
      return result;
    } finally {
      if (db) db.close();
      if (imageDb) imageDb.close();
      import_fs_extra5.default.removeSync(tmpDir);
    }
  },
  async from_external(obf, outputPath) {
    const tmpDir = import_fs_extra5.default.mkdtempSync(
      import_path.default.join(import_os.default.tmpdir(), 'touchchat-out-')
    );
    const vocabPath = import_path.default.join(tmpDir, 'vocab.c4v');
    const imagesPath = import_path.default.join(tmpDir, 'Images.c4s');
    const db = new import_better_sqlite3.default(vocabPath);
    try {
      db.exec(`
        CREATE TABLE resources (id INTEGER PRIMARY KEY, rid TEXT UNIQUE, name TEXT, type INTEGER);
        CREATE TABLE pages (id INTEGER PRIMARY KEY, resource_id INTEGER UNIQUE, symbol_link_id INTEGER, page_style_id INTEGER, button_style_id INTEGER, feature INTEGER);
        CREATE TABLE buttons (id INTEGER PRIMARY KEY, resource_id INTEGER, label TEXT, message TEXT, symbol_link_id INTEGER, visible INTEGER, button_style_id INTEGER, pronunciation TEXT);
        CREATE TABLE button_boxes (id INTEGER PRIMARY KEY, resource_id INTEGER, layout_x INTEGER, layout_y INTEGER);
        CREATE TABLE button_box_instances (id INTEGER PRIMARY KEY, page_id INTEGER, button_box_id INTEGER, position_x INTEGER, position_y INTEGER, size_x INTEGER, size_y INTEGER);
        CREATE TABLE button_box_cells (id INTEGER PRIMARY KEY, button_box_id INTEGER, resource_id INTEGER, location INTEGER, span_x INTEGER, span_y INTEGER);
        CREATE TABLE page_id_mapping (numeric_id INTEGER, string_id TEXT);
        CREATE TABLE variables (id INTEGER PRIMARY KEY, name TEXT, value TEXT);
        CREATE TABLE symbol_links (id INTEGER PRIMARY KEY, rid TEXT, feature INTEGER);
        CREATE TABLE actions (id INTEGER PRIMARY KEY, resource_id INTEGER, rank INTEGER, code INTEGER);
        CREATE TABLE action_data (id INTEGER PRIMARY KEY, action_id INTEGER, key INTEGER, value TEXT);
      `);
      const boards = obf.boards || [obf];
      const vars = boards[0]?.ext_touchchat_variables || {};
      Object.entries(vars).forEach(([k, v]) => {
        db.prepare('INSERT INTO variables (name, value) VALUES (?, ?)').run(k, String(v));
      });
      let resIdCounter = 1;
      let pageIdCounter = 1;
      let btnIdCounter = 1;
      let boxIdCounter = 1;
      let actionIdCounter = 1;
      let symLinkIdCounter = 1;
      const imageDb = new import_better_sqlite3.default(imagesPath);
      imageDb.exec(
        'CREATE TABLE symbols (id INTEGER PRIMARY KEY, rid TEXT UNIQUE, data BLOB, compressed INTEGER, type INTEGER, width INTEGER, height INTEGER)'
      );
      const imageMap = /* @__PURE__ */ new Map();
      (obf.images || []).forEach((img, idx) => {
        const rid = `{IMAGE-${idx}}`;
        imageDb
          .prepare(
            'INSERT INTO symbols (rid, data, compressed, type, width, height) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(rid, Buffer.from(img.data, 'base64'), 0, 1, 100, 100);
        imageMap.set(img.id, rid);
      });
      imageDb.close();
      boards.forEach((board) => {
        const numericPageId = pageIdCounter++;
        const pageResId = resIdCounter++;
        db.prepare('INSERT INTO resources (id, rid, name, type) VALUES (?, ?, ?, ?)').run(
          pageResId,
          `{PAGE-${numericPageId}}`,
          board.name,
          1
        );
        db.prepare(
          'INSERT INTO pages (id, resource_id, page_style_id, button_style_id) VALUES (?, ?, 1, 1)'
        ).run(numericPageId, pageResId);
        db.prepare('INSERT INTO page_id_mapping (numeric_id, string_id) VALUES (?, ?)').run(
          numericPageId,
          board.id
        );
        const currentBoxId = boxIdCounter++;
        const boxResId = resIdCounter++;
        db.prepare('INSERT INTO resources (id, rid, name, type) VALUES (?, ?, ?, ?)').run(
          boxResId,
          `{BOX-${currentBoxId}}`,
          `Box for ${board.name}`,
          6
        );
        db.prepare(
          'INSERT INTO button_boxes (id, resource_id, layout_x, layout_y) VALUES (?, ?, ?, ?)'
        ).run(currentBoxId, boxResId, board.grid?.columns || 1, board.grid?.rows || 1);
        db.prepare(
          'INSERT INTO button_box_instances (page_id, button_box_id, position_x, position_y, size_x, size_y) VALUES (?, ?, 0, 0, ?, ?)'
        ).run(numericPageId, currentBoxId, board.grid?.columns || 1, board.grid?.rows || 1);
        board.buttons.forEach((btn, idx) => {
          const numericBtnId = btnIdCounter++;
          const btnResId = resIdCounter++;
          let currentSymId = null;
          if (btn.image_id && imageMap.has(btn.image_id)) {
            currentSymId = symLinkIdCounter++;
            db.prepare('INSERT INTO symbol_links (id, rid, feature) VALUES (?, ?, 14)').run(
              currentSymId,
              imageMap.get(btn.image_id)
            );
          }
          db.prepare('INSERT INTO resources (id, rid, name, type) VALUES (?, ?, ?, ?)').run(
            btnResId,
            `{BTN-${numericBtnId}}`,
            btn.label,
            1
          );
          db.prepare(
            'INSERT INTO buttons (id, resource_id, label, message, symbol_link_id, button_style_id, pronunciation) VALUES (?, ?, ?, ?, ?, 1, ?)'
          ).run(
            numericBtnId,
            btnResId,
            btn.label,
            btn.vocalization || btn.label,
            currentSymId,
            btn.ext_touchchat_pronunciation || null
          );
          if (btn.load_board) {
            const actId = actionIdCounter++;
            db.prepare('INSERT INTO actions (id, resource_id, rank, code) VALUES (?, ?, 1, 1)').run(
              actId,
              btnResId,
              1
            );
            db.prepare('INSERT INTO action_data (action_id, key, value) VALUES (?, 1, ?)').run(
              actId,
              btn.load_board.id
            );
          }
          let loc = idx;
          if (board.grid?.order) {
            board.grid.order.forEach((row, r) => {
              row.forEach((bid, c) => {
                if (bid === btn.id) loc = r * (board.grid.columns || 1) + c;
              });
            });
          }
          db.prepare(
            'INSERT INTO button_box_cells (button_box_id, resource_id, location, span_x, span_y) VALUES (?, ?, ?, 1, 1)'
          ).run(currentBoxId, btnResId, loc);
        });
      });
    } finally {
      db.close();
      const zip = new import_adm_zip.default();
      zip.addLocalFile(vocabPath);
      zip.addLocalFile(imagesPath);
      zip.writeZip(outputPath);
      import_fs_extra5.default.removeSync(tmpDir);
    }
  },
};
var touchchat_default = TouchChat;

// src/converters/snap.ts
var import_fs_extra6 = __toESM(require('fs-extra'));
var import_better_sqlite32 = __toESM(require('better-sqlite3'));
var Snap = {
  async to_external(filePath) {
    let db = null;
    try {
      db = new import_better_sqlite32.default(filePath, { readonly: true });
      const pages = db.prepare('SELECT * FROM Page').all();
      const idToUniqueId = {};
      pages.forEach((p) => {
        idToUniqueId[String(p.Id)] = String(p.UniqueId || p.Id);
      });
      const pageSetProps = {};
      try {
        const props = db.prepare('SELECT * FROM PageSetProperties LIMIT 1').get();
        if (props) {
          Object.assign(pageSetProps, props);
        }
      } catch (_e) {}
      const imagesMap = /* @__PURE__ */ new Map();
      try {
        const images = db
          .prepare('SELECT Id, Identifier, Data FROM PageSetData WHERE Identifier LIKE "IMG:%"')
          .all();
        images.forEach((img) => {
          imagesMap.set(img.Id, {
            id: `img_${img.Id}`,
            data: img.Data.toString('base64'),
            content_type: 'image/png',
            // Guessing PNG
            ext_snap_identifier: img.Identifier,
          });
        });
      } catch (_e) {}
      const result = {
        format: 'open-board-0.1',
        boards: [],
        images: [],
        sounds: [],
      };
      const boardsMap = /* @__PURE__ */ new Map();
      pages.forEach((pageRow) => {
        const uniqueId = idToUniqueId[String(pageRow.Id)];
        const board = {
          id: uniqueId,
          name: pageRow.Title || pageRow.Name || '',
          format: 'open-board-0.1',
          buttons: [],
          grid: {
            rows: 1,
            columns: 1,
            order: [[null]],
          },
          style: {
            background_color: pageRow.BackgroundColor
              ? `#${(pageRow.BackgroundColor & 16777215).toString(16).padStart(6, '0')}`
              : void 0,
          },
          images: [],
          sounds: [],
          ext_snap_technical_id: pageRow.Id,
          ext_snap_pageset_properties: pageSetProps,
        };
        boardsMap.set(pageRow.Id, board);
        result.boards.push(board);
      });
      const buttons = db
        .prepare(
          `
        SELECT b.*, ep.GridPosition, er.PageId, er.BackgroundColor as RefBackgroundColor, er.ForegroundColor as RefForegroundColor
        FROM Button b
        INNER JOIN ElementReference er ON b.ElementReferenceId = er.Id
        LEFT JOIN ElementPlacement ep ON ep.ElementReferenceId = er.Id
        GROUP BY b.Id
      `
        )
        .all();
      buttons.forEach((btnRow) => {
        const board = result.boards.find((b) => b.ext_snap_technical_id === btnRow.PageId);
        if (board) {
          const button = {
            id: String(btnRow.Id),
            label: btnRow.Label || ' ',
            vocalization: btnRow.Message || btnRow.Label || ' ',
            style: {
              background_color:
                btnRow.RefBackgroundColor || btnRow.BackgroundColor
                  ? `#${((btnRow.RefBackgroundColor || btnRow.BackgroundColor) & 16777215).toString(16).padStart(6, '0')}`
                  : void 0,
              border_color: btnRow.BorderColor
                ? `#${(btnRow.BorderColor & 16777215).toString(16).padStart(6, '0')}`
                : void 0,
              font_color:
                btnRow.RefForegroundColor || btnRow.LabelColor
                  ? `#${((btnRow.RefForegroundColor || btnRow.LabelColor) & 16777215).toString(16).padStart(6, '0')}`
                  : void 0,
            },
          };
          if (btnRow.PageSetImageId && imagesMap.has(btnRow.PageSetImageId)) {
            const img = imagesMap.get(btnRow.PageSetImageId);
            if (!board.images.find((i) => i.id === img.id)) {
              board.images.push(img);
            }
            button.image_id = img.id;
          }
          if (btnRow.NavigatePageId && idToUniqueId[String(btnRow.NavigatePageId)]) {
            button.load_board = { id: idToUniqueId[String(btnRow.NavigatePageId)] };
          }
          board.buttons.push(button);
          const pos = btnRow.GridPosition;
          if (pos && pos.includes(',')) {
            const [x, y] = pos.split(',').map((n) => parseInt(n));
            board.grid.columns = Math.max(board.grid.columns, x + 1);
            board.grid.rows = Math.max(board.grid.rows, y + 1);
            if (!board.grid.order[y]) {
              for (let i = board.grid.order.length; i <= y; i++) {
                board.grid.order[i] = [];
              }
            }
            board.grid.order[y][x] = button.id;
          }
        }
      });
      result.boards.forEach((board) => {
        if (board.buttons.length > 0 && (board.grid.rows === 0 || board.grid.columns === 0)) {
          board.grid.columns = 4;
          board.grid.rows = Math.ceil(board.buttons.length / 4);
          board.grid.order = Array.from({ length: board.grid.rows }, () => Array(4).fill(null));
          board.buttons.forEach((btn, idx) => {
            const r = Math.floor(idx / 4);
            const c = idx % 4;
            board.grid.order[r][c] = btn.id;
          });
        }
        for (let r = 0; r < board.grid.rows; r++) {
          if (!board.grid.order[r]) board.grid.order[r] = [];
          for (let c = 0; c < board.grid.columns; c++) {
            if (board.grid.order[r][c] === void 0) {
              board.grid.order[r][c] = null;
            }
          }
        }
      });
      return result;
    } finally {
      if (db) db.close();
    }
  },
  async from_external(obf, outputPath) {
    if (import_fs_extra6.default.existsSync(outputPath)) {
      import_fs_extra6.default.unlinkSync(outputPath);
    }
    const db = new import_better_sqlite32.default(outputPath, { readonly: false });
    try {
      db.exec(`
        CREATE TABLE Page (Id INTEGER PRIMARY KEY, UniqueId TEXT UNIQUE, Title TEXT, Name TEXT, BackgroundColor INTEGER);
        CREATE TABLE Button (Id INTEGER PRIMARY KEY, Label TEXT, Message TEXT, NavigatePageId INTEGER, ElementReferenceId INTEGER, LibrarySymbolId INTEGER, PageSetImageId INTEGER, MessageRecordingId INTEGER, SerializedMessageSoundMetadata TEXT, UseMessageRecording INTEGER, LabelColor INTEGER, BackgroundColor INTEGER, BorderColor INTEGER, BorderThickness REAL, FontSize REAL, FontFamily TEXT, FontStyle INTEGER);
        CREATE TABLE ElementReference (Id INTEGER PRIMARY KEY, PageId INTEGER, ForegroundColor INTEGER, BackgroundColor INTEGER);
        CREATE TABLE ElementPlacement (Id INTEGER PRIMARY KEY, ElementReferenceId INTEGER, GridPosition TEXT, GridSpan TEXT NOT NULL DEFAULT '1,1');
        CREATE TABLE PageSetData (Id INTEGER PRIMARY KEY, Identifier TEXT UNIQUE, Data BLOB, RefCount INTEGER DEFAULT 1);
        CREATE TABLE PageSetProperties (Id INTEGER PRIMARY KEY, Language TEXT, FontFamily TEXT, FontSize REAL, PageBackgroundColor INTEGER);
      `);
      const boards = obf.boards || [obf];
      const pageIdMap = /* @__PURE__ */ new Map();
      const imageIdMap = /* @__PURE__ */ new Map();
      db.prepare('INSERT INTO PageSetProperties (Language) VALUES (?)').run(obf.locale || 'en');
      let imageDataId = 1;
      const images = obf.images || [];
      images.forEach((img) => {
        if (img.data) {
          const identifier = img.ext_snap_identifier || `IMG:${img.id}`;
          const data = Buffer.from(img.data, 'base64');
          db.prepare('INSERT INTO PageSetData (Id, Identifier, Data) VALUES (?, ?, ?)').run(
            imageDataId,
            identifier,
            data
          );
          imageIdMap.set(img.id, imageDataId);
          imageDataId++;
        }
      });
      let pageId = 1;
      boards.forEach((board) => {
        const numericId = pageId++;
        pageIdMap.set(board.id, numericId);
        db.prepare(
          'INSERT INTO Page (Id, UniqueId, Title, Name, BackgroundColor) VALUES (?, ?, ?, ?, ?)'
        ).run(
          numericId,
          board.id,
          board.name,
          board.name,
          board.style?.background_color
            ? parseInt(board.style.background_color.replace('#', ''), 16)
            : null
        );
      });
      let buttonIdCounter = 1;
      let refIdCounter = 1;
      let placementIdCounter = 1;
      boards.forEach((board) => {
        const numericPageId = pageIdMap.get(board.id);
        board.buttons.forEach((btn) => {
          const numericRefId = refIdCounter++;
          db.prepare(
            'INSERT INTO ElementReference (Id, PageId, BackgroundColor, ForegroundColor) VALUES (?, ?, ?, ?)'
          ).run(
            numericRefId,
            numericPageId,
            btn.style?.background_color
              ? parseInt(btn.style.background_color.replace('#', ''), 16)
              : null,
            btn.style?.font_color ? parseInt(btn.style.font_color.replace('#', ''), 16) : null
          );
          let navigateId = null;
          if (btn.load_board) {
            navigateId = pageIdMap.get(btn.load_board.id || btn.load_board.path) || null;
          }
          db.prepare(
            'INSERT INTO Button (Id, Label, Message, NavigatePageId, ElementReferenceId, PageSetImageId, BorderColor) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(
            buttonIdCounter++,
            btn.label,
            btn.vocalization || btn.label,
            navigateId,
            numericRefId,
            imageIdMap.get(btn.image_id) || null,
            btn.style?.border_color ? parseInt(btn.style.border_color.replace('#', ''), 16) : null
          );
          let pos = '0,0';
          if (board.grid?.order) {
            board.grid.order.forEach((row, r) => {
              row.forEach((bid, c) => {
                if (bid === btn.id) pos = `${c},${r}`;
              });
            });
          }
          db.prepare(
            'INSERT INTO ElementPlacement (Id, ElementReferenceId, GridPosition) VALUES (?, ?, ?)'
          ).run(placementIdCounter++, numericRefId, pos);
        });
      });
    } finally {
      if (db) db.close();
    }
  },
};
var snap_default = Snap;

// src/converters/grid3.ts
var import_path2 = __toESM(require('path'));
var import_adm_zip2 = __toESM(require('adm-zip'));
var import_fast_xml_parser = require('fast-xml-parser');
var import_xml2js3 = __toESM(require('xml2js'));
var Grid3 = {
  async to_external(filePath) {
    const zip = new import_adm_zip2.default(filePath);
    const parser = new import_fast_xml_parser.XMLParser({ ignoreAttributes: false });
    const result = {
      format: 'open-board-0.1',
      boards: [],
      images: [],
      sounds: [],
    };
    const entries = zip.getEntries();
    const gridEntries = entries.filter(
      (e) => e.entryName.startsWith('Grids/') && e.entryName.endsWith('grid.xml')
    );
    const gridNameToIdMap = /* @__PURE__ */ new Map();
    const readEntry = (entry) => {
      return entry.getData().toString('utf8');
    };
    gridEntries.forEach((entry) => {
      try {
        const xml = readEntry(entry);
        const data = parser.parse(xml);
        const grid = data.Grid || data.grid;
        if (grid) {
          const id = grid.GridGuid || grid.gridGuid || grid.id || entry.entryName;
          const name =
            grid.Name ||
            grid.name ||
            import_path2.default.basename(import_path2.default.dirname(entry.entryName));
          gridNameToIdMap.set(String(name), String(id));
        }
      } catch (_e) {}
    });
    gridEntries.forEach((entry) => {
      try {
        const xml = readEntry(entry);
        const data = parser.parse(xml);
        const grid = data.Grid || data.grid;
        if (!grid) return;
        const id = String(grid.GridGuid || grid.gridGuid || grid.id || entry.entryName);
        const name = String(
          grid.Name ||
            grid.name ||
            import_path2.default.basename(import_path2.default.dirname(entry.entryName))
        );
        const columnDefs = grid.ColumnDefinitions?.ColumnDefinition || [];
        const rowDefs = grid.RowDefinitions?.RowDefinition || [];
        const cols = Array.isArray(columnDefs) ? columnDefs.length : columnDefs ? 1 : 5;
        const rows = Array.isArray(rowDefs) ? rowDefs.length : rowDefs ? 1 : 4;
        const fileMapIndex = /* @__PURE__ */ new Map();
        try {
          const fmEntry = zip.getEntries().find((e) => e.entryName.endsWith('FileMap.xml'));
          if (fmEntry) {
            const fmXml = fmEntry.getData().toString('utf8');
            const fmData = parser.parse(fmXml);
            const fmEntries =
              fmData?.FileMap?.Entries?.Entry || fmData?.fileMap?.entries?.entry || [];
            (Array.isArray(fmEntries) ? fmEntries : [fmEntries]).forEach((ent) => {
              const staticFile = (ent['$']?.StaticFile || ent.StaticFile || '').replace(/\\/g, '/');
              if (!staticFile) return;
              const df = ent.DynamicFiles || ent.dynamicFiles;
              const files = df?.File || df?.file || [];
              fileMapIndex.set(
                staticFile,
                (Array.isArray(files) ? files : [files]).map((f) =>
                  (typeof f === 'string' ? f : f['_'] || '').replace(/\\/g, '/')
                )
              );
            });
          }
        } catch (_e) {}
        const gridEntryPath = entry.entryName.replace(/\\/g, '/');
        const board = {
          id,
          name,
          format: 'open-board-0.1',
          buttons: [],
          grid: {
            rows,
            columns: cols,
            order: Array.from({ length: rows }, () => Array(cols).fill(null)),
          },
          style: {
            background_color: grid.BackgroundColour || grid.backgroundColour,
          },
          images: [],
          sounds: [],
        };
        if (grid.WordList) {
          board.ext_grid3_wordlist = grid.WordList;
        }
        const resolveImage = (cellX, cellY, declaredName) => {
          const baseDir = gridEntryPath.replace(/\/grid\.xml$/, '/');
          const dynamicFiles = fileMapIndex.get(gridEntryPath) || [];
          const candidates = [];
          if (declaredName) {
            candidates.push(`${baseDir}${declaredName}`);
            candidates.push(`${baseDir}Images/${declaredName}`);
          }
          const x = cellX + 1;
          const y = cellY + 1;
          dynamicFiles.forEach((df) => {
            if (df.includes(`${x}-${y}-`)) candidates.push(df);
          });
          candidates.push(`${baseDir}${x}-${y}-0-text-0.png`);
          candidates.push(`${baseDir}${x}-${y}-0-text-0.jpg`);
          candidates.push(`${baseDir}${x}-${y}.png`);
          for (const cand of candidates) {
            const found =
              zip.getEntry(cand.replace(/\//g, import_path2.default.sep)) || zip.getEntry(cand);
            if (found) return found;
          }
          return null;
        };
        const cells = grid.Cells?.Cell || grid.cells?.cell;
        if (cells) {
          const cellArr = Array.isArray(cells) ? cells : [cells];
          cellArr.forEach((cell, idx) => {
            const cellX = Math.max(0, parseInt(String(cell['@_X'] || '1')) - 1);
            const cellY = Math.max(0, parseInt(String(cell['@_Y'] || '1')) - 1);
            const content = cell.Content;
            if (!content) return;
            let caption =
              content.CaptionAndImage?.Caption || content.captionAndImage?.caption || '';
            if (!caption && content.ContentType === 'AutoContent') {
              caption = `(AutoContent ${idx})`;
            }
            const buttonId = `${id}_${idx}`;
            const button = {
              id: buttonId,
              label: String(caption || ' '),
              vocalization: String(caption || ' '),
              ext_grid3_content_type: content.ContentType,
            };
            const declaredImage =
              content.CaptionAndImage?.Image || content.captionAndImage?.image || '';
            const imgEntry = resolveImage(cellX, cellY, declaredImage);
            if (imgEntry) {
              const entryName = imgEntry.entryName;
              let imgObj = board.images.find((i) => i.ext_grid3_entry === entryName);
              if (!imgObj) {
                const imgId = `img_${board.images.length}`;
                const ext = import_path2.default.extname(entryName).toLowerCase();
                imgObj = {
                  id: imgId,
                  data: imgEntry.getData().toString('base64'),
                  content_type:
                    ext === '.png'
                      ? 'image/png'
                      : ext === '.jpg' || ext === '.jpeg'
                        ? 'image/jpeg'
                        : 'image/png',
                  ext_grid3_entry: entryName,
                };
                board.images.push(imgObj);
              }
              button.image_id = imgObj.id;
            }
            const commands = content.Commands?.Command || content.commands?.command;
            if (commands) {
              const cmdArr = Array.isArray(commands) ? commands : [commands];
              const jump = cmdArr.find((c) => (c['@_ID'] || c.id) === 'Jump.To');
              if (jump) {
                const params = jump.Parameter || jump.parameter;
                const paramArr = Array.isArray(params) ? params : [params];
                const gridParam = paramArr.find((p) => p['@_Key'] === 'grid');
                if (gridParam) {
                  const targetName = gridParam['#text'] || gridParam.text;
                  const targetId = gridNameToIdMap.get(String(targetName)) || String(targetName);
                  button.load_board = { id: targetId };
                }
              }
            }
            board.buttons.push(button);
            if (board.grid.order[cellY] && board.grid.order[cellY][cellX] === null) {
              board.grid.order[cellY][cellX] = buttonId;
            }
          });
        }
        result.boards.push(board);
      } catch (err) {
        console.error(`Error processing grid ${entry.entryName}:`, err);
      }
    });
    return result;
  },
  async from_external(obf, outputPath) {
    const builder = new import_xml2js3.default.Builder();
    const zip = new import_adm_zip2.default();
    const fixXmlAttributes = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(fixXmlAttributes);
      const newObj = {};
      const attrs = {};
      let hasAttrs = false;
      for (const [key, val] of Object.entries(obj)) {
        if (key.startsWith('@_')) {
          attrs[key.slice(2)] = val;
          hasAttrs = true;
        } else if (key === '#text') {
          newObj['_'] = val;
        } else {
          newObj[key] = fixXmlAttributes(val);
        }
      }
      if (hasAttrs) newObj['$'] = attrs;
      return newObj;
    };
    const boards = obf.boards || [obf];
    boards.forEach((board) => {
      if (!board.name) board.name = board.id || 'board';
      const safeName = board.name.replace(/[/\\?%*:|"<>]/g, '_');
      const gridXml = {
        Grid: {
          GridGuid: String(board.id),
          Name: String(board.name),
          BackgroundColour: String(board.style?.background_color || '#FFFFFF'),
          ColumnDefinitions: {
            ColumnDefinition: Array.from({ length: board.grid?.columns || 1 }).map(() => ({
              Width: 1,
            })),
          },
          RowDefinitions: {
            RowDefinition: Array.from({ length: board.grid?.rows || 1 }).map(() => ({ Width: 1 })),
          },
          Cells: {
            Cell: board.buttons.map((btn) => {
              let x = 1,
                y = 1;
              if (board.grid?.order) {
                board.grid.order.forEach((row, r) => {
                  row.forEach((bid, c) => {
                    if (bid === btn.id) {
                      x = c + 1;
                      y = r + 1;
                    }
                  });
                });
              }
              const cell = {
                $: { X: String(x), Y: String(y), ColumnSpan: '1', RowSpan: '1' },
                Content: {
                  $: { ContentType: String(btn.ext_grid3_content_type || 'Normal') },
                  CaptionAndImage: {
                    Caption: String(btn.label || ''),
                  },
                  Commands: {
                    Command: [],
                  },
                },
              };
              if (btn.image_id) {
                const img = (obf.images || []).find((i) => i.id === btn.image_id);
                if (img) {
                  const imageName = img.ext_grid3_entry || `${x}-${y}-0-text-0.png`;
                  cell.Content.CaptionAndImage.Image = imageName;
                  const imgData = Buffer.from(img.data, 'base64');
                  zip.addFile(`Grids/${safeName}/${imageName}`, imgData);
                }
              }
              if (btn.load_board) {
                cell.Content.Commands.Command.push({
                  $: { ID: 'Jump.To' },
                  Parameter: {
                    $: { Key: 'grid' },
                    _: String(btn.load_board.id || btn.load_board.path || ''),
                  },
                });
              }
              return cell;
            }),
          },
        },
      };
      if (board.ext_grid3_wordlist) {
        gridXml.Grid.WordList = fixXmlAttributes(board.ext_grid3_wordlist);
      }
      const xmlString = builder.buildObject(gridXml);
      zip.addFile(`Grids/${safeName}/grid.xml`, Buffer.from(xmlString, 'utf8'));
    });
    zip.writeZip(outputPath);
  },
};
var grid3_default = Grid3;

// src/converters/picto4me.ts
var import_jszip4 = __toESM(require('jszip'));
var Picto4me = {
  async to_external(zipPath) {
    const boards = [];
    const images = [];
    const sounds = [];
    const content = await (await fetch(zipPath)).arrayBuffer();
    const zip = await import_jszip4.default.loadAsync(content);
    const jsFile = Object.keys(zip.files).find((name) => name.endsWith('.js'));
    if (!jsFile) {
      throw new Error('No .js file found in Picto4me zip');
    }
    const jsContent = await zip.file(jsFile).async('string');
    const json = JSON.parse(jsContent);
    const locale = json.locale || 'en';
    for (let sheetIdx = 0; sheetIdx < json.sheets.length; sheetIdx++) {
      const sheet = json.sheets[sheetIdx];
      const board = {
        id: sheetIdx.toString(),
        locale,
        format: 'open-board-0.1',
        name: sheet.title.text,
        buttons: [],
        images: [],
        sounds: [],
        grid: {
          rows: sheet.rows,
          columns: sheet.columns,
          order: Array.from({ length: sheet.rows }, () => Array(sheet.columns).fill(null)),
        },
        ext_picto4me_title: sheet.title,
        ext_picto4me_cellsize: sheet.cellsize,
        ext_picto4me_pictoOverrule: sheet.pictoOverrule,
        ext_picto4me_showPictoTitles: sheet.showPictoTitles,
        ext_picto4me_pictoBorder: sheet.pictoBorder,
      };
      const grid = board.grid.order;
      for (let pictoIdx = 0; pictoIdx < sheet.pictos.length; pictoIdx++) {
        const picto = sheet.pictos[pictoIdx];
        if (!picto) continue;
        const buttonId = `${board.id}:${picto.id}`;
        const button = {
          id: buttonId,
          label: picto.title.text,
          vocalization: picto.description.text,
          ext_picto4me_lang: picto.lang,
          ext_picto4me_description: picto.description,
          ext_picto4me_title: picto.title,
          ext_picto4me_overlay: picto.overlay,
          ext_picto4me_source: picto.source,
          ext_picto4me_key: picto.key,
          ext_picto4me_categories: picto.categories,
          ext_picto4me_size: picto.size,
        };
        if (picto.borderColor !== 'transparent') {
          button.border_color = picto.borderColor;
        }
        if (picto.bgColor !== 'transparent') {
          button.background_color = picto.bgColor;
        }
        if (picto.imageurl) {
          const imagePath = picto.imageurl.substring(1);
          const imageFile = zip.file(imagePath);
          if (imageFile) {
            const imageContent = await imageFile.async('base64');
            const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
            const contentType = `image/${ext}`;
            const image = {
              id: `img:${buttonId}`,
              content_type: contentType,
              data: `data:${contentType};base64,${imageContent}`,
              width: 300,
              height: 300,
            };
            const img = new Image();
            const dataUrl = `data:${contentType};base64,${imageContent}`;
            const dimensions = await new Promise((resolve) => {
              img.onload = () => {
                resolve({ width: img.width, height: img.height });
              };
              img.onerror = () => resolve(void 0);
              img.src = dataUrl;
            });
            if (dimensions) {
              image.width = dimensions.width;
              image.height = dimensions.height;
            }
            images.push(image);
            button.image_id = image.id;
          }
        }
        if (picto.soundurl) {
          const soundPath = picto.soundurl.substring(1);
          const soundFile = zip.file(soundPath);
          if (soundFile) {
            const soundContent = await soundFile.async('base64');
            const ext = soundPath.split('.').pop()?.toLowerCase() || 'mp3';
            const contentType = `audio/${ext}`;
            const sound = {
              id: `snd:${buttonId}`,
              content_type: contentType,
              data: `data:${contentType};base64,${soundContent}`,
              duration: 1e3,
              // Default duration
            };
            sounds.push(sound);
            button.sound_id = sound.id;
          }
        }
        if (picto.link && json.sheets[parseInt(picto.link)]) {
          button.load_board = { id: picto.link };
        }
        board.buttons.push(button);
        const row = Math.floor(pictoIdx / sheet.columns);
        const col = pictoIdx % sheet.columns;
        if (row < sheet.rows && col < sheet.columns) {
          grid[row][col] = buttonId;
        }
      }
      boards.push(board);
    }
    const uniqueImages = images.filter(
      (img, index, self) => index === self.findIndex((i) => i.id === img.id)
    );
    const uniqueSounds = sounds.filter(
      (snd, index, self) => index === self.findIndex((s) => s.id === snd.id)
    );
    if (boards.length === 1) {
      const board = boards[0];
      board.images = uniqueImages;
      board.sounds = uniqueSounds;
      return board;
    }
    return {
      boards,
      images: uniqueImages,
      sounds: uniqueSounds,
    };
  },
};
var picto4me_default = Picto4me;
// Annotate the CommonJS export names for ESM import in node:
0 &&
  (module.exports = {
    External,
    Grid3,
    PdfBuilder,
    Picto4me,
    Sfy,
    Sgrid,
    Snap,
    TouchChat,
    Utils,
    Validator,
  });
