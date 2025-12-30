import axios from 'axios';
import JSZip from 'jszip';
import plist from 'plist';
import xml2js from 'xml2js';
import tinycolor from 'tinycolor2';
import mime from 'mime-types';
import { OBFPage } from './types';

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

const Utils = {
  async get_url(
    url: string | null | undefined
  ): Promise<{ content_type: string; data: Buffer | ArrayBuffer; extension: string } | null> {
    if (!url) return null;
    let contentType = '';
    let data: Buffer | ArrayBuffer;

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
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        contentType = response.headers['content-type'] as string;
        data = response.data;
      } catch (e: any) {
        console.error(`FAILED TO RETRIEVE ${url} ${e.message}`);
        return null;
      }
    }

    const extension = (mime.extension(contentType) as string)
      ? `.${mime.extension(contentType)}`
      : '';
    return {
      content_type: contentType,
      data: data,
      extension: extension,
    };
  },

  async identify_content(content: Buffer | Uint8Array | string, filename: string): Promise<string> {
    const name = filename.toLowerCase();
    if (name.endsWith('.obf')) return 'obf';
    if (name.endsWith('.obz')) return 'obz';
    if (name.endsWith('.ce')) return 'touchchat';
    if (name.endsWith('.gridset')) return 'grid3';
    if (name.endsWith('.spb') || name.endsWith('.sps')) return 'snap';
    if (name.endsWith('.avz')) return 'avz';

    const contentStr = typeof content === 'string' ? content : content.toString();

    // Try JSON
    try {
      const json = JSON.parse(contentStr);
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
      const parsedPlist = plist.parse(contentStr) as any;
      if (
        parsedPlist &&
        parsedPlist.$objects &&
        parsedPlist.$objects.some((o: any) => o.$classname === 'SYWord')
      ) {
        return 'sfy';
      }
    } catch (_e) {
      // Not Plist
    }

    // Try XML (sgrid)
    try {
      const parser = new xml2js.Parser();
      const xml = await parser.parseStringPromise(contentStr);
      if (xml && xml.sensorygrid) {
        return 'sgrid';
      }
    } catch (_e) {
      // Not XML
    }

    // Try Zip (obz or picto4me)
    try {
      const zip = await JSZip.loadAsync(content);
      if (zip.file('manifest.json')) {
        const manifestContent = await zip.file('manifest.json')!.async('string');
        const json = JSON.parse(manifestContent);
        if (json.root && json.format && json.format.match(/^open-board-/)) {
          return 'obz';
        }
      }
      // Check for Picto4me format (has .js file with locale and sheets)
      const jsFiles = Object.keys(zip.files).filter((n) => n.endsWith('.js'));
      if (jsFiles.length > 0) {
        const jsContent = await zip.file(jsFiles[0])!.async('string');
        const jsJson = JSON.parse(jsContent);
        if (jsJson.locale && jsJson.sheets) {
          return 'picto4me';
        }
      }
    } catch (_e) {
      // Not Zip
    }

    return 'unknown';
  },

  async identify_file(filePath: string): Promise<string> {
    if (!fs) throw new Error('File system access not available in this environment');
    const name = path.basename(filePath);
    const content = await fs.readFile(filePath);
    return this.identify_content(content, name);
  },

  fix_color(str: string, type: 'hex' | 'string' = 'hex'): string {
    const color = tinycolor(str);
    if (type === 'hex') {
      return color.toHexString();
    }
    return color.toString();
  },

  async load_obf_content(content: Buffer | Uint8Array, filename: string): Promise<OBFPage> {
    const type = await this.identify_content(content, filename);
    if (type === 'obf') {
      const contentStr = content.toString();
      return JSON.parse(contentStr);
    } else if (type === 'obz') {
      const zip = await JSZip.loadAsync(content);
      const manifestStr = await zip.file('manifest.json')!.async('string');
      const manifest = JSON.parse(manifestStr);
      const rootPath = manifest.root;
      const rootStr = await zip.file(rootPath)!.async('string');
      const root = JSON.parse(rootStr);

      if (manifest.paths && manifest.paths.boards) {
        root.boards = [];
        for (const [_id, boardPath] of Object.entries(
          manifest.paths.boards as Record<string, string>
        )) {
          if (boardPath === rootPath) continue;
          const boardStr = await zip.file(boardPath)!.async('string');
          const board = JSON.parse(boardStr);
          root.boards.push(board);
        }
      }
      return root;
    } else {
      throw new Error(`Unsupported file type for OBF loading: ${type}`);
    }
  },

  async load_obf(filePath: string): Promise<OBFPage> {
    if (!fs) throw new Error('File system access not available in this environment');
    const content = await fs.readFile(filePath);
    return this.load_obf_content(content, path.basename(filePath));
  },

  parse_obf(obj: any, _opts = {}): OBFPage {
    let json = obj;
    if (typeof obj === 'string') {
      json = JSON.parse(obj);
    }

    // Normalize images/sounds/buttons to arrays if they are hashes
    ['images', 'sounds', 'buttons'].forEach((key) => {
      if (json[key] && !Array.isArray(json[key])) {
        const arr: any[] = [];
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

    return json as OBFPage;
  },
};

export default Utils;
