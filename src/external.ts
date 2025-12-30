import fs from 'fs-extra';
import Utils from './utils';
import JSZip from 'jszip';


export interface PathHash {
  zip?: JSZip;
  boards?: Record<string, { path: string }>;
  images?: Record<string, { path: string }>;
  sounds?: Record<string, { path: string }>;
}

const External = {
  async to_obf(
    hash: any,
    destPath: string | null,
    pathHash: PathHash | null = null,
    toInclude: { images?: boolean; sounds?: boolean } = {}
  ): Promise<string | null> {
    const res: any = {
      format: 'open-board-0.1',
      id: hash.id || Math.random().toString(36).substring(2, 15),
      locale: hash.locale || 'en',
      name: hash.name,
      description_html: hash.description_html,
      buttons: [],
      images: [],
      sounds: [],
    };

    // Copy extra attributes
    Object.keys(hash).forEach((key) => {
      if (key.startsWith('ext_')) {
        res[key] = hash[key];
      }
    });

    const images = hash.images || [];
    const sounds = hash.sounds || [];
    const buttons = hash.buttons || [];

    if (toInclude.images) {
      for (const originalImage of images) {
        const image: any = {
          id: originalImage.id,
          width: originalImage.width || 300,
          height: originalImage.height || 300,
          content_type: originalImage.content_type,
          license: originalImage.license,
          symbol: originalImage.symbol,
          url: originalImage.url,
          data: originalImage.data,
        };

        if (pathHash && pathHash.zip) {
          const imageId = image.id.toString();
          if (pathHash.images && pathHash.images[imageId]) {
            image.path = pathHash.images[imageId].path;
          } else {
            const imageFetch = await Utils.get_url(image.url || image.data);
            if (imageFetch) {
              const zipPath = `images/image_${imageId}${imageFetch.extension}`;
              pathHash.images = pathHash.images || {};
              pathHash.images[imageId] = { path: zipPath };
              await pathHash.zip.file(zipPath, imageFetch.data);
              image.path = zipPath;
            }
          }
        }
        res.images.push(image);
      }
    }

    if (toInclude.sounds) {
      for (const originalSound of sounds) {
        const sound: any = {
          id: originalSound.id,
          duration: originalSound.duration,
          content_type: originalSound.content_type,
          url: originalSound.url,
          data: originalSound.data,
        };

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
            }
          }
        }
        res.sounds.push(sound);
      }
    }

    res.buttons = buttons;
    res.grid = hash.grid;

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

  async to_obz(content: any, destPath: string, _opts = {}): Promise<string> {
    let boards = content.boards;
    if (content.id && !boards) {
      boards = [content];
    }

    const paths: PathHash & { zip: JSZip } = {
      images: {},
      sounds: {},
      boards: {},
      zip: new JSZip(),
    };

    const rootBoard = boards[0];
    for (const b of boards) {
      b.images = content.images || b.images || [];
      b.sounds = content.sounds || b.sounds || [];
      await this.to_obf(b, null, paths, { images: true, sounds: true });
    }

    const manifest: any = {
      format: 'open-board-0.1',
      root: paths.boards![rootBoard.id].path,
      paths: {
        boards: {},
        images: {},
        sounds: {},
      },
    };

    Object.keys(paths.boards!).forEach((id) => (manifest.paths.boards[id] = paths.boards![id].path));
    Object.keys(paths.images!).forEach((id) => (manifest.paths.images[id] = paths.images![id].path));
    Object.keys(paths.sounds!).forEach((id) => (manifest.paths.sounds[id] = paths.sounds![id].path));

    await paths.zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await paths.zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(destPath, buffer);
    return destPath;
  },
};

export default External;
