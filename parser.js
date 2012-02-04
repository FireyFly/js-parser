
// Debugging
var VERBOSITY = 1 //10
function debugLog(verbosity/*, ...message*/) {
	if (VERBOSITY < verbosity) { return }
	var prefix = "[" + Array(verbosity+1).join("*")
			+ Array(7 - verbosity).join(" ") + "]"
	console.log.apply(console, [prefix].concat(
			Array.prototype.slice.call(arguments, 1)))
}

// Helper functions
function isRegExp(o) {
	return o != null && typeof o == 'object' && o instanceof RegExp
}

//-- Parser ---------------------------------------------------------
var Parser = exports.Parser = function() {
	this.rules = {}
	this.subruleMap = {}
}

// Parser#add -- adds rules to the ruleset given by the ruleset name.
Parser.prototype.add = function(name/*, ...rule*/) {
	var self = this
	  , rules = Array.prototype.slice.call(arguments, 1)

	if (!this.rules[name]) this.rules[name] = []

	rules.forEach(function(tokens) {
		self.rules[name].push({
			name   : name,
			tokens : tokens,

			toString: function() {
				return this.tokens.map(function(o) {
					if (isRegExp(o)) {
						return "" + o
					} else {
						return JSON.stringify(o)
					}
				}).join(" ")
			}
		})
	})
}

// Parser#prepare -- prepares the parser for parsing, making sure that internal
// maps and other things are up-to-date.
//
// TODO: Automatically call Parser#prepare from Parser#parse if the internal
// parser state has been altered after last preparation.
Parser.prototype.prepare = function() {
	var self   = this
	  , submap = this.subruleMap = []

	// Create the subrule map, and then populate it. The goal of the subrule map
	// is to be able to look up a list of all rules and subrules that belongs to
	// a given rulename.

	for (var name in this.rules) {
		var traversed = []
		  , mymap = submap[name] = []

		function traverse(name) {
			traversed.push(name)

			if (!self.rules[name]) return

			self.rules[name].forEach(function(rule) {
				mymap.push(rule)

		//		rule.tokens.forEach(function(token) {
				var firstToken = rule.tokens[0]
				if (Array.isArray(firstToken) &&
						traversed.indexOf(firstToken[0]) == -1) {
					traverse(firstToken[0])
				}
			})
		}

		traverse(name)
	}
}

// Parser#parse helpers
function matchRule(rtoken, token) {
	switch (typeof rtoken) {
		case 'undefined': return false
		case 'string': return token.value == rtoken
		case 'object':
			if (Array.isArray(rtoken)) {
				return token.name == rtoken[0]
			} else if (isRegExp(rtoken)) {
				return rtoken.test(token.value)
			}
	}

	throw new Error("Unsupported rule token type: " + (typeof rtoken) +
			": " + rtoken)
}

function getRuleFilter(token, index) {
	return function(rule) {
		var rtoken = rule.tokens[index]

		debugLog(7, "  Filter rule?  " + index + " : " + rule)
		debugLog(7, "    ..." + (matchRule(rtoken, token) ? "yes" : "no"))

		return matchRule(rtoken, token)
	}
}

function createNode(rule, tokens) {
	if (rule.tokens.length != tokens.length) {
		throw new Error("createNode: length mismatch: #rule is " +
				rule.tokens.length + " tokens, #tokens is " + tokens.length)
	}

	var children  = []
	  , terminals = []

	rule.tokens.forEach(function(rtoken, idx) {
		if (typeof rtoken == 'string') {
			terminals.push(tokens[idx])
		} else {
			children.push(tokens[idx])
		}
	})

	if (rule.tokens.length == 1 && Array.isArray(rule.tokens[0])
			&& rule.tokens[0][1] == '*' && children[0].children) {
		// '*' syntax: promote child node instead.
		var res = children[0]
		res.name = rule.name
		return res
	}

	return {
		type      : 'node',
		name      : rule.name,
		children  : children,
		terminals : terminals,

		toString: function() {
			return "{" + rule.name + ": " + this.children.join(" ") + "}"
		}
	}
}

// Parser#parse -- parses a token stream into a parse tree.
Parser.prototype.parse = function(tokenStream, verbosity) {
	VERBOSITY = (verbosity || 1)

	var token
	  , nodeStack  = []

	var context    = '$top'
	  , index      = 0
	  , stateStack = []
	  , stateRules = this.subruleMap[context]

	var inPotentialRuleState  = false
	  , potentialRuleStateTip = null

	var mayPopState = false

	while (token = tokenStream.next()) {
		// TODO: Preserve ignored tokens in the resulting tree.
		if (token.ignore) {
			continue
		}

		var tokenOrNode = token

		// Filter out rules with tokenOrNode
		while (true) {
			//-- Handle state pushing/popping first of all ----------
			if (tokenOrNode.name == context) {
				if (context == '$top') {
					// FIXME: Semi-hacky?
					return tokenOrNode
				} else if (!mayPopState && stateRules.length > 1) {
					debugLog(3, "Potential rule state w/ state stack")
					inPotentialRuleState = true
					mayPopState          = true
				} else {
					var oldContext = context
					var newState = stateStack.pop()

					var context    = newState[0]
					  , stateRules = newState[1]
					  , index      = newState[2]
					  , nodeStack  = newState[3]

					mayPopState = false
					debugLog(3, "Popping the state stack:", oldContext, "->", context)
				}
			} else if (stateRules.length == 1 && index > 0
					&& Array.isArray(stateRules[0].tokens[index])
					&& (stateRules[0].tokens[index] in this.rules)) {
				// Change state if we're following a single rule and we are on an
				// index > 0
				var rule       = stateRules[0]
				  , currRtoken = rule.tokens[index]

				stateStack.push([context, stateRules, index, nodeStack])
				context    = currRtoken[0]
				nodeStack  = []
				index      = 0
				stateRules = this.subruleMap[context]

				debugLog(3, "Pushing the state stack:", context)
			}
			//-- State push/pop end ---------------------------------

			debugLog(5)
			debugLog(5, "Current node: " + tokenOrNode)

			stateRules = stateRules.filter(getRuleFilter(tokenOrNode, index))

			debugLog(5, "State rules:")
			stateRules.forEach(function(rule) {
				debugLog(5, "  " + rule)
			})
			debugLog(5)

			var currPotentialRules = stateRules.filter(function(rule) {
				return rule.tokens.length == index + 1
			})

			// stateRules: the whole rule set that we're currently reducing
			// currPotentialRules: state rules that might be "finished" by now

			//-- Check what to do next ------------------------------
			if (currPotentialRules.length > 1) {
				throw new Error("Rule ambiguity between: {" +
						currPotentialRules.join("; ") + "}")

			} else if (currPotentialRules.length == 1
					&& stateRules.length != 1) {
				debugLog(5, "Potential longer match")
				// Problem! We have a potential match, but there are other longer
				// matches that we cannot disregard!
				//   We need to "try" to read tokens while it matches longer
				// rules, and otherwise fall back to the original match (and
				// push back the tokens). This should be the only case when we
				// need to backtrack.
				inPotentialRuleState  = true
				potentialRuleStateTip = currPotentialRules[0]
				nodeStack.push(tokenOrNode)

			} else if (stateRules.length == 0 && inPotentialRuleState) {
				debugLog(5, "Longer match failed; backtracking...")
				// Longer rule(s) failed to match. Fall back to the longest
				// matching rule by popping tokens from the stack and pushing
				// them back into the stream, until we have just enough tokens to
				// get a potentialMatch.

				inPotentialRuleState = false
				var rule = potentialRuleStateTip
				tokenStream.undo(token)

				// FIXME: Are we sure that the nodeStack only contains tokens?
				while (nodeStack.length > rule.tokens.length) {
					tokenStream.undo(nodeStack.pop())
				}

				debugLog(6, "Applying rule (" + rule + ") to nodes ("
						+ nodeStack + ")")
				tokenOrNode = createNode(rule, nodeStack)
				nodeStack   = []
				stateRules  = this.subruleMap[context]

				debugLog(4, "  <- " + tokenOrNode)
				index = 0
				continue

			} else if (stateRules.length == 0 && !inPotentialRuleState) {
				throw new Error("No rule to handle syntax! Working on " + context
						+ "; tokens are " + nodeStack.concat([token]).join(" "))

			// We have exactly one state rule! This is good...
			//} else if (stateRules.length == 1) {
			} else if (stateRules.length == 1) {
				var rule = stateRules[0]
				if (rule.tokens.length == nodeStack.length + 1) {
					debugLog(5, "Exactly one state rule; matching rule!")

					tokenOrNode = createNode(rule, nodeStack.concat([tokenOrNode]))
					nodeStack   = []
					stateRules  = this.subruleMap[context]

					debugLog(4, "  <- " + tokenOrNode)
					index = 0
					continue
				} else {
					debugLog(5, "Exactly one state rule, but not enough tokens!")
					debugLog(6, "  Rule   : " + rule)
					debugLog(6, "  Tokens : " + nodeStack.concat([tokenOrNode]))
					nodeStack.push(tokenOrNode)
				}

			} else { // #stateRules > 1, #currPotentialRules >= 0
				debugLog(4, "Too many state rules; continuing...")
				nodeStack.push(tokenOrNode)
			}

			++index
			break
		}
	}

	if (token == null) {
		throw new Error("Reached end of token stream while parsing!")
	}
}
