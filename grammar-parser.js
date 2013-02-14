var util   = require('util')
  , assert = require('assert')
  , parser = require('./parser')

var Rule   = parser.Rule

//-- Parser grammar parser ------------------------------------------
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
R.C_any         = Rule.regex(/^./)

//-- Rules
R.WS            = Rule.ignore(
                    Rule.kleene(
                      Rule.terminal(" ", "\t", "\r", "\n")))
R.WS_           = Rule.ignore(
                    Rule.kleene(
                      Rule.terminal(" ", "\t", "\r")))

// Various
R.identifier    = Rule.name('identifier',
                    Rule.sequence(
                      R.C_letter,
                      Rule.kleene(R.C_letter)))

R.lefthand      = Rule.name('lefthand',
                    Rule.sequence(
                      Rule.optional(Rule.terminal("*")),
                      R.WS_,
                      R.identifier))

R.line_sep      = Rule.ignore(Rule.terminal("\n"))

// first-level
R.nonterminal   = Rule.name('nonterminal', R.identifier)

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

R.r_primitive   = Rule.any(
                    R.nonterminal,
                    R.charrange,
                    R.terminal,
                    R.anyCharacter,
                    Rule.sequence(
                      Rule.ignore(Rule.terminal("(")),
                      nonterminal("r_any"),
                      Rule.ignore(Rule.terminal(")"))))

// second-level
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

// third-level
R.r_sequence    = Rule.name('r_sequence',
                    Rule.sequence(
                      R.r_secondary,
                      Rule.kleene(
                        Rule.sequence(
                          R.WS_,
                          R.r_secondary))))

R.r_any         = Rule.name('r_any',
                    Rule.sequence(
                      R.r_sequence,
                      Rule.kleene(
                        Rule.sequence(
                          R.WS,
                          Rule.ignore(Rule.terminal("/")),
                          R.WS,
                          R.r_sequence))))

// actual body
R.rule          = Rule.name('rule',
                    Rule.sequence(
                      R.lefthand,
                      R.WS_,
                      Rule.ignore(Rule.terminal("<-")),
                      R.WS_,
                      R.r_any))

R.comment       = Rule.name('comment',
                    Rule.sequence(
                      Rule.terminal("#"),
                      Rule.kleene(
                        Rule.sequence(
                          Rule.not(Rule.terminal("\n")),
                          R.C_any))))

R.line          = Rule.any(
                    Rule.ignore(R.comment),
                    R.rule)

R.lines         = Rule.sequence(
                    R.line,
                    R.WS_,
                    Rule.kleene(
                      Rule.sequence(
                        R.line_sep,
                        R.WS,
                        R.line)))

var $top        = Rule.name('$top',
                    Rule.consumesAll(
                      Rule.sequence(
                        R.WS,
                        R.lines,
                        R.WS)))
//*/


exports.parse = $top
