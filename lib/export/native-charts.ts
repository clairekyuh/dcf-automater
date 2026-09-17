import JSZip from "jszip";

type ChartSeries = {
  name: string;
  categories: string;
  values: string;
  color: string;
  noFill?: boolean;
  numericCategories?: boolean;
};

type NativeChart = {
  title: string;
  type: "line" | "column" | "bar" | "stackedBar" | "stackedColumn";
  series: ChartSeries[];
  from: { col: number; row: number };
  to: { col: number; row: number };
  valueFormat?: string;
};

const chartNamespace = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function seriesXml(series: ChartSeries, index: number, type: NativeChart["type"]) {
  const line = type === "line";
  const noFill = series.noFill
    ? "<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>"
    : line
      ? `<c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill></a:ln></c:spPr></c:marker>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${series.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
  const categoryReference = series.numericCategories
    ? `<c:numRef><c:f>${escapeXml(series.categories)}</c:f></c:numRef>`
    : `<c:strRef><c:f>${escapeXml(series.categories)}</c:f></c:strRef>`;
  return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${escapeXml(series.name)}</c:v></c:tx>${noFill}<c:cat>${categoryReference}</c:cat><c:val><c:numRef><c:f>${escapeXml(series.values)}</c:f></c:numRef></c:val></c:ser>`;
}

function chartXml(chart: NativeChart, id: number) {
  const isLine = chart.type === "line";
  const isBar = chart.type === "bar" || chart.type === "stackedBar";
  const stacked = chart.type === "stackedBar" || chart.type === "stackedColumn";
  const plot = isLine
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${chart.series.map((series, index) => seriesXml(series, index, chart.type)).join("")}<c:axId val="${id * 2 + 1000}"/><c:axId val="${id * 2 + 1001}"/></c:lineChart>`
    : `<c:barChart><c:barDir val="${isBar ? "bar" : "col"}"/><c:grouping val="${stacked ? "stacked" : "clustered"}"/><c:varyColors val="0"/>${chart.series.map((series, index) => seriesXml(series, index, chart.type)).join("")}<c:gapWidth val="${isBar ? 55 : 85}"/>${stacked ? "<c:overlap val=\"100\"/>" : ""}<c:axId val="${id * 2 + 1000}"/><c:axId val="${id * 2 + 1001}"/></c:barChart>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${chartNamespace}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${relationshipNamespace}"><c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${escapeXml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}<c:catAx><c:axId val="${id * 2 + 1000}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${isBar ? "l" : "b"}"/><c:tickLblPos val="nextTo"/><c:crossAx val="${id * 2 + 1001}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${id * 2 + 1001}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${isBar ? "b" : "l"}"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="D9DDD8"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${escapeXml(chart.valueFormat || "#,##0")}" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${id * 2 + 1000}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="t"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
}

function drawingXml(charts: NativeChart[]) {
  const anchors = charts.map((chart, index) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${chart.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${chart.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="Chart ${index + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="${chartNamespace}"><c:chart xmlns:c="${chartNamespace}" xmlns:r="${relationshipNamespace}" r:id="rId${index + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`;
}

export async function addNativeVisualSummaryCharts(buffer: Buffer | Uint8Array | ArrayBuffer, peerCount: number) {
  const zip = await JSZip.loadAsync(buffer);
  const worksheetPath = "xl/worksheets/sheet2.xml";
  const worksheetFile = zip.file(worksheetPath);
  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!worksheetFile || !contentTypesFile) throw new Error("Visual Summary worksheet package parts were not found.");

  const charts: NativeChart[] = [
    { title: "Valuation ranges ($ per share)", type: "bar", from: { col: 10, row: 3 }, to: { col: 26, row: 12 }, valueFormat: "$0", series: [
      { name: "Low", categories: "'Visual Summary'!$B$6:$B$10", values: "'Visual Summary'!$C$6:$C$10", color: "8EA99A" },
      { name: "High", categories: "'Visual Summary'!$B$6:$B$10", values: "'Visual Summary'!$D$6:$D$10", color: "13271E" },
    ] },
    { title: "Operating forecast (USD millions)", type: "line", from: { col: 10, row: 13 }, to: { col: 21, row: 26 }, series: [
      { name: "Revenue", categories: "'Visual Summary'!$AI$15:$AN$15", values: "'Visual Summary'!$C$16:$H$16", color: "4D765F" },
      { name: "EBITDA", categories: "'Visual Summary'!$AI$15:$AN$15", values: "'Visual Summary'!$C$17:$H$17", color: "13271E" },
      { name: "UFCF", categories: "'Visual Summary'!$AI$15:$AN$15", values: "'Visual Summary'!$C$18:$H$18", color: "B66A3C" },
    ] },
    { title: "Forecast margins", type: "line", from: { col: 22, row: 13 }, to: { col: 33, row: 26 }, valueFormat: "0.0%", series: [
      { name: "Gross margin", categories: "'Visual Summary'!$AI$15:$AN$15", values: "'Visual Summary'!$C$23:$H$23", color: "41651C" },
      { name: "EBIT margin", categories: "'Visual Summary'!$AI$15:$AN$15", values: "'Visual Summary'!$C$24:$H$24", color: "B66A3C" },
    ] },
    { title: "Enterprise value composition", type: "stackedColumn", from: { col: 10, row: 27 }, to: { col: 21, row: 39 }, series: [
      { name: "PV of forecast UFCF", categories: "'Visual Summary'!$B$29:$B$30", values: "'Visual Summary'!$C$29:$C$30", color: "8EA99A" },
      { name: "PV of terminal value", categories: "'Visual Summary'!$B$29:$B$30", values: "'Visual Summary'!$D$29:$D$30", color: "13271E" },
    ] },
    { title: "Enterprise to equity value", type: "column", from: { col: 22, row: 27 }, to: { col: 33, row: 39 }, series: [
      { name: "Enterprise value", categories: "'Visual Summary'!$B$35:$B$36", values: "'Visual Summary'!$C$35:$C$36", color: "13271E" },
      { name: "Cash", categories: "'Visual Summary'!$B$35:$B$36", values: "'Visual Summary'!$D$35:$D$36", color: "8EA99A" },
      { name: "Debt and other claims", categories: "'Visual Summary'!$B$35:$B$36", values: "'Visual Summary'!$E$35:$E$36", color: "B66A3C" },
      { name: "Equity value", categories: "'Visual Summary'!$B$35:$B$36", values: "'Visual Summary'!$F$35:$F$36", color: "41651C" },
    ] },
    ...(peerCount > 0 ? [{ title: "Peer EV / EBITDA", type: "bar" as const, from: { col: 10, row: 40 }, to: { col: 26, row: 53 }, valueFormat: "0.0x", series: [
      { name: "EV / EBITDA", categories: `'Visual Summary'!$B$41:$B$${40 + peerCount}`, values: `'Visual Summary'!$D$41:$D$${40 + peerCount}`, color: "41651C" },
    ] }] : []),
  ];

  let worksheetXml = await worksheetFile.async("string");
  if (!worksheetXml.includes("xmlns:r=")) worksheetXml = worksheetXml.replace("<worksheet ", `<worksheet xmlns:r="${relationshipNamespace}" `);
  worksheetXml = worksheetXml.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>');
  zip.file(worksheetPath, worksheetXml);
  zip.file("xl/worksheets/_rels/sheet2.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  zip.file("xl/drawings/drawing1.xml", drawingXml(charts));
  zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${charts.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${index + 1}.xml"/>`).join("")}</Relationships>`);
  charts.forEach((chart, index) => zip.file(`xl/charts/chart${index + 1}.xml`, chartXml(chart, index + 1)));

  let contentTypes = await contentTypesFile.async("string");
  const overrides = `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${charts.map((_, index) => `<Override PartName="/xl/charts/chart${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}`;
  contentTypes = contentTypes.replace("</Types>", `${overrides}</Types>`);
  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
