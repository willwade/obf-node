import JSZip from 'jszip';
import Utils from './utils';

const OBF_FORMAT = 'open-board-0.1';
const OBF_FORMAT_CURRENT_VERSION = 0.1;

// Optional Node-only imports
let fs: any = null;
let path: any = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    fs = require('fs-extra');
    path = require('path');
  } catch (_e) {
    // Ignore
  }
}

export class ValidationError extends Error {
  blocker: boolean;
  constructor(message: string, blocker = false) {
    super(message);
    this.blocker = blocker;
  }
}

export interface ValidationCheck {
  type: string;
  description: string;
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export interface ValidationResult {
  filename: string;
  filesize: number;
  valid: boolean;
  errors: number;
  warnings: number;
  results: ValidationCheck[];
  sub_results?: ValidationResult[];
}

export class Validator {
  private _errors: number = 0;
  private _warnings: number = 0;
  private _checks: ValidationCheck[] = [];
  private _sub_checks: ValidationResult[] = [];
  private _blocked: boolean = false;

  constructor() {
    this._errors = 0;
    this._warnings = 0;
    this._checks = [];
    this._sub_checks = [];
    this._blocked = false;
  }

  async add_check(type: string, description: string, checkFn: () => Promise<void>) {
    if (this._blocked) return;

    const checkObj: ValidationCheck = { type, description, valid: true };
    this._checks.push(checkObj);

    try {
      await checkFn();
    } catch (e: any) {
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

  err(message: string, blocker = false) {
    throw new ValidationError(message, blocker);
  }

  warn(message: string) {
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

  static async validate_file(filePath: string): Promise<ValidationResult> {
    if (!fs) throw new Error('File system access not available in this environment');
    const content = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);
    return this.validate_content(content, path.basename(filePath), stats.size);
  }

  static async validate_content(
    content: Buffer | Uint8Array,
    filename: string,
    filesize: number
  ): Promise<ValidationResult> {
    const type = await Utils.identify_content(content, filename);

    if (type === 'obf') {
      return await this.validate_obf_content_static(content.toString(), filename, filesize);
    } else if (type === 'obz') {
      return await this.validate_obz_content_static(content, filename, filesize);
    } else {
      const res: ValidationResult = {
        filename: filename,
        filesize: filesize,
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

  static async validate_obf_content_static(
    content: string,
    filename: string,
    filesize: number,
    opts: { zipper?: JSZip } = {}
  ): Promise<ValidationResult> {
    const v = new Validator();
    const results = await v.validate_obf_content(content, filename, opts);

    return {
      filename: filename,
      filesize: filesize,
      valid: v.errors === 0,
      errors: v.errors,
      warnings: v.warnings,
      results: results,
    };
  }

  static async validate_obf_file(
    filePath: string,
    opts: { zipper?: JSZip } = {}
  ): Promise<ValidationResult> {
    if (!fs) throw new Error('File system access not available in this environment');
    const fn = path.basename(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    const filesize = (await fs.stat(filePath)).size;
    return this.validate_obf_content_static(content, fn, filesize, opts);
  }

  static async validate_obz_content_static(
    content: Buffer | Uint8Array,
    filename: string,
    filesize: number
  ): Promise<ValidationResult> {
    const v = new Validator();
    const [results, sub_results] = await v.validate_obz_content_buffer(content, filename);

    const totalErrors = v.errors + sub_results.reduce((acc, r: any) => acc + (r.errors || 0), 0);
    const totalWarnings =
      v.warnings + sub_results.reduce((acc, r: any) => acc + (r.warnings || 0), 0);

    return {
      filename: filename,
      filesize: filesize,
      valid: totalErrors === 0,
      errors: totalErrors,
      warnings: totalWarnings,
      results: results,
      sub_results: sub_results as ValidationResult[],
    };
  }

  static async validate_obz_file(filePath: string): Promise<ValidationResult> {
    if (!fs) throw new Error('File system access not available in this environment');
    const content = await fs.readFile(filePath);
    const filesize = (await fs.stat(filePath)).size;
    return this.validate_obz_content_static(content, path.basename(filePath), filesize);
  }

  async validate_obz_content_buffer(
    zipContent: Buffer | Uint8Array,
    filename: string
  ): Promise<[ValidationCheck[], ValidationResult[]]> {
    await this.add_check('filename', 'file name', async () => {
      if (!filename.match(/\.obz$/)) this.warn('filename should end with .obz');
    });

    let zip: JSZip | null = null;
    let valid_zip = false;
    await this.add_check('zip', 'valid zip', async () => {
      try {
        zip = await JSZip.loadAsync(zipContent);
        valid_zip = true;
      } catch (_e) {
        this.err('file is not a valid zip package');
      }
    });

    const sub_results: ValidationResult[] = [];

    if (valid_zip && zip) {
      let json: any = null;

      await this.add_check('manifest', 'manifest.json', async () => {
        const manifestFile = zip!.file('manifest.json');
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
          if (!zip!.file(json.root)) {
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
          for (const [id, boardPath] of Object.entries(
            json.paths.boards as Record<string, string>
          )) {
            foundPaths.push(boardPath);
            await this.add_check(
              `manifest_boards[${id}]`,
              `manifest.json path.boards.${id}`,
              async () => {
                const bFile = zip!.file(boardPath);
                if (!bFile) {
                  this.err(`board path (${boardPath}) not found in the zip package`);
                  return;
                }
                try {
                  const boardStr = await bFile.async('string');
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

            const bFile = (zip as any).file(boardPath);
            if (bFile) {
              const bStr = await bFile.async('string');
              const bData = await bFile.async('uint8array');
              const sub = await Validator.validate_obf_content_static(
                bStr,
                boardPath,
                bData.length,
                { zipper: zip as any }
              );
              sub_results.push(sub);
            }
          }
        }

        if (json.paths && json.paths.images) {
          for (const [_id, imgPath] of Object.entries(
            json.paths.images as Record<string, string>
          )) {
            foundPaths.push(imgPath);
            await this.add_check(
              `manifest_images[${_id}]`,
              `manifest.json path.images.${_id}`,
              async () => {
                if (!(zip as any).file(imgPath)) {
                  this.err(`image path (${imgPath}) not found in the zip package`);
                }
              }
            );
          }
        }

        if (json.paths && json.paths.sounds) {
          for (const [_id, soundPath] of Object.entries(
            json.paths.sounds as Record<string, string>
          )) {
            foundPaths.push(soundPath);
            await this.add_check(
              `manifest_sounds[${_id}]`,
              `manifest.json path.sounds.${_id}`,
              async () => {
                if (!(zip as any).file(soundPath)) {
                  this.err(`sound path (${soundPath}) not found in the zip package`);
                }
              }
            );
          }
        }

        const actualPaths = Object.keys((zip as any).files);
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

  async validate_obf_content(
    content: string,
    filename: string,
    opts: { zipper?: JSZip } = {}
  ): Promise<ValidationCheck[]> {
    await this.add_check('filename', 'file name', async () => {
      if (!filename.match(/\.obf$/)) this.warn('filename should end with .obf');
    });

    let json: any = null;

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
      if (!ext.grid.order.every((r: any) => Array.isArray(r) && r.length === ext.grid.columns)) {
        this.err(
          `grid.order must contain ${ext.grid.rows} arrays each of size ${ext.grid.columns}`
        );
      }
    });

    await this.add_check('grid_ids', 'button IDs in grid.order attribute', async () => {
      const buttonIds = (ext.buttons || []).map((b: any) => b.id);
      const usedButtonIds: string[] = [];
      if (ext.grid && ext.grid.order) {
        ext.grid.order.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach((id: any) => {
              if (id !== null && id !== undefined) {
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

      const unusedIds = buttonIds.filter((id: any) => !usedButtonIds.includes(id));
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
            sound.duration !== undefined &&
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
            if (
              button[attr] !== undefined &&
              (typeof button[attr] !== 'number' || button[attr] < 0)
            ) {
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

          if (button.hidden !== undefined && typeof button.hidden !== 'boolean') {
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
}
