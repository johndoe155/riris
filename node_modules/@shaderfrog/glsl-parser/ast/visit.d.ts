import type { AstNode, Program } from './ast-types.js';
export type Path<NodeType> = {
    node: NodeType;
    parent: Program | AstNode | undefined;
    parentPath: Path<any> | undefined;
    key: string | undefined;
    index: number | undefined;
    stop: () => void;
    skip: () => void;
    remove: () => void;
    replaceWith: (replacer: AstNode) => void;
    findParent: (test: (p: Path<any>) => boolean) => Path<any> | undefined;
    stopped?: boolean;
    skipped?: boolean;
    removed?: boolean;
    replaced?: any;
};
export type NodeVisitor<NodeType> = {
    enter?: (p: Path<NodeType>) => void;
    exit?: (p: Path<NodeType>) => void;
};
export type NodeVisitors = {
    [NodeType in AstNode['type']]?: NodeVisitor<Extract<AstNode, {
        type: NodeType;
    }>>;
} & {
    program?: NodeVisitor<Program>;
};
/**
 * Apply the visitor pattern to an AST that conforms to this compiler's spec
 */
export declare const visit: (ast: Program | AstNode, visitors: NodeVisitors) => void;
