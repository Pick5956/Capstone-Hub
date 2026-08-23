package joyboy

import "context"

// The interfaces here are the entire surface between Joyboy and the rest of the
// backend. They are written from Joyboy's side — what it needs, not what the
// service happens to expose — so the wiring can change without this package
// noticing, and so the package can be exercised with fakes.

// ToolSpec is one capability offered to the model: a stable name and a sentence
// saying what it returns. There are deliberately no parameters. A tool that
// accepted a restaurant id would be a tool a model could point at another shop.
type ToolSpec struct {
	Name        string
	Description string
}

// Chat is one turn with a language model: a prompt in, text out.
//
// Deliberately not a tool-calling interface. Joyboy asks for tools by naming
// them in the prompt and reading the names back out of the reply, which works
// the same on every provider, keeps the protocol in this package where it can
// be tested, and leaves the implementation with one job — call a model, with
// whatever key rotation and provider fallback the backend already has.
type Chat interface {
	Complete(ctx context.Context, prompt string) (string, error)
}

// ToolResult is what one tool produced, already rendered as text by the code
// that owns the calculation. Label says where it came from and what period it
// covers; it is printed above the body in the fact sheet so the model can never
// mistake one tool's figures for another's.
type ToolResult struct {
	Tool  string
	Label string
	Body  string
}

// Tools runs the read-only capabilities against one restaurant's data.
//
// Catalogue is the full list offered to the model. Run is given the names the
// model asked for and returns only those it recognises and could execute; an
// unknown name is dropped rather than failing the question, because a model
// guessing should cost the owner nothing.
//
// Implementations bind the restaurant themselves. Joyboy passes no identity
// because it holds none.
type Tools interface {
	Catalogue() []ToolSpec
	Run(ctx context.Context, names []string) ([]ToolResult, error)
}

// Turn is one exchange already in the conversation, oldest first.
type Turn struct {
	Role    string
	Content string
}

// Request is one question to answer.
type Request struct {
	Question string
	History  []Turn
}

// Answer is what the owner reads, plus the tools that produced it, which the
// caller logs. Tools is empty when the model chose to answer without data.
type Answer struct {
	Text  string
	Tools []string
}
