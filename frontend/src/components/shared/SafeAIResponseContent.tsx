"use client";

import { Component, type ReactNode } from "react";
import AIResponseContent from "@/src/components/shared/AIResponseContent";

type SafeAIResponseContentProps = {
  content: string;
  compact?: boolean;
  language: "th" | "en";
};

type SafeAIResponseContentState = {
  failed: boolean;
};

export function AIResponsePlainTextFallback({
  content,
  language,
}: Pick<SafeAIResponseContentProps, "content" | "language">) {
  const safeContent = typeof content === "string" ? content : "";
  return (
    <div role="alert">
      <p className="text-xs font-semibold text-red-700 dark:text-red-300">
        {language === "th"
          ? "แสดงรูปแบบคำตอบนี้ไม่ได้ จึงแสดงเป็นข้อความแทน"
          : "This answer could not be formatted, so it is shown as plain text."}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
        {safeContent || (language === "th" ? "ไม่มีข้อความคำตอบ" : "No answer text was returned.")}
      </p>
    </div>
  );
}

// Rendering an AI answer is deliberately isolated from the rest of the page.
// If a future rich-text edge case fails, keep the conversation and input usable
// and fall back to the original plain text instead of replacing the whole route.
export default class SafeAIResponseContent extends Component<
  SafeAIResponseContentProps,
  SafeAIResponseContentState
> {
  state: SafeAIResponseContentState = { failed: false };

  static getDerivedStateFromError(): SafeAIResponseContentState {
    return { failed: true };
  }

  componentDidUpdate(previousProps: SafeAIResponseContentProps) {
    if (this.state.failed && previousProps.content !== this.props.content) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <AIResponsePlainTextFallback
          content={this.props.content}
          language={this.props.language}
        />
      );
    }
    return <AIResponseContent content={this.props.content} compact={this.props.compact} />;
  }
}
