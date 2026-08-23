package joyboy

import "context"

// The interfaces here are the entire surface between Joyboy and the rest of the
// backend. They are written from Joyboy's side — what it needs, not what the
// service happens to expose — so that the wiring can change without this package
// noticing, and so the package can be exercised with fakes.

// ToolSpec is one capability offered to the model: a stable name and a sentence
// saying what it returns. There are deliberately no parameters. A tool that
// accepted a restaurant id would be a tool a model could point at another shop.
type ToolSpec struct {
	Name        string
	Description string
}

// Chat is one turn with a language model.
//
// SelectTools offers the catalogue and reports which tools the model asked for;
// an empty result means it wants to answer without data, which is the right
// call for "สวัสดีครับ". Write asks for prose and returns it verbatim.
//
// Both are expected to handle provider fallback and key rotation internally —
// Joyboy does not know that Groq or Gemini exist.
type Chat interface {
	SelectTools(ctx context.Context, prompt string, tools []ToolSpec) ([]string, error)
	Write(ctx context.Context, prompt string) (string, error)
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
// Catalogue is the full list offered to the model. Run is given names the model
// asked for and returns only the ones it recognises and could execute; an
// unknown or non-read-only name is dropped rather than failing the question,
// because a model guessing a tool name should cost the owner nothing.
//
// Implementations must bind the restaurant themselves. Joyboy passes no
// identity because it holds none.
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

// Answer is what the owner reads, plus what the tools were asked for, which the
// caller logs. Tools is empty when the model chose to answer without data.
type Answer struct {
	Text  string
	Tools []string
}
