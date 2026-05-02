export interface OnboardingResponses {
  // Required questions
  phraseOveruse: string;
  badNewsSoftening: string;
  formerBelief: string;
  hillToDieOn: string;
  notSoundLike: string;
  sampleMessages: string;
  currentSeason: string;
  // Optional deeper questions
  avoidingThinking?: string;
  decisionSittingWith?: string;
  wishMoreTime?: string;
  tellingTooLong?: string;
  noLongerAfraid?: string;
  oneShift?: string;
  wishAsked?: string;
  accurateCriticism?: string;
}

export const REQUIRED_QUESTIONS = [
  {
    id: "phraseOveruse",
    question: "What's a phrase you find yourself using too much?",
  },
  {
    id: "badNewsSoftening",
    question:
      "When you have to deliver bad news, how do you tend to soften it? Give an example sentence.",
  },
  {
    id: "formerBelief",
    question: "What's something you used to believe that you don't anymore?",
  },
  {
    id: "hillToDieOn",
    question:
      "What's a hill you'd die on that most people don't agree with?",
  },
  {
    id: "notSoundLike",
    question: "Who are you trying not to sound like?",
  },
  {
    id: "sampleMessages",
    question: "Paste 5-10 messages you've sent to friends recently.",
    helperText:
      "Paste recent messages you've sent to friends. This is how the future-selves will pick up your cadence. Doesn't have to be 10 — even 5 helps. Don't curate; pick whatever's already in your sent folder.",
    isLarge: true,
  },
  {
    id: "currentSeason",
    question: "What season of life are you in right now, in your own words?",
  },
] as const;

export const OPTIONAL_QUESTIONS = [
  {
    id: "avoidingThinking",
    question: "What's something you're avoiding thinking about?",
  },
  {
    id: "decisionSittingWith",
    question: "What's a decision you're sitting with right now?",
  },
  {
    id: "wishMoreTime",
    question: "Who do you wish you spent more time with?",
  },
  {
    id: "tellingTooLong",
    question: "What's something you've been telling yourself for too long?",
  },
  {
    id: "noLongerAfraid",
    question: "What did you used to be afraid of that you're not anymore?",
  },
  {
    id: "oneShift",
    question:
      "If a year passed and one thing had genuinely shifted, what would you want it to be?",
  },
  {
    id: "wishAsked",
    question: "What's a question you wish someone would ask you?",
  },
  {
    id: "accurateCriticism",
    question: "What's the most accurate criticism anyone's ever made of you?",
  },
] as const;
