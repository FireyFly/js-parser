
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

		var lines = content.toString().split("\n")
		  , state = '$top'
		  , match

		var rulemap = {}
		var input   = []
		var options = {
			verbosity : 0
		}

		function checkNonComment(line) {
			if (line.match(/^(?:#.*)?$/)) {
				// Ignore empty lines or "comments"
			} else {
				throw new Error("Invalid line in " + state + " section: '"
						+ line + "'")
			}
		}

		for (var i=0; i<lines.length; i++) {
			var lineRaw = lines[i]
			  , line    = lineRaw.trim()

			if (match = line.match(/^\[(.*)\]$/)) {
				state = match[1].toLowerCase()
			} else if (state == 'grammar') {
				if (match = line.match(/([^:]+)\s*::=/)) {
					var start = i
					for (++i; lines[i].match(/^\s*\|/) && i < lines.length; i++);
					var end = i

					match = lines.slice(start, end).join(" ").split(/::=/)
					var name = match[0].trim()
					  , rules = match[1].split(/\|/).map(trim)

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

					if (!rulemap[name]) rulemap[name] = []
					Array.prototype.push.apply(rulemap[name], rules)
					--i
				} else {
					checkNonComment(line)
				}
			} else if (state == 'input') {
				input.push(lineRaw)
			} else if (state == 'options') {
				if (match = line.match(/^(.*)[=:](.*)$/)) {
					var name  = match[1].trim()
					  , value = match[2].trim()

					options[name] = value
				} else {
					checkNonComment(line)
				}
			}
		}

		var res = new parser.Parser()
		for (var name in rulemap) {
			res.add.apply(res, [name].concat(rulemap[name]))
		}
		res.prepare()

		options.input = input.join("\n")
		callback(null, res, options)
	})
}

// Parser
//var parser = new parser.Parser()
if (process.argv.length != 3) {
	console.log("  Usage: " + process.argv.slice(0, 2).join(" ") + " <rulefile>")
	process.exit(1)
}

parseRuleFile(process.argv[2], function(err, parser, options) {
	if (err) throw err

	function pad(str, n, rightpad) {
		var pad = Array(Math.abs(n - ("" + str).length + 1)).join(" ")
		return rightpad ? str + pad : pad + str
	}

	var tokens = lexer.tokenize(options.input)

	console.log()
	console.log("## Input: ##########################################")
	console.log(options.input.trim())

	var res = parser.parse({
		next : tokens.shift.bind(tokens),
		undo : tokens.unshift.bind(tokens)
	}, options.verbosity)

	console.log()
	console.log("## Parser: #########################################")

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

