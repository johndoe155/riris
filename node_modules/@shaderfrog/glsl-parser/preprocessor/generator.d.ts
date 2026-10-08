import { PreprocessorProgram } from './preprocessor.js';
import { PreprocessorAstNode } from './preprocessor-node.js';
type Generator = (ast: PreprocessorProgram | PreprocessorAstNode | PreprocessorAstNode[] | string | string[] | undefined | null) => string;
declare const generate: Generator;
export default generate;
