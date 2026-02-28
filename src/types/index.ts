export type PestAnalysis = {
  political: string;
  economic: string;
  social: string;
  technological: string;
};

export type JobsAnalysis = {
  functional: string[];
  emotional: string[];
  social: string[];
};

export type FrameworksAnalysis = {
  five_forces: string;
  three_c: string;
  four_p: string;
};

export type ServiceIdea = {
  name: string;
  description: string;
  target: string;
};

export type Seed = {
  id: string;
  raw_input: string;
  pest: PestAnalysis | null;
  jobs: JobsAnalysis | null;
  frameworks: FrameworksAnalysis | null;
  service_ideas: ServiceIdea[] | null;
  tags: string[] | null;
  created_at: string;
};

export type Combination = {
  id: string;
  seed_ids: string[];
  idea: string;
  created_at: string;
};

export type AnalysisResult = {
  seed: Seed;
  combinations: CombinationSuggestion[];
};

export type CombinationSuggestion = {
  related_seed_input: string;
  idea: string;
};
