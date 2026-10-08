import { NodeVisitor, Path } from '../ast/visit.js';
import { PreprocessorAstNode, PreprocessorSegmentNode } from './preprocessor-node.js';
export type PreprocessorProgram = {
    type: string;
    program: PreprocessorSegmentNode[];
    wsEnd?: string;
};
declare const preprocessComments: (src: string) => string;
type NodeEvaluator<NodeType> = (node: NodeType, visit: (node: PreprocessorAstNode) => any) => any;
export type NodeEvaluators = Partial<{
    [NodeType in PreprocessorAstNode['type']]: NodeEvaluator<Extract<PreprocessorAstNode, {
        type: NodeType;
    }>>;
}>;
export type Macro = {
    args?: PreprocessorAstNode[];
    body: string;
};
export type Macros = {
    [name: string]: Macro;
};
type VisitorOverride = (ast: PreprocessorAstNode | PreprocessorProgram, visitors: {
    [NodeType in PreprocessorAstNode['type']]?: NodeVisitor<Extract<PreprocessorAstNode, {
        type: NodeType;
    }>>;
}) => void;
export declare const visitPreprocessedAst: VisitorOverride;
type PathOverride<NodeType> = {
    node: NodeType;
    parent: PreprocessorAstNode | undefined;
    parentPath: Path<any> | undefined;
    key: string | undefined;
    index: number | undefined;
    skip: () => void;
    remove: () => void;
    replaceWith: (replacer: PreprocessorAstNode) => void;
    findParent: (test: (p: Path<any>) => boolean) => Path<any> | undefined;
    skipped?: boolean;
    removed?: boolean;
    replaced?: any;
};
/**
 * Perform the preprocessing logic, aka the "preprocessing" phase of the compiler.
 * Expand macros, evaluate conditionals, etc
 * TODO: Define the strategy for conditionally removing certain macro types
 * and conditionally expanding certain expressions. And take in optiona list
 * of pre defined thigns?
 * TODO: Handle __LINE__ and other constants.
 */
export type NodePreservers = {
    [nodeType: string]: (path: PathOverride<any>) => boolean;
};
export type PreprocessorOptions = {
    defines?: {
        [definitionName: string]: Object;
    };
    preserve?: NodePreservers;
    preserveComments?: boolean;
    stopOnError?: boolean;
    grammarSource?: string;
    startRule?: 'constant_expression' | 'program';
};
declare const unescapeSrc: (src: string, options?: PreprocessorOptions) => string;
declare const preprocessAst: (program: PreprocessorProgram, options?: PreprocessorOptions) => PreprocessorProgram;
export { preprocessAst, preprocessComments, unescapeSrc };
