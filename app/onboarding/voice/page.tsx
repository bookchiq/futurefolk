"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../context";
import { REQUIRED_QUESTIONS, OnboardingResponses } from "../types";
import { QuestionScreen } from "./question-screen";

export default function VoiceQuestionsPage() {
  const router = useRouter();
  const { responses, updateResponse } = useOnboarding();
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentQuestion = REQUIRED_QUESTIONS[currentIndex];
  const totalQuestions = REQUIRED_QUESTIONS.length;

  const currentValue =
    (responses[currentQuestion.id as keyof OnboardingResponses] as string) ||
    "";

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All required questions complete, move to optional deeper questions
      router.push("/onboarding/deeper");
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      router.push("/onboarding");
    }
  };

  const handleChange = (value: string) => {
    updateResponse(currentQuestion.id as keyof OnboardingResponses, value);
  };

  const canContinue = currentValue.trim().length > 0;

  return (
    <QuestionScreen
      questionNumber={currentIndex + 1}
      totalQuestions={totalQuestions}
      question={currentQuestion.question}
      helperText={"helperText" in currentQuestion ? currentQuestion.helperText : undefined}
      isLarge={"isLarge" in currentQuestion ? currentQuestion.isLarge : false}
      value={currentValue}
      onChange={handleChange}
      onNext={handleNext}
      onBack={handleBack}
      canContinue={canContinue}
      isFirst={currentIndex === 0}
      isLast={currentIndex === totalQuestions - 1}
    />
  );
}
