"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../context";
import { REQUIRED_QUESTIONS, OnboardingResponses } from "../types";
import { QuestionScreen } from "./question-screen";

export default function VoiceQuestionsPage() {
  const router = useRouter();
  const { responses, updateResponse } = useOnboarding();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localValue, setLocalValue] = useState("");

  const currentQuestion = REQUIRED_QUESTIONS[currentIndex];
  const totalQuestions = REQUIRED_QUESTIONS.length;
  const questionId = currentQuestion.id as keyof OnboardingResponses;

  // Sync local state with context when question changes
  useEffect(() => {
    const savedValue = (responses[questionId] as string) || "";
    setLocalValue(savedValue);
  }, [currentIndex, questionId, responses]);

  const handleNext = () => {
    // Save current answer to context before moving
    updateResponse(questionId, localValue);
    
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      router.push("/onboarding/deeper");
    }
  };

  const handleBack = () => {
    // Save current answer to context before moving
    updateResponse(questionId, localValue);
    
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      router.push("/onboarding");
    }
  };

  const handleChange = (value: string) => {
    console.log("[v0] handleChange fired, value length:", value.length);
    setLocalValue(value);
  };

  const canContinue = localValue.trim().length > 0;
  console.log("[v0] render - localValue:", localValue, "canContinue:", canContinue);

  return (
    <QuestionScreen
      questionNumber={currentIndex + 1}
      totalQuestions={totalQuestions}
      question={currentQuestion.question}
      helperText={"helperText" in currentQuestion ? currentQuestion.helperText : undefined}
      isLarge={"isLarge" in currentQuestion ? currentQuestion.isLarge : false}
      value={localValue}
      onChange={handleChange}
      onNext={handleNext}
      onBack={handleBack}
      canContinue={canContinue}
      isFirst={currentIndex === 0}
      isLast={currentIndex === totalQuestions - 1}
    />
  );
}
