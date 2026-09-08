/**
 * SPREADSHEET IMPORT — the pure half.
 *
 * Everything here is a function of its arguments: no database, no Nest, no file system, no
 * xlsx. The workbook decoder lives in the API module because that is where the parsing
 * dependency belongs; what it produces is a plain grid of cells, and from that point on the
 * decisions that actually matter — where the header is, which column is which field,
 * whether "1,200" is a quantity, whether three rows are one order — are made here where
 * they can be tested without booting anything.
 *
 * That split is the reason this is a first-class integration path rather than a script. The
 * behaviour a factory will argue with is the behaviour under unit test.
 */
export * from "./spec.js";
export * from "./sheet.js";
export * from "./mapping.js";
export * from "./validate.js";
export * from "./group.js";
