import xml2js from 'xml2js';
import fs from 'fs-extra';
import { OBFPage, OBFButton, OBFImage } from '../types';

const Sgrid = {
  async to_external(filePath: string): Promise<OBFPage> {
    const content = await fs.readFile(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(content);

    const gridData = result.sensorygrid.grid;
    const rows = parseInt(gridData.rows);
    const columns = parseInt(gridData.cols);

    const board: OBFPage = {
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
      if (gridData[attr]) (board as any)[extPrefix + attr] = gridData[attr];
    });

    if (gridData.background) {
      (board as any)[extPrefix + 'background'] = {
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

    cellsArr.forEach((cell: any, idx: number) => {
      const col = parseInt(cell.$.x) - 1;
      const row = parseInt(cell.$.y) - 1;

      const button: OBFButton = {
        id: idx.toString(),
        label: cell.caption || ' ',
      };

      ['stylepreset', 'scanblock', 'magnifyx', 'magnifyy', 'tooltip', 'directactivate'].forEach(
        (attr) => {
          if (cell[attr]) (button as any)[extPrefix + attr] = cell[attr];
        }
      );

      const preset = (button as any)[extPrefix + 'stylepreset'];
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
        commands.forEach((cmd: any) => {
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

        const image: OBFImage = {
          id: imageIdCounter.toString(),
          content_type: 'image/png',
        };
        if (symbolSet) {
          (image as any).symbol = { set: symbolSet, filename };
        } else {
          (image as any)[extPrefix + 'filename'] = filename;
        }
        board.images.push(image);
        button.image_id = image.id;
        imageIdCounter++;
      }

      board.buttons.push(button);
      if (row >= 0 && row < rows && col >= 0 && col < columns) {
        board.grid!.order[row][col] = button.id;
      }
    });

    return board;
  },
};

export default Sgrid;
