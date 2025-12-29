const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const JSZip = require('jszip');
const plist = require('plist');
const xml2js = require('xml2js');
const tinycolor = require('tinycolor2');
const mime = require('mime-types');

const Utils = {
  async get_url(url) {
    if (!url) return null;
    let res = {};
    let contentType = null;
    let data = null;

    if (url.match(/^data:/)) {
      const parts = url.split(',');
      const meta = parts[0].split(';');
      contentType = meta[0].split(':')[1];
      data = Buffer.from(parts[1], 'base64');
    } else {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        contentType = response.headers['content-type'];
        data = response.data;
      } catch (e) {
        console.error(`FAILED TO RETRIEVE ${url} ${e.message}`);
        return null;
      }
    }

    res.content_type = contentType;
    res.data = data;
    res.extension = mime.extension(contentType) ? `.${mime.extension(contentType)}` : '';
    return res;
  },

  async identify_file(filePath) {
    const name = path.basename(filePath);
    if (name.match(/\.obf$/)) return 'obf';
    if (name.match(/\.obz$/)) return 'obz';
    if (name.match(/\.avz$/)) return 'avz';

    let content;
    try {
      content = await fs.readFile(filePath);
    } catch (_e) {
      return 'unknown';
    }

    // Try JSON
    try {
      const json = JSON.parse(content.toString());
      if (json && typeof json === 'object') {
        if (json.format && json.format.match(/^open-board-/)) {
          return 'obf';
        }
        return 'json_not_obf';
      }
      return 'json_not_object';
    } catch (_e) {
      // Not JSON
    }

    // Try Plist (sfy)
    try {
      const parsedPlist = plist.parse(content.toString());
      if (
        parsedPlist &&
        parsedPlist.$objects &&
        parsedPlist.$objects.some((o) => o.$classname === 'SYWord')
      ) {
        return 'sfy';
      }
    } catch (_e) {
      // Not Plist
    }

    // Try XML (sgrid)
    try {
      const parser = new xml2js.Parser();
      const xml = await parser.parseStringPromise(content.toString());
      if (xml && xml.sensorygrid) {
        return 'sgrid';
      }
    } catch (_e) {
      // Not XML
    }

    // Try Zip (obz, picto4me)
    try {
      const zip = await JSZip.loadAsync(content);
      if (zip.file('manifest.json')) {
        const manifestContent = await zip.file('manifest.json').async('string');
        const json = JSON.parse(manifestContent);
        if (json.root && json.format && json.format.match(/^open-board-/)) {
          return 'obz';
        }
      }

      // Check for picto4me (ignoring as per instructions, but logic was here)
    } catch (_e) {
      // Not Zip
    }

    return 'unknown';
  },

  fix_color(str, type = 'hex') {
    const color = tinycolor(str);
    if (type === 'hex') {
      return color.toHexString();
    }
    return color.toString();
  },

  async load_obf(filePath) {
    const type = await this.identify_file(filePath);
    if (type === 'obf') {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } else if (type === 'obz') {
      const content = await fs.readFile(filePath);
      const zip = await JSZip.loadAsync(content);
      const manifestStr = await zip.file('manifest.json').async('string');
      const manifest = JSON.parse(manifestStr);
      const rootPath = manifest.root;
      const rootStr = await zip.file(rootPath).async('string');
      const root = JSON.parse(rootStr);

      // For OBZ, we might want to return the whole structure or just the root board
      // The Ruby version seems to handle this by creating an External object
      // For now, let's return the root board and attach other boards if needed
      if (manifest.paths && manifest.paths.boards) {
        root.boards = [];
        for (const [_id, path] of Object.entries(manifest.paths.boards)) {
          if (path === rootPath) continue;
          const boardStr = await zip.file(path).async('string');
          const board = JSON.parse(boardStr);
          root.boards.push(board);
        }
      }
      return root;
    } else {
      throw new Error(`Unsupported file type: ${type}`);
    }
  },

  parse_obf(obj, _opts = {}) {
    let json = obj;
    if (typeof obj === 'string') {
      json = JSON.parse(obj);
    }

    // Normalize images/sounds/buttons to arrays if they are hashes
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

module.exports = Utils;
