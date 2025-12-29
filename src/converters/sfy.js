const plist = require('plist');
const fs = require('fs-extra');

const Sfy = {
  async to_external(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const data = plist.parse(content);

    const _top = data['$top']['root'];
    const objects = data['$objects'];

    const items = {
      strings: {},
      buttons: [],
    };
    const boardIds = {};
    const images = [];

    objects.forEach((item, idx) => {
      if (typeof item === 'string') {
        items.strings[idx] = item;
      } else if (item && typeof item === 'object' && item.mScreen !== undefined) {
        if (item.wordKey !== undefined) item.word = objects[item.wordKey];
        if (item.imageName !== undefined) item.symbol = objects[item.imageName];
        boardIds[item.mScreen] = true;
        items.buttons.push(item);
      }
    });

    const boards = [];
    let imageCounter = 0;

    const colors = {
      0: 'rgb(255, 255, 255)', // white
      1: 'rgb(255, 0, 0)', // red
      3: 'rgb(255, 112, 156)', // red pink
      2: 'rgb(255, 115, 222)', // pinky purple
      4: 'rgb(250, 196, 140)', // light red-orange
      5: 'rgb(255, 196, 87)', // orange
      6: 'rgb(255, 234, 117)', // yellow
      7: 'rgb(255, 241, 92)', // yellowy
      8: 'rgb(252, 242, 134)', // light yellow
      9: 'rgb(82, 209, 86)', // dark green
      10: 'rgb(149, 189, 42)', // navy green
      11: 'rgb(161, 245, 113)', // green
      12: 'rgb(196, 252, 141)', // pale green
      13: 'rgb(94, 207, 255)', // strong blue
      14: 'rgb(148, 223, 255)', // happy blue
      15: 'rgb(176, 223, 255)', // bluey
      16: 'rgb(194, 241, 255)', // light blue
      17: 'rgb(118, 152, 199)', // dark purple
      18: 'rgb(208, 190, 232)', // light purple
      19: 'rgb(153, 79, 0)', // brown
      20: 'rgb(0, 109, 235)', // dark blue
      21: 'rgb(0, 0, 0)', // black
      22: 'rgb(161, 161, 161)', // gray
      23: 'rgb(255, 108, 59)', // dark orange
    };

    Object.keys(boardIds).forEach((screenIdx) => {
      const idx = parseInt(screenIdx);
      let name = idx === 0 ? 'HOME' : `Screen ${idx}`;

      const rawButtons = items.buttons.filter((b) => b.mScreen === idx);
      let maxRow = 0;
      let maxCol = 0;
      rawButtons.forEach((b) => {
        maxRow = Math.max(maxRow, b.mRow);
        maxCol = Math.max(maxCol, b.mColumn);
      });

      const rows = maxRow + 1;
      const columns = maxCol + 1;
      const grid = {
        rows,
        columns,
        order: Array.from({ length: rows }, () => Array(columns).fill(null)),
      };

      const buttons = [];
      let buttonCounter = 0;

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
          const rawButton = rawButtons.find((b) => b.mRow === i && b.mColumn === j);
          if (rawButton) {
            let imageId = null;
            if (rawButton.symbol) {
              images.push({
                id: imageCounter,
                symbol: {
                  set: 'sfy',
                  name: rawButton.symbol,
                },
              });
              imageId = imageCounter;
              imageCounter++;
            }

            const button = {
              id: buttonCounter.toString(),
              label: rawButton.word,
              background_color: colors[rawButton.backgroundColorID] || 'rgb(255,255,255)',
              image_id: imageId !== null ? imageId.toString() : null,
              hidden: !rawButton.isOpen,
              ext_sfy_isLinked: rawButton.isLinked,
              ext_sfy_isProtected: rawButton.isProtected,
              ext_sfy_backgroundColorID: rawButton.backgroundColorID,
            };

            if (rawButton.customLabel && objects[rawButton.customLabel]) {
              button.vocalization = button.label;
              button.label = objects[rawButton.customLabel];
            }

            if (idx === 0 && rawButton.isLinked && boardIds[buttonCounter + 1]) {
              button.load_board = { id: (buttonCounter + 1).toString() };
            }

            grid.order[i][j] = button.id;
            buttons.push(button);
          }
          buttonCounter++;
        }
      }

      boards.push({
        id: idx.toString(),
        name,
        buttons,
        grid,
        ext_sfy_screen: idx,
      });
    });

    return {
      boards,
      images,
      sounds: [],
    };
  },
};

module.exports = Sfy;
