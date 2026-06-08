const path = require("path");
const sharp = require("sharp");

const referencePath = "C:/Users/Aaron Ge/.codex/generated_images/019ea1de-10da-7630-b17d-8ee86b068f29/interface-pack/exact-size/B09-phone-handoff-context-export-desktop.png";
const currentPath = path.join(__dirname, "B09-phone-handoff-context-export-desktop-closer.png");
const outputPath = path.join(__dirname, "B09-reference-vs-current-hero-buttons.png");

const width = 2880;
const headerHeight = 34;
const labelSvg = `
  <svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${headerHeight}" fill="#101827"/>
    <text x="14" y="23" fill="#e5edf6" font-family="Arial, sans-serif" font-size="16" font-weight="700">Reference B09</text>
    <text x="1454" y="23" fill="#e5edf6" font-family="Arial, sans-serif" font-size="16" font-weight="700">Current app B09 - hero buttons wired</text>
  </svg>`;

(async () => {
  const reference = await sharp(referencePath).resize(1440, 1024).png().toBuffer();
  const current = await sharp(currentPath).resize(1440, 1024).png().toBuffer();
  await sharp({
    create: {
      width,
      height: 1024 + headerHeight,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([
      { input: Buffer.from(labelSvg), top: 0, left: 0 },
      { input: reference, top: headerHeight, left: 0 },
      { input: current, top: headerHeight, left: 1440 }
    ])
    .png()
    .toFile(outputPath);
  console.log(outputPath);
})();
