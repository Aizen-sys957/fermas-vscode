import { useStore } from '../state/store';

/**
 * Predict-First card.
 *
 * The answer never reaches this component before submission: the host sends a
 * QuizQuestion, and the panel only learns correctness from its own comparison
 * against correctIndex, which the backend is responsible for not exposing
 * earlier. See FERMAS-CONTRACT.md §3.
 */
export function PredictFirst() {
  const { state, answerQuiz } = useStore();
  const quiz = state.activeModule?.quiz;
  if (!quiz) return null;

  const answered = state.answerIndex !== undefined;

  return (
    <div className="m-2 rounded border border-accent/50 bg-surface p-2">
      <div className="lane-label mb-1 text-accent">🎯 Predict first</div>
      <p className="mb-2 text-[12px] font-semibold leading-snug">{quiz.question}</p>

      <div className="flex flex-col gap-1">
        {quiz.options.map((option, index) => {
          const isCorrect = answered && index === quiz.correctIndex;
          const isWrongPick = answered && index === state.answerIndex && !isCorrect;
          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => answerQuiz(index)}
              className={[
                'rounded border px-2 py-1 text-left text-[11px] leading-snug',
                isCorrect
                  ? 'border-ok bg-ok/15 text-ok'
                  : isWrongPick
                    ? 'border-err bg-err/15 text-err'
                    : 'border-border bg-raised hover:border-accent',
              ].join(' ')}
            >
              <span aria-hidden className="mr-1 font-mono text-muted">
                {isCorrect ? '✓' : isWrongPick ? '✗' : String.fromCharCode(65 + index)}
              </span>
              {option}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-2 rounded border border-border bg-raised p-2">
          <div className="lane-label mb-0.5">Why</div>
          <p className="text-[11px] leading-snug">{quiz.explanation}</p>
        </div>
      )}
    </div>
  );
}
