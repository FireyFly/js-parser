//-- Lexer ----------------------------------------------------------
var Lexer = exports.Lexer = function() {
	this.descriptors = []
}

Lexer.prototype.add = function(name, start, cont, ignore) {
	this.descriptors.push({
		name   : name,  // TODO: Unused?
		start  : start,
		cont   : cont,

		ignore : !!ignore,
		toString: function() {return this.name}
	})

	return this
}

Lexer.prototype.tokenize = function(str) {
	var tokens = []
	var descriptors = this.descriptors
	//var descriptors = this.descriptors.concat(Lexer.UNDEFINED_TOKEN)
	var pos = {row:1, column:1}

	for (var idx=0; idx<str.length; idx++) {
		var chr = str[idx]

		// Keep track on where we are.
		if (chr == "\n") {
			pos.row++
			pos.column = 1
		} else {
			pos.column++
		}

		// Try each token descriptor
		for (var i=0; i<descriptors.length; i++) {
			var desc = descriptors[i]
			if (!desc.start(chr)) continue

			var start = idx
			++idx

			while (idx < str.length) {
				var cont = desc.cont(str[idx], idx-start, str.slice(start, idx+1))
				if (!cont) break
				++idx
			}

			var end = idx
			tokens.push({
				type    : 'token',
				name    : desc.name, // TODO: Unused?
				value   : str.slice(start, end),
				ignore  : desc.ignore,

				pos     : {row: pos.row, column: pos.column},
				toString: function() {return "(" + this.name + ": " + this.value
						+ ")"}
			})

			--idx
			break
		}

		if (i == descriptors.length) {
			throw new Error("Lexer#tokenize: invalid character: '" + chr + "'")
		}
	}

	tokens.push({
		type   : 'token',
		name   : '$eof',
	//	value  : null,
		ignore : false,

		pos    : {row: pos.row, column: pos.column},
		toString: function() {return "(EOF)"}
	})

	return tokens
}

