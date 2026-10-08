import { AstNode, Program } from '../ast/index.js';
import { Parse, ParserOptions } from './parser.js';
export declare const inspect: (arg: any) => void;
export declare const nextWarn: () => () => any;
export declare const buildParser: () => Promise<{
    parse: Parse;
    parser: typeof import("./parser.js");
    parseSrc: ParseSrc;
    debugSrc: (src: string) => void;
    debugStatement: (stmt: AstNode) => void;
    expectParsedStatement: (src: string, options?: {}) => void;
    parseStatement: (src: string, options?: ParserOptions) => Program;
    expectParsedProgram: (src: string, options?: ParserOptions) => void;
}>;
export declare const buildPreprocessorParser: () => Promise<{
    parse: (src: string, options?: import("../preprocessor/preprocessor.js").PreprocessorOptions) => PreprocessorProgram;
    parser: typeof import("../preprocessor/preprocessor-parser.js");
}>;
type ParseSrc = (src: string, options?: ParserOptions) => Program;
export {};
