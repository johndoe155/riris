import generate from './generator.js';
import { preprocessAst, preprocessComments, PreprocessorOptions, visitPreprocessedAst } from './preprocessor.js';
import * as parser from './preprocessor-parser.js';
/**
 * This is the main entry point for the preprocessor. It parses the source
 * code and returns an AST. It protects the user from the horrific peggy
 * SyntaxError, by wrapping it in a nicer custom error.
 */
declare const parse: (src: string, options?: PreprocessorOptions) => PreprocessorProgram;
declare const preprocess: (src: string, options?: PreprocessorOptions) => string;
export default preprocess;
export { parse, preprocessAst, preprocessComments, generate, preprocess, parser, visitPreprocessedAst, };
