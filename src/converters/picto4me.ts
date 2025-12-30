import JSZip from 'jszip';
import { OBFPage, OBFImage, OBFSound, OBFButton } from '../types';

interface Picto4meSheet {
  title: { text: string };
  rows: number;
  columns: number;
  pictoOverrule: boolean;
  showPictoTitles: boolean;
  pictoBorder: string;
  cellsize: number;
  pictos: (Picto4mePicto | null)[];
}

interface Picto4mePicto {
  id: string;
  title: { text: string };
  description: { text: string };
  lang: string;
  borderColor: string;
  bgColor: string;
  imageurl?: string;
  soundurl?: string;
  link?: string;
  overlay: string;
  source: string;
  key: string;
  categories: string[];
  size: number;
}

interface Picto4meData {
  locale: string;
  sheets: Picto4meSheet[];
}

const Picto4me = {
  async to_external(
    zipPath: string
  ): Promise<{ boards: OBFPage[]; images: OBFImage[]; sounds: OBFSound[] } | OBFPage> {
    const boards: OBFPage[] = [];
    const images: OBFImage[] = [];
    const sounds: OBFSound[] = [];

    // Read the zip file
    const content = await (await fetch(zipPath)).arrayBuffer();
    const zip = await JSZip.loadAsync(content);

    // Find and parse the .js file
    const jsFile = Object.keys(zip.files).find((name) => name.endsWith('.js'));
    if (!jsFile) {
      throw new Error('No .js file found in Picto4me zip');
    }

    const jsContent = await zip.file(jsFile)!.async('string');
    const json: Picto4meData = JSON.parse(jsContent);

    const locale = json.locale || 'en';

    for (let sheetIdx = 0; sheetIdx < json.sheets.length; sheetIdx++) {
      const sheet = json.sheets[sheetIdx];
      const board: OBFPage = {
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

      const grid = board.grid!.order as (string | null)[][];

      for (let pictoIdx = 0; pictoIdx < sheet.pictos.length; pictoIdx++) {
        const picto = sheet.pictos[pictoIdx];
        if (!picto) continue;

        const buttonId = `${board.id}:${picto.id}`;
        const button: any = {
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

        // Handle image
        if (picto.imageurl) {
          const imagePath = picto.imageurl.substring(1); // Remove leading '/'
          const imageFile = zip.file(imagePath);
          if (imageFile) {
            const imageContent = await imageFile.async('base64');
            const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
            const contentType = `image/${ext}`;

            const image: OBFImage = {
              id: `img:${buttonId}`,
              content_type: contentType,
              data: `data:${contentType};base64,${imageContent}`,
              width: 300,
              height: 300,
            };

            // Try to get image dimensions
            const img = new Image();
            const dataUrl = `data:${contentType};base64,${imageContent}`;
            const dimensions = await new Promise<{ width: number; height: number } | undefined>(
              (resolve) => {
                img.onload = () => {
                  resolve({ width: img.width, height: img.height });
                };
                img.onerror = () => resolve(undefined);
                img.src = dataUrl;
              }
            );
            if (dimensions) {
              image.width = dimensions.width;
              image.height = dimensions.height;
            }

            images.push(image);
            button.image_id = image.id;
          }
        }

        // Handle sound
        if (picto.soundurl) {
          const soundPath = picto.soundurl.substring(1); // Remove leading '/'
          const soundFile = zip.file(soundPath);
          if (soundFile) {
            const soundContent = await soundFile.async('base64');
            const ext = soundPath.split('.').pop()?.toLowerCase() || 'mp3';
            const contentType = `audio/${ext}`;

            const sound: OBFSound = {
              id: `snd:${buttonId}`,
              content_type: contentType,
              data: `data:${contentType};base64,${soundContent}`,
              duration: 1000, // Default duration
            };

            sounds.push(sound);
            button.sound_id = sound.id;
          }
        }

        // Handle board linking
        if (picto.link && json.sheets[parseInt(picto.link)]) {
          button.load_board = { id: picto.link };
        }

        board.buttons!.push(button as OBFButton);

        // Place button in grid
        const row = Math.floor(pictoIdx / sheet.columns);
        const col = pictoIdx % sheet.columns;
        if (row < sheet.rows && col < sheet.columns) {
          grid[row][col] = buttonId;
        }
      }

      boards.push(board);
    }

    // Deduplicate images and sounds
    const uniqueImages = images.filter(
      (img, index, self) => index === self.findIndex((i) => i.id === img.id)
    );
    const uniqueSounds = sounds.filter(
      (snd, index, self) => index === self.findIndex((s) => s.id === snd.id)
    );

    // Return single board or multiple
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

export default Picto4me;
