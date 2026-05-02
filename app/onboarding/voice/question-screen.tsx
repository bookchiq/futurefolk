"use client";

interface QuestionScreenProps {
  questionNumber: number;
  totalQuestions: number;
  question: string;
  helperText?: string;
  isLarge?: boolean;
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  canContinue: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export function QuestionScreen({
  questionNumber,
  totalQuestions,
  question,
  helperText,
  isLarge = false,
  value,
  onChange,
  onNext,
  onBack,
  canContinue,
  isFirst,
  isLast,
}: QuestionScreenProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey && canContinue) {
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          {questionNumber} of {totalQuestions}
        </span>
        <div className="flex-1 h-0.5 bg-border-subtle rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="space-y-4">
        <h2 className="text-2xl leading-snug">{question}</h2>
        {helperText && (
          <p className="text-muted text-base leading-relaxed">{helperText}</p>
        )}
      </div>

      {/* Answer textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Your answer..."
        autoFocus
        className={`w-full bg-bg-subtle border border-border rounded-sm px-4 py-3 text-ink placeholder:text-muted/50 resize-none transition-colors focus:border-accent focus:outline-none ${
          isLarge ? "min-h-64" : "min-h-32"
        }`}
      />

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4">
        <button
          onClick={onBack}
          className="text-muted hover:text-ink transition-colors"
        >
          {isFirst ? "Back to start" : "Previous"}
        </button>

        <button
          onClick={onNext}
          disabled={!canContinue}
          className="px-6 py-2 bg-primary text-bg rounded-sm transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLast ? "Continue" : "Next"}
        </button>
      </div>
    </div>
  );
}
