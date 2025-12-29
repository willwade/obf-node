const fs = require('fs-extra');
const path = require('path');
const JSZip = require('jszip');
const Utils = require('./utils-node');

const OBF_FORMAT = 'open-board-0.1';
const OBF_FORMAT_CURRENT_VERSION = 0.1;

class ValidationError extends Error {
  constructor(message, blocker = false) {
    super(message);
    this.blocker = blocker;
  }
}

class Validator {
  constructor() {
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
    const type = await Utils.identify_file(filePath);
    const fn = path.basename(filePath);
    const stats = await fs.stat(filePath);
    const filesize = stats.size;

    if (type === 'obf') {
      return await this.validate_obf_file(filePath);
    } else if (type === 'obz') {
      return await this.validate_obz_file(filePath);
    } else {
      const res = {
        filename: fn,
        filesize: filesize,
        valid: false,
        errors: 1,
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

  static async validate_obf_file(filePath, opts = {}) {
    const v = new Validator();
    let fn, content, filesize;

    if (opts.zipper) {
      fn = filePath;
      content = await opts.zipper.file(filePath).async('string');
      filesize = (await opts.zipper.file(filePath).async('uint8array')).length;
    } else {
      fn = path.basename(filePath);
      content = await fs.readFile(filePath, 'utf8');
      filesize = (await fs.stat(filePath)).size;
    }

    const results = await v.validate_obf_content(content, fn, opts);

    return {
      filename: fn,
      filesize: filesize,
      valid: v.errors === 0,
      errors: v.errors,
      warnings: v.warnings,
      results: results,
    };
  }

  static async validate_obz_file(filePath) {
    const v = new Validator();
    const fn = path.basename(filePath);
    const [results, sub_results] = await v.validate_obz_content(filePath, fn);

    const totalErrors = v.errors + sub_results.reduce((acc, r) => acc + r.errors, 0);
    const totalWarnings = v.warnings + sub_results.reduce((acc, r) => acc + r.warnings, 0);

    return {
      filename: fn,
      filesize: (await fs.stat(filePath)).size,
      valid: totalErrors === 0,
      errors: totalErrors,
      warnings: totalWarnings,
      results: results,
      sub_results: sub_results,
    };
  }

  async validate_obz_content(filePath, filename) {
    const self = this;

    await this.add_check('filename', 'file name', async () => {
      if (!filename.match(/\.obz$/)) self.warn('filename should end with .obz');
    });

    let valid_zip = false;
    let zipContent;

    try {
      zipContent = await fs.readFile(filePath);
    } catch (_e) {
      //
    }

    let zip;
    await this.add_check('zip', 'valid zip', async () => {
      try {
        zip = await JSZip.loadAsync(zipContent);
        valid_zip = true;
      } catch (_e) {
        self.err('file is not a valid zip package');
      }
    });

    let sub_results = [];

    if (valid_zip) {
      let json = null;

      await this.add_check('manifest', 'manifest.json', async () => {
        if (!zip.file('manifest.json')) {
          self.err('manifest.json is required in the zip package');
        }

        try {
          const manifestStr = await zip.file('manifest.json').async('string');
          json = JSON.parse(manifestStr);
        } catch (_e) {
          json = null;
        }

        if (!json) self.err('manifest.json must contain a valid JSON structure');
      });

      if (json) {
        await this.add_check('manifest_format', 'manifest.json format version', async () => {
          if (!json.format) {
            self.err('format attribute is required, set to ' + OBF_FORMAT);
          }
          const version = parseFloat(json.format.split('-').pop());
          if (version > OBF_FORMAT_CURRENT_VERSION) {
            self.err(
              `format version (${version}) is invalid, current version is ${OBF_FORMAT_CURRENT_VERSION}`
            );
          } else if (version < OBF_FORMAT_CURRENT_VERSION) {
            self.warn(
              `format version (${version}) is old, consider updating to ${OBF_FORMAT_CURRENT_VERSION}`
            );
          }
        });

        await this.add_check('manifest_root', 'manifest.json root attribute', async () => {
          if (!json.root) self.err('root attribute is required');
          if (!zip.file(json.root)) {
            self.err('root attribute must reference a file in the package');
          }
        });

        await this.add_check('manifest_paths', 'manifest.json paths attribute', async () => {
          if (!json.paths || typeof json.paths !== 'object') {
            self.err('paths attribute must be a valid hash');
          }
          if (!json.paths.boards || typeof json.paths.boards !== 'object') {
            self.err('paths.boards must be a valid hash');
          }
        });

        await this.add_check('manifest_extras', 'manifest.json extra attributes', async () => {
          const attrs = ['format', 'root', 'paths'];
          Object.keys(json).forEach((key) => {
            if (!attrs.includes(key) && !key.startsWith('ext_')) {
              self.warn(
                `${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });

          const pathAttrs = ['boards', 'images', 'sounds'];
          Object.keys(json.paths).forEach((key) => {
            if (!pathAttrs.includes(key) && !key.startsWith('ext_')) {
              self.warn(
                `paths.${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });
        });

        const foundPaths = ['manifest.json'];
        if (json.paths && json.paths.boards) {
          for (const [id, path] of Object.entries(json.paths.boards)) {
            foundPaths.push(path);
            await this.add_check(
              `manifest_boards[${id}]`,
              `manifest.json path.boards.${id}`,
              async () => {
                if (!zip.file(path)) {
                  self.err(`board path (${path}) not found in the zip package`);
                }
                try {
                  const boardStr = await zip.file(path).async('string');
                  const boardJson = JSON.parse(boardStr);
                  if (!boardJson || boardJson.id !== id) {
                    const boardId = (boardJson && boardJson.id) || 'null';
                    self.err(
                      `board at path (${path}) defined in manifest with id "${id}" but actually has id "${boardId}"`
                    );
                  }
                } catch (_e) {
                  self.err(`could not parse board at path (${path})`);
                }
              }
            );
            const sub = await Validator.validate_obf_file(path, { zipper: zip });
            sub_results.push(sub);
          }
        }

        if (json.paths && json.paths.images) {
          for (const [id, path] of Object.entries(json.paths.images)) {
            foundPaths.push(path);
            await this.add_check(
              `manifest_images[${id}]`,
              `manifest.json path.images.${id}`,
              async () => {
                if (!zip.file(path)) {
                  self.err(`image path (${path}) not found in the zip package`);
                }
              }
            );
          }
        }

        if (json.paths && json.paths.sounds) {
          for (const [id, path] of Object.entries(json.paths.sounds)) {
            foundPaths.push(path);
            await this.add_check(
              `manifest_sounds[${id}]`,
              `manifest.json path.sounds.${id}`,
              async () => {
                if (!zip.file(path)) {
                  self.err(`sound path (${path}) not found in the zip package`);
                }
              }
            );
          }
        }

        const actualPaths = Object.keys(zip.files);
        await this.add_check('extra_paths', 'manifest.json extra paths', async () => {
          actualPaths.forEach((path) => {
            if (!foundPaths.includes(path) && !path.endsWith('/')) {
              self.warn(`the file "${path}" isn't listed in manifest.json`);
            }
          });
        });

        this._sub_checks = sub_results;
      }
    }

    return [this._checks, this._sub_checks];
  }

  async validate_obf_content(content, filename, opts = {}) {
    const self = this;

    await this.add_check('filename', 'file name', async () => {
      if (!filename.match(/\.obf$/)) self.warn('filename should end with .obf');
    });

    let json = null;

    await this.add_check('valid_json', 'JSON file', async () => {
      try {
        json = JSON.parse(content);
      } catch (_e) {
        self.err("Couldn't parse as JSON", true);
      }
    });

    if (!json) return this._checks;

    let ext = json;

    await this.add_check('format_version', 'format version', async () => {
      if (!ext.format) {
        self.err('format attribute is required, set to ' + OBF_FORMAT);
      }
      const version = parseFloat(ext.format.split('-').pop());
      if (version > OBF_FORMAT_CURRENT_VERSION) {
        self.err(
          `format version (${version}) is invalid, current version is ${OBF_FORMAT_CURRENT_VERSION}`
        );
      } else if (version < OBF_FORMAT_CURRENT_VERSION) {
        self.warn(
          `format version (${version}) is old, consider updating to ${OBF_FORMAT_CURRENT_VERSION}`
        );
      }
    });

    await this.add_check('id', 'board ID', async () => {
      if (!ext.id) self.err('id attribute is required');
    });

    await this.add_check('locale', 'locale', async () => {
      if (!ext.locale) self.err('locale attribute is required, please set to "en" for English');
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
          self.warn(
            `${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
          );
        }
      });
    });

    await this.add_check('description', 'descriptive attributes', async () => {
      if (!ext.name) self.warn('name attribute is strongly recommended');
      if (!ext.description_html) self.warn('description_html attribute is recommended');
    });

    await this.add_check('background', 'background attribute', async () => {
      if (ext.background && typeof ext.background !== 'object') {
        self.err('background attribute must be a hash');
      }
    });

    await this.add_check('buttons', 'buttons attribute', async () => {
      if (!ext.buttons) self.err('buttons attribute is required');
      if (!Array.isArray(ext.buttons)) self.err('buttons attribute must be an array');
    });

    await this.add_check('grid', 'grid attribute', async () => {
      if (!ext.grid) self.err('grid attribute is required');
      if (typeof ext.grid !== 'object') self.err('grid attribute must be a hash');
      if (typeof ext.grid.rows !== 'number' || ext.grid.rows < 1)
        self.err('grid.rows must be a positive number');
      if (typeof ext.grid.columns !== 'number' || ext.grid.columns < 1)
        self.err('grid.columns must be a positive number');
      if (!ext.grid.order || !Array.isArray(ext.grid.order))
        self.err('grid.order must be an array of arrays');
      if (ext.grid.order.length !== ext.grid.rows)
        self.err(
          `grid.order length (${ext.grid.order.length}) must match grid.rows (${ext.grid.rows})`
        );
      if (!ext.grid.order.every((r) => Array.isArray(r) && r.length === ext.grid.columns)) {
        self.err(
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
              if (id !== null && id !== undefined) {
                usedButtonIds.push(id);
                if (!buttonIds.includes(id)) {
                  self.err(
                    `grid.order references button with id ${id} but no button with that id found in buttons attribute`
                  );
                }
              }
            });
          }
        });
      }
      if (usedButtonIds.length === 0) self.warn('board has no buttons defined in the grid');

      const unusedIds = buttonIds.filter((id) => !usedButtonIds.includes(id));
      if (unusedIds.length > 0) {
        self.warn(
          `not all defined buttons were included in the grid order (${unusedIds.join(',')})`
        );
      }
    });

    await this.add_check('images', 'images attribute', async () => {
      if (!ext.images) self.err('images attribute is required');
      if (!Array.isArray(ext.images)) self.err('images attribute must be an array');
    });

    if (Array.isArray(ext.images)) {
      for (let i = 0; i < ext.images.length; i++) {
        const image = ext.images[i];
        await this.add_check(`image[${i}]`, `image at images[${i}]`, async () => {
          if (typeof image !== 'object') self.err('image must be a hash');
          if (!image.id) self.err('image.id is required');
          if (!image.width || typeof image.width !== 'number' || image.width < 1)
            self.err('image.width must be a valid positive number');
          if (!image.height || typeof image.height !== 'number' || image.height < 1)
            self.err('image.height must be a valid positive number');
          if (!image.content_type || !image.content_type.match(/^image\/.+$/))
            self.err('image.content_type must be a valid image mime type');
          if (!image.url && !image.data && !image.symbol && !image.path)
            self.err('image must have data, url, path or symbol attribute defined');

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
              self.warn(
                `image.${key} attribute is not defined in the spec, should be prefixed with ext_yourapp_`
              );
            }
          });
        });
      }
    }

    await this.add_check('sounds', 'sounds attribute', async () => {
      if (!ext.sounds) self.err('sounds attribute is required');
      if (!Array.isArray(ext.sounds)) self.err('sounds attribute must be an array');
    });

    if (Array.isArray(ext.sounds)) {
      for (let i = 0; i < ext.sounds.length; i++) {
        const sound = ext.sounds[i];
        await this.add_check(`sounds[${i}]`, `sound at sounds[${i}]`, async () => {
          if (typeof sound !== 'object') self.err('sound must be a hash');
          if (!sound.id) self.err('sound.id is required');
          if (
            sound.duration !== undefined &&
            (typeof sound.duration !== 'number' || sound.duration < 0)
          )
            self.err('sound.duration must be a valid positive number');
          if (!sound.content_type || !sound.content_type.match(/^audio\/.+$/))
            self.err('sound.content_type must be a valid audio mime type');
          if (!sound.url && !sound.data && !sound.symbol && !sound.path)
            self.err('sound must have data, url, path or symbol attribute defined');
        });
      }
    }

    if (Array.isArray(ext.buttons)) {
      for (let i = 0; i < ext.buttons.length; i++) {
        const button = ext.buttons[i];
        await this.add_check(`buttons[${i}]`, `button at buttons[${i}]`, async () => {
          if (typeof button !== 'object') self.err('button must be a hash');
          if (!button.id) self.err('button.id is required');
          if (!button.label && !button.vocalization)
            self.err('button.label or button.vocalization is required');

          ['background_color', 'border_color'].forEach((color) => {
            if (button[color]) {
              if (
                !button[color].match(
                  /^\s*rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[01]\.?\d*)?\)\s*/
                )
              ) {
                self.err(
                  `button.${color} must be a valid rgb or rgba value if defined ("${button[color]}" is invalid)`
                );
              }
            }
          });

          if (button.hidden !== undefined && typeof button.hidden !== 'boolean') {
            self.err('button.hidden must be a boolean if defined');
          }

          if (button.image_id === undefined || button.image_id === null) {
            self.warn('button.image_id is recommended');
          }

          if (
            button.action &&
            typeof button.action === 'string' &&
            !button.action.match(/^(:|\+)/)
          ) {
            self.err('button.action must start with either : or + if defined');
          }
          if (button.action && !Array.isArray(button.action)) {
            self.err('button.actions must be an array of strings');
          }

          if (button.load_board && button.load_board.path) {
            if (!opts.zipper) {
              self.err("button.load_board.path is set but this isn't a zipped file");
            } else if (!opts.zipper.file(button.load_board.path)) {
              self.err(
                `button.load_board.path references ${button.load_board.path} which isn't found in the zipped file`
              );
            }
          }
        });
      }
    }

    return this._checks;
  }
}

module.exports = Validator;
