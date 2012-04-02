var util   = require('util')
  , assert = require('assert')
  , parser = require('./parser')

var Rule   = parser.Rule


function astToParser(tree) {
  var nonterminals = {}

  return treeMapPostorder(tree, mapper)

  function mapper(name, children) {
    switch (name) {
      // To simplify...
      case 'identifier':
        return [ name, children.join("") ]

      case 'lefthand':
        if (children[1]) {
          var modifier = children[0]
            , name     = children[1][1]

        } else {
          var modifier = ' '
            , name     = children[0][1]
        }

        return (
          { transparent : (modifier == '*')
          , name        : name
          })


      // Primitives
      case 'terminal':
        var value = handleEscapes(children.join(""))
        return Rule.terminal(value)

      function handleEscapes(str) {
        return str.replace(/\\([tnr\\])/, function(_, chr) {
          return { 't':"\t", 'n':"\n", 'r':"\r" }[chr]
        })
      }

      case 'charrange':
        var start = children[0]
          , end   = children[1]
        return Rule.charRange(start, end)

      case 'any-character':
        return Rule.regex(/^./)

      case 'nonterminal':
        var name = children[0][1]
        return nonterminal(name)


      // Higher-order rules
      case 'r_any':
        return Rule.any.apply(null, children)

      case 'r_sequence':
        return Rule.sequence.apply(null, children)


      // Second-order rules
      case 'r_repeat':
        var rule     = children[0]
          , operator = children[1]
          , fun      = { '*':Rule.kleene, '?':Rule.optional }[operator]

        return fun(rule)

      case 'r_prefix':
        var operator = children[0]
          , rule     = children[1]
          , fun      = { '!':Rule.not, '&':Rule.and, '%':Rule.ignore }[operator]

        return fun(rule)


      // body
      case 'rule':
        var lhs = children[0]
          , rhs = children[1]

        return (
          { transparent : lhs.transparent
          , name        : lhs.name
          , value       : rhs
          })


      case '$top':
        var rules = children
        rules.forEach(function(rule) {
          var transparent = rule.transparent
            , name        = rule.name
            , value       = rule.value

          if (transparent) {
            nonterminals[name] = value

          } else {
            nonterminals[name] = Rule.name(name, value)
          }
        })

        return Rule.consumesAll(nonterminals['$top'])

      default:
        throw new Error("unimplemented: " + name)
    }
  }

  function nonterminal(name) {
    return function(tokens) {
      return nonterminals[name](tokens)
    }
  }
}

exports.convert = astToParser


//-- Utility functions ----------------------------------------------
// Traverses a tree in postorder (depth-first left-to-right)
function treeMapPostorder(tree, fun) {
  var name        = tree[0]
    , children    = tree.slice(1)
    , resChildren = children.map(applyToChild)

  return fun(name, resChildren)

  function applyToChild(child) {
    if (Array.isArray(child)) {
      return treeMapPostorder(child, fun)

    } else {
      return child
    }
  }
}
