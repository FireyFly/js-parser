
// Debugging
var VERBOSITY = 0 //10

function debugLog(verbosity/*, ...message*/) {
	if (VERBOSITY < verbosity) { return }
	var prefix = "[" + Array(verbosity+1).join("*")
			+ Array(VERBOSITY - verbosity + 1).join(" ") + "]"
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
		debugLog(6, "Promoting " + children[0].name + " to " + rule.name)
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
			return "{" + this.name + ": " + this.children.join(" ") + "}"
		}
	}
}

//-- Parser#parse sub-parts -----------------------------------------

//-- doMaybePopStack -- Either pops the state stack, or makes sure that we might
// pop the state stack next time around (mayPopState). Specially handles the
// case when we're about to pop a '$top' state, since this means we're done with
// the parsing.
//   May alter stateStack and potentialLongerMatch ( :/ )
//   NOTE: returns [ newState, mayPopState, returnNode ]; if either is null, do
//         not alter. If returnNode is set, return node as the resulting value
//         of the parsing.
function doMaybePopStack(stateStack, state, mayPopState, potentialLongerMatch) {
	if (state.context == '$top') {
		// FIXME: A bit hacky?
		return [ null, null, true ]

	} else if (!mayPopState && state.rules.length > 1) {
		debugLog(3, "Potential longer rule [w/ state stack]")
		mayPopState                = true
		potentialLongerMatch.state = true
		// FIXME: Hacky solution. Create a fake grammar rule to
		// trick the backtracking part into doing the right thing.
		//   The 'null' token is important to tell the backtracking
		// part that they're backtracking into a state pop.
		potentialLongerMatch.rule = { tokens: [ null ] }
		return [ null, true ]

	} else {
		var newState = stateStack.pop()
	//	mayPopState = false
		debugLog(1, "<<< ", state.context, "->", newState.context)
		return [ newState, false ]
	}
}

//-- doPushStack -- Pushes the current state to the stack and returns a new one
// to replace it.
//   Alters stateStack.
function doPushStack(stateStack, state, subruleMap) {
	var rule       = state.rules[0]
	  , currRtoken = rule.tokens[state.index]
	  , newContext = currRtoken[0]

	stateStack.push(state)

	debugLog(1, ">>> ", newContext)

	return { // The new state to change to
		context   : newContext,
		nodeStack : [],
		index     : 0,
		rules     : subruleMap[newContext]
	}
}

// Parser#parse -- parses a token stream into a parse tree.
Parser.prototype.parse = function(tokenStream, verbosity) {
	VERBOSITY = (verbosity || 0)

	var mayPopState = false

	var potentialLongerMatch = {
		state : false,
		rule  : null
	}

	var session = {
		state: {
			context   : '$top',
			index     : 0,
			rules     : this.subruleMap['$top'],
			nodeStack : []
		},
		stack: []
	}

	var token, node
	  , stateStack = session.stack

	var state = session.state

	while (token = tokenStream.next()) {
		// TODO: Preserve ignored tokens in the resulting tree.
		if (token.ignore) {
			continue
		}

		node = token

		var currNonterminalRules = state.rules.filter(function(rule) {
			return Array.isArray(rule.tokens[state.index])
		})

		// Filter out rules with node
		while (true) {
			//-- Handle state pushing/popping first of all ----------
			if (node.name == state.context) {
				var tmp = doMaybePopStack(stateStack, state, mayPopState,
						potentialLongerMatch)
				if (tmp[0] != null) { session.state = state = tmp[0] } // FIXME
				if (tmp[1] != null) { mayPopState = tmp[1] }
				if (tmp[2]) { return node }

			} else if (currNonterminalRules.length == 1 && state.index > 0
					&& state.rules.length > 1
					&& Array.isArray(currNonterminalRules[0].tokens[state.index])) {
				// We have a single rule with nonterminal at the curr index, and
				// multiple rules with terminals at the curr index. Try the
				// terminals first, and otherwise fall back to the single rule
				// with nonterminal.
				//   This is definitely a hacky solution.
				potentialLongerMatch.state = true
				potentialLongerMatch.rule  = currNonterminalRules[0]

			} else if (state.rules.length == 1
					&& Array.isArray(state.rules[0].tokens[state.index])
					&& (state.rules[0].tokens[state.index] in this.rules)) {
				// Change state if we're following a single rule, and we're on a
				// nonterminal.
				// FIXME
				session.state = state = doPushStack(stateStack, state, this.subruleMap)
			}

			//-- Current state --------------------------------------
			debugLog(5)
			debugLog(5, "Current node: " + node)

			state.rules = state.rules.filter(getRuleFilter(node, state.index))

			debugLog(5, "State rules:")
			state.rules.forEach(function(rule) {
				debugLog(5, "  " + rule)
			})
			debugLog(5)

			var currPotentialRules = state.rules.filter(function(rule) {
				return rule.tokens.length == state.index + 1
			})

			// state.rules: the whole rule set that we're currently reducing
			// currPotentialRules: state rules that might be "finished" by now

			//-- Check what to do next ------------------------------
			if (currPotentialRules.length > 1) {
				throw new Error("Rule ambiguity between: {" +
						currPotentialRules.join("; ") + "}")

			} else if (currPotentialRules.length == 1
					&& state.rules.length != 1) {
				debugLog(5, "Potential longer match")
				// Problem! We have a potential match, but there are other longer
				// matches that we cannot disregard!
				//   We need to "try" to read tokens while it matches longer
				// rules, and otherwise fall back to the original match (and
				// push back the tokens). This should be the only case when we
				// need to backtrack.
				potentialLongerMatch.state = true
				potentialLongerMatch.rule  = currPotentialRules[0]
				state.nodeStack.push(node)

			} else if (state.rules.length == 0 && potentialLongerMatch.state) {
				debugLog(5, "Longer match failed; backtracking...")
				// Longer rule(s) failed to match. Fall back to the longest
				// matching rule by popping tokens from the stack and pushing
				// them back into the stream, until we have just enough tokens to
				// get a potentialMatch.

				potentialLongerMatch.state = false
				var rule = potentialLongerMatch.rule

				// FIXME: More ugly state backtracking stuff.
				if (rule.tokens.length > state.nodeStack.length) {
					state.rules = [ rule ]
					continue
				}

				state.nodeStack.push(node)

				// FIXME: Are we sure that the state.nodeStack only contains tokens?
				while (state.nodeStack.length > rule.tokens.length) {
					var token = state.nodeStack.pop()

					if (token.type != 'token') {
						throw new Error("Fatal: trying to push non-token back"
								+ "into token stream: " + token)
					}

					debugLog(6, "Undoing " + token)
					tokenStream.undo(token)
				}

				// FIXME: See above notes. If we backtrack due to state stuff,
				// we need to pop the state next iteration. Otherwise, make sure
				// we don't pop the state stack.
				if (rule.tokens[0] == null) {
					node = state.nodeStack.pop()
					continue
				}
				mayPopState = false

				debugLog(6, "Applying rule (" + rule + ") to nodes ("
						+ state.nodeStack + ")")
				node = createNode(rule, state.nodeStack)
				state.nodeStack   = []
				state.rules  = this.subruleMap[state.context]

				debugLog(2, "  <- " + node.name)
				state.index = 0
				continue

			} else if (state.rules.length == 0) { // !potentialLongerMatch.state
				throw new Error("No rule to handle syntax! Working on "
						+ state.context + "; tokens are "
						+ state.nodeStack.concat([node]).join(" "))

			} else if (state.rules.length == 1
					&& state.rules[0].tokens.length == state.nodeStack.length + 1) {
				// If we have exactly one state rule, and we have enough tokens,
				// apply the rule and move on with this new node.
				var rule = state.rules[0]
				debugLog(5, "Exactly one state rule; matching rule!")

				node = createNode(rule, state.nodeStack.concat([node]))
				state.nodeStack = []
				state.rules = this.subruleMap[state.context]
				state.index = 0

				debugLog(2, "  <- " + node.name)
				continue

			} else {
				//    #state.rules >  1, #currPotentialRules >= 0
				// || #state.rules == 1, #tokens != #rule.tokens
				debugLog(3, "Either exactly one state rule but not enough tokens,")
				debugLog(3, "or too many rules. Continuing.")
				state.nodeStack.push(node)
			}

			++state.index
			break
		}
	}

	throw new Error("Reached end of token stream while parsing!")
}

