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
	// Group is an optional heading the tool sits under in the rendered catalogue.
	// It is presentation only — the model still picks freely across groups; the
	// heading just breaks a long flat list into readable sections. Tools sharing
	// a group must be listed consecutively for the heading to print once.
	Group string
}

// CallKind says which of the two calls in a question this is. The two want
// opposite things from a model that can be asked how hard to think, and the
// caller is the only place that knows which one is being made — by the time the
// prompt reaches a provider it is just text.
//
// Measured on gpt-oss-20b at low effort: choosing tools got worse, picking
// get_lowest_margin_menu for "เมนูไหนขายดีแต่กำไรน้อย" — a tool that reports one
// margin and nothing about sales — and then answering from it rather than saying
// so. Writing got better: no reply hit the output ceiling again, and five of
// eight calls thought for under twenty tokens because there is nothing to decide,
// only figures to put into sentences.
type CallKind uint8

const (
	// CallSelectTools is the judgement: which capabilities answer this question.
	CallSelectTools CallKind = iota + 1
	// CallWriteAnswer is the transcription: these figures, in Thai, for an owner.
	CallWriteAnswer
)

// Chat is one turn with a language model: a prompt in, text out.
//
// Deliberately not a tool-calling interface. Joyboy asks for tools by naming
// them in the prompt and reading the names back out of the reply, which works
// the same on every provider, keeps the protocol in this package where it can
// be tested, and leaves the implementation with one job — call a model, with
// whatever key rotation and provider fallback the backend already has.
//
// The kind is a hint about the call, not an instruction to any provider. An
// implementation that cannot act on it must still answer.
type Chat interface {
	Complete(ctx context.Context, prompt string, kind CallKind) (string, error)
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
// question is the owner's original question. Most tools ignore it — they read
// figures from the restaurant's data — but a documentation search needs the
// words to search with, so the port carries it rather than a second method.
//
// Implementations bind the restaurant themselves. Joyboy passes no identity
// because it holds none.
type Tools interface {
	Catalogue() []ToolSpec
	Run(ctx context.Context, names []string, question string) ([]ToolResult, error)
}

// Turn is one exchange already in the conversation, oldest first.
type Turn struct {
	Role    string
	Content string

	// Topic is a short Thai label for what this turn was about, written by the
	// caller from what the turn actually used (its tool's section: "วัตถุดิบและ
	// สต๊อก", "เมนู"). It exists so a turn that falls outside the verbatim window
	// still leaves a trace the model can read — the thread index — instead of
	// vanishing. Deliberately carries no figures: the index says WHAT was
	// discussed, never WHAT THE NUMBER WAS, so an answer about it has to call the
	// tool again and read fresh data. Empty for turns with no tool behind them.
	Topic string
}

// Request is one question to answer.
type Request struct {
	Question string
	History  []Turn
	// Digest is the memory of the older part of this conversation, already
	// composed by the caller. joyboy prints it into both prompts and does not
	// interpret it: what it says, and whether it deserves to be trusted, is
	// decided where it was written.
	Digest string
	// OwnerTitle is what the assistant should call the owner ("คุณผู้จัดการ",
	// "พี่เก่ง"). Empty leaves the persona as it is.
	OwnerTitle string
}

// Answer is what the owner reads, plus the tools that produced it, which the
// caller logs. Tools is empty when the model chose to answer without data.
type Answer struct {
	Text  string
	Tools []string
}
