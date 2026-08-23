// Package joyboy answers a restaurant owner's question by letting a language
// model choose the data it needs and write the reply, while Go keeps the
// database and the arithmetic.
//
// # Why this exists
//
// The legacy orchestrator asks a model to label the question, then renders the
// answer from Go templates. That guarantees the figures and guarantees the
// wording too, so two people asking the same thing in different words get the
// same reply word for word, and supporting a new phrasing means adding another
// branch to a keyword matcher that is already 1,728 lines long.
//
// Joyboy moves the wording to the model and keeps the numbers with Go.
//
// # The shape of one question
//
//	question + history
//	  → model sees every tool and asks for the ones it wants
//	  → Go checks each request against the read-only allowlist and runs it
//	  → Go builds a labelled fact sheet the owner never sees
//	  → model writes the whole answer from that sheet
//
// If the model cannot write, the owner is told the assistant is unavailable.
// The fact sheet is never shown: it is text Go wrote, and putting it on screen
// would be the template all over again.
//
// # What Go still owns
//
// Reading the database, every calculation, the read-only tool allowlist, and
// binding the query to one restaurant. A tool has no parameter for a restaurant
// id, so a model cannot ask for another shop's data even if it tries — the
// snapshot it reads from was already scoped by the caller.
//
// # Reading order
//
//	ports.go      what this package needs from the outside world
//	joyboy.go     the orchestrator, one question end to end
//	tools.go      the catalogue and the request the model makes against it
//	factsheet.go  turning tool results into the labelled sheet
//	answer.go     the prompt that writes the answer, and cleaning its output
//
// Nothing here imports the service package. Everything it needs arrives through
// the interfaces in ports.go, so this package can be read on its own.
package joyboy
