const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const Utils = require('./utils-node');
const axios = require('axios');

class PdfBuilder {
  static async build(obj, destPath, opts = {}) {
    const doc = new PDFDocument({
      layout: 'landscape',
      size: [11 * 72, 8.5 * 72], // Letter landscape
      info: {
        Title: obj.name || 'Communication Board'
      },
      autoFirstPage: false
    });

    const stream = fs.createWriteStream(destPath);
    doc.pipe(stream);

    if (obj.boards && obj.boards.length > 0) {
      // Multi-page (OBZ)
      for (let i = 0; i < obj.boards.length; i++) {
        const board = obj.boards[i];
        doc.addPage();
        await this.buildPage(doc, board, { ...opts, pageNum: i + 1, totalPages: obj.boards.length });
      }
    } else {
      // Single page
      doc.addPage();
      await this.buildPage(doc, obj, opts);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(destPath));
      stream.on('error', reject);
    });
  }

  static async buildPage(doc, board, opts) {
    const docWidth = doc.page.width;
    const docHeight = doc.page.height;
    const headerHeight = opts.headerless ? 0 : 80;
    const padding = 10;
    const textHeight = 20;

    // Draw Header (Simplified)
    if (!opts.headerless) {
      doc.rect(0, 0, docWidth, headerHeight).fill('#eeeeee');
      
      const buttons = [
        { label: "Go Back", x: 10, color: "#6D81D1" },
        { label: "Say that out loud", x: 120, w: 200, color: "#DDDB54" },
        { label: "Start Over", x: docWidth - 320, color: "#5c9c6d" },
        { label: "Oops", x: docWidth - 210, color: "#6653a6" },
        { label: "Stop", x: docWidth - 100, color: "#944747" },
        { label: "Clear", x: docWidth - 430, color: "#888888" }
      ];

      buttons.forEach(btn => {
        doc.rect(btn.x, 10, btn.w || 80, 60).fill(btn.color).stroke('#888888');
        doc.fillColor('#000000').fontSize(10).text(btn.label, btn.x, 35, { width: btn.w || 80, align: 'center' });
      });
    }

    // Draw Grid
    if (board.grid && board.grid.rows > 0 && board.grid.columns > 0) {
      const gridHeight = docHeight - headerHeight - textHeight - (padding * 2);
      const gridWidth = docWidth;
      const buttonHeight = (gridHeight - (padding * (board.grid.rows - 1))) / board.grid.rows;
      const buttonWidth = (gridWidth - (padding * (board.grid.columns - 1))) / board.grid.columns;

      for (let row = 0; row < board.grid.rows; row++) {
        for (let col = 0; col < board.grid.columns; col++) {
          const buttonId = board.grid.order[row][col];
          const button = (board.buttons || []).find(b => b.id === buttonId);
          
          if (!button || button.hidden) continue;

          const x = (padding * col) + (col * buttonWidth);
          const y = headerHeight + padding + (row * (buttonHeight + padding));

          // Background
          const bgColor = button.background_color ? Utils.fix_color(button.background_color, 'hex') : '#ffffff';
          const borderColor = button.border_color ? Utils.fix_color(button.border_color, 'hex') : '#eeeeee';

          doc.roundedRect(x, y, buttonWidth, buttonHeight, 5)
             .fillAndStroke(bgColor, borderColor);

          // Label
          const label = button.label || button.vocalization || "";
          doc.fillColor('#000000').fontSize(12);
          
          const labelY = opts.text_on_top ? y + 5 : y + buttonHeight - textHeight - 5;
          doc.text(label, x, labelY, { width: buttonWidth, align: 'center' });

          // Image
          if (button.image_id) {
            const image = (board.images || []).find(i => i.id === button.image_id);
            if (image) {
              try {
                let imageBuffer;
                if (image.data) {
                  // Data URI
                  const base64Data = image.data.split(',')[1];
                  imageBuffer = Buffer.from(base64Data, 'base64');
                } else if (image.url) {
                  // Remote URL
                  const response = await axios.get(image.url, { responseType: 'arraybuffer' });
                  imageBuffer = Buffer.from(response.data, 'binary');
                }

                if (imageBuffer) {
                  // pdfkit doesn't support SVG, so we'd need to convert it if it's SVG
                  // For now, we'll just try to draw it and catch errors
                  const imgY = opts.text_on_top ? y + textHeight + 5 : y + 5;
                  const imgHeight = buttonHeight - textHeight - 10;
                  doc.image(imageBuffer, x + 5, imgY, {
                    fit: [buttonWidth - 10, imgHeight],
                    align: 'center',
                    valign: 'center'
                  });
                }
              } catch (e) {
                // console.error(`Error rendering image ${image.id}: ${e.message}`);
                // Fallback to placeholder or just skip
                doc.rect(x + 10, y + 10, buttonWidth - 20, buttonHeight - 40).stroke();
                doc.fontSize(8).text("Img Err", x + 10, y + 30, { width: buttonWidth - 20, align: 'center' });
              }
            }
          }
        }
      }
    }
  }
}

module.exports = PdfBuilder;
