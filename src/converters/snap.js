const fs = require('fs-extra');
const Database = require('better-sqlite3');

const Snap = {
  async to_external(filePath) {
    let db = null;
    try {
      db = new Database(filePath, { readonly: true });

      const pages = db.prepare('SELECT * FROM Page').all();
      const idToUniqueId = {};
      pages.forEach((p) => {
        idToUniqueId[String(p.Id)] = String(p.UniqueId || p.Id);
      });

      const pageSetProps = {};
      try {
        const props = db.prepare('SELECT * FROM PageSetProperties LIMIT 1').get();
        if (props) {
          Object.assign(pageSetProps, props);
        }
      } catch (_e) {
        // Ignore
      }

      const imagesMap = new Map();
      try {
        const images = db
          .prepare('SELECT Id, Identifier, Data FROM PageSetData WHERE Identifier LIKE "IMG:%"')
          .all();
        images.forEach((img) => {
          imagesMap.set(img.Id, {
            id: `img_${img.Id}`,
            data: img.Data.toString('base64'),
            content_type: 'image/png', // Guessing PNG
            ext_snap_identifier: img.Identifier,
          });
        });
      } catch (_e) {
        // Ignore
      }

      const result = {
        boards: [],
        images: [],
        sounds: [],
      };

      const boardsMap = new Map();

      pages.forEach((pageRow) => {
        const uniqueId = idToUniqueId[String(pageRow.Id)];
        const board = {
          id: uniqueId,
          name: pageRow.Title || pageRow.Name || '',
          buttons: [],
          grid: {
            rows: 0,
            columns: 0,
            order: [],
          },
          style: {
            background_color: pageRow.BackgroundColor
              ? `#${(pageRow.BackgroundColor & 0x00ffffff).toString(16).padStart(6, '0')}`
              : undefined,
          },
          images: [],
          ext_snap_technical_id: pageRow.Id,
          ext_snap_pageset_properties: pageSetProps,
        };
        boardsMap.set(pageRow.Id, board);
        result.boards.push(board);
      });

      const buttons = db
        .prepare(
          `
        SELECT b.*, ep.GridPosition, er.PageId, er.BackgroundColor as RefBackgroundColor, er.ForegroundColor as RefForegroundColor
        FROM Button b
        INNER JOIN ElementReference er ON b.ElementReferenceId = er.Id
        LEFT JOIN ElementPlacement ep ON ep.ElementReferenceId = er.Id
        GROUP BY b.Id
      `
        )
        .all();

      buttons.forEach((btnRow) => {
        const board = result.boards.find((b) => b.ext_snap_technical_id === btnRow.PageId);
        if (board) {
          const button = {
            id: String(btnRow.Id),
            label: btnRow.Label || '',
            vocalization: btnRow.Message || btnRow.Label || '',
            style: {
              background_color:
                btnRow.RefBackgroundColor || btnRow.BackgroundColor
                  ? `#${((btnRow.RefBackgroundColor || btnRow.BackgroundColor) & 0x00ffffff).toString(16).padStart(6, '0')}`
                  : undefined,
              border_color: btnRow.BorderColor
                ? `#${(btnRow.BorderColor & 0x00ffffff).toString(16).padStart(6, '0')}`
                : undefined,
              font_color:
                btnRow.RefForegroundColor || btnRow.LabelColor
                  ? `#${((btnRow.RefForegroundColor || btnRow.LabelColor) & 0x00ffffff).toString(16).padStart(6, '0')}`
                  : undefined,
            },
          };

          if (btnRow.PageSetImageId && imagesMap.has(btnRow.PageSetImageId)) {
            const img = imagesMap.get(btnRow.PageSetImageId);
            if (!board.images.find((i) => i.id === img.id)) {
              board.images.push(img);
            }
            button.image_id = img.id;
          }

          if (btnRow.NavigatePageId && idToUniqueId[String(btnRow.NavigatePageId)]) {
            button.load_board = { id: idToUniqueId[String(btnRow.NavigatePageId)] };
          }
          board.buttons.push(button);

          const pos = btnRow.GridPosition;
          if (pos && pos.includes(',')) {
            const [x, y] = pos.split(',').map((n) => parseInt(n));
            board.grid.columns = Math.max(board.grid.columns, x + 1);
            board.grid.rows = Math.max(board.grid.rows, y + 1);
            if (!board.grid.order[y]) {
              for (let i = board.grid.order.length; i <= y; i++) {
                board.grid.order[i] = [];
              }
            }
            board.grid.order[y][x] = button.id;
          }
        }
      });

      // Normalize grid order and handle pages with buttons but no grid
      result.boards.forEach((board) => {
        if (board.buttons.length > 0 && (board.grid.rows === 0 || board.grid.columns === 0)) {
          // Default 4xX grid if no positions
          board.grid.columns = 4;
          board.grid.rows = Math.ceil(board.buttons.length / 4);
          board.grid.order = Array.from({ length: board.grid.rows }, () => Array(4).fill(null));
          board.buttons.forEach((btn, idx) => {
            const r = Math.floor(idx / 4);
            const c = idx % 4;
            board.grid.order[r][c] = btn.id;
          });
        }

        for (let r = 0; r < board.grid.rows; r++) {
          if (!board.grid.order[r]) board.grid.order[r] = [];
          for (let c = 0; c < board.grid.columns; c++) {
            if (board.grid.order[r][c] === undefined) {
              board.grid.order[r][c] = null;
            }
          }
        }
      });

      return result;
    } finally {
      if (db) db.close();
    }
  },
  async from_external(obf, outputPath) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    const db = new Database(outputPath, { readonly: false });

    try {
      db.exec(`
        CREATE TABLE Page (Id INTEGER PRIMARY KEY, UniqueId TEXT UNIQUE, Title TEXT, Name TEXT, BackgroundColor INTEGER);
        CREATE TABLE Button (Id INTEGER PRIMARY KEY, Label TEXT, Message TEXT, NavigatePageId INTEGER, ElementReferenceId INTEGER, LibrarySymbolId INTEGER, PageSetImageId INTEGER, MessageRecordingId INTEGER, SerializedMessageSoundMetadata TEXT, UseMessageRecording INTEGER, LabelColor INTEGER, BackgroundColor INTEGER, BorderColor INTEGER, BorderThickness REAL, FontSize REAL, FontFamily TEXT, FontStyle INTEGER);
        CREATE TABLE ElementReference (Id INTEGER PRIMARY KEY, PageId INTEGER, ForegroundColor INTEGER, BackgroundColor INTEGER);
        CREATE TABLE ElementPlacement (Id INTEGER PRIMARY KEY, ElementReferenceId INTEGER, GridPosition TEXT, GridSpan TEXT NOT NULL DEFAULT '1,1');
        CREATE TABLE PageSetData (Id INTEGER PRIMARY KEY, Identifier TEXT UNIQUE, Data BLOB, RefCount INTEGER DEFAULT 1);
        CREATE TABLE PageSetProperties (Id INTEGER PRIMARY KEY, Language TEXT, FontFamily TEXT, FontSize REAL, PageBackgroundColor INTEGER);
      `);

      const boards = obf.boards || [obf];
      const pageIdMap = new Map();
      const imageIdMap = new Map();

      // Insert PageSetProperties (minimal)
      db.prepare('INSERT INTO PageSetProperties (Language) VALUES (?)').run(obf.locale || 'en');

      // Insert Images (PageSetData)
      let imageDataId = 1;
      const images = obf.images || [];
      images.forEach((img) => {
        if (img.data) {
          const identifier = img.ext_snap_identifier || `IMG:${img.id}`;
          const data = Buffer.from(img.data, 'base64');
          db.prepare('INSERT INTO PageSetData (Id, Identifier, Data) VALUES (?, ?, ?)').run(
            imageDataId,
            identifier,
            data
          );
          imageIdMap.set(img.id, imageDataId);
          imageDataId++;
        }
      });

      // Insert Pages
      let pageId = 1;
      boards.forEach((board) => {
        const numericId = pageId++;
        pageIdMap.set(board.id, numericId);
        db.prepare(
          'INSERT INTO Page (Id, UniqueId, Title, Name, BackgroundColor) VALUES (?, ?, ?, ?, ?)'
        ).run(
          numericId,
          board.id,
          board.name,
          board.name,
          board.style?.background_color
            ? parseInt(board.style.background_color.replace('#', ''), 16)
            : null
        );
      });

      // Insert Buttons & References
      let buttonId = 1;
      let refId = 1;
      let placementId = 1;

      boards.forEach((board) => {
        const numericPageId = pageIdMap.get(board.id);
        board.buttons.forEach((btn, _idx) => {
          const numericRefId = refId++;
          db.prepare(
            'INSERT INTO ElementReference (Id, PageId, BackgroundColor, ForegroundColor) VALUES (?, ?, ?, ?)'
          ).run(
            numericRefId,
            numericPageId,
            btn.style?.background_color
              ? parseInt(btn.style.background_color.replace('#', ''), 16)
              : null,
            btn.style?.font_color ? parseInt(btn.style.font_color.replace('#', ''), 16) : null
          );

          let navigateId = null;
          if (btn.load_board) {
            navigateId = pageIdMap.get(btn.load_board.id || btn.load_board.path) || null;
          }

          db.prepare(
            'INSERT INTO Button (Id, Label, Message, NavigatePageId, ElementReferenceId, PageSetImageId, BorderColor) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(
            buttonId++,
            btn.label,
            btn.vocalization || btn.label,
            navigateId,
            numericRefId,
            imageIdMap.get(btn.image_id) || null,
            btn.style?.border_color ? parseInt(btn.style.border_color.replace('#', ''), 16) : null
          );

          // Find position
          let pos = '0,0';
          if (board.grid?.order) {
            board.grid.order.forEach((row, r) => {
              row.forEach((bid, c) => {
                if (bid === btn.id) pos = `${c},${r}`;
              });
            });
          }

          db.prepare(
            'INSERT INTO ElementPlacement (Id, ElementReferenceId, GridPosition) VALUES (?, ?, ?)'
          ).run(placementId++, numericRefId, pos);
        });
      });
    } finally {
      db.close();
    }
  },
};

module.exports = Snap;
