const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');

const TouchChat = {
  async to_external(filePath) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'touchchat-'));
    let db = null;
    let imageDb = null;

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

      const idMappings = new Map();
      try {
        const mappings = db.prepare('SELECT numeric_id, string_id FROM page_id_mapping').all();
        mappings.forEach((m) => idMappings.set(m.numeric_id, m.string_id));
      } catch (_e) {
        // Ignore
      }

      const variables = {};
      try {
        db.prepare('SELECT name, value FROM variables')
          .all()
          .forEach((v) => {
            variables[v.name] = v.value;
          });
      } catch (_e) {
        // Ignore
      }

      const buttonStyles = new Map();
      const pageStyles = new Map();
      try {
        db.prepare('SELECT * FROM button_styles')
          .all()
          .forEach((s) => buttonStyles.set(s.id, s));
        db.prepare('SELECT * FROM page_styles')
          .all()
          .forEach((s) => pageStyles.set(s.id, s));
      } catch (_e) {
        // Ignore
      }

      const intToHex = (colorInt) => {
        if (colorInt === null || typeof colorInt === 'undefined') return undefined;
        return `#${(colorInt & 0x00ffffff).toString(16).padStart(6, '0')}`;
      };

      const imageDbPath = path.join(tmpDir, 'Images.c4s');
      const imagesMap = new Map();
      if (fs.existsSync(imageDbPath)) {
        imageDb = new Database(imageDbPath, { readonly: true });
        try {
          const symbolLinks = db.prepare('SELECT id, rid FROM symbol_links').all();
          const ridToImage = new Map();
          const symbols = imageDb.prepare('SELECT rid, data FROM symbols').all();
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
        .all();

      const result = {
        boards: [],
        images: [],
        sounds: [],
      };

      const boardsMap = new Map();

      pages.forEach((pageRow) => {
        const pageId = idMappings.get(pageRow.id) || String(pageRow.id);
        const style = pageStyles.get(pageRow.page_style_id);

        const board = {
          id: pageId,
          name: pageRow.name || '',
          buttons: [],
          grid: {
            rows: 0,
            columns: 0,
            order: [],
          },
          style: {
            background_color: intToHex(style?.bg_color),
          },
          images: [],
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
        .all();

      const buttonBoxes = new Map();
      buttonBoxCells.forEach((cell) => {
        if (!buttonBoxes.has(cell.box_id)) {
          buttonBoxes.set(cell.box_id, {
            cells: [],
            layout_x: cell.layout_x,
            layout_y: cell.layout_y,
          });
        }
        buttonBoxes.get(cell.box_id).cells.push(cell);
      });

      // Actions
      const navActions = new Map();
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
          .forEach((nav) => {
            navActions.set(nav.button_id, nav.target_page_id);
          });
      } catch (_e) {
        // Ignore
      }

      const boxInstances = db.prepare('SELECT * FROM button_box_instances').all();
      boxInstances.forEach((instance) => {
        const board = boardsMap.get(instance.page_id);
        const box = buttonBoxes.get(instance.button_box_id);
        if (board && box) {
          const cols = box.layout_x || instance.size_x || 1;
          const rows = box.layout_y || instance.size_y || 1;
          board.grid.columns = Math.max(board.grid.columns, cols);
          board.grid.rows = Math.max(board.grid.rows, rows);

          if (board.grid.order.length === 0) {
            board.grid.order = Array.from({ length: rows }, () => Array(cols).fill(null));
          }

          box.cells.forEach((cell) => {
            const style = buttonStyles.get(cell.button_style_id);
            const buttonId = String(cell.id);
            const targetId = navActions.get(cell.id);

            const button = {
              id: buttonId,
              label: cell.label || '',
              vocalization: cell.message || '',
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
              const img = imagesMap.get(cell.symbol_link_id);
              if (!board.images.find((i) => i.id === img.id)) {
                board.images.push(img);
              }
              button.image_id = img.id;
            }

            if (cell.pronunciation) {
              button.ext_touchchat_pronunciation = cell.pronunciation;
            }

            if (targetId) {
              const mappedTargetId = idMappings.get(parseInt(targetId)) || String(targetId);
              button.load_board = { id: mappedTargetId };
            }

            board.buttons.push(button);

            const x = cell.location % cols;
            const y = Math.floor(cell.location / cols);
            if (board.grid.order[y]) {
              board.grid.order[y][x] = buttonId;
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
  async from_external(obf, outputPath) {
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

      let resId = 1;
      let pageId = 1;
      let btnId = 1;
      let boxId = 1;
      let actionId = 1;
      let symLinkId = 1;

      const imageDb = new Database(imagesPath);
      imageDb.exec(
        'CREATE TABLE symbols (id INTEGER PRIMARY KEY, rid TEXT UNIQUE, data BLOB, compressed INTEGER, type INTEGER, width INTEGER, height INTEGER)'
      );

      const imageMap = new Map();
      (obf.images || []).forEach((img, idx) => {
        const rid = `{IMAGE-${idx}}`;
        imageDb
          .prepare(
            'INSERT INTO symbols (rid, data, compressed, type, width, height) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(rid, Buffer.from(img.data, 'base64'), 0, 1, 100, 100);
        imageMap.set(img.id, rid);
      });
      imageDb.close();

      boards.forEach((board) => {
        const numericPageId = pageId++;
        const pageResId = resId++;
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

        const currentBoxId = boxId++;
        const boxResId = resId++;
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

        board.buttons.forEach((btn, idx) => {
          const numericBtnId = btnId++;
          const btnResId = resId++;

          let currentSymId = null;
          if (btn.image_id && imageMap.has(btn.image_id)) {
            currentSymId = symLinkId++;
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
            const actId = actionId++;
            db.prepare('INSERT INTO actions (id, resource_id, rank, code) VALUES (?, ?, 1, 1)').run(
              actId,
              btnResId,
              1
            );
            // Note: we can't easily map back to numeric target page ID here if it wasn't processed yet, but we'll use a placeholder or ID
            db.prepare('INSERT INTO action_data (action_id, key, value) VALUES (?, 1, ?)').run(
              actId,
              btn.load_board.id
            );
          }

          // Location
          let loc = idx;
          if (board.grid?.order) {
            board.grid.order.forEach((row, r) => {
              row.forEach((bid, c) => {
                if (bid === btn.id) loc = r * board.grid.columns + c;
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

module.exports = TouchChat;
