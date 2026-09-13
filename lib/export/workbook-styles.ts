import type ExcelJS from "exceljs";

export const workbookColors = {
  navy: "17324D",
  blue: "0000FF",
  teal: "20B7C9",
  paleBlue: "E8F2F7",
  paleGreen: "EEF5E6",
  gray: "66727A",
  lightBorder: "C8D1D6",
  white: "FFFFFF",
  black: "000000",
} as const;

export const workbookFormats = {
  money: "$#,##0;[Red]($#,##0);-",
  perShare: "$0.00;[Red]($0.00);-",
  percent: "0.0%;[Red](0.0%);-",
  multiple: "0.0x;[Red](0.0x);-",
} as const;

export function setWorkbookTitle(sheet: ExcelJS.Worksheet, range: string, title: string, subtitle?: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = title;
  cell.font = { name: "Aptos Display", size: 18, bold: true, color: { argb: workbookColors.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: workbookColors.navy } };
  cell.alignment = { vertical: "middle" };
  if (subtitle) cell.note = subtitle;
}

export function styleWorkbookSection(row: ExcelJS.Row, from = 2, to = 12) {
  row.height = 21;
  for (let column = from; column <= to; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: workbookColors.navy } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: workbookColors.white } };
    cell.border = { bottom: { style: "thin", color: { argb: workbookColors.navy } } };
  }
}

export function styleWorkbookInput(cell: ExcelJS.Cell, note?: string) {
  cell.font = { name: "Aptos", size: 10, color: { argb: workbookColors.blue } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE6" } };
  if (note) cell.note = note;
}

export function styleWorkbookFormula(cell: ExcelJS.Cell, linked = false) {
  cell.font = { name: "Aptos", size: 10, color: { argb: linked ? "008000" : workbookColors.black } };
}

export function styleWorkbookTableHeader(row: ExcelJS.Row, from: number, to: number) {
  row.height = 24;
  for (let column = from; column <= to; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: workbookColors.navy } };
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: workbookColors.white } };
    cell.alignment = { vertical: "middle", horizontal: column === from ? "left" : "right", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: workbookColors.white } } };
  }
}

export function applyWorkbookBodyStyle(sheet: ExcelJS.Worksheet, range: string) {
  const [from, to] = range.split(":");
  const start = sheet.getCell(from);
  const end = sheet.getCell(to);
  for (let row = start.row; row <= end.row; row += 1) {
    for (let column = start.col; column <= end.col; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.font = cell.font?.name ? cell.font : { name: "Aptos", size: 10, color: { argb: workbookColors.black } };
      cell.border = { bottom: { style: "hair", color: { argb: workbookColors.lightBorder } } };
      cell.alignment = { vertical: "middle", horizontal: column === start.col ? "left" : "right" };
    }
  }
}
