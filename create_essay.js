const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

// 创建文档内容
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: "Microsoft YaHei",
          size: 24
        }
      }
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
          size: 36,
          bold: true,
          font: "Microsoft YaHei"
        },
        paragraph: {
          spacing: { before: 240, after: 240 },
          alignment: AlignmentType.CENTER
        }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: {
          width: 12240,
          height: 15840
        },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("春天的美好")]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("春天，是一年四季中最充满希望的季节。当第一缕春风轻轻拂过大地，万物便开始苏醒，整个世界仿佛被重新染上了色彩。")
        ]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("清晨，推开窗户，清新的空气扑面而来。远处的山峦披上了嫩绿的新装，近处的花坛里，五彩缤纷的花朵竞相开放。红的像火，粉的像霞，白的像雪，把大地装扮得格外美丽。")
        ]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("春天也是播种的季节。农民伯伯们在田野里辛勤劳作，播下希望的种子。孩子们在草地上放风筝、追逐嬉戏，欢声笑语回荡在蓝天白云之间。")
        ]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("我爱春天，爱它的生机勃勃，爱它的五彩斑斓，更爱它带给人们的无限希望。让我们珍惜这美好的时光，用心感受大自然的馈赠。")
        ]
      }),
      new Paragraph({
        spacing: { before: 400 },
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: "—— Jacky", italics: true })
        ]
      })
    ]
  }]
});

// 生成文档
Packer.toBuffer(doc).then(buffer => {
  const outputPath = 'C:\\Users\\15727\\Desktop\\春天的美好.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log('Word文档已创建：' + outputPath);
});
