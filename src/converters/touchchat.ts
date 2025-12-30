import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { OBFPage, OBFImage, OBZPackage, OBFButton } from '../types';

const TouchChat = {
  async to_external(filePath: string): Promise<OBZPackage> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'touchchat-'));
    let db: Database.Database | null = null;
    let imageDb: Database.Database | null = null;

    try {
      const zip = new AdmZip(filePath);
      zip.extractAllTo(tmpDir, true);

      const files = fs.readdirSync(tmpDir);
      const vocabFile = files.find((f) => f.endsWith('.c4v'));
      if (!vocabFile) {
        throw new Error('No .c4v vocab DB found in TouchChat export');
      }

      const dbPath = path.join(tmpDir, vocabFile);
      db = new Database(dbPath, { readonly: true });

      const idMappings = new Map<number, string>();
      try {
        const mappings = db
          .prepare('SELECT numeric_id, string_id FROM page_id_mapping')
          .all() as any[];
        mappings.forEach((m) => idMappings.set(m.numeric_id, m.string_id));
      } catch (_e) {
        // Ignore
      }

      const variables: Record<string, any> = {};
      try {
        db.prepare('SELECT name, value FROM variables')
          .all()
          .forEach((v: any) => {
            variables[v.name] = v.value;
          });
      } catch (_e) {
        // Ignore
      }

      const buttonStyles = new Map<number, any>();
      const pageStyles = new Map<number, any>();
      try {
        db.prepare('SELECT * FROM button_styles')
          .all()
          .forEach((s: any) => buttonStyles.set(s.id, s));
        db.prepare('SELECT * FROM page_styles')
          .all()
          .forEach((s: any) => pageStyles.set(s.id, s));
      } catch (_e) {
        // Ignore
      }

      const intToHex = (colorInt: number | null | undefined): string | undefined => {
        if (colorInt === null || typeof colorInt === 'undefined') return undefined;
        return `#${(colorInt & 0x00ffffff).toString(16).padStart(6, '0')}`;
      };

      const imageDbPath = path.join(tmpDir, 'Images.c4s');
      const imagesMap = new Map<number, OBFImage>();
      if (fs.existsSync(imageDbPath)) {
        imageDb = new Database(imageDbPath, { readonly: true });
        try {
          const symbolLinks = db.prepare('SELECT id, rid FROM symbol_links').all() as any[];
          const ridToImage = new Map<string, Buffer>();
          const symbols = imageDb.prepare('SELECT rid, data FROM symbols').all() as any[];
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
                content_type: 'image/png', // Assuming PNG for symbols
              });
            }
          });
        } catch (_e) {
          // Ignore
        }
      }

      const pages = db
        .prepare(
          `
        SELECT p.*, r.name
        FROM pages p
        JOIN resources r ON r.id = p.resource_id
      `
        )
        .all() as any[];

      const result: OBZPackage = {
        format: 'open-board-0.1',
        boards: [],
        images: [],
        sounds: [],
      };

      const boardsMap = new Map<number, OBFPage>();

      pages.forEach((pageRow) => {
        const pageId = idMappings.get(pageRow.id) || String(pageRow.id);
        const style = pageStyles.get(pageRow.page_style_id);

        const board: OBFPage = {
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
        .all() as any[];

      const buttonBoxes = new Map<number, { cells: any[]; layout_x: number; layout_y: number }>();
      buttonBoxCells.forEach((cell) => {
        if (!buttonBoxes.has(cell.box_id)) {
          buttonBoxes.set(cell.box_id, {
            cells: [],
            layout_x: cell.layout_x,
            layout_y: cell.layout_y,
          });
        }
        buttonBoxes.get(cell.box_id)!.cells.push(cell);
      });

      // Actions
      const navActions = new Map<number, number>();
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
          .forEach((nav: any) => {
            navActions.set(nav.button_id, parseInt(nav.target_page_id));
          });
      } catch (_e) {
        // Ignore
      }

      const boxInstances = db.prepare('SELECT * FROM button_box_instances').all() as any[];
      boxInstances.forEach((instance) => {
        const board = boardsMap.get(instance.page_id);
        const box = buttonBoxes.get(instance.button_box_id);
        if (board && box) {
          const cols = box.layout_x || instance.size_x || 1;
          const rows = box.layout_y || instance.size_y || 1;
          board.grid!.columns = Math.max(board.grid!.columns, cols);
          board.grid!.rows = Math.max(board.grid!.rows, rows);

          if (board.grid!.order.length < rows || board.grid!.order[0].length < cols) {
            const newOrder = Array.from({ length: rows }, () => Array(cols).fill(null));
            // Copy existing
            board.grid!.order.forEach((r, rowIdx) => {
              r.forEach((cell, colIdx) => {
                if (newOrder[rowIdx]) newOrder[rowIdx][colIdx] = cell;
              });
            });
            board.grid!.order = newOrder;
          }

          box.cells.forEach((cell) => {
            const style = buttonStyles.get(cell.button_style_id);
            const buttonId = String(cell.id);
            const targetId = navActions.get(cell.id);

            const button: OBFButton = {
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
              const img = imagesMap.get(cell.symbol_link_id)!;
              if (!board.images.find((i) => i.id === img.id)) {
                board.images.push(img);
              }
              button.image_id = img.id;
            }

            if (cell.pronunciation) {
              (button as any).ext_touchchat_pronunciation = cell.pronunciation;
            }

            if (targetId) {
              const mappedTargetId = idMappings.get(targetId) || String(targetId);
              button.load_board = { id: mappedTargetId };
            }

            board.buttons.push(button);

            const x = cell.location % cols;
            const y = Math.floor(cell.location / cols);
            if (board.grid!.order[y]) {
              board.grid!.order[y][x] = buttonId;
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
      fs.removeSync(tmpDir);
    }
  },
  async from_external(obf: any, outputPath: string): Promise<void> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'touchchat-out-'));
    const vocabPath = path.join(tmpDir, 'vocab.c4v');
    const imagesPath = path.join(tmpDir, 'Images.c4s');

    const db = new Database(vocabPath);

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

      const imageDb = new Database(imagesPath);
      imageDb.exec(
        'CREATE TABLE symbols (id INTEGER PRIMARY KEY, rid TEXT UNIQUE, data BLOB, compressed INTEGER, type INTEGER, width INTEGER, height INTEGER)'
      );

      const imageMap = new Map<string, string>();
      (obf.images || []).forEach((img: any, idx: number) => {
        const rid = `{IMAGE-${idx}}`;
        imageDb
          .prepare(
            'INSERT INTO symbols (rid, data, compressed, type, width, height) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(rid, Buffer.from(img.data, 'base64'), 0, 1, 100, 100);
        imageMap.set(img.id, rid);
      });
      imageDb.close();

      boards.forEach((board: any) => {
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

        board.buttons.forEach((btn: any, idx: number) => {
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

          // Location
          let loc = idx;
          if (board.grid?.order) {
            board.grid.order.forEach((row: any[], r: number) => {
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
      const zip = new AdmZip();
      zip.addLocalFile(vocabPath);
      zip.addLocalFile(imagesPath);
      zip.writeZip(outputPath);
      fs.removeSync(tmpDir);
    }
  },
};

export default TouchChat;
