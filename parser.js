
//-- Utility functions ----------------------------------------------
function fail(val, message, tokens) {
  // Default to empty failure value
  if (val == null) {
    val = { fail   : true
          , value  : []
          , tokens : tokens }
  }

  return { fail   : true
         , value  : [ message ].concat(val.value)
         , tokens : val.tokens }
}

function isSuccess(val) { return !isFail(val)      }
function isFail(val)    { return Boolean(val.fail) }

//-- Parser parts (rule creators) -----------------------------------
var Rule = {
  //-- Higher-order rules -------------------------------------------
  /**
   * Matches any of the given rules, and returns the first match found.
   */
  any: function(/*...rules */) {
    var rules = Array.prototype.slice.call(arguments, 0)

    return function any(tokens) {
      for (var i=0; i<rules.length; i++) {
        var res    = rules[i](tokens)
          , length = isSuccess(res) && res[0]

        if (isSuccess(res)) { return res }
      }

      // None of the rules matched; fail.
      return fail(res, "any", tokens)
    }
  },

  /**
   * Matches a sequence of rules on the tokens in sequence.
   */
  sequence: function(/*...rules*/) {
    var rules = Array.prototype.slice.call(arguments, 0)

    return function sequence(tokens) {
      var offset       = 0
        , resultTokens = []

      for (var i=0; i<rules.length; i++) {
        var rule = rules[i]

        var res     = rule(tokens.slice(offset))
          , length  = res.slice && res[0]
          , mtokens = res.slice && res.slice(1)

        // If any of the rules fail, then the entire sequence fails
        if (isFail(res)) { return fail(res, "sequence") }

        Array.prototype.push.apply(resultTokens, mtokens)
        offset += length
      }

      return [ offset ].concat(resultTokens)
    }
  },

  //-- Second-order rules -------------------------------------------
  /**
   * Matches a given rule zero or more times, greedily.
   */
  kleene: function(rule) {
    return function kleene(tokens) {
      var result = []
        , tmp

      for (var offset=0; matches(); offset += tmp[0]) {
        Array.prototype.push.apply(result, tmp.slice(1))
      }

      return [ offset ].concat(result)

      function matches() {
        return isSuccess(tmp = rule(tokens.slice(offset)))
      }
    }
  },

  /**
   * Matches a given rule zero or one time, greedily.
   */
  optional: function(rule) {
    return function optional(tokens) {
      var res = rule(tokens)

      if (isSuccess(res)) {
        return res
      } else {
        return [ 0 ]
      }
    }
  },

  /**
   * Applies a rule but ignores the result.
   */
  ignore: function(rule) {
    return function ignore(tokens) {
      var res = rule(tokens)

      if (isSuccess(res)) {
        var length = res[0]
        return [ length ]

      } else {
        // Rule didn't match; forward this fact to the caller.
        return fail(res, "ignore")
      }
    }
  },

  // (Zero-width assertions)
  /**
   * Asserts that a given rule matches, without consuming any input.
   */
  and: function(rule) {
    return function and(tokens) {
      var res = rule(tokens)

      if (isSuccess(res)) {
        return [ 0 ]
      } else {
        return fail(res, "and")
      }
    }
  },

  /**
   * Asserts that a given rule does not match, without consuming any input.
   */
  not: function(rule) {
    return function not(tokens) {
      var res = rule(tokens)

      if (isFail(res)) {
        return [ 0 ]
      } else {
        return fail(null, "not", tokens)
      }
    }
  },

  //-- Primitive rules ----------------------------------------------
  /**
   * Matches a given terminal, and returns it as a string literal.
   */
  terminal: function(required) {
    var choices = Array.prototype.slice.call(arguments)

    // Allow `terminal(c1, c2, c3, ...)` to be equivalent to
    // `any(terminal(c1), terminal(c2), terminal(c3), ...)`.
    if (choices.length > 1) {
      return Rule.any.apply(null, choices.map(terminalify))
    }

    // The "actual" terminal parser
    return function terminal(tokens) {
      var leading = tokens.slice(0, required.length)//.join("")

      if (leading == required) {
        return [ required.length, leading ]
      }

      // Didn't match; fail.
      return fail(null, "terminal: " + required, tokens)
    }

    function terminalify(x) {
      return Rule.terminal(x)
    }
  },

  /**
   * Matches a given regex, and returns it as a terminal.
   */
  regex: function(pattern) {
    return function regex(tokens) {
      var str = keepWhile(tokens, isString)//.join("")
        , res = pattern.exec(str)

      if (res) {
        // Matched!
        var match = res[0]
        return [ match.length, match ]

      } else {
        // No match
        return fail(null, "regex: " + pattern, tokens)
      }
    }

    function isString(str) { return typeof str == 'string' }

    function keepWhile(arr, pred) {
      var res = []

      for (var i=0; i<arr.length && pred(arr[i]); i++) {
        res.push(arr[i])
      }

      return res
    }
  },

  /**
   * Matches a single (terminal) character in a given range.
   */
  charRange: function(start, end) {
    return function charRange(tokens) {
      var tk = tokens[0]

      if (tokens.length == 0) {
        return fail(null, "charRange: [" + start + "-" + end + "]", tokens)
    }

      if (start <= tk && tk <= end) {
        return [ 1, tk ]
      }

      // Didn't match; fail.
      return fail(null, "charRange: [" + start + "-" + end + "]", tokens)
    }
  },

  //-- Internal rules -----------------------------------------------
  /**
   * Wraps the result of a rule in a nonterminal with the specified name.
   */
  name: function(name, rule) {
    return function nameFun(tokens) {
      var res = rule(tokens)

      if (isSuccess(res)) {
        // Wrap the result in a nonterminal token.
        var length      = res[0]
          , mtokens     = res.slice(1)
          , nonterminal = [ name ].concat(mtokens)

        return [ length, nonterminal ]

      } else {
        // Rule didn't match; forward this fact to the caller.
        return fail(res, "name: " + name)
      }
    }
  },

  /**
   * Asserts that the given rule consumes all input; forwards the result if so,
   * fails otherwise.
   */
  consumesAll: function(rule) {
    return function consumesAll(tokens) {
      var res = rule(tokens)

      if (isSuccess(res)) {
        var length  = res[0]

        if (length == tokens.length) {
          return res

        } else {
          return fail(null, "consumesAll: trailing characters", tokens.slice(length))
        }

      } else {
        return fail(res, "consumesAll")
      }
    }
  }
}

exports.Rule      = Rule
exports.fail      = fail
exports.isFail    = isFail
exports.isSuccess = isSuccess
