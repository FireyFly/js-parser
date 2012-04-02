var util   = require('util')
  , assert = require('assert')
  , parser = require('./parser')

var Rule   = parser.Rule

//-- Parser grammar parser ------------------------------------------
// Tokens/character types
var T_letter = Rule.any(Rule.charRange('a', 'z'), Rule.charRange('A', 'Z'))
  , T_arrow  = Rule.terminal('<-')
  , T_eol    = Rule.terminal("\n")
  , T_space  = Rule.terminal(" ", "\t", "\r")

  , T_quote  = Rule.terminal('"')
  , T_any    = Rule.regex(/^./)

// Rules
var R = {}
function nonterminal(str) {
  return function(tokens) {
    return R[str](tokens)
  }
}

//-- Characters
R.C_letter      = Rule.any(
                    Rule.charRange("A", "Z"),
                    Rule.charRange("a", "z"),
                    Rule.terminal("_", "-", "$"))
R.C_eol         = Rule.terminal("\n")
R.C_wspace      = Rule.terminal(" ", "\t", "\r")
R.C_any         = Rule.regex(/^./)

//-- Rules
R.S_            = Rule.ignore(Rule.kleene(R.C_wspace))
R.S_plus        = Rule.ignore(Rule.kleene(Rule.any(R.C_eol, R.C_wspace)))
R.line_sep      = Rule.ignore(
                    Rule.sequence(
                      R.S_,
                      R.C_eol,
                      R.S_plus))

R.identifier    = Rule.name('identifier',
                    Rule.sequence(
                      R.C_letter,
                      Rule.kleene(R.C_letter)))

R.lefthand      = Rule.name('lefthand',
                    Rule.sequence(
                      Rule.optional(Rule.terminal("*")),
                      R.S_,
                      R.identifier))

// primitives
//R.nonterminal   = Rule.name('nonterminal',
//                    Rule.sequence(
//                      R.C_letter,
//                      Rule.kleene(R.C_letter)))
R.nonterminal   = Rule.name('nonterminal',
                    Rule.sequence(
                      R.identifier,
                      Rule.not(Rule.terminal("<-"))))

R.charrange     = Rule.name('charrange',
                    Rule.sequence(
                      Rule.ignore(Rule.terminal("[")),
                      R.C_any,
                      Rule.ignore(Rule.terminal("-")),
                      R.C_any,
                      Rule.ignore(Rule.terminal("]"))))

R.terminal      = Rule.name('terminal',
                    Rule.any(
                      Rule.sequence(
                        Rule.ignore(Rule.terminal('"')),
                        R.C_any,
                        Rule.kleene(
                          Rule.sequence(
                            Rule.not(Rule.terminal('"')),
                            R.C_any)),
                        Rule.ignore(Rule.terminal('"'))),

                      Rule.sequence(
                        Rule.ignore(Rule.terminal("'")),
                        R.C_any,
                        Rule.kleene(
                          Rule.sequence(
                            Rule.not(Rule.terminal("'")),
                            R.C_any)),
                        Rule.ignore(Rule.terminal("'")))))

R.anyCharacter  = Rule.name('any-character',
                    Rule.ignore(Rule.terminal(".")))

R.endOfInput    = Rule.name('end-of-input',
                    Rule.ignore(Rule.terminal("$")))

R.regex         = Rule.name('regex',
                    Rule.sequence(
                      Rule.ignore(Rule.terminal("/")),
                      R.C_any,
                      Rule.kleene(
                        Rule.sequence(
                          Rule.not(Rule.terminal("/")),
                          R.C_any)),
                      Rule.ignore(Rule.terminal("/"))))

R.r_primitive   = Rule.any(
                    R.nonterminal,
                    R.charrange,
                    R.terminal,
//                    R.regex,
                    R.anyCharacter,
                    R.endOfInput,
                    Rule.sequence(
                      Rule.ignore(Rule.terminal("(")),
                      nonterminal("r_any"),
                      Rule.ignore(Rule.terminal(")"))))

// second-order
R.r_repeat      = Rule.name('r_repeat',
                    Rule.sequence(
                      R.r_primitive,
                      Rule.terminal("*", "?")))

R.r_prefix      = Rule.name('r_prefix',
                    Rule.sequence(
                      Rule.any(
                        Rule.terminal("!"),
                        Rule.terminal("&"),
                        Rule.terminal("%")),
                      R.r_primitive))

R.r_secondary   = Rule.any(R.r_repeat, R.r_prefix, R.r_primitive)

// higher-order
R.r_sequence    = Rule.name('r_sequence',
                    Rule.sequence(
                      R.r_secondary,
                      Rule.kleene(
                        Rule.sequence(
                          R.S_,
                          R.r_secondary))))

R.r_any         = Rule.name('r_any',
                    Rule.sequence(
                      R.r_sequence,
                      Rule.kleene(
                        Rule.sequence(
                          R.S_,
                          Rule.ignore(Rule.terminal("/")),
                          R.S_,
                          R.r_sequence))))

// actual body
R.rule          = Rule.name('rule',
                    Rule.sequence(
                      R.lefthand,
                      R.S_,
                      Rule.ignore(Rule.terminal("<-")),
                      R.S_,
                      R.r_any))

R.comment       = Rule.name('comment',
                    Rule.sequence(
                      R.S_,
                      Rule.terminal("#"),
                      Rule.kleene(
                        Rule.sequence(
                          Rule.not(R.line_sep),
                          T_any))))

R.line          = Rule.any(
                    Rule.ignore(R.comment),
                    R.rule)

R.lines         = Rule.sequence(
                    R.line,
                    Rule.kleene(
                      Rule.sequence(
                        R.line_sep,
                        R.line)))

var $top        = Rule.name('$top',
                    Rule.consumesAll(
                      Rule.sequence(
                        R.S_plus,
                        R.lines,
                        R.S_plus)))
//*/


exports.parse = $top
