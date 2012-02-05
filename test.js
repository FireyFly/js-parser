var parserModule = require('./index')

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
//var lexer = new parser.Lexer()

/*
lexer.add("identifier", beginsIdentifier, isIdentifier)
lexer.add("number",     isNumber,         isNumber    )
lexer.add("string", function(c) {
	return c == '"'
}, function(c, i, str) {
	return i == 1 || (str[i-1] != '"' && str[i-2] != '\\')
})
lexer.add("whitespace",  isWhitespace, isWhitespace, true)
lexer.add("operator", function() {return true}, function() {return false})
*/


function parseRuleFile(filename, callback) {
	function trim(str) { return str.trim() }

	require('fs').readFile(filename, function(err, content) {
		if (err) throw err

		var lines = content.toString().split("\n")
		  , state = '$top'
		  , match

		var rulemap  = {}
		  , tokenArr = []
		  , input    = []
		  , options  = {
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
				continue
			}
			switch (state) {
				case 'grammar':
					if (match = line.match(/([^:]+)::=/)) {
						var start = i
						for (++i; lines[i].match(/^\s*\|/) && i < lines.length; i++);
						var end = i

						match = lines.slice(start, end).join(" ").split(/::=/)
						var name  = match[0].trim()
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

					break

				case 'tokens':
					if (match = line.match(/^([^:]+)::=\s*(i:|)\s*(.*)$/)) {
						var name  = match[1].trim()
						  , flags = match[2].replace(/:$/, '')
						  , rules = match[3].trim()

						function ruleStringToReal(str) {
							if (str == 'true' || str == 'false') {
								var which = (str == 'true' ? true : false)
								return function() { return which }
							} else if (str[0] == '/') {
								var regex = new RegExp(str.trim().slice(1, -1))
								return function(chr) { return chr.match(regex) }
							} else if (match = str.match(/^delimited (\S)$/)) {
								var delimiter = match[1]

								function begins(c) { return c == delimiter }
								function matches(c, i, str) {
									return i == 1 || (str[i-1] != delimiter
											&& str[i-2] != '\\')
								}

								return [begins, matches, false]
							} else {
								throw new Error("Invalid string: '" + str + "'")
							}
						}

						// Handle the special case of 'delimited' tokens, e.g.
						// quoted strings, regex literals.
						if (rules.trim().match(/^delimited .$/)) {
							tokenArr.push([name].concat(
									ruleStringToReal(rules.trim())))
							continue
						}

						var exprPattern = [
							'true', 'false',
							'/(?:[^/]|\\\\/)*/'
						].join('|')
						var rulesPattern = new RegExp('^(' + exprPattern
								+ ')(|\\s+(?:' + exprPattern + '))$')
						  , rulesNice = rules.match(rulesPattern)

						if (!rulesNice) {
							throw new Error("Syntax error in token rule " + name
									+ ": '" + rules + "'")
						}

						tokenArr.push([
							name,
							ruleStringToReal(rulesNice[1]),
							ruleStringToReal(rulesNice[2].trim() || rulesNice[1]),
							(flags.indexOf('i') >= 0)
						])

					} else {
						checkNonComment(line)
					}
					break

				case 'options':
					if (match = line.match(/^(.*)[=:](.*)$/)) {
						var name  = match[1].trim()
						  , value = match[2].trim()

						options[name] = value
					} else {
						checkNonComment(line)
					}
					break

				case 'input':
					input.push(lineRaw)
					break

				case '$top': break

				default:
					console.warn("Ignoring unknown section: " + state)
			}
		}

		// Create parser
		var parser = new parserModule.Parser()
		for (var name in rulemap) {
			parser.add.apply(parser, [name].concat(rulemap[name]))
		}
		parser.prepare()

		// Create lexer
		var lexer = new parserModule.Lexer()
		tokenArr.forEach(lexer.add.apply.bind(lexer.add, lexer))

		options.input = input.join("\n")
		callback(null, lexer, parser, options)
	})
}

// Parser
//var parser = new parser.Parser()
if (process.argv.length < 3) {
	console.log("  Usage: " + process.argv.slice(0, 2).join(" ") + " [-q] <rulefile>")
	process.exit(1)
}

var flags = { }
process.argv.slice(2).forEach(function(arg, idx) {
	if (arg[0] == '-') {
		flags[arg[1]] = true
	} else {
		flags["filename"] = arg

		if (process.argv.length > idx + 3) {
			console.log("Stray arguments: "
					+ process.argv.slice(idx + 3).join(" "))
			process.exit(1)
		}
	}
})

parseRuleFile(flags["filename"], function(err, lexer, parser, options) {
	if (err) throw err

	function pad(str, n, rightpad) {
		var pad = Array(Math.abs(n - ("" + str).length + 1)).join(" ")
		return rightpad ? str + pad : pad + str
	}

	try {
		var tokens = lexer.tokenize(options.input)
	} catch (err) {
		log("Error while lexing:", err)
		process.exit(2)
	}

	var log = flags["q"] ? (function() {}) : console.log.bind(console)
	log()
	log("## Input: ##########################################")
	log(options.input.trim())

	try {
		var res = parser.parse({
			next : tokens.shift.bind(tokens),
			undo : tokens.unshift.bind(tokens)
		}, flags["q"] ? 0 : options.verbosity)
	} catch (err) {
		log("Error while parsing:", err)
		process.exit(3)
	}

	log()
	log("## Parser: #########################################")

	function printTree(indent, node) {
		if (node.type == 'token') {
			log(indent + node)
		} else {
			var pretty = node.terminals.map(function(x) {return x.value}).join(" ")
			log(indent + node.name + ": " + pretty)
		}

		if (node.children) {
			node.children.forEach(printTree.bind(null, indent + "  "))
		}
	}

	printTree("", res)
})

