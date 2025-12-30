import path from 'path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import xml2js from 'xml2js';
import { OBZPackage, OBFPage, OBFButton } from '../types';

const Grid3 = {
  async to_external(filePath: string): Promise<OBZPackage> {
    const zip = new AdmZip(filePath);
    const parser = new XMLParser({ ignoreAttributes: false });

    const result: OBZPackage = {
      format: 'open-board-0.1',
      boards: [],
      images: [],
      sounds: [],
    };

    const entries = zip.getEntries();
    const gridEntries = entries.filter(
      (e) => e.entryName.startsWith('Grids/') && e.entryName.endsWith('grid.xml')
    );

    const gridNameToIdMap = new Map<string, string>();

    const readEntry = (entry: AdmZip.IZipEntry) => {
      return entry.getData().toString('utf8');
    };

    // First pass: collect IDs
    gridEntries.forEach((entry) => {
      try {
        const xml = readEntry(entry);
        const data = parser.parse(xml);
        const grid = data.Grid || data.grid;
        if (grid) {
          const id = grid.GridGuid || grid.gridGuid || grid.id || entry.entryName;
          const name = grid.Name || grid.name || path.basename(path.dirname(entry.entryName));
          gridNameToIdMap.set(String(name), String(id));
        }
      } catch (_e) {
        // Ignore
      }
    });

    // Second pass: process
    gridEntries.forEach((entry) => {
      try {
        const xml = readEntry(entry);
        const data = parser.parse(xml);
        const grid = data.Grid || data.grid;
        if (!grid) return;

        const id = String(grid.GridGuid || grid.gridGuid || grid.id || entry.entryName);
        const name = String(grid.Name || grid.name || path.basename(path.dirname(entry.entryName)));

        const columnDefs = grid.ColumnDefinitions?.ColumnDefinition || [];
        const rowDefs = grid.RowDefinitions?.RowDefinition || [];
        const cols = Array.isArray(columnDefs) ? columnDefs.length : columnDefs ? 1 : 5;
        const rows = Array.isArray(rowDefs) ? rowDefs.length : rowDefs ? 1 : 4;

        const fileMapIndex = new Map<string, string[]>();
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
                (Array.isArray(files) ? files : [files]).map((f: any) =>
                  (typeof f === 'string' ? f : f['_'] || '').replace(/\\/g, '/')
                )
              );
            });
          }
        } catch (_e) {
          // Ignore
        }

        const gridEntryPath = entry.entryName.replace(/\\/g, '/');
        const board: OBFPage = {
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
          (board as any).ext_grid3_wordlist = grid.WordList;
        }

        const resolveImage = (cellX: number, cellY: number, declaredName: string) => {
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
            const found = zip.getEntry(cand.replace(/\//g, path.sep)) || zip.getEntry(cand);
            if (found) return found;
          }
          return null;
        };

        const cells = grid.Cells?.Cell || grid.cells?.cell;
        if (cells) {
          const cellArr = Array.isArray(cells) ? cells : [cells];
          cellArr.forEach((cell: any, idx: number) => {
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
            const button: OBFButton = {
              id: buttonId,
              label: String(caption),
              vocalization: String(caption),
              ext_grid3_content_type: content.ContentType,
            };

            const declaredImage =
              content.CaptionAndImage?.Image || content.captionAndImage?.image || '';
            const imgEntry = resolveImage(cellX, cellY, declaredImage);
            if (imgEntry) {
              const entryName = imgEntry.entryName;
              let imgObj = (board.images as any[]).find((i) => i.ext_grid3_entry === entryName);
              if (!imgObj) {
                const imgId = `img_${board.images.length}`;
                const ext = path.extname(entryName).toLowerCase();
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
              const jump = cmdArr.find((c: any) => (c['@_ID'] || c.id) === 'Jump.To');
              if (jump) {
                const params = jump.Parameter || jump.parameter;
                const paramArr = Array.isArray(params) ? params : [params];
                const gridParam = paramArr.find((p: any) => p['@_Key'] === 'grid');
                if (gridParam) {
                  const targetName = gridParam['#text'] || gridParam.text;
                  const targetId = gridNameToIdMap.get(String(targetName)) || String(targetName);
                  button.load_board = { id: targetId };
                }
              }
            }

            board.buttons.push(button);
            if (board.grid!.order[cellY] && board.grid!.order[cellY][cellX] === null) {
              board.grid!.order[cellY][cellX] = buttonId;
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
  async from_external(obf: any, outputPath: string): Promise<void> {
    const builder = new xml2js.Builder();
    const zip = new AdmZip();

    const fixXmlAttributes = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(fixXmlAttributes);
      const newObj: any = {};
      const attrs: any = {};
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
    boards.forEach((board: any) => {
      if (!board.name) board.name = board.id || 'board';
      const safeName = board.name.replace(/[/\\?%*:|"<>]/g, '_');

      const gridXml: any = {
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
            Cell: board.buttons.map((btn: any) => {
              // Find position
              let x = 1,
                y = 1;
              if (board.grid?.order) {
                board.grid.order.forEach((row: any[], r: number) => {
                  row.forEach((bid, c) => {
                    if (bid === btn.id) {
                      x = c + 1;
                      y = r + 1;
                    }
                  });
                });
              }

              const cell: any = {
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
                const img = (obf.images || []).find((i: any) => i.id === btn.image_id);
                if (img) {
                  const imageName = img.ext_grid3_entry || `${x}-${y}-0-text-0.png`;
                  cell.Content.CaptionAndImage.Image = imageName;
                  // Re-save image to zip
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

export default Grid3;
