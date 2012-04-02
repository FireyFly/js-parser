var util       = require('util')
  , fs         = require('fs')
  , assert     = require('assert')

  , parser     = require('./parser')
  , gparser    = require('./grammar-parser')
  , ast2parser = require('./grammar-ast-to-parser')

var Rule = parser.Rule


function readData() {
  if (process.argv.length != 4) {
    var file = process.argv.slice(0, 2).join(" ")
    process.stderr.write("Usage: " + file + " <grammar-file> <input-file>")
    process.exit(1)
  }

  var grammar = fs.readFileSync(process.argv[2]).toString()
    , input   = fs.readFileSync(process.argv[3]).toString()

  return (
    { grammar : grammar
    , input   : input
    })
}

var data = readData()

function parse(fun, input) {
  var result        = fun(input)
    , matchedLength = result && result[0]
    , tree          = result && result[1]

  if (parser.isFail(result)) {
    throw new Error("Match failed! @ '" + escape(result.tokens.slice(0, 10)
                  + "'; error: {" + result.value.pop() + "}"))
         //         + "; stack: {{{" + result.value.join(" ;; ") + "}}}"))

    function indented(arr) {
      return arr.map(function(x) { return "    " + x }).join("\n")
    }

    function escape(str) {
      return str.replace(/[\x00-\x1f]/g, function(c) {
        var code = c.charCodeAt()

        switch (code) {
          case  9: return "\\t"
          case 10: return "\\n"
          case 13: return "\\r"
          default: return "\\x" + code.toString(16)
        }
      })
    }

  } else {
    assert.equal(2, result.length)
    return tree
  }
}

var tree_   = parse(gparser.parse, data.grammar)
  , parser2 = ast2parser.convert(tree_)
  , tree    = parse(parser2, data.input)

var pretty = toSexprs("", tree)
console.log("Success!\n" + pretty)

function prettyPrint(parseTree) {
  var pretty = treeMapPostorder(tree, mapper)
  console.log(toSexprs("", pretty))

  function mapper(name, children) {
    switch (name) {
      case 'identifier':
        return [ name, children.join("") ]

      default:
        return [ name ].concat(children)
    }
  }
}

//-- Utility functions ----------------------------------------------
// Converts an array tree into well-formatted s-expressions
function toSexprs(indent, tree) {
  var node = tree[0]
    , rest = tree.slice(1)

  if (typeof tree == 'string') {
    return indent + quotes(tree)

  } else if (rest.length == 0) {
    return util.format("%s(%s)", indent, node)

  } else if (rest.every(isString)) {
    return util.format("%s(%s %s)", indent, node, rest.map(quotes).join(" "))

  } else {
    var newIndent  = indent + Array(node.length + 3).join(" ")
      , toSexprs_  = toSexprs.bind(null, newIndent)
      , restStr    = rest.map(toSexprs_).join("\n").trim()

    return util.format("%s(%s %s)", indent, node, restStr)
  }

  function trimLeft(str) { return str.replace(/^\s+/, "") }
  function quotes(str)   { return "'" + str + "'"         }
  function isString(any) { return typeof any == 'string'  }
}

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
