import fs from 'fs-extra';
import Utils from './utils';
import JSZip from 'jszip';
import { OBFPage, OBFImage, OBFSound } from './types';
import tinycolor from 'tinycolor2';

export interface PathHash {
  zip?: JSZip;
  boards?: Record<string, { path: string }>;
  images?: Record<string, { path: string; content_type?: string; width?: number; height?: number }>;
  sounds?: Record<string, { path: string }>;
  included_boards?: Record<string, OBFPage>;
}

export interface ToIncludeOptions {
  images?: boolean;
  sounds?: boolean;
  image_urls?: boolean;
  sound_urls?: boolean;
}

const External = {
  trim_empties(hash: Record<string, any>): Record<string, any> {
    const new_hash: Record<string, any> = {};
    Object.keys(hash).forEach((key) => {
      if (hash[key] != null) {
        new_hash[key] = hash[key];
      }
    });
    return new_hash;
  },

  parse_license(pre_license: any): Record<string, any> {
    if (!pre_license || typeof pre_license !== 'object') {
      pre_license = {};
    }
    const license: Record<string, any> = {};
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
        // Handle legacy link attributes
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

  fix_color(str: string, targetFormat: 'hex' | 'rgb' = 'rgb'): string {
    const color = tinycolor(str);
    if (targetFormat === 'hex') {
      return color.toHexString();
    }
    return color.toRgbString();
  },

  async to_obf(
    hash: any,
    destPath: string | null = null,
    pathHash: PathHash | null = null,
    toInclude: ToIncludeOptions = {}
  ): Promise<string | null> {
    const to_include: ToIncludeOptions = { images: true, sounds: true, ...toInclude };

    const res: any = {
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

    // Handle license
    if (hash.license) {
      res.license = this.parse_license(hash.license);
    }

    // Copy ext_ attributes
    Object.keys(hash).forEach((key) => {
      if (key.startsWith('ext_')) {
        res[key] = hash[key];
      }
    });

    const images: OBFImage[] = hash.images || [];
    const sounds: OBFSound[] = hash.sounds || [];
    const buttons = hash.buttons || [];
    const imageSet = new Set<string>();
    const soundSet = new Set<string>();

    // Process buttons
    for (const originalButton of buttons) {
      const button: any = {
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
          : undefined,
        background_color: originalButton.background_color
          ? this.fix_color(originalButton.background_color || '#ffffff', 'rgb')
          : undefined,
      };

      // Remove undefined values
      if (!button.border_color) delete button.border_color;
      if (!button.background_color) delete button.background_color;
      if (!button.left) delete button.left;
      if (!button.top) delete button.top;
      if (!button.width) delete button.width;
      if (!button.height) delete button.height;
      if (!button.action) delete button.action;
      if (!button.actions) delete button.actions;

      // Handle load_board
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

      // Handle translations
      if (originalButton.translations) {
        button.translations = {};
        Object.keys(originalButton.translations).forEach((loc) => {
          const hash = originalButton.translations[loc];
          if (typeof hash === 'object') {
            button.translations[loc] = {};
            if (hash.label) button.translations[loc].label = hash.label.toString();
            if (hash.vocalization)
              button.translations[loc].vocalization = hash.vocalization.toString();
            if (hash.inflections) {
              button.translations[loc].inflections = {};
              Object.keys(hash.inflections).forEach((key) => {
                if (key.startsWith('ext_')) {
                  button.translations[loc].inflections[key] = hash.inflections[key];
                } else {
                  button.translations[loc].inflections[key] = hash.inflections[key].toString();
                }
              });
            }
            Object.keys(hash).forEach((key) => {
              if (key.startsWith('ext_')) {
                button.translations[loc][key] = hash[key];
              }
            });
          }
        });
      }

      if (originalButton.hidden !== undefined) {
        button.hidden = originalButton.hidden;
      }
      if (originalButton.url) {
        button.url = originalButton.url;
      }

      // Copy ext_ attributes
      Object.keys(originalButton).forEach((key) => {
        if (key.startsWith('ext_')) {
          button[key] = originalButton[key];
        }
      });

      // Track image and sound IDs
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

    // Process images
    if (to_include.images) {
      for (const originalImage of images) {
        if (!imageSet.has(originalImage.id) && !images.includes(originalImage)) continue;

        const image: any = {
          id: originalImage.id,
          width: originalImage.width,
          height: originalImage.height,
          content_type: originalImage.content_type,
          license: originalImage.license ? this.parse_license(originalImage.license) : undefined,
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
            const imageFetch = await Utils.get_url(image.url || image.data);
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
        const image: any = {
          id: originalImage.id,
          width: originalImage.width,
          height: originalImage.height,
          license: originalImage.license ? this.parse_license(originalImage.license) : undefined,
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

    // Process sounds
    if (to_include.sounds) {
      for (const originalSound of sounds) {
        if (!soundSet.has(originalSound.id)) continue;

        const sound: any = {
          id: originalSound.id,
          duration: originalSound.duration,
          content_type: originalSound.content_type,
          license: originalSound.license ? this.parse_license(originalSound.license) : undefined,
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
            const soundFetch = await Utils.get_url(sound.url || sound.data);
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
        const sound: any = {
          id: originalSound.id,
          duration: originalSound.duration,
          content_type: originalSound.content_type,
          license: originalSound.license ? this.parse_license(originalSound.license) : undefined,
          protected: originalSound.protected,
          protected_source: originalSound.protected_source,
          url: originalSound.url,
          data_url: originalSound.data_url,
        };
        if (!sound.license) delete sound.license;
        res.sounds.push(this.trim_empties(sound));
      }
    }

    // Write to file or zip
    if (pathHash && pathHash.zip) {
      const zipPath = `board_${res.id}.obf`;
      pathHash.boards = pathHash.boards || {};
      pathHash.boards[res.id] = { path: zipPath };
      await pathHash.zip.file(zipPath, JSON.stringify(res, null, 2));
    } else if (destPath) {
      await fs.writeJson(destPath, res, { spaces: 2 });
    }

    return destPath;
  },

  async to_obz(
    content: any,
    destPath: string,
    opts: { to_include?: ToIncludeOptions } = {}
  ): Promise<string> {
    let boards = content.boards;
    if (content.id && !boards) {
      boards = [content];
    }

    const paths: PathHash & { zip: JSZip } = {
      images: {},
      sounds: {},
      boards: {},
      included_boards: {},
      zip: new JSZip(),
    };

    const rootBoard = boards[0];
    const to_include = opts.to_include || { images: true, sounds: true };

    // Mark all boards as included
    boards.forEach((b: OBFPage) => {
      paths.included_boards![b.id] = b;
    });

    // Process all boards
    for (const b of boards) {
      b.images = content.images || b.images || [];
      b.sounds = content.sounds || b.sounds || [];
      await this.to_obf(b, null, paths, to_include);
    }

    // Build manifest
    const manifest: any = {
      format: 'open-board-0.1',
      root: paths.boards![rootBoard.id].path,
      paths: {
        boards: {},
        images: {},
        sounds: {},
      },
    };

    Object.keys(paths.boards!).forEach(
      (id) => (manifest.paths.boards[id] = paths.boards![id].path)
    );
    Object.keys(paths.images!).forEach(
      (id) => (manifest.paths.images[id] = paths.images![id].path)
    );
    Object.keys(paths.sounds!).forEach(
      (id) => (manifest.paths.sounds[id] = paths.sounds![id].path)
    );

    await paths.zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await paths.zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(destPath, buffer);
    return destPath;
  },

  async from_obf(
    obfJsonOrPath: string | OBFPage,
    opts: { zipper?: JSZip; manifest?: any } = {}
  ): Promise<OBFPage> {
    let obj: OBFPage;

    if (typeof obfJsonOrPath === 'string') {
      const content = await fs.readFile(obfJsonOrPath, 'utf8');
      obj = JSON.parse(content);
    } else {
      obj = obfJsonOrPath;
    }

    // Resolve image and sound paths from manifest
    if (opts.zipper && opts.manifest) {
      const manifest = opts.manifest as any;

      // Process images
      if (obj.images) {
        for (const image of obj.images) {
          if (image.image_id && !image.path && !image.data) {
            const img = obj.images?.find((i: OBFImage) => i.id === image.image_id);
            if (img && manifest.paths?.images?.[image.image_id]) {
              image.path = manifest.paths.images[image.image_id];
            }
          }
        }
      }

      // Process sounds
      if (obj.sounds) {
        for (const sound of obj.sounds) {
          if (sound.sound_id && !sound.path && !sound.data) {
            const snd = obj.sounds?.find((s: OBFSound) => s.id === sound.sound_id);
            if (snd && manifest.paths?.sounds?.[sound.sound_id]) {
              sound.path = manifest.paths.sounds[sound.sound_id];
            }
          }
        }
      }
    }

    // Normalize arrays from hashes if needed
    ['images', 'sounds', 'buttons'].forEach((key) => {
      if (obj[key as keyof OBFPage] && !Array.isArray(obj[key as keyof OBFPage])) {
        const arr: any[] = [];
        Object.keys((obj as any)[key]).forEach((id) => {
          const item = (obj as any)[key][id];
          if (item) {
            item.id = item.id || id;
            arr.push(item);
          }
        });
        (obj as any)[key] = arr;
      }
    });

    // Parse license
    if (obj.license) {
      obj.license = this.parse_license(obj.license);
    }

    return obj;
  },

  async from_obz(
    obzPath: string
  ): Promise<{ boards: OBFPage[]; images: OBFImage[]; sounds: OBFSound[] }> {
    const content = await fs.readFile(obzPath);
    const zip = await JSZip.loadAsync(content);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('No manifest.json found in OBZ file');
    }

    const manifestContent = await manifestFile.async('string');
    const manifest = JSON.parse(manifestContent);

    const boards: OBFPage[] = [];
    const images: OBFImage[] = [];
    const sounds: OBFSound[] = [];
    const visitedBoardIds = new Set<string>();
    const unvisitedBoards: OBFPage[] = [];

    // Load root board
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

    // Process all linked boards
    while (unvisitedBoards.length > 0) {
      const board = unvisitedBoards.shift()!;
      boards.push(board);

      // Check for linked boards
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

    // Collect all images and sounds
    boards.forEach((board) => {
      if (board.images) {
        images.push(...board.images);
      }
      if (board.sounds) {
        sounds.push(...board.sounds);
      }
    });

    // Deduplicate by id
    const uniqueImages = images.filter(
      (img, index, self) => index === self.findIndex((i) => i.id === img.id)
    );
    const uniqueSounds = sounds.filter(
      (snd, index, self) => index === self.findIndex((s) => s.id === snd.id)
    );

    // Validate uniqueness
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

export default External;
