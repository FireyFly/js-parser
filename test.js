
var parser = require('./index')

//-- Utility functions ----------------------------------------------
function beginsIdentifier(c) {
	return c >= "a" && c <= "z" || c >= "A" && c <= "Z" ||
			c == "$" || c == "_";
}
function isNumber(c) {
	return c >= "0" && c <= "9";
}
function isWhitespace(c) {
	return c == " " || c == "\t" || c == "\n" || c == "\r";
}
function isIdentifier(c) {
	return beginsIdentifier(c) || isNumber(c);
}

//-- Create lexer & parser ------------------------------------------
// Lexer
var lexer = new parser.Lexer()

lexer.add("identifier", beginsIdentifier, isIdentifier)
lexer.add("number",     isNumber,         isNumber    )
lexer.add("string", function(c) {
	return c == '"'
}, function(c, i, str) {
	return i == 1 || (str[i-1] != '"' && str[i-2] != '\\')
})
lexer.add("whitespace",  isWhitespace, isWhitespace, true)
lexer.add("operator", function() {return true}, function() {return false})


function parseRuleFile(filename, callback) {
	function trim(str) { return str.trim() }

	require('fs').readFile(filename, function(err, content) {
		if (err) throw err

		var lines = content.toString().split("\n").map(trim)
		  , state = '$top'
		  , match

		var rulemap = {}
		var input   = []

		for (var i=0; i<lines.length; i++) {
			var line = lines[i]

			if (match = line.match(/^\[(.*)\]$/)) {
				state = match[1].toLowerCase()
			} else if (state == 'grammar') {
				if (match = line.match(/([^:]+)\s*::=/)) {
					var start = i
					for (++i; lines[i].match(/^\|/) && i < lines.length; i++);
					var end = i

					console.log(start, end)
					match = lines.slice(start, end).join(" ").split(/::=/)
					var name = match[0].trim()
					  , rules = match[1].split(/\|/).map(trim)
					console.log("Result:", name, rules)

					rules = rules.map(function(strRule) {
						return strRule.split(/\s+/).map(function(rtoken) {
							if (match = rtoken.match(/^(\*?)([^"]+)$/)) {
								return match[1] ? [match[2], "*"] : [match[2]]
							} else if (match = rtoken.match(/^"([^"]+)"$/)) {
								return match[1]
							} else {
								throw new Error("Invalid rtoken: " + rtoken)
							}
						})
					})

					rulemap[name] = rules
					--i
				} else if (line.match(/^(?:#.*)?$/)) {
					// Ignore empty lines or "comments"
				} else {
					throw new Error("Invalid line in grammar section: '"
							+ line + "'")
				}
			} else if (state == 'input') {
				input.push(line)
			}
		}

		console.log("Rulemap", rulemap)

		var res = new parser.Parser()
		for (var name in rulemap) {
			res.add.apply(res, [name].concat(rulemap[name]))
		}
		res.prepare()

		callback(null, res, input.join("\n"))
	})
}

// Parser
//var parser = new parser.Parser()
parseRuleFile('scriptlang.rule', function(err, parser, input) {
	if (err) throw err

	function pad(str, n, rightpad) {
		var pad = Array(Math.abs(n - ("" + str).length + 1)).join(" ")
		return rightpad ? str + pad : pad + str
	}

	var tokens = lexer.tokenize(input)

	var res = parser.parse({
		next : tokens.shift.bind(tokens),
		undo : tokens.unshift.bind(tokens)
	}, 6)

	console.log("Parser:")
	function printTree(indent, node) {
		if (node.type == 'token') {
			console.log(indent + node)
		} else {
			var pretty = node.terminals.map(function(x) {return x.value}).join(" ")
			console.log(indent + node.name + ": " + pretty)
		}

		if (node.children) {
			node.children.forEach(printTree.bind(null, indent + "  "))
		}
	}

	printTree("", res)
})

/*  // Simple math grammar: + - * / () numbers
parser.add('$top'    , [ ['expr-1'], ['$eof']                      ])
parser.add('expr-1'  , [ ['expr-1'], "+", ['expr-1']               ]
                     , [ ['expr-1'], "-", ['expr-1']               ]
                     , [ ['expr-2', '*']                           ])
parser.add('expr-2'  , [ ['expr-2'], "*", ['expr-2']               ]
                     , [ ['expr-2'], "/", ['expr-2']               ]
                     , [ "(", ['expr-1'], ")"                      ]
                     , [ ['number', '*']                           ])
//*/

/*  // "scripting language" grammar
parser.add('$top'
	, [ ['statements'], ['$eof']                                   ])
parser.add('statements'
	, [ ['statement']                                              ]
	, [ ['statement'], ";", ['statements']                         ])
parser.add('statement'
	, [ ['function-statement', '*'],                               ]
	, [ ['expression', '*'],                                       ])
parser.add('function-statement'
	, [ "function", ['identifier'], "(", ['identifier'], ")", ['block'] ])
parser.add('block'
	, [ "{", ['statements'], "}"                                   ])

parser.add('expression'
	, [ ['expr-1', '*']                                            ])
parser.add('expr-1'
	, [ ['expr-1'], "+", ['expr-1']                                ]
	, [ ['expr-1'], "-", ['expr-1']                                ]
	, [ ['expr-2', '*']                                            ])
parser.add('expr-2'
	, [ ['expr-2'], "*", ['expr-2']                                ]
	, [ ['expr-2'], "/", ['expr-2']                                ]
	, [ "(", ['expr-1'], ")"                                       ]
	, [ ['number', '*']                                            ])
//*/

//parser.prepare()

//-- Try it out -----------------------------------------------------
/*
function pad(str, n, rightpad) {
	var pad = Array(Math.abs(n - ("" + str).length + 1)).join(" ")
	return rightpad ? str + pad : pad + str
}

var tokens = lexer.tokenize("(1 + 3)")
*/
/*
var tokens = lexer.tokenize([
	"function foo(x) { 1 + 2 }",
	"function bar(x) { 10 }",
	"1 * 3 + 4"
].join("; "))
//*/

// Lexer output
/*
console.log("Lexer:")
tokens.forEach(function(token) {
	if (!token.ignore) {
		console.log(" ", pad(token.name, 12, true)
		           , ":" + pad(token.pos.row + ":" + token.pos.column, 5)
		           , " '" + token.value + "'")
	}
})

console.log()
console.log()

// Parser rules output
console.log("Parser rules:")
for (var key in parser.rules) {
	console.log(" ", key + ":")
	parser.rules[key].forEach(function(rule) {
		console.log("    " + rule)
	})
	console.log()
}

console.log()

// Parser subrule map
console.log("Parser subrule map:")
for (var key in parser.subruleMap) {
	console.log(" ", key + ":")
	parser.subruleMap[key].forEach(function(rule) {
		console.log("    " + rule)
	})
	console.log()
}

console.log()
*/

// Parser parsing output
/*
console.log("Parsing output:")
var res = parser.parse({
	next : tokens.shift.bind(tokens),
	undo : tokens.unshift.bind(tokens)
}, 6)

console.log()
*/

// Parser result
/*
console.log("Parser:")
function printTree(indent, node) {
	if (node.type == 'token') {
		console.log(indent + node)
	} else {
		var pretty = node.terminals.map(function(x) {return x.value}).join(" ")
		console.log(indent + node.name + ": " + pretty)
	}

	if (node.children) {
		node.children.forEach(printTree.bind(null, indent + "  "))
	}
}

printTree("", res)
*/
