var util = require('util')

// Debugging
var VERBOSITY = 0 //10

var debugIndentation = 0
function debugLog(indentation, arg1/*, ...args*/) {
  var spaces = Array(debugIndentation + indentation + 1).join("  ")
    , args   = Array.prototype.slice.call(arguments, 2)

  console.log.apply(console, [spaces + arg1].concat(args))
}

// Helper functions
function isRegExp(o) {
  return o != null && typeof o == 'object' && o instanceof RegExp
}

//-- Parser ---------------------------------------------------------
var Parser = exports.Parser = function() {
  this.rules    = {}
  this.allRules = []
}

// Parser#add -- adds rules to the ruleset given by the ruleset name.
Parser.prototype.add = function(name/*, ...rules*/) {
  var self  = this
    , rules = Array.prototype.slice.call(arguments, 1)

  if (!this.rules[name]) this.rules[name] = []

  rules.forEach(function(tokens) {
    var newRule = {
      name   : name,
      tokens : tokens,

      toString: function() {
        return util.format("%s ::= %s", this.name, formatTokens(this.tokens))

        function formatTokens(arr) {
          return arr.map(function(o) {
            return typeof o == 'string' ? '"' + o + '"'
                 : Array.isArray(o)     ? o[0]
                 : /* else */             "???"
          }).join(" ")
        }
      }
    }

    self.rules[name].push(newRule)
    self.allRules.push(newRule)
  })
}

// FIXME: Remove
Parser.prototype.prepare = function() { }

// Parser#parse helpers
// FIXME: Won't be needed I think.
function matchRule(rtoken, token) {
  if (token == null) return false

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

  throw new Error(util.format("Unsupported rule token type: %s: %s",
                              (typeof rtoken), rtoken))
}

// FIXME: Won't be needed I think.
function getRuleFilter(token, index) {
  return function(rule) {
    return matchRule(rule.tokens[index], token)
  }
}

// Creates a new node (nonterminal)
function createNode(rule, tokens) {
  if (rule.tokens.length != tokens.length) {
    throw new Error(util.format(
        "createNode: length mismatch: #rule is %d tokens, #tokens is %d",
        rule.tokens.length, tokens.length))
  }

  var tmp       = partitionChildrenAndTerminals(tokens)
    , children  = tmp[0]
    , terminals = tmp[1]

  return {
    type      : 'node',
    name      : rule.name,
    children  : children,
    terminals : terminals,

    toString: function() {
      return util.format("{%s: %s}", this.name, this.children.join(" "))
    }
  }

  function partitionChildrenAndTerminals(tokens) {
    var children  = []
      , terminals = []

    rule.tokens.forEach(function(rtoken, idx) {
      if (typeof rtoken == 'string') {
        terminals.push(tokens[idx])
      } else {
        children.push(tokens[idx])
      }
    })

    return [ children, terminals ]
  }
}

var debugIndentation = 0
function debugLog(indentation, arg1/*, ...args*/) {
  var spaces = Array(debugIndentation + indentation + 1).join(" ")
    , args   = Array.prototype.slice.call(arguments, 2)

  console.log.apply(console, [spaces + arg1].concat(args))
}

// Partitions an array of rules into those that matches the end of the tokens,
// those that might match in the future if given more tokens, and those that
// won't match even if given more tokens (those that have failed).
/*
function partitionRules(tokens, rules) {
  var matches = []
    , future  = []
    , failed  = []

  var lastToken = tokens.slice(-1)[0]
  rules.forEach(function(rule) {
    /*
    var offset           = Math.max(0, tokens.length - rule.tokens.length)
      , relevantTokens   = tokens.slice(offset)
      , relevantRulePart = rule.tokens.slice(0, relevantTokens.length)
      , ruleMatches      = relevantRulePart.every(equalsToken)
    * /

    var firstRuleToken = rule.tokens[0]
      , ruleMatches    = matchRule(firstRuleToken, lastToken)

    var target = !ruleMatches                       ? failed
               : tokens.length < rule.tokens.length ? future
               : /* tokens.length >= ... * /           matches

    var targetS = !ruleMatches                       ? 'failed'
                : tokens.length < rule.tokens.length ? 'future'
                : /* tokens.length >= ... * /           'matches'
    console.log("     %s :: %s  ==> %s", simple(tokens), rule, targetS)

    function simple(tokens) {
      return tokens.map(function(x) {return x.name}).join(" ")
    }

    target.push(rule)

    function equalsToken(rtoken, idx) {
      return matchRule(rtoken, relevantTokens[idx])
    }
  })

  return [ matches, future, failed ]
}
*/

// Matches an array of rules on the end of an array of tokens, and returns an
// array of rules + how much of the rule that matches the end of the tokens.
// E.g. [ rule, 1 ] if only the last token matches the first rule token.
function matchRuleTails(tokens, rules) {
  return rules.map(function(rule) {
    return [ rule, compareRule(rule, tokens) ]
  })

  return [ matches, future, failed ]

  function compareRule(rule, tokens) {
    if (rule.tokens.length > tokens.length) {
      var rtokensLeading = rule.tokens.slice(0, tokens.length)
        , res            = arrayEq(tokens, rtokensLeading, matchRuleFlipped)

      return res ? tokens.length : 0
    } else {
      return compareOverlap(tokens, rule.tokens, matchRuleFlipped)
    }
  }

  function matchRuleFlipped(token, rule) {
    return matchRule(rule, token)
  }

  function compareOverlap(xs, ys, isEqual) {
    var maxval = Math.min(xs.length, ys.length)

    for (var i=maxval; i>0; i--) {
      var xtail = xs.slice(xs.length - i)
        , ylead = ys.slice(0, i)

      if (arrayEq(xtail, ylead, isEqual)) { return i }
    }
    return 0
  }

  function arrayEq(xs, ys, isEqual) {
    return xs.every(function(x, i) {
      return isEqual(x, ys[i])
    })
  }
}

//-- Parser#parse ---------------------------------------------------
// parses a token stream into a parse tree.
Parser.prototype.parse = function(tokenStream, verbosity) {
  VERBOSITY = (verbosity || 0)

  var self     = this
    , sessions = [ [] ]

    , result   = null

  for (var token; (token = tokenStream.next()) && !result;) {
    // TODO: Preserve ignored tokens in the resulting tree.
    if (token.ignore) {
      continue
    }

    console.log()
    console.log(" o Read token %s", token)

    // Add the newly read token to all sessions (shift)
    sessions.forEach(function(sess) {
      sess.push(token)
    })

    var newSessions  = []
      , keptSessions = []

    // Apply rules until there are no more rules to apply (reduce)
    while (sessions.length > 0 && !result) {
      sessions.forEach(function(sess) {
        var keep = false
  //      console.log("   Session: %s", sess.join(" "))

        matchRuleTails(sess, self.allRules).forEach(function(tmp) {
          var rule         = tmp[0]
            , similarCount = tmp[1]
            , matched      = (similarCount == rule.tokens.length)

          if (matched) {
            newSessions.push(applyRule(sess, rule))
   //         console.log("   matched: %s", rule)
          } else if (similarCount > 0) {
            // Indicates potential for longer rules to apply
            keep = true
          }
        })

        if (keep) {
  //        console.log("   keep!")
          keptSessions.push(sess)
        }

        // Check if we're done
        if (sess.length == 1 && sess[0].name == '$top') {
          // "return" the final result
          result = sess[0]
        }
      })

      sessions    = newSessions
      newSessions = []
    }
    Array.prototype.push.apply(sessions, keptSessions)

    // Returns a new session which is `session` with the rule `rule` applied to
    // the tokens on the top of the stack.
    function applyRule(sess, rule) {
      var newSess         = sess.slice() // copy sess
        , tokensToApplyOn = newSess.splice(newSess.length - rule.tokens.length)
        , newNode         = createNode(rule, tokensToApplyOn)

      newSess.push(newNode)
      return newSess
    }
  }

  // Check if we exited expectedly (with a result to return), or if we reached
  // EOF.
  if (result) {
    return result
  } else {
    throw new Error("Reached end of stream while parsing.")
  }
}

/*
          function printTree(spaces, node) {
            if (node.type == 'token') {
              console.log(spaces + node)
            } else {
              console.log(spaces + node.name)
              node.children.forEach(printTree.bind(null, spaces + "  "))
            }
          }
*/
