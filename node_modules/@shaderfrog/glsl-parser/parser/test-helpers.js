var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { expect, vi } from 'vitest';
import { execSync } from 'child_process';
import util from 'util';
import generate from './generator.js';
export var inspect = function (arg) {
    return console.log(util.inspect(arg, false, null, true));
};
export var nextWarn = function () {
    console.warn = vi.fn();
    var i = 0;
    // @ts-ignore
    var mock = console.warn.mock;
    return function () { return mock.calls[i++][0]; };
};
export var buildParser = function () { return __awaiter(void 0, void 0, void 0, function () {
    var parser, parse, ps, ctx;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                execSync('npx peggy --cache --format es -o src/parser/parser.js src/parser/glsl-grammar.pegjs');
                return [4 /*yield*/, import('./parser.js')];
            case 1:
                parser = _a.sent();
                parse = parser.parse;
                ps = parseSrc(parse);
                ctx = {
                    parse: parse,
                    parseSrc: ps,
                };
                return [2 /*return*/, {
                        parse: parse,
                        parser: parser,
                        parseSrc: ps,
                        debugSrc: debugSrc(ctx),
                        debugStatement: debugStatement(ctx),
                        expectParsedStatement: expectParsedStatement(ctx),
                        parseStatement: parseStatement(ctx),
                        expectParsedProgram: expectParsedProgram(ctx),
                    }];
        }
    });
}); };
export var buildPreprocessorParser = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, parse, parser;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                execSync('npx peggy --cache --format es --allowed-start-rules program,constant_expression -o src/preprocessor/preprocessor-parser.js src/preprocessor/preprocessor-grammar.pegjs');
                return [4 /*yield*/, import('../preprocessor/index.js')];
            case 1:
                _a = _b.sent(), parse = _a.parse, parser = _a.parser;
                return [2 /*return*/, {
                        parse: parse,
                        parser: parser,
                    }];
        }
    });
}); };
// Keeping this around in case I need to figure out how to do tracing again
// Most of this ceremony around building a parser is dealing with Peggy's error
// format() function, where the grammarSource has to line up in generate() and
// format() to get nicely formatted errors if there's a syntax error in the
// grammar
// const buildParser = (file: string) => {
//   const grammar = fileContents(file);
//   try {
//     return peggy.generate(grammar, {
//       grammarSource: file,
//       cache: true,
//       trace: false,
//     });
//   } catch (e) {
//     const err = e as SyntaxError;
//     if ('format' in err && typeof err.format === 'function') {
//       console.error(err.format([{ source: file, text: grammar }]));
//     }
//     throw e;
//   }
// };
var middle = /\/\* start \*\/((.|[\r\n])+)(\/\* end \*\/)?/m;
var parseSrc = function (parse) { return function (src, options) {
    if (options === void 0) { options = {}; }
    var grammarSource = '<anonymous glsl>';
    try {
        return parse(src, __assign(__assign({}, options), { grammarSource: grammarSource, tracer: {
                trace: function (type) {
                    if (type.type === 'rule.match' &&
                        type.rule !== 'whitespace' &&
                        type.rule !== 'single_comment' &&
                        type.rule !== 'comment' &&
                        type.rule !== 'digit_sequence' &&
                        type.rule !== 'digit' &&
                        type.rule !== 'fractional_constant' &&
                        type.rule !== 'floating_constant' &&
                        type.rule !== 'translation_unit' &&
                        type.rule !== 'start' &&
                        type.rule !== 'external_declaration' &&
                        type.rule !== 'SEMICOLON' &&
                        type.rule !== 'terminal' &&
                        type.rule !== '_') {
                        if (type.rule === 'IDENTIFIER' || type.rule === 'TYPE_NAME') {
                            console.log('\x1b[35mMatch literal\x1b[0m', type.rule, type.result);
                        }
                        else {
                            console.log('\x1b[35mMatch\x1b[0m', type.rule);
                        }
                    }
                    // if (type.type === 'rule.fail') {
                    //   console.log('fail', type.rule);
                    // }
                },
            } }));
    }
    catch (e) {
        var err = e;
        if ('format' in err) {
            console.error(err.format([{ source: grammarSource, text: src }]));
        }
        console.error("Error parsing lexeme!\n\"".concat(src, "\""));
        throw err;
    }
}; };
var debugSrc = function (_a) {
    var parseSrc = _a.parseSrc;
    return function (src) {
        inspect(parseSrc(src).program);
    };
};
var debugStatement = function (_a) {
    var parseSrc = _a.parseSrc;
    return function (stmt) {
        var program = "void main() {/* start */".concat(stmt, "/* end */}");
        var ast = parseSrc(program);
        inspect(ast.program[0].body.statements[0]);
    };
};
var expectParsedStatement = function (_a) {
    var parseSrc = _a.parseSrc;
    return function (src, options) {
        if (options === void 0) { options = {}; }
        var program = "void main() {/* start */".concat(src, "/* end */}");
        var ast = parseSrc(program, options);
        var glsl = generate(ast);
        if (glsl !== program) {
            inspect(ast.program[0]);
            // @ts-ignore
            expect(glsl.match(middle)[1]).toBe(src);
        }
    };
};
var parseStatement = function (_a) {
    var parseSrc = _a.parseSrc;
    return function (src, options) {
        if (options === void 0) { options = {}; }
        var program = "void main() {".concat(src, "}");
        return parseSrc(program, options);
    };
};
var expectParsedProgram = function (_a) {
    var parseSrc = _a.parseSrc;
    return function (src, options) {
        var ast = parseSrc(src, options);
        var glsl = generate(ast);
        if (glsl !== src) {
            inspect(ast);
            expect(glsl).toBe(src);
        }
    };
};
